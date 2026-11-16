// A shop must be able to sell all day with no internet and have every bill
// land once, in order, when the connection returns -- and a bill the server
// refuses must be put in front of the owner, never dropped.
//
// These tests drive the real SyncService against a real (in-memory or on-disk)
// Drift database, with only the network faked.

import 'dart:async';
import 'dart:io';

import 'package:drift/drift.dart' show OrderingTerm;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/database/database.dart';
import 'package:mobile_app/core/database/sync_errors.dart';
import 'package:mobile_app/core/database/sync_service.dart';
import 'package:mobile_app/core/database/unsynced_sales.dart';
import 'package:mobile_app/features/sales/presentation/add_sale_screen.dart' show newSaleId;
import 'package:mobile_app/features/daybook/data/daybook_repository.dart';
import 'package:supabase_flutter/supabase_flutter.dart'
    show PostgrestException, AuthException, AuthRetryableFetchException, SupabaseClient;

import 'support/fake_sync_transport.dart';

Future<List<SyncMutation>> jobs(AppDatabase db) =>
    (db.select(db.syncMutations)..orderBy([(t) => OrderingTerm(expression: t.id)])).get();

void main() {
  late AppDatabase db;
  late FakeSyncTransport net;
  late SyncService svc;

  setUp(() {
    db = AppDatabase.connect(NativeDatabase.memory());
    net = FakeSyncTransport(online: false);
    svc = SyncService(db, transport: net, autoStart: false);
  });
  tearDown(() async {
    svc.dispose();
    await db.close();
  });

  group('offline sale', () {
    test('is queued, not failed, and carries its own id', () async {
      final queued = await svc.rpcOnlineOrQueue('process_sale', saleParams('SAL-A'));
      expect(queued, isTrue);

      final all = await jobs(db);
      expect(all, hasLength(1));
      expect(all.single.rpcName, 'process_sale');
      expect(all.single.status, JobStatus.pending);
      // The exact call it would have made online, same p_id.
      expect(all.single.payload, contains('"p_id":"SAL-A"'));
      expect(await svc.pendingCount(), 1);
      expect(await svc.watchUnsyncedSaleCount().first, 1);
    });

    test('a whole day offline never expires a sale', () async {
      await svc.rpcOnlineOrQueue('process_sale', saleParams('SAL-A'));
      // Wi-Fi up, internet down: connectivity says online, every request dies.
      final flaky = _FlakyTransport();
      final svc2 = SyncService(db, transport: flaky, autoStart: false);
      for (var i = 0; i < 12; i++) {
        await svc2.sync(force: true);
      }
      final job = (await jobs(db)).single;
      expect(job.status, JobStatus.pending, reason: 'transport failures must not expire');
      expect(job.attempts, 12);
      expect(job.nextAttemptAt.difference(DateTime.now()).inSeconds,
          lessThanOrEqualTo(SyncService.kBackoffSeconds.last),
          reason: 'backoff is capped so the evening sync is not an hour away');
      svc2.dispose();
    });

    test('survives an app kill and a phone restart', () async {
      final dir = await Directory.systemTemp.createTemp('outbox');
      final file = File('${dir.path}/ledgr_local.sqlite');
      var disk = AppDatabase.connect(NativeDatabase(file));
      var s1 = SyncService(disk, transport: net, autoStart: false);
      await s1.rpcOnlineOrQueue('process_sale', saleParams('SAL-1'));
      await s1.rpcOnlineOrQueue('process_sale', saleParams('SAL-2'));
      // Killed mid-send: the job was claimed but never finished.
      await disk.customStatement(
          "UPDATE sync_mutations SET status = 'PROCESSING' WHERE id = 1");
      s1.dispose();
      await disk.close();

      // Phone restarts, app opens, internet is back.
      disk = AppDatabase.connect(NativeDatabase(file));
      final net2 = FakeSyncTransport(online: true);
      s1 = SyncService(disk, transport: net2, autoStart: false);
      expect(await s1.pendingCount(), 2);
      await s1.sync();
      expect(net2.calls, ['process_sale:SAL-1', 'process_sale:SAL-2']);
      expect((await jobs(disk)).map((j) => j.status), everyElement(JobStatus.success));
      s1.dispose();
      await disk.close();
      await dir.delete(recursive: true);
    });
  });

  group('replay', () {
    test('runs in the order the bills were made', () async {
      await svc.rpcOnlineOrQueue('process_sale', saleParams('SAL-1', method: 'CREDIT'));
      await svc.rpcOnlineOrQueue('settle_client_payment', {'p_id': 'CP-1', 'p_amount': 50});
      await svc.rpcOnlineOrQueue('process_sale', saleParams('SAL-2'));
      net.goOnline();
      await svc.sync();
      expect(net.calls, ['process_sale:SAL-1', 'settle_client_payment:CP-1', 'process_sale:SAL-2']);
    });

    test('a job waiting on its backoff holds the ones behind it', () async {
      await svc.rpcOnlineOrQueue('process_sale', saleParams('SAL-1'));
      await svc.rpcOnlineOrQueue('settle_client_payment', {'p_id': 'CP-1'});
      // First job is parked in the future (it failed a moment ago).
      await db.customStatement(
          "UPDATE sync_mutations SET next_attempt_at = ${DateTime.now().add(const Duration(minutes: 5)).millisecondsSinceEpoch ~/ 1000} WHERE id = 1");
      net.online = true;
      await svc.sync();
      expect(net.calls, isEmpty, reason: 'the payment must not overtake its sale');
      await svc.sync(force: true); // connectivity came back / Sync now
      expect(net.calls, ['process_sale:SAL-1', 'settle_client_payment:CP-1']);
    });

    test('a new sale made online joins the back of an unsent queue', () async {
      await svc.rpcOnlineOrQueue('process_sale', saleParams('SAL-OLD'));
      net.online = true;
      // Pretend the flush has not run yet: park the old job.
      await db.customStatement(
          "UPDATE sync_mutations SET next_attempt_at = ${DateTime.now().add(const Duration(minutes: 5)).millisecondsSinceEpoch ~/ 1000}");
      final queued = await svc.rpcOnlineOrQueue('process_sale', saleParams('SAL-NEW'));
      expect(queued, isTrue);
      expect(net.calls, isEmpty);
      await svc.sync(force: true);
      expect(net.calls, ['process_sale:SAL-OLD', 'process_sale:SAL-NEW']);
    });

    test('a timeout after the server committed is replayed into ONE sale', () async {
      net.online = true;
      net.commitThenTimeout.add('SAL-X');
      // Online attempt: server writes the sale, the reply never arrives.
      final queued = await svc.rpcOnlineOrQueue('process_sale', saleParams('SAL-X'));
      expect(queued, isTrue, reason: 'unconfirmed is kept, never "not saved"');
      expect(net.recorded.keys, ['SAL-X']);

      await svc.sync(force: true);
      expect(net.calls, ['process_sale:SAL-X', 'process_sale:SAL-X']);
      expect(net.recorded, hasLength(1), reason: 'the replay guard made it a no-op');
      expect((await jobs(db)).single.status, JobStatus.success);
    });

    test('auto-replays when connectivity returns', () async {
      final live = SyncService(db, transport: net, autoStart: true);
      await live.rpcOnlineOrQueue('process_sale', saleParams('SAL-1'));
      net.goOnline();
      await Future<void>.delayed(const Duration(milliseconds: 50));
      await live.sync(); // wait for the pass the event started
      expect(net.calls, ['process_sale:SAL-1']);
      live.dispose();
    });
  });

  group('a refused replay', () {
    test('is parked for the owner with the reason, and does not block others', () async {
      await svc.rpcOnlineOrQueue('process_sale', saleParams('SAL-1'));
      await svc.rpcOnlineOrQueue('process_sale', saleParams('SAL-2'));
      net.refuse['SAL-1'] =
          'NEGATIVE_STOCK_BLOCKED: Salt has 0 in stock and this bill needs 1';
      net.goOnline();
      await svc.sync();

      final all = await jobs(db);
      expect(all[0].status, JobStatus.failed);
      expect(all[0].lastError, contains('NEGATIVE_STOCK_BLOCKED'));
      expect(all[1].status, JobStatus.success, reason: 'one refusal must not hold the queue');
      expect(await svc.failedCount(), 1);

      // Not retried behind the owner's back.
      await svc.sync(force: true);
      expect(net.calls.where((c) => c == 'process_sale:SAL-1'), hasLength(1));

      // And the owner is told what it is and what to do.
      final info = describeRefusal(all[0].lastError);
      expect(info.title, 'Not enough stock');
      expect(info.reason, 'Salt has 0 in stock and this bill needs 1');
      expect(info.whatToDo, contains('Retry'));

      // It is still listed, as refused, for the till and the sales list.
      final ops = await unsyncedOps(db, 'T1');
      expect(ops.single.opId, 'SAL-1');
      expect(ops.single.state, UnsyncedState.refused);
    });

    test('Retry after the owner fixes it lands the sale', () async {
      await svc.rpcOnlineOrQueue('process_sale', saleParams('SAL-1', method: 'CREDIT'));
      net.refuse['SAL-1'] =
          'CREDIT_LIMIT_EXCEEDED: Ravi already owes 4000, and this bill adds 100 against an approved limit of 4000';
      net.goOnline();
      await svc.sync();
      expect((await jobs(db)).single.status, JobStatus.failed);

      net.refuse.clear(); // limit raised
      await svc.retryJob(1);
      expect((await jobs(db)).single.status, JobStatus.success);
      expect(net.recorded.keys, ['SAL-1']);
    });

    test('Discard keeps the row, out of every count', () async {
      await svc.rpcOnlineOrQueue('process_sale', saleParams('SAL-1'));
      net.refuse['SAL-1'] = 'NEGATIVE_STOCK_BLOCKED: Salt has 0 in stock and this bill needs 1';
      net.goOnline();
      await svc.sync();
      await svc.discardJob(1);

      final row = (await jobs(db)).single;
      expect(row.status, JobStatus.discarded);
      expect(row.lastError, contains('NEGATIVE_STOCK_BLOCKED'), reason: 'audit trail kept');
      expect(await svc.failedCount(), 0);
      expect(await svc.pendingCount(), 0);
      expect(await unsyncedOps(db, 'T1'), isEmpty);
    });

    test('an online refusal is thrown to the till, not queued', () async {
      net.online = true;
      net.refuse['SAL-1'] = 'CREDIT_LIMIT_EXCEEDED: over the limit';
      await expectLater(
        svc.rpcOnlineOrQueue('process_sale', saleParams('SAL-1')),
        throwsA(isA<PostgrestException>()),
      );
      expect(await jobs(db), isEmpty);
    });
  });

  group('editing a sale that has not been sent', () {
    test('UPI confirmed offline: the queued sale goes as PAID', () async {
      await svc.rpcOnlineOrQueue('process_sale',
          saleParams('SAL-U', method: 'UPI')..['p_payment_status'] = 'PENDING');
      final job = await svc.findPendingRpc('process_sale', 'SAL-U');
      expect(job, isNotNull);
      expect(await svc.amendPendingJob(job!.id, {'p_payment_status': 'PAID', 'p_paid_amount': 100}), isTrue);
      net.goOnline();
      await svc.sync();
      expect(net.recorded['SAL-U']!['p_payment_status'], 'PAID');
    });

    test('UPI not received offline: the sale is withdrawn and never sent', () async {
      await svc.rpcOnlineOrQueue('process_sale', saleParams('SAL-U', method: 'UPI'));
      final job = await svc.findPendingRpc('process_sale', 'SAL-U');
      expect(await svc.withdrawPendingJob(job!.id, 'UPI payment not received'), isTrue);
      net.goOnline();
      await svc.sync();
      expect(net.calls, isEmpty);
      expect((await jobs(db)).single.status, JobStatus.discarded);
    });

    test('a job already sent cannot be amended (caller sends a follow-up)', () async {
      await svc.rpcOnlineOrQueue('process_sale', saleParams('SAL-U'));
      net.goOnline();
      await svc.sync();
      expect(await svc.amendPendingJob(1, {'p_payment_status': 'PAID'}), isFalse);
      expect(await svc.withdrawPendingJob(1, 'x'), isFalse);
    });

    test('a follow-up update queues behind its sale', () async {
      await svc.rpcOnlineOrQueue('process_sale', saleParams('SAL-1'));
      await svc.updateOnlineOrQueue('sales', 'SAL-1', {'amount_received': 100});
      net.goOnline();
      await svc.sync();
      expect(net.calls, ['process_sale:SAL-1', 'update:SAL-1']);
    });
  });

  group('failure classification', () {
    test('transport, auth and refusal are told apart', () {
      expect(classifyFailure(const SocketException('x')), FailureKind.transport);
      expect(classifyFailure(TimeoutException('x')), FailureKind.transport);
      expect(classifyFailure(AuthRetryableFetchException()), FailureKind.transport);
      expect(classifyFailure(PostgrestException(message: 'gw', code: '503')), FailureKind.transport);
      expect(classifyFailure(PostgrestException(message: 'busy', code: '57014')), FailureKind.transport);
      expect(classifyFailure(PostgrestException(message: 'JWT expired', code: 'PGRST301')), FailureKind.auth);
      expect(classifyFailure(AuthException('refresh token revoked')), FailureKind.auth);
      expect(
          classifyFailure(PostgrestException(
              message: 'NEGATIVE_STOCK_BLOCKED: Salt has 0', code: '23514')),
          FailureKind.refused);
      expect(classifyFailure(PostgrestException(message: 'Access denied', code: 'P0001')),
          FailureKind.refused);
    });

    test('an expired session keeps the sale queued and says why', () async {
      await svc.rpcOnlineOrQueue('process_sale', saleParams('SAL-1'));
      final authFail = _AuthFailTransport();
      final s2 = SyncService(db, transport: authFail, autoStart: false);
      await s2.sync(force: true);
      final job = (await jobs(db)).single;
      expect(job.status, JobStatus.pending);
      expect(job.lastError, startsWith('Sign in again'));
      s2.dispose();
    });
  });

  group('bill numbers', () {
    test('are SAL- plus 12 hex digits, and do not repeat', () {
      final ids = {for (var i = 0; i < 20000; i++) newSaleId()};
      expect(ids, hasLength(20000));
      for (final id in ids.take(50)) {
        expect(id, matches(RegExp(r'^SAL-[0-9A-F]{12}$')));
      }
    });
  });

  group('showing queued sales', () {
    test('overlay tags queued sales and lets the server copy win', () async {
      await svc.rpcOnlineOrQueue('process_sale', saleParams('SAL-1', total: 250));
      await svc.rpcOnlineOrQueue('process_sale', saleParams('SAL-2', total: 80));
      final ops = await unsyncedOps(db, 'T1');
      final rows = overlayUnsyncedSales([
        {'id': 'SAL-2', 'totalAmount': 80, 'paymentMethod': 'CASH'},
      ], ops);
      expect(rows, hasLength(2));
      final mine = rows.firstWhere((r) => r['id'] == 'SAL-1');
      expect(mine['_sync'], 'pending');
      expect(mine['totalAmount'], 250);
      expect(rows.firstWhere((r) => r['id'] == 'SAL-2')['_sync'], isNull);
    });

    test('the offline Day Book counts queued bills in the drawer, not refused ones',
        () async {
      await svc.rpcOnlineOrQueue('process_sale', saleParams('SAL-1', total: 250));
      await svc.rpcOnlineOrQueue('process_sale', saleParams('SAL-2', total: 999));
      await svc.rpcOnlineOrQueue('settle_client_payment', {
        'p_id': 'CP-1', 'p_tenant_id': 'T1', 'p_client_id': 'C1',
        'p_amount': 40, 'p_date': '2026-11-16', 'p_method': 'CASH',
      });
      await db.customStatement(
          "UPDATE sync_mutations SET status = 'FAILED', last_error = 'NEGATIVE_STOCK_BLOCKED: x' WHERE id = 2");

      // A Supabase client that cannot reach anything: the repository falls
      // back to the cache, exactly as it does in airplane mode.
      final repo = DaybookRepository(SupabaseClient('http://127.0.0.1:9', 'anon'), db);
      final ledger = await repo.buildLedger(
          tenantId: 'T1', date: '2026-11-16', dayBookList: const []);

      expect(ledger.fromCache, isTrue);
      expect(ledger.cashSales, 250, reason: 'the refused 999 is not takings');
      expect(ledger.cashCollect, 40);
      expect(ledger.unsyncedEntries, 2);
      expect(ledger.entries.firstWhere((e) => e.id == 'SAL-1').note, contains('Not synced yet'));
    });

    test('another tenant\'s queued sale is not shown', () async {
      await svc.rpcOnlineOrQueue('process_sale', saleParams('SAL-1')..['p_tenant_id'] = 'T2');
      expect(await unsyncedOps(db, 'T1'), isEmpty);
    });
  });
}

/// Reports online, but every request dies on the wire.
class _FlakyTransport extends FakeSyncTransport {
  _FlakyTransport() : super(online: true);
  @override
  Future<dynamic> rpc(String name, Map<String, dynamic> params) async =>
      throw const SocketException('Network is unreachable');
}

class _AuthFailTransport extends FakeSyncTransport {
  _AuthFailTransport() : super(online: true);
  @override
  Future<dynamic> rpc(String name, Map<String, dynamic> params) async =>
      throw PostgrestException(message: 'JWT expired', code: 'PGRST301');
}
