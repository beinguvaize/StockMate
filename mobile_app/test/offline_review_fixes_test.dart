// Fixes for the Director's review of the offline-sales branch: an RPC that
// must never be sent twice, a purchase replay that already landed, follow-ups
// of a refused sale, the receipt's tax lines, and two small guards.

import 'dart:async';
import 'dart:io';

import 'package:drift/drift.dart' show OrderingTerm;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' show ClientException;
import 'package:mobile_app/core/auth/tenant_provider.dart' show mayUseCachedContext;
import 'package:mobile_app/core/database/database.dart' hide Invoice, Client, Sale;
import 'package:mobile_app/core/database/sync_errors.dart';
import 'package:mobile_app/core/database/sync_service.dart';
import 'package:mobile_app/core/print/pos_receipt_pdf.dart';
import 'package:mobile_app/features/invoices/data/models/invoice.dart';
import 'package:mobile_app/features/sales/presentation/add_sale_screen.dart'
    show cachedPickerClients, newSaleId;
import 'package:supabase_flutter/supabase_flutter.dart'
    show PostgrestException, AuthException, AuthRetryableFetchException;

import 'support/fake_sync_transport.dart';

Future<List<SyncMutation>> jobs(AppDatabase db) =>
    (db.select(db.syncMutations)..orderBy([(t) => OrderingTerm(expression: t.id)])).get();

Map<String, dynamic> adjust({double amount = -2}) => {
      'p_product_id': 'P1',
      'p_location_id': null,
      'p_amount': amount,
      'p_reason': 'Manual adjustment',
      'p_tenant_id': 'T1',
      'p_consume_batches': true,
      'p_unit_cost': null,
    };

/// Online, but every call dies with [error] (the request may have been sent).
class _Throwing extends FakeSyncTransport {
  final Object error;
  _Throwing(this.error) : super(online: true);
  int sent = 0;
  @override
  Future<dynamic> rpc(String name, Map<String, dynamic> params) async {
    sent++;
    throw error;
  }
}

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

  group('1. adjust_inventory_atomic is never sent twice', () {
    test('offline: queued, and the replay is its first and only delivery', () async {
      expect(await svc.rpcOnlineOrQueue('adjust_inventory_atomic', adjust()), isTrue);
      expect((await jobs(db)).single.status, JobStatus.pending);
      net.goOnline();
      await svc.sync();
      expect(net.adjustments, hasLength(1));
      expect((await jobs(db)).single.status, JobStatus.success);
    });

    test('a timeout after commit, then a replay: exactly ONE adjustment', () async {
      net.online = true;
      net.commitThenTimeout.add('P1');
      await svc.rpcOnlineOrQueue('adjust_inventory_atomic', adjust());
      expect(net.adjustments, hasLength(1), reason: 'the server committed');

      final job = (await jobs(db)).single;
      expect(job.status, JobStatus.failed);
      expect(job.lastError, startsWith(SyncService.kUnconfirmed));

      // Every way the outbox could replay: connectivity, tick, Sync now, Retry all.
      await svc.sync(force: true);
      await svc.retryFailed();
      net.goOffline();
      net.goOnline();
      await svc.sync(force: true);
      expect(net.adjustments, hasLength(1), reason: 'never auto-resent');
    });

    test('a timeout on REPLAY is parked Unconfirmed, not retried', () async {
      await svc.rpcOnlineOrQueue('adjust_inventory_atomic', adjust());
      net.goOnline();
      net.commitThenTimeout.add('P1');
      await svc.sync();
      expect(net.adjustments, hasLength(1));
      final job = (await jobs(db)).single;
      expect(job.status, JobStatus.failed);
      expect(job.lastError, startsWith(SyncService.kUnconfirmed));

      await svc.retryFailed();
      await svc.sync(force: true);
      expect(net.adjustments, hasLength(1));
      expect(await svc.failedCount(), 1, reason: 'still waiting for the owner');
    });

    test('only the owner\'s Retry on that job sends it again', () async {
      net.online = true;
      net.commitThenTimeout.add('P1');
      await svc.rpcOnlineOrQueue('adjust_inventory_atomic', adjust());
      await svc.retryJob(1);
      expect(net.adjustments, hasLength(2));
    });

    test('a socket that never connected is safe to queue', () async {
      final flaky = _Throwing(const SocketException('Failed host lookup'));
      final s = SyncService(db, transport: flaky, autoStart: false);
      expect(await s.rpcOnlineOrQueue('adjust_inventory_atomic', adjust()), isTrue);
      final job = (await jobs(db)).single;
      expect(job.status, JobStatus.pending);
      s.dispose();
    });

    for (final c in <String, Object>{
      'timeout': TimeoutException('slow'),
      '503': PostgrestException(message: 'bad gateway', code: '503'),
      '408': PostgrestException(message: 'request timeout', code: '408'),
      '429': PostgrestException(message: 'slow down', code: '429'),
      'AuthRetryableFetch': AuthRetryableFetchException(),
      'ClientException': ClientException('connection closed before response'),
      'connection reset': const SocketException('Connection reset by peer'),
    }.entries) {
      test('${c.key}: online -> Unconfirmed, replay -> Unconfirmed, never resent', () async {
        final t = _Throwing(c.value);
        final s = SyncService(db, transport: t, autoStart: false);
        await s.rpcOnlineOrQueue('adjust_inventory_atomic', adjust());
        var job = (await jobs(db)).single;
        expect(job.status, JobStatus.failed);
        expect(job.lastError, startsWith(SyncService.kUnconfirmed));
        expect(t.sent, 1);
        await s.retryFailed();
        await s.sync(force: true);
        expect(t.sent, 1, reason: 'no automatic second delivery');
        s.dispose();
      });
    }

    test('an unsafe job found mid-flight (app killed) is not sent again', () async {
      await svc.rpcOnlineOrQueue('adjust_inventory_atomic', adjust());
      await db.customStatement("UPDATE sync_mutations SET status = 'PROCESSING'");
      net.goOnline();
      await svc.sync(force: true);
      expect(net.adjustments, isEmpty);
      expect((await jobs(db)).single.lastError, startsWith(SyncService.kUnconfirmed));
    });

    test('a refusal is still thrown to the caller', () async {
      net.online = true;
      net.refuse['P1'] = 'Access denied';
      await expectLater(svc.rpcOnlineOrQueue('adjust_inventory_atomic', adjust()),
          throwsA(isA<PostgrestException>()));
      expect(await jobs(db), isEmpty);
    });

    test('the owner is told what to check', () {
      final info = describeRefusal(SyncService.kUnconfirmed,
          rpcName: 'adjust_inventory_atomic');
      expect(info.whatToDo, contains('Stock History'));
    });
  });

  group('2. a purchase replay that hits its own key already landed', () {
    test('23505 on purchases_pkey is SUCCESS, not "ring the bill again"', () async {
      net.online = true;
      net.commitThenTimeout.add('PUR-1');
      final p = {'p_id': 'PUR-1', 'p_product_id': 'P1', 'p_total_amount': 50};
      expect(await svc.rpcOnlineOrQueue('process_purchase', p), isTrue);
      expect(net.purchases, {'PUR-1'});

      await svc.sync(force: true);
      final job = (await jobs(db)).single;
      expect(job.status, JobStatus.success);
      expect(await svc.failedCount(), 0);
      expect(net.purchases, hasLength(1));
    });

    test('a 23505 on some OTHER constraint is still a refusal', () async {
      await svc.rpcOnlineOrQueue('process_purchase', {'p_id': 'PUR-2'});
      final bad = _Throwing(PostgrestException(
          message: 'duplicate key value violates unique constraint "suppliers_name_key"',
          code: '23505'));
      final s = SyncService(db, transport: bad, autoStart: false);
      await s.sync(force: true);
      expect((await jobs(db)).single.status, JobStatus.failed);
      s.dispose();
    });

    test('describeRefusal names the job type', () {
      expect(describeRefusal('boom', rpcName: 'process_purchase').title, contains('purchase'));
      expect(describeRefusal('boom', rpcName: 'process_purchase').whatToDo,
          isNot(contains('ring the bill')));
      expect(describeRefusal('boom', rpcName: 'settle_client_payment').title, contains('payment'));
      expect(describeRefusal('boom', rpcName: 'process_sale').title, contains('sale'));
      expect(describeRefusal('boom').title, contains('sale'));
    });
  });

  group('3. follow-ups of a sale', () {
    Map<String, dynamic> upi(String id) =>
        saleParams(id, method: 'UPI')..['p_payment_status'] = 'PENDING';

    Future<void> refuseOnReplay(String id) async {
      net.refuse[id] = 'NEGATIVE_STOCK_BLOCKED: Salt has 0 in stock and this bill needs 1';
      net.goOnline();
      await svc.sync();
      expect((await jobs(db)).first.status, JobStatus.failed);
    }

    test('(a) an update that matches no row is refused, not "done"', () async {
      net.online = true;
      await expectLater(
        svc.updateOnlineOrQueue('sales', 'SAL-NOPE', {'amount_received': 5}),
        throwsA(isA<PostgrestException>()),
      );
      final e = ZeroRowsException('sales', 'SAL-NOPE');
      expect(classifyFailure(e), FailureKind.refused);
      expect(await jobs(db), isEmpty);
    });

    test('(b) a refused sale can still be edited and withdrawn', () async {
      await svc.rpcOnlineOrQueue('process_sale', upi('SAL-U'));
      await refuseOnReplay('SAL-U');
      final job = await svc.findPendingRpc('process_sale', 'SAL-U');
      expect(job, isNotNull);
      expect(await svc.amendPendingJob(job!.id, {'p_payment_status': 'PAID'}), isTrue);
      expect((await jobs(db)).first.status, JobStatus.failed, reason: 'edited, still refused');
      expect(await svc.withdrawPendingJob(job.id, 'UPI payment not received'), isTrue);
      expect((await jobs(db)).first.status, JobStatus.discarded);
    });

    test('(b) other RPCs are still editable only while PENDING', () async {
      await svc.rpcOnlineOrQueue('settle_client_payment', {'p_id': 'CP-1'});
      net.refuse['CP-1'] = 'nope';
      net.goOnline();
      await svc.sync();
      expect(await svc.findPendingRpc('settle_client_payment', 'CP-1'), isNull);
    });

    test('(c) a follow-up of a refused sale is held, not sent', () async {
      await svc.rpcOnlineOrQueue('process_sale', saleParams('SAL-1'));
      await svc.updateOnlineOrQueue('sales', 'SAL-1', {'amount_received': 100});
      await refuseOnReplay('SAL-1');
      await svc.sync(force: true);
      expect(net.updates, isEmpty);
      final all = await jobs(db);
      expect(all[1].status, JobStatus.pending);
      expect(all[1].lastError, isNull, reason: 'held is not a failure');
    });

    test('(c) a follow-up made now, while the sale is refused, is queued', () async {
      await svc.rpcOnlineOrQueue('process_sale', saleParams('SAL-1'));
      await refuseOnReplay('SAL-1');
      final queued = await svc.updateOnlineOrQueue('sales', 'SAL-1', {'amount_received': 1});
      expect(queued, isTrue);
      final voided = await svc.rpcOnlineOrQueue('void_sale', {'p_id': 'SAL-1'});
      expect(voided, isTrue);
      expect(net.calls.where((c) => c.startsWith('void_sale')), isEmpty);
      expect(net.updates, isEmpty);
    });

    test('(c) a held follow-up does not make unrelated writes queue', () async {
      await svc.rpcOnlineOrQueue('process_sale', saleParams('SAL-1'));
      await svc.updateOnlineOrQueue('sales', 'SAL-1', {'amount_received': 1});
      await refuseOnReplay('SAL-1');
      expect(await svc.rpcOnlineOrQueue('settle_client_payment', {'p_id': 'CP-9'}), isFalse);
    });

    test('(d) discarding the sale discards its follow-ups', () async {
      await svc.rpcOnlineOrQueue('process_sale', saleParams('SAL-1'));
      await svc.updateOnlineOrQueue('sales', 'SAL-1', {'amount_received': 100});
      await refuseOnReplay('SAL-1');
      await svc.discardJob(1);
      final all = await jobs(db);
      expect(all.map((j) => j.status), [JobStatus.discarded, JobStatus.discarded]);
      expect(await svc.pendingCount(), 0);
      await svc.sync(force: true);
      expect(net.updates, isEmpty);
    });

    test('(d) Retry re-queues the follow-ups behind the sale', () async {
      await svc.rpcOnlineOrQueue('process_sale', saleParams('SAL-1'));
      await svc.updateOnlineOrQueue('sales', 'SAL-1', {'amount_received': 100});
      await refuseOnReplay('SAL-1');
      net.refuse.clear();
      await svc.retryJob(1);
      expect(net.calls, ['process_sale:SAL-1', 'process_sale:SAL-1', 'update:SAL-1']);
      expect((await jobs(db)).map((j) => j.status), [JobStatus.success, JobStatus.success]);
      expect(net.saleFields['SAL-1'], {'amount_received': 100});
    });

    test('refused sale + UPI confirmed + Retry lands PAID', () async {
      await svc.rpcOnlineOrQueue('process_sale', upi('SAL-U'));
      await refuseOnReplay('SAL-U'); // refused before the cashier answered the QR
      final job = await svc.findPendingRpc('process_sale', 'SAL-U');
      expect(await svc.amendPendingJob(
          job!.id, {'p_payment_status': 'PAID', 'p_paid_amount': 100}), isTrue);
      await svc.updateOnlineOrQueue('sales', 'SAL-U', {'amount_received': 100});
      net.refuse.clear();
      await svc.retryJob(job.id);
      expect(net.recorded['SAL-U']!['p_payment_status'], 'PAID');
      expect(net.saleFields['SAL-U'], {'amount_received': 100});
      expect(await svc.failedCount(), 0);
    });

    test('refused sale + UPI not received + Retry results in no sale', () async {
      await svc.rpcOnlineOrQueue('process_sale', upi('SAL-U'));
      await svc.updateOnlineOrQueue('sales', 'SAL-U', {'amount_received': 0});
      await refuseOnReplay('SAL-U');
      final job = await svc.findPendingRpc('process_sale', 'SAL-U');
      expect(await svc.withdrawPendingJob(job!.id, 'UPI payment not received'), isTrue);
      net.refuse.clear();
      await svc.retryJob(job.id); // Retry on a discarded job is a no-op
      await svc.retryFailed();
      await svc.sync(force: true);
      expect(net.recorded, isEmpty);
      expect(net.updates, isEmpty);
      expect((await jobs(db)).map((j) => j.status), everyElement(JobStatus.discarded));
    });
  });

  group('4. offline receipt tax', () {
    final items = [PdfLineItem(name: 'Soap', qty: 2, price: 59, taxRate: 18)];

    void expectAddsUp(ReceiptTotals t) {
      expect(t.subtotal + t.tax - t.discount + t.other, closeTo(t.total, 0.005));
    }

    test('INCLUSIVE: taxable = line/(1+r), tax = line - taxable, with a Discount line', () {
      // 2 x 59 = 118 incl. 18% -> taxable 100, tax 18; Rs 10 off -> 108.
      final t = ReceiptTotals.compute(items,
          taxMode: 'INCLUSIVE', recordedTotal: 108, discount: 10);
      expect(t.subtotal, 100);
      expect(t.tax, 18);
      expect(t.discount, 10);
      expect(t.total, 108);
      expectAddsUp(t);

      final rows = receiptSummaryRows(t);
      expect(rows.map((r) => r[0]), containsAll(['Subtotal', 'Discount']));
      expect(rows.firstWhere((r) => r[0] == 'Subtotal')[1], 'Rs.100.00');
      expect(rows.firstWhere((r) => r[0] == 'Discount')[1], '-Rs.10.00');
      final taxRows = rows.where((r) => r[0].startsWith('CGST') || r[0].startsWith('SGST'));
      expect(taxRows.map((r) => r[1]), ['Rs.9.00', 'Rs.9.00']);
    });

    test('EXCLUSIVE: tax on top; Subtotal + tax - discount = Total', () {
      final one = [PdfLineItem(name: 'Soap', qty: 1, price: 100, taxRate: 18)];
      final t = ReceiptTotals.compute(one,
          taxMode: 'EXCLUSIVE', recordedTotal: 108, discount: 10);
      expect(t.subtotal, 100);
      expect(t.tax, 18);
      expect(t.discount, 10);
      expect(t.total, 108);
      expectAddsUp(t);
      expect(receiptSummaryRows(t).map((r) => r[0]), contains('Discount'));
    });

    test('EXCLUSIVE sale recorded without its tax still prints rows that add up', () {
      final one = [PdfLineItem(name: 'Soap', qty: 1, price: 100, taxRate: 18)];
      final t = ReceiptTotals.compute(one,
          taxMode: 'EXCLUSIVE', recordedTotal: 90, discount: 10);
      expect(t.total, 108);
      expectAddsUp(t);
    });

    test('NONE: no tax rows; the lines are the price', () {
      final t = ReceiptTotals.compute(items, taxMode: 'NONE', recordedTotal: 118);
      expect(t.tax, 0);
      expect(t.total, 118);
      expect(receiptSummaryRows(t).map((r) => r[0]), ['Subtotal']);
    });

    test('odd paise: CGST + SGST add to the tax exactly', () {
      final odd = [PdfLineItem(name: 'X', qty: 1, price: 33.33, taxRate: 5)];
      final t = ReceiptTotals.compute(odd, taxMode: 'INCLUSIVE', recordedTotal: 33.33);
      final rows = receiptSummaryRows(t);
      final c = double.parse(rows.firstWhere((r) => r[0].startsWith('CGST'))[1].substring(3));
      final s = double.parse(rows.firstWhere((r) => r[0].startsWith('SGST'))[1].substring(3));
      expect(c + s, closeTo(t.tax, 0.0001));
      expectAddsUp(t);
    });

    for (final mode in ['INCLUSIVE', 'EXCLUSIVE']) {
      test('$mode: the slip builds from a queued sale and the cached profile mode', () async {
        final inv = Invoice(
          id: 'SAL-1',
          grandTotal: 108,
          paidAmount: 108,
          discount: 10,
          items: [
            {'name': 'Soap', 'quantity': 1, 'rate': mode == 'INCLUSIVE' ? 118 : 100, 'taxRate': 18}
          ],
        );
        final bytes = await buildPosReceiptPdf(inv, null, taxMode: mode);
        expect(bytes.take(4), [0x25, 0x50, 0x44, 0x46]); // %PDF
      });
    }

    test('the sale\'s discount survives into the receipt invoice', () {
      expect(Invoice(id: 'SAL-1', discount: 7).discount, 7);
    });
  });

  group('5. cached tenant context only when the network is down', () {
    test('transport failures may use the cache', () {
      expect(mayUseCachedContext(TimeoutException('x')), isTrue);
      expect(mayUseCachedContext(const SocketException('x')), isTrue);
      expect(mayUseCachedContext(PostgrestException(message: 'gw', code: '503')), isTrue);
    });
    test('a server answer or an invalid session may not', () {
      expect(mayUseCachedContext(PostgrestException(message: 'denied', code: '42501')), isFalse);
      expect(mayUseCachedContext(PostgrestException(message: 'JWT expired', code: 'PGRST301')), isFalse);
      expect(mayUseCachedContext(AuthException('revoked')), isFalse);
    });
  });

  group('6. customer picker cache', () {
    test('no tenant known: no customers, not every shop\'s', () async {
      for (final t in ['T1', 'T2']) {
        await db.into(db.clients).insert(
            ClientsCompanion.insert(id: 'C-$t', tenantId: t, name: 'Cust $t'));
      }
      expect(await cachedPickerClients(db, null), isEmpty);
      final mine = await cachedPickerClients(db, 'T1');
      expect(mine.map((c) => c['id']), ['C-T1']);
    });
  });

  group('7. bill ids', () {
    test('SAL- plus 16 hex digits', () {
      final ids = {for (var i = 0; i < 5000; i++) newSaleId()};
      expect(ids, hasLength(5000));
      for (final id in ids.take(50)) {
        expect(id, matches(RegExp(r'^SAL-[0-9A-F]{16}$')));
      }
    });
  });
}
