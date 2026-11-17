// Offline-first sync service (the outbox).
//
// Every write the phone cannot deliver right now goes into the local
// sync_mutations table (Drift/SQLite, so it survives an app kill and a phone
// restart) and is replayed, in the order it was made, when the network returns.
//
// The rules the replay keeps:
//
//   • FIFO. Jobs are replayed in insertion order. A collection queued after a
//     credit sale must not reach the server before the sale it pays for, so a
//     job waiting on its backoff timer holds the ones behind it, and a new
//     online write is queued (not sent ahead) while older jobs are still owed.
//
//   • Same call, same id. A queued job is the exact RPC the phone makes online,
//     carrying a client-made id (sale SAL-…, payment CP-…). The server's replay
//     guard (processed_ops / "sale already exists") makes a second delivery a
//     no-op, so a request that timed out AFTER committing is safe to resend.
//
//   • Transport failures never expire. A sale made at 9 am in a dead zone must
//     still be there at 9 pm. They back off (capped at five minutes) and retry
//     on a timer, on app resume and the moment connectivity returns.
//
//   • Server refusals are never retried silently and never dropped. They are
//     parked as FAILED with the server's reason, counted in the indicator and
//     listed for the owner with Retry and Discard. Discard keeps the row.
//
//   • Not every RPC is safe to resend. adjust_inventory_atomic carries no op
//     id, so the server cannot tell a second delivery from a second
//     adjustment. Those (kUnsafeToResend) are queued only when the request
//     provably never left the phone; after any ambiguous failure they are
//     parked FAILED as "Unconfirmed" for the owner to check and never resent
//     on their own.
//
// Statuses: PENDING | PROCESSING | SUCCESS | FAILED (refused, needs the owner)
//           | DISCARDED (owner acknowledged a refused job; kept for audit).

import 'dart:async';
import 'dart:convert';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:drift/drift.dart';
import 'package:flutter/foundation.dart';
import 'package:mobile_app/core/database/database.dart';
import 'package:mobile_app/core/database/sync_errors.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show PostgrestException;

enum SyncAction { upsert, delete, rpc, update }

/// Job states, as stored in sync_mutations.status.
class JobStatus {
  static const pending = 'PENDING';
  static const processing = 'PROCESSING';
  static const success = 'SUCCESS';
  static const failed = 'FAILED';
  static const discarded = 'DISCARDED';
  static const owed = [pending, processing];
}

/// Everything the outbox needs from the outside world. The default talks to
/// Supabase and connectivity_plus; tests hand in a fake so "the network is
/// down" is a flag rather than airplane mode.
abstract class SyncTransport {
  Future<bool> isOnline();
  Stream<bool> get onlineChanges;
  Future<dynamic> rpc(String name, Map<String, dynamic> params);
  Future<void> upsert(String table, Map<String, dynamic> row);
  Future<void> update(String table, String id, Map<String, dynamic> fields);
  Future<void> softDelete(String table, String id);

  /// The tenant_id of the row [table]/[id] as this user can see it, or null
  /// when no such row is visible (it may belong to another shop).
  Future<String?> rowTenant(String table, String id);
}

/// An UPDATE that touched no row. A refusal: replaying it cannot succeed until
/// the row exists, and "saved" would be a lie.
class ZeroRowsException extends PostgrestException {
  ZeroRowsException(String table, String id)
      : super(message: 'No $table row $id was updated', code: 'ZERO_ROWS');
}

class SupabaseSyncTransport implements SyncTransport {
  // Bounded: on a slow link fall back to the queue after 6s instead of
  // freezing the till for the platform default (60s+).
  static const _netTimeout = Duration(seconds: 6);

  @override
  Future<bool> isOnline() async =>
      (await Connectivity().checkConnectivity()) != ConnectivityResult.none;

  @override
  Stream<bool> get onlineChanges =>
      Connectivity().onConnectivityChanged.map((r) => r != ConnectivityResult.none);

  @override
  Future<dynamic> rpc(String name, Map<String, dynamic> params) =>
      supabase.rpc(name, params: params).timeout(_netTimeout);

  @override
  Future<void> upsert(String table, Map<String, dynamic> row) =>
      supabase.from(table).upsert(row).timeout(_netTimeout);

  @override
  Future<void> update(String table, String id, Map<String, dynamic> fields) async {
    // select('id') so a write that matched NOTHING (RLS hid the row, or the
    // sale it follows never landed) is seen and refused, not reported as done.
    final rows = await supabase
        .from(table)
        .update(fields)
        .eq('id', id)
        .select('id')
        .timeout(_netTimeout);
    if ((rows as List).isEmpty) throw ZeroRowsException(table, id);
  }

  @override
  Future<String?> rowTenant(String table, String id) async {
    final r = await supabase
        .from(table)
        .select('tenant_id')
        .eq('id', id)
        .maybeSingle()
        .timeout(_netTimeout);
    return r?['tenant_id'] as String?;
  }

  @override
  Future<void> softDelete(String table, String id) => supabase
      .from(table)
      // Soft delete — rows are flagged, never dropped (recoverable + audit).
      .update({'deleted_at': DateTime.now().toUtc().toIso8601String()})
      .eq('id', id)
      .timeout(_netTimeout);
}

class SyncService {
  final AppDatabase db;
  final SyncTransport transport;

  /// Kept for callers that read it; transport failures no longer expire.
  static const int kMaxAttempts = 6;

  /// Backoff (seconds) after the n-th consecutive transport failure of the
  /// head job. Capped at five minutes: a shop coming back online should not
  /// wait an hour for its morning's sales to land.
  static const List<int> kBackoffSeconds = [5, 15, 30, 60, 120, 300];

  /// How often the worker looks at the queue on its own. Covers the case
  /// connectivity_plus cannot see: Wi-Fi up, internet down, then back.
  static const Duration kTick = Duration(seconds: 60);

  /// RPCs that must never be sent twice: no op id, so a second delivery is a
  /// second adjustment. Queued only when the request never left the phone.
  static const Set<String> kUnsafeToResend = {'adjust_inventory_atomic'};

  /// Shown on a job whose delivery cannot be known.
  static const String kUnconfirmed = 'Unconfirmed: check Stock History before Retry';

  /// rpc → the primary-key constraint of the row the job itself creates. A
  /// 23505 on it on replay means the first delivery already landed.
  static const Map<String, String> kOwnKeyConstraint = {
    'process_purchase': 'purchases_pkey',
  };

  StreamSubscription<bool>? _connSub;
  Timer? _ticker;
  bool _flushing = false;
  Completer<void>? _flushDone;

  SyncService(this.db, {SyncTransport? transport, bool autoStart = true})
      : transport = transport ?? SupabaseSyncTransport() {
    if (autoStart) {
      // Connectivity restored → replay now, ignoring backoff timers.
      _connSub = this.transport.onlineChanges.listen((online) {
        if (online) sync(force: true);
      });
      _ticker = Timer.periodic(kTick, (_) => sync());
    }
  }

  void dispose() {
    _connSub?.cancel();
    _ticker?.cancel();
  }

  // ── Queue API ──────────────────────────────────────────────────────────────

  /// Queue a mutation. Returns the row id of the queued job.
  Future<int> queueMutation({
    required String targetTable,
    required String action, // 'upsert' | 'delete' | 'rpc' | 'update'
    required Map<String, dynamic> payload,
    String? rpcName, // required when action == 'rpc'
    bool fireAndForgetFlush = true,
  }) async {
    final id = await db.into(db.syncMutations).insert(
          SyncMutationsCompanion.insert(
            targetTable: targetTable,
            action: action,
            payload: jsonEncode(payload),
            rpcName: Value(rpcName),
          ),
        );

    if (fireAndForgetFlush) {
      // ignore: unawaited_futures
      sync();
    }
    return id;
  }

  // ── Offline-first helpers ──────────────────────────────────────────────────
  // Each tries the network first and falls back to the queue when the failure
  // is transport (or the queue already owes older jobs). Returns true when the
  // operation was queued (caller shows "saved on this phone"), false when it
  // completed online. A server refusal is rethrown: queueing it would only
  // report "saved" for something that can never land.

  /// True when older jobs are still owed. A new write then joins the back of
  /// the queue rather than overtaking them.
  /// Jobs held behind a refused sale do not count: they wait for the owner,
  /// not for the network, and must not make every later write queue too.
  Future<bool> _hasBacklog() async =>
      (await pendingCount()) - (await _heldJobIds()).length > 0;

  Future<bool> _onlineOrQueue(
    Future<void> Function() online,
    Future<int> Function() queue,
    String label, {
    Future<bool>? forceQueue,
  }) async {
    if (await _hasBacklog() || (forceQueue != null && await forceQueue)) {
      debugPrint('[sync] $label queued behind older jobs');
      await queue();
      return true;
    }
    try {
      await online();
      return false;
    } catch (e) {
      final kind = classifyFailure(e);
      if (kind == FailureKind.refused) {
        debugPrint('[sync] $label REJECTED by server — not queueing: $e');
        rethrow;
      }
      // Transport or auth: it may even have committed. Keep it; the
      // idempotent replay settles which.
      debugPrint('[sync] $label failed online ($kind) — queueing: $e');
      await queue();
      return true;
    }
  }

  Future<bool> upsertOnlineOrQueue(String table, Map<String, dynamic> row) =>
      _onlineOrQueue(
        () => transport.upsert(table, row),
        () => queueMutation(targetTable: table, action: 'upsert', payload: row),
        'upsert($table)',
      );

  Future<bool> deleteOnlineOrQueue(String table, String id) => _onlineOrQueue(
        () => transport.softDelete(table, id),
        () => queueMutation(targetTable: table, action: 'delete', payload: {'id': id}),
        'delete($table)',
      );

  /// Absolute-value column writes on one row (`UPDATE … SET … WHERE id`).
  /// Replaying it is harmless, which is why it is allowed in the queue.
  Future<bool> updateOnlineOrQueue(
          String table, String id, Map<String, dynamic> fields) =>
      _onlineOrQueue(
        () => transport.update(table, id, fields),
        () => queueMutation(
            targetTable: table, action: 'update', payload: {'id': id, 'fields': fields}),
        'update($table)',
        forceQueue: table == 'sales' ? _saleIsHeld(id) : null,
      );

  Future<bool> rpcOnlineOrQueue(String name, Map<String, dynamic> params) {
    Future<int> queue() => queueMutation(
        targetTable: 'rpc:$name', action: 'rpc', rpcName: name, payload: params);
    if (kUnsafeToResend.contains(name)) return _unsafeRpc(name, params, queue);
    // A follow-up of a refused sale waits behind it instead of racing ahead.
    return _onlineOrQueue(
      () async => transport.rpc(name, params),
      queue,
      'rpc($name)',
      forceQueue: _followsHeldSale(name, params),
    );
  }

  /// An RPC that must not be sent twice. Queue it only when the request
  /// provably never left (offline, or the socket never connected); after
  /// anything ambiguous record it FAILED/Unconfirmed instead of resending.
  Future<bool> _unsafeRpc(
      String name, Map<String, dynamic> params, Future<int> Function() queue) async {
    Future<bool> unconfirmed(Object e) async {
      debugPrint('[sync] $name outcome unknown ($e) — parked as Unconfirmed');
      final id = await queue();
      await (db.update(db.syncMutations)..where((t) => t.id.equals(id))).write(
        SyncMutationsCompanion(
          status: const Value(JobStatus.failed),
          lastError: Value('$kUnconfirmed ($e)'),
        ),
      );
      return true;
    }

    if (await _hasBacklog() || !await transport.isOnline()) {
      await queue();
      return true;
    }
    try {
      await transport.rpc(name, params);
      return false;
    } catch (e) {
      final kind = classifyFailure(e);
      if (kind == FailureKind.refused) rethrow;
      if (requestNeverLeft(e) || kind == FailureKind.auth) {
        await queue(); // not delivered; the replay is the first delivery
        return true;
      }
      return unconfirmed(e);
    }
  }

  // ── Editing a job that has not been sent ────────────────────────────────────

  // A sale that was refused can still be edited before the owner retries it:
  // the UPI answer arrives after the replay already failed. So for process_sale
  // "editable" means PENDING or FAILED; any other RPC only PENDING.
  List<String> _editable(String? rpcName) => rpcName == 'process_sale'
      ? [JobStatus.pending, JobStatus.failed]
      : [JobStatus.pending];

  /// The newest still-editable rpc job whose payload has `p_id == opId`
  /// (PENDING, or FAILED for a process_sale).
  Future<SyncMutation?> findPendingRpc(String rpcName, String opId) async {
    final rows = await (db.select(db.syncMutations)
          ..where((t) => t.rpcName.equals(rpcName) & t.status.isIn(_editable(rpcName)))
          ..orderBy([(t) => OrderingTerm(expression: t.id, mode: OrderingMode.desc)]))
        .get();
    for (final r in rows) {
      try {
        if ((jsonDecode(r.payload) as Map)['p_id'] == opId) return r;
      } catch (_) {}
    }
    return null;
  }

  /// Merge [changes] into a job that has NOT been picked up yet (or a refused
  /// sale, which stays FAILED until Retry sends the edited payload). Returns
  /// false when the worker already holds it (or it finished), in which case the
  /// caller must send its change as a follow-up job instead.
  Future<bool> amendPendingJob(int jobId, Map<String, dynamic> changes) async {
    return db.transaction(() async {
      final row = await (db.select(db.syncMutations)..where((t) => t.id.equals(jobId)))
          .getSingleOrNull();
      if (row == null || !_editable(row.rpcName).contains(row.status)) return false;
      final payload = Map<String, dynamic>.from(jsonDecode(row.payload) as Map)
        ..addAll(changes);
      final n = await (db.update(db.syncMutations)
            ..where((t) => t.id.equals(jobId) & t.status.equals(row.status)))
          .write(SyncMutationsCompanion(payload: Value(jsonEncode(payload))));
      return n == 1;
    });
  }

  /// Withdraw a job that has not been sent (e.g. a UPI sale whose payment never
  /// arrived), or a refused sale. Kept as DISCARDED with [reason]; a sale takes
  /// its follow-ups with it. Returns false if already sent.
  Future<bool> withdrawPendingJob(int jobId, String reason) async {
    return db.transaction(() async {
      final row = await (db.select(db.syncMutations)..where((t) => t.id.equals(jobId)))
          .getSingleOrNull();
      if (row == null || !_editable(row.rpcName).contains(row.status)) return false;
      final n = await (db.update(db.syncMutations)
            ..where((t) => t.id.equals(jobId) & t.status.equals(row.status)))
          .write(SyncMutationsCompanion(
            status: const Value(JobStatus.discarded),
            lastError: Value(reason),
          ));
      if (n == 1 && row.rpcName == 'process_sale') {
        await _discardFollowUps(_opIdOf(row), reason);
      }
      return n == 1;
    });
  }

  // ── Follow-ups of a sale ────────────────────────────────────────────────────
  // A follow-up is a job that changes a sale the same phone queued: an UPDATE
  // on sales (amount received, paid) or void_sale. It means nothing without
  // the sale, so while the sale is refused it is held; if the sale is
  // discarded it goes too; Retry sends both, sale first.

  String? _opIdOf(SyncMutation r) {
    try {
      return (jsonDecode(r.payload) as Map)['p_id']?.toString();
    } catch (_) {
      return null;
    }
  }

  /// The sale id a job follows, or null when it is not a follow-up.
  String? _followedSale(SyncMutation r) {
    try {
      final p = jsonDecode(r.payload) as Map;
      if (r.action == 'update' && r.targetTable == 'sales') return p['id']?.toString();
      if (r.action == 'rpc' && r.rpcName == 'void_sale') return p['p_id']?.toString();
    } catch (_) {}
    return null;
  }

  Future<Set<String>> _refusedSaleIds() async {
    final rows = await (db.select(db.syncMutations)
          ..where((t) => t.rpcName.equals('process_sale') & t.status.equals(JobStatus.failed)))
        .get();
    return {for (final r in rows) if (_opIdOf(r) != null) _opIdOf(r)!};
  }

  Future<bool> _saleIsHeld(String saleId) async => (await _refusedSaleIds()).contains(saleId);

  Future<bool> _followsHeldSale(String rpcName, Map<String, dynamic> params) async {
    if (rpcName != 'void_sale') return false;
    return _saleIsHeld((params['p_id'] ?? '').toString());
  }

  /// Owed follow-ups of refused sales: waiting on the owner, not the network.
  Future<Set<int>> _heldJobIds() async {
    final refused = await _refusedSaleIds();
    if (refused.isEmpty) return {};
    final owed = await (db.select(db.syncMutations)
          ..where((t) => t.status.isIn(JobStatus.owed)))
        .get();
    return {
      for (final r in owed)
        if (refused.contains(_followedSale(r))) r.id
    };
  }

  Future<void> _discardFollowUps(String? saleId, String reason) async {
    if (saleId == null) return;
    final rows = await (db.select(db.syncMutations)
          ..where((t) => t.status.isIn([...JobStatus.owed, JobStatus.failed])))
        .get();
    for (final r in rows) {
      if (_followedSale(r) != saleId) continue;
      await (db.update(db.syncMutations)..where((t) => t.id.equals(r.id))).write(
        SyncMutationsCompanion(
          status: const Value(JobStatus.discarded),
          lastError: Value('Its sale was discarded ($reason)'),
        ),
      );
    }
  }

  // ── Counters / observability ───────────────────────────────────────────────

  static const _owedSql =
      "SELECT COUNT(*) AS c FROM sync_mutations WHERE status IN ('PENDING','PROCESSING')";

  /// Jobs still owed to the server.
  Future<int> pendingCount() async =>
      (await db.customSelect(_owedSql).getSingle()).read<int>('c');

  Stream<int> watchPendingCount() => db
      .customSelect(_owedSql, readsFrom: {db.syncMutations})
      .watchSingle()
      .map((r) => r.read<int>('c'));

  Future<int> failedCount() async => (await db
          .customSelect("SELECT COUNT(*) AS c FROM sync_mutations WHERE status = 'FAILED'")
          .getSingle())
      .read<int>('c');

  /// Jobs the server refused — each one needs the owner.
  Stream<int> watchFailedCount() => db
      .customSelect("SELECT COUNT(*) AS c FROM sync_mutations WHERE status = 'FAILED'",
          readsFrom: {db.syncMutations})
      .watchSingle()
      .map((r) => r.read<int>('c'));

  /// Sales made on this phone that the server does not have yet.
  Stream<int> watchUnsyncedSaleCount() => db
      .customSelect(
          "SELECT COUNT(*) AS c FROM sync_mutations "
          "WHERE rpc_name = 'process_sale' AND status IN ('PENDING','PROCESSING')",
          readsFrom: {db.syncMutations})
      .watchSingle()
      .map((r) => r.read<int>('c'));

  // ── Worker ─────────────────────────────────────────────────────────────────

  /// Replay owed jobs in insertion order. Reentrant-safe: a call made while a
  /// pass runs does not start a second pass; it makes the running one go
  /// round again when it finishes (so a request made just as the network
  /// came back is not lost inside a pass that had already seen it offline),
  /// and resolves when that is done.
  ///
  /// [force] ignores backoff timers (connectivity just came back, or the
  /// cashier tapped Sync now).
  Future<void> sync({bool force = false}) async {
    if (_flushing) {
      _again = true;
      _againForce = _againForce || force;
      return _flushDone?.future;
    }
    _flushing = true;
    _flushDone = Completer<void>();
    try {
      var f = force;
      do {
        _again = false;
        await _pass(f);
        f = _againForce;
        _againForce = false;
      } while (_again);
    } catch (e) {
      debugPrint('[sync] outer error: $e');
    } finally {
      _flushing = false;
      _flushDone?.complete();
      _flushDone = null;
    }
  }

  bool _again = false;
  bool _againForce = false;

  Future<void> _pass(bool force) async {
    if (!await transport.isOnline()) return;
    var lastId = 0;
    while (true) {
      final batch = await (db.select(db.syncMutations)
            ..where((t) => t.status.isIn(JobStatus.owed) & t.id.isBiggerThanValue(lastId))
            ..orderBy([(t) => OrderingTerm(expression: t.id)])
            ..limit(50))
          .get();
      if (batch.isEmpty) return;
      for (final job in batch) {
        lastId = job.id;
        // Head of line: a job waiting on its timer holds everything after
        // it, or a later job (a collection) could overtake its sale.
        // A follow-up of a refused sale is held, not sent (it would update a
        // row that does not exist). It waits for the owner, not a timer, so it
        // is checked FIRST: it must never hold up the jobs behind it.
        final follows = _followedSale(job);
        if (follows != null && (await _refusedSaleIds()).contains(follows)) continue;
        if (!force && job.nextAttemptAt.isAfter(DateTime.now())) return;
        final failure = await _processJob(job);
        // The network (or the session) is gone for everyone, not just this
        // job; stop rather than time out on the rest of the queue.
        if (failure == FailureKind.transport || failure == FailureKind.auth) return;
      }
    }
  }

  String? _cachedTenantId;
  Future<String?> _currentTenantId() async {
    if (_cachedTenantId != null) return _cachedTenantId;
    final u = supabase.auth.currentUser;
    if (u == null) return null;
    _cachedTenantId = u.userMetadata?['tenant_id'] as String?
        ?? (await supabase.from('users').select('tenant_id').eq('id', u.id).maybeSingle())?['tenant_id'] as String?;
    return _cachedTenantId;
  }

  /// Returns null on success, otherwise how it failed.
  Future<FailureKind?> _processJob(SyncMutation queued) async {
    // Claim it, then re-read: an amendment made before the claim must be the
    // payload that is sent, and one made after it is refused (see
    // amendPendingJob), so nothing is half-applied.
    final claimed = await (db.update(db.syncMutations)
          ..where((t) => t.id.equals(queued.id) & t.status.isIn(JobStatus.owed)))
        .write(SyncMutationsCompanion(
          status: const Value(JobStatus.processing),
          lastAttemptAt: Value(DateTime.now()),
          attempts: Value(queued.attempts + 1),
        ));
    if (claimed == 0) return null; // withdrawn meanwhile
    // An unsafe RPC found mid-flight (PROCESSING: the app died or the reply
    // never came) may already have been applied. Never send it a second time.
    if (queued.status == JobStatus.processing &&
        queued.action == 'rpc' &&
        kUnsafeToResend.contains(queued.rpcName)) {
      await (db.update(db.syncMutations)..where((t) => t.id.equals(queued.id))).write(
        const SyncMutationsCompanion(
          status: Value(JobStatus.failed),
          lastError: Value(kUnconfirmed),
        ),
      );
      return null;
    }
    final job = await (db.select(db.syncMutations)..where((t) => t.id.equals(queued.id)))
        .getSingle();

    try {
      final payload = jsonDecode(job.payload) as Map<String, dynamic>;

      switch (job.action) {
        case 'upsert':
          // Stamp the live tenant on tenant-scoped rows. Older queued items
          // could carry a stale/null tenant_id → RLS rejects them (42501).
          if (payload.containsKey('tenant_id')) {
            final tid = await _currentTenantId();
            if (tid != null) payload['tenant_id'] = tid;
          }
          await transport.upsert(job.targetTable, payload);
          break;
        case 'delete':
          final id = payload['id'];
          if (id == null) throw Exception('delete payload missing id');
          await transport.softDelete(job.targetTable, id as String);
          break;
        case 'update':
          await transport.update(job.targetTable, payload['id'] as String,
              Map<String, dynamic>.from(payload['fields'] as Map));
          break;
        case 'rpc':
          final name = job.rpcName;
          if (name == null || name.isEmpty) {
            throw StateError('rpc job missing rpcName');
          }
          try {
            await transport.rpc(name, payload);
          } catch (e) {
            // A duplicate key on the row this very job creates: the first
            // delivery landed and only its reply was lost. That is success.
            if (await _landedBefore(name, e, payload)) {
              debugPrint('[sync] $name already landed (replay hit its own key)');
              break;
            }
            rethrow;
          }
          break;
        default:
          throw StateError('unknown action ${job.action}');
      }

      await (db.update(db.syncMutations)..where((t) => t.id.equals(job.id))).write(
        const SyncMutationsCompanion(
          status: Value(JobStatus.success),
          isSynced: Value(true),
          lastError: Value(null),
        ),
      );
      debugPrint('[sync] OK job=${job.id} ${job.action} ${job.targetTable}');
      return null;
    } catch (e) {
      // A malformed job is a refusal too: it can never succeed on replay.
      final unsafe = job.action == 'rpc' && kUnsafeToResend.contains(job.rpcName);
      var kind = e is StateError || e is FormatException || e is TypeError
          ? FailureKind.refused
          : classifyFailure(e);
      if (unsafe && kind == FailureKind.transport && !requestNeverLeft(e)) {
        // Ambiguous: it may have been applied. Park it; the owner checks.
        await (db.update(db.syncMutations)..where((t) => t.id.equals(job.id))).write(
          SyncMutationsCompanion(
            status: const Value(JobStatus.failed),
            lastError: Value('$kUnconfirmed ($e)'),
          ),
        );
        debugPrint('[sync] job=${job.id} ${job.rpcName} outcome unknown — Unconfirmed');
        return kind;
      }
      if (kind == FailureKind.refused) {
        await (db.update(db.syncMutations)..where((t) => t.id.equals(job.id))).write(
          SyncMutationsCompanion(
            status: const Value(JobStatus.failed),
            lastError: Value(e.toString()),
          ),
        );
      } else {
        final backoff = kBackoffSeconds[
            (job.attempts - 1).clamp(0, kBackoffSeconds.length - 1)];
        await (db.update(db.syncMutations)..where((t) => t.id.equals(job.id))).write(
          SyncMutationsCompanion(
            status: const Value(JobStatus.pending),
            lastError: Value(kind == FailureKind.auth
                ? 'Sign in again to send this. ($e)'
                : e.toString()),
            nextAttemptAt: Value(DateTime.now().add(Duration(seconds: backoff))),
          ),
        );
      }
      debugPrint('[sync] FAIL job=${job.id} attempt=${job.attempts} kind=$kind: $e');
      return kind;
    }
  }

  /// True when [e] is the job's own key colliding AND the row that is there
  /// is this shop's. Ids are random, but a clash across shops must never be
  /// read as "already landed" (that would silently lose a purchase). If the
  /// row's tenant cannot be confirmed it stays a refusal.
  Future<bool> _landedBefore(String rpcName, Object e, Map<String, dynamic> payload) async {
    final constraint = kOwnKeyConstraint[rpcName];
    if (constraint == null || e is! PostgrestException) return false;
    if ((e.code ?? '') != '23505') return false;
    if (!'${e.message} ${e.details} ${e.hint}'.contains(constraint)) return false;
    final tenant = payload['p_tenant_id'];
    final id = payload['p_id'];
    if (tenant == null || id == null) return false;
    try {
      return await transport.rowTenant('purchases', id.toString()) == tenant;
    } catch (_) {
      return false;
    }
  }

  /// "Sync now" / "Retry all": resets FAILED and backed-off PENDING jobs, then
  /// replays. Owner-initiated, so a refused job gets another honest attempt.
  Future<void> retryFailed() async {
    // Unconfirmed jobs are the owner's call (Retry on that one job), never a
    // bulk resend: they may already have been applied.
    await (db.update(db.syncMutations)
          ..where((t) =>
              (t.status.equals(JobStatus.failed) &
                  (t.lastError.isNull() | t.lastError.like('$kUnconfirmed%').not())) |
              t.status.equals(JobStatus.pending)))
        .write(SyncMutationsCompanion(
          status: const Value(JobStatus.pending),
          attempts: const Value(0),
          nextAttemptAt: Value(DateTime.now()),
        ));
    await sync(force: true);
  }

  /// Retry one refused job (after the owner fixed the stock, limit, …).
  Future<void> retryJob(int jobId) async {
    final row = await (db.select(db.syncMutations)..where((t) => t.id.equals(jobId)))
        .getSingleOrNull();
    if (row != null && row.status == JobStatus.failed && row.rpcName == 'process_sale') {
      // Its follow-ups were held; put any that failed back behind it.
      final id = _opIdOf(row);
      final rows = await (db.select(db.syncMutations)
            ..where((t) => t.status.equals(JobStatus.failed)))
          .get();
      for (final r in rows) {
        if (id != null && _followedSale(r) == id) {
          await (db.update(db.syncMutations)..where((t) => t.id.equals(r.id))).write(
            SyncMutationsCompanion(
              status: const Value(JobStatus.pending),
              attempts: const Value(0),
              nextAttemptAt: Value(DateTime.now()),
            ),
          );
        }
      }
    }
    await (db.update(db.syncMutations)
          ..where((t) => t.id.equals(jobId) & t.status.equals(JobStatus.failed)))
        .write(SyncMutationsCompanion(
          status: const Value(JobStatus.pending),
          attempts: const Value(0),
          nextAttemptAt: Value(DateTime.now()),
        ));
    await sync(force: true);
  }

  /// The owner accepts that a refused job will not be recorded. The row is
  /// kept (DISCARDED) with the reason it was refused, never deleted.
  Future<void> discardJob(int jobId) async {
    final row = await (db.select(db.syncMutations)..where((t) => t.id.equals(jobId)))
        .getSingleOrNull();
    if (row == null || row.status != JobStatus.failed) return;
    await (db.update(db.syncMutations)..where((t) => t.id.equals(jobId))).write(
      SyncMutationsCompanion(
        status: const Value(JobStatus.discarded),
        lastError: Value('Discarded by owner on ${DateTime.now().toIso8601String()}. '
            'Was refused: ${row.lastError ?? ''}'),
      ),
    );
    if (row.rpcName == 'process_sale') {
      await _discardFollowUps(_opIdOf(row), 'discarded by owner');
    }
  }

  // ── Pull sync (server → local) ─────────────────────────────────────────────

  /// Public helper: refresh ONLY the products table from supabase.
  /// Used by the inventory provider so post-sale stock updates land in
  /// Drift in ~300ms instead of waiting for a full 22-table pullSync.
  Future<void> pullProductsOnly() => _pullProducts();

  /// Initial full sync from Supabase. RLS limits to the current tenant.
  /// Each table is independent — if one fails the others still proceed.
  Future<void> pullSync() async {
    await Future.wait([
      _pullProducts(),
      _pullClients(),
      _pullSuppliers(),
      _pullInvoices(),
      _pullBusinessProfile(),
      _pullSales(),
      _pullExpenses(),
      _pullPurchases(),
      // Added in schema v6 — these back DayBook, client payments, HR, godown
      // stock, logistics stops and staff, all of which used to fail offline.
      _pullDayBook(),
      _pullClientPayments(),
      _pullEmployees(),
      _pullInventoryLocations(),
      _pullInventoryBalances(),
      _pullProductBatches(),
      _pullVehicles(),
      _pullRouteStops(),
      _pullPurchaseReturns(),
      _pullUsers(),
    ]);
  }

  Future<void> _pullProducts() async {
    try {
      // Filter by current user's tenant. RLS already does this on the
      // server but the local Drift cache has no tenant separation, so we
      // must be explicit — otherwise a GLOBAL_ADMIN view pollutes the
      // shared products table on every device.
      // currentUser!.id threw "Null check operator used on a null value" whenever
      // this ran without a session — caught by the per-table catch below, so
      // products silently did not sync and nothing said why. Seen on a real
      // device upgrade: "[pullSync] products failed: Null check operator used on
      // a null value". Session restore is async, so a sync firing before it
      // completes hits exactly this.
      final uid = supabase.auth.currentUser?.id;
      if (uid == null) {
        debugPrint('[pullSync] products skipped — no session yet');
        return;
      }
      final tenantId = supabase.auth.currentUser?.userMetadata?['tenant_id'] as String?
          ?? (await supabase.from('users').select('tenant_id').eq('id', uid).maybeSingle())?['tenant_id'] as String?;
      // Paged. This was a bare select, so a shop with more than 1000 SKUs
      // cached the first 1000 and the scanner silently failed to resolve the
      // rest -- the same truncation the web catalogue had.
      final List<dynamic> data = await _pageAll('products', (from, to) async {
        var q = supabase.from('products').select().isFilter('deleted_at', null);
        if (tenantId != null) q = q.eq('tenant_id', tenantId);
        final res = await q.order('id').range(from, to);
        return res as List<dynamic>;
      });
      await db.batch((batch) {
        for (final item in data) {
          batch.insert(
            db.products,
            ProductsCompanion.insert(
              id: item['id'],
              tenantId: item['tenant_id'],
              name: item['name'],
              sku: Value(item['sku']),
              category: Value(item['category']),
              unit: Value(item['unit']),
              secondaryUnit: Value(item['secondary_unit'] as String?),
              conversionFactor: Value((item['conversion_factor'] as num?)?.toDouble()),
              costPrice: Value((item['costPrice'] ?? 0).toDouble()),
              sellingPrice: Value((item['sellingPrice'] ?? 0).toDouble()),
              stock: Value((item['stock'] ?? 0).toDouble()),
              taxRate: Value((item['taxRate'] ?? 0).toDouble()),
              cessRate: Value((item['cess_rate'] ?? 0).toDouble()),
              hsnCode: Value(item['hsn_code']),
              image: Value(item['image']),
            ),
            mode: InsertMode.insertOrReplace,
          );
        }
      });
    } catch (e) {
      debugPrint('[pullSync] products failed: $e');
    }
  }

  Future<void> _pullClients() async {
    try {
      final response = await supabase
          .from('clients')
          .select('id, tenant_id, name, email, phone, address, balance, outstanding_balance')
          .isFilter('deleted_at', null);
      final List<dynamic> data = response as List<dynamic>;
      await db.batch((batch) {
        for (final item in data) {
          batch.insert(
            db.clients,
            ClientsCompanion.insert(
              id: item['id'] as String,
              tenantId: item['tenant_id'] as String,
              name: (item['name'] as String?) ?? '',
              email:   Value(item['email']   as String?),
              phone:   Value(item['phone']   as String?),
              address: Value(item['address'] as String?),
              balance: Value((item['balance'] ?? 0).toDouble()),
              outstandingBalance:
                  Value((item['outstanding_balance'] ?? 0).toDouble()),
            ),
            mode: InsertMode.insertOrReplace,
          );
        }
      });
    } catch (e) {
      debugPrint('[pullSync] clients failed: $e');
    }
  }

  Future<void> _pullInvoices() async {
    try {
      final response = await supabase
          .from('invoices')
          .select('id, tenant_id, invoice_number, client_id, client_name, sale_id, invoice_date, due_date, taxable_amount, grand_total, paid_amount, payment_status, irn, irn_status, ack_no, signed_qr, items').isFilter('deleted_at', null)
          .order('invoice_date', ascending: false)
          .limit(500);
      final List<dynamic> data = response as List<dynamic>;
      await db.batch((batch) {
        for (final item in data) {
          batch.insert(
            db.invoices,
            InvoicesCompanion.insert(
              id: item['id'] as String,
              tenantId: item['tenant_id'] as String,
              invoiceNumber: Value(item['invoice_number'] as String?),
              clientId:      Value(item['client_id']      as String?),
              clientName:    Value(item['client_name']    as String?),
              saleId:        Value(item['sale_id']        as String?),
              invoiceDate:   Value(item['invoice_date']?.toString()),
              dueDate:       Value(item['due_date']?.toString()),
              taxableAmount: Value((item['taxable_amount'] ?? 0).toDouble()),
              grandTotal:    Value((item['grand_total']    ?? 0).toDouble()),
              paidAmount:    Value((item['paid_amount']    ?? 0).toDouble()),
              paymentStatus: Value(item['payment_status'] as String?),
              irn:           Value(item['irn']            as String?),
              irnStatus:     Value(item['irn_status']     as String?),
              ackNo:         Value(item['ack_no']         as String?),
              signedQr:      Value(item['signed_qr']      as String?),
              itemsJson:     Value(item['items'] == null ? null : jsonEncode(item['items'])),
            ),
            mode: InsertMode.insertOrReplace,
          );
        }
      });
    } catch (e) {
      debugPrint('[pullSync] invoices failed: $e');
    }
  }

  Future<void> _pullBusinessProfile() async {
    try {
      final response = await supabase
          .from('business_profile')
          .select('tenant_id, name, address, phone, email, currency, gst_no, pan_no, upi_id, invoice_terms')
          .limit(1);
      final List<dynamic> data = response as List<dynamic>;
      if (data.isEmpty) return;
      final item = data.first as Map<String, dynamic>;
      await db.into(db.businessProfileLocal).insert(
        BusinessProfileLocalCompanion.insert(
          tenantId:        item['tenant_id'] as String,
          name:            Value(item['name']            as String?),
          address:         Value(item['address']         as String?),
          phone:           Value(item['phone']           as String?),
          email:           Value(item['email']           as String?),
          currency:        Value(item['currency']        as String?),
          gstNo:           Value(item['gst_no']          as String?),
          panNo:           Value(item['pan_no']          as String?),
          upiId:           Value(item['upi_id']          as String?),
          invoiceTerms:    Value(item['invoice_terms']   as String?),
          footerMessage:   const Value(null),
          autoIrnEnabled:  const Value(false),
        ),
        mode: InsertMode.insertOrReplace,
      );
    } catch (e) {
      debugPrint('[pullSync] business_profile failed: $e');
    }
  }

  Future<void> _pullSuppliers() async {
    try {
      final response = await supabase
          .from('suppliers')
          .select('id, tenant_id, name, contact_person, phone, balance')
          .isFilter('deleted_at', null);
      final List<dynamic> data = response as List<dynamic>;
      await db.batch((batch) {
        for (final item in data) {
          batch.insert(
            db.suppliers,
            SuppliersCompanion.insert(
              id:            item['id'] as String,
              tenantId:      item['tenant_id'] as String,
              name:          (item['name'] as String?) ?? '',
              contactPerson: Value(item['contact_person'] as String?),
              phone:         Value(item['phone'] as String?),
              balance:       Value((item['balance'] ?? 0).toDouble()),
            ),
            mode: InsertMode.insertOrReplace,
          );
        }
      });
    } catch (e) {
      debugPrint('[pullSync] suppliers failed: $e');
    }
  }

  Future<void> _pullSales() async {
    try {
      final response = await supabase
          .from('sales')
          .select('id, tenant_id, "shopId", "paymentMethod", "paymentStatus", subtotal, tax, "totalAmount", "paidAmount", date, items, created_at, "customerInfo"')
          .isFilter('deleted_at', null)
          .order('date', ascending: false)
          .limit(500);
      final List<dynamic> data = response as List<dynamic>;
      await db.batch((batch) {
        for (final item in data) {
          final rawDate = item['date'];
          final date = rawDate is String
              ? DateTime.tryParse(rawDate) ?? DateTime.now()
              : (rawDate as DateTime? ?? DateTime.now());
          batch.insert(
            db.sales,
            SalesCompanion.insert(
              id:            item['id'] as String,
              tenantId:      item['tenant_id'] as String,
              clientId:      Value(item['shopId'] as String?),
              paymentMethod: (item['paymentMethod'] as String?) ?? 'CASH',
              paymentStatus: (item['paymentStatus'] as String?) ?? 'PAID',
              subtotal:      (item['subtotal'] ?? 0).toDouble(),
              tax:           (item['tax'] ?? 0).toDouble(),
              totalAmount:   (item['totalAmount'] ?? 0).toDouble(),
              paidAmount:    Value((item['paidAmount'] ?? 0).toDouble()),
              date:          date,
              itemsJson:     item['items'] == null ? '[]' : jsonEncode(item['items']),
              createdAt:     Value(_ts(item['created_at'])),
              customerInfoJson: Value(item['customerInfo'] == null ? null : jsonEncode(item['customerInfo'])),
            ),
            mode: InsertMode.insertOrReplace,
          );
        }
      });
    } catch (e) {
      debugPrint('[pullSync] sales failed: $e');
    }
  }

  Future<void> _pullExpenses() async {
    try {
      final response = await supabase
          .from('expenses')
          .select('id, tenant_id, category, amount, note, date, created_at').isFilter('deleted_at', null)
          .order('date', ascending: false)
          .limit(500);
      final List<dynamic> data = response as List<dynamic>;
      await db.batch((batch) {
        for (final item in data) {
          final rawDate = item['date'];
          final date = rawDate is String
              ? DateTime.tryParse(rawDate) ?? DateTime.now()
              : (rawDate as DateTime? ?? DateTime.now());
          batch.insert(
            db.expenses,
            ExpensesCompanion.insert(
              id:       item['id'] as String,
              tenantId: item['tenant_id'] as String,
              category: (item['category'] as String?) ?? '',
              amount:   (item['amount'] ?? 0).toDouble(),
              note:     Value(item['note'] as String?),
              date:     date,
              createdAt: Value(_ts(item['created_at'])),
            ),
            mode: InsertMode.insertOrReplace,
          );
        }
      });
    } catch (e) {
      debugPrint('[pullSync] expenses failed: $e');
    }
  }

  Future<void> _pullPurchases() async {
    try {
      final response = await supabase
          .from('purchases')
          .select('id, tenant_id, supplier_id, linked_product_id, quantity, total_amount, date, payment_type, created_at').isFilter('deleted_at', null)
          .order('date', ascending: false)
          .limit(500);
      final List<dynamic> data = response as List<dynamic>;
      await db.batch((batch) {
        for (final item in data) {
          final rawDate = item['date'];
          final date = rawDate is String
              ? DateTime.tryParse(rawDate) ?? DateTime.now()
              : (rawDate as DateTime? ?? DateTime.now());
          batch.insert(
            db.purchases,
            PurchasesCompanion.insert(
              id:          item['id'] as String,
              tenantId:    item['tenant_id'] as String,
              supplierId:  Value(item['supplier_id'] as String?),
              // purchases.product_id was dropped server-side; it duplicated
              // linked_product_id and drifted whenever a purchase was re-linked.
              productId:   Value(item['linked_product_id'] as String?),
              quantity:    (item['quantity'] ?? 0).toDouble(),
              totalAmount: (item['total_amount'] ?? 0).toDouble(),
              date:        date,
              paymentType: Value(item['payment_type'] as String?),
              createdAt:   Value(_ts(item['created_at'])),
            ),
            mode: InsertMode.insertOrReplace,
          );
        }
      });
    } catch (e) {
      debugPrint('[pullSync] purchases failed: $e');
    }
  }

  // --- Offline cache for the ten tables added in schema v6 ---
  //
  // Each is scoped to the current tenant explicitly. RLS already does this
  // server-side, but the Drift cache has no tenant separation, so a GLOBAL_ADMIN
  // session would otherwise pour every tenant's rows into one shared local table
  // (the same trap _pullProducts documents).
  //
  // Helpers keep the ten methods honest about the two things that actually vary:
  // the query and the row mapping.

  DateTime? _ts(dynamic v) => v == null ? null : DateTime.tryParse(v as String);

  /// PostgREST answers with at most this many rows per request, whatever the
  /// query asks for. A pull without a .range() loop therefore returns the first
  /// 1000 rows and no error -- which for `products` means the scanner stops
  /// resolving anything past the thousandth SKU and nothing says why.
  static const int kPageSize = 1000;

  /// Stop rather than pull an unbounded table into a phone. Hitting it is
  /// reported, because the failure this replaces was the silent one.
  static const int kPullCeiling = 50000;

  /// Read every page of a query instead of its first 1000 rows.
  ///
  /// [page] is handed a zero-based inclusive range and must apply its own
  /// ORDER BY: range paging over an unordered query can repeat a row on one
  /// page and skip it on the next, because Postgres is free to return rows in
  /// a different order each time.
  Future<List<dynamic>> _pageAll(
    String label,
    Future<List<dynamic>> Function(int from, int to) page,
  ) async {
    final out = <dynamic>[];
    for (var from = 0; from < kPullCeiling; from += kPageSize) {
      final batch = await page(from, from + kPageSize - 1);
      out.addAll(batch);
      if (batch.length < kPageSize) return out;   // short page = end of table
    }
    debugPrint('[pullSync] $label: stopped at the $kPullCeiling-row ceiling; '
        'the local cache is incomplete past that point.');
    return out;
  }

  /// Fetch a tenant-scoped, non-deleted slice of [table].
  ///
  /// With no [limit] this pages the whole table rather than taking PostgREST's
  /// first 1000 rows.
  Future<List<dynamic>?> _fetch(String table, String columns, {int? limit}) async {
    final tenantId = await _currentTenantId();
    if (tenantId == null) return null;
    if (limit != null) {
      final res = await supabase.from(table).select(columns)
          .eq('tenant_id', tenantId).isFilter('deleted_at', null).limit(limit);
      return res as List<dynamic>;
    }
    return _pageAll(table, (from, to) async {
      final res = await supabase.from(table).select(columns)
          .eq('tenant_id', tenantId).isFilter('deleted_at', null)
          .order('id').range(from, to);
      return res as List<dynamic>;
    });
  }

  Future<void> _pullDayBook() async {
    try {
      final data = await _fetch('day_book',
          'id, tenant_id, date, location_id, opening_balance, closing_balance, total_sales, total_expenses, is_closed, closed_at, closed_by, physical_cash, variance, updated_at');
      if (data == null) return;
      await db.batch((batch) {
        for (final i in data) {
          batch.insert(db.dayBookLocal, DayBookLocalCompanion.insert(
            id: i['id'] as String,
            tenantId: i['tenant_id'] as String,
            date: i['date'] as String,
            locationId: Value(i['location_id'] as String?),
            openingBalance: Value((i['opening_balance'] as num?)?.toDouble()),
            closingBalance: Value((i['closing_balance'] as num?)?.toDouble()),
            totalSales: Value((i['total_sales'] as num?)?.toDouble()),
            totalExpenses: Value((i['total_expenses'] as num?)?.toDouble()),
            isClosed: Value((i['is_closed'] as bool?) ?? false),
            closedAt: Value(_ts(i['closed_at'])),
            closedBy: Value(i['closed_by'] as String?),
            physicalCash: Value((i['physical_cash'] as num?)?.toDouble()),
            variance: Value((i['variance'] as num?)?.toDouble()),
            updatedAt: Value(_ts(i['updated_at'])),
          ), mode: InsertMode.insertOrReplace);
        }
      });
    } catch (e) {
      debugPrint('[pullSync] day_book failed: $e');
    }
  }

  Future<void> _pullClientPayments() async {
    try {
      final data = await _fetch('client_payments',
          'id, tenant_id, client_id, amount, date, payment_method, notes, recorded_by, updated_at');
      if (data == null) return;
      await db.batch((batch) {
        for (final i in data) {
          batch.insert(db.clientPayments, ClientPaymentsCompanion.insert(
            id: i['id'] as String,
            tenantId: i['tenant_id'] as String,
            clientId: Value(i['client_id'] as String?),
            amount: Value((i['amount'] as num?)?.toDouble()),
            date: Value(i['date'] as String?),
            paymentMethod: Value(i['payment_method'] as String?),
            notes: Value(i['notes'] as String?),
            recordedBy: Value(i['recorded_by'] as String?),
            updatedAt: Value(_ts(i['updated_at'])),
          ), mode: InsertMode.insertOrReplace);
        }
      });
    } catch (e) {
      debugPrint('[pullSync] client_payments failed: $e');
    }
  }

  Future<void> _pullEmployees() async {
    try {
      final data = await _fetch('employees',
          'id, tenant_id, name, role, position, department, status, pay_type, salary, daily_rate, days_worked, amount_paid, phone, email, bank_account, employment_type, joining_date, notes, user_id, updated_at');
      if (data == null) return;
      await db.batch((batch) {
        for (final i in data) {
          batch.insert(db.employees, EmployeesCompanion.insert(
            id: i['id'] as String,
            tenantId: i['tenant_id'] as String,
            name: Value(i['name'] as String?),
            role: Value(i['role'] as String?),
            position: Value(i['position'] as String?),
            department: Value(i['department'] as String?),
            status: Value(i['status'] as String?),
            payType: Value(i['pay_type'] as String?),
            salary: Value((i['salary'] as num?)?.toDouble()),
            dailyRate: Value((i['daily_rate'] as num?)?.toDouble()),
            daysWorked: Value((i['days_worked'] as num?)?.toDouble()),
            amountPaid: Value((i['amount_paid'] as num?)?.toDouble()),
            phone: Value(i['phone'] as String?),
            email: Value(i['email'] as String?),
            bankAccount: Value(i['bank_account'] as String?),
            employmentType: Value(i['employment_type'] as String?),
            joiningDate: Value(i['joining_date'] as String?),
            notes: Value(i['notes'] as String?),
            userId: Value(i['user_id'] as String?),
            updatedAt: Value(_ts(i['updated_at'])),
          ), mode: InsertMode.insertOrReplace);
        }
      });
    } catch (e) {
      debugPrint('[pullSync] employees failed: $e');
    }
  }

  Future<void> _pullInventoryLocations() async {
    try {
      final data = await _fetch('inventory_locations',
          'id, tenant_id, name, type, reference_id, updated_at');
      if (data == null) return;
      await db.batch((batch) {
        for (final i in data) {
          batch.insert(db.inventoryLocations, InventoryLocationsCompanion.insert(
            id: i['id'] as String,
            tenantId: i['tenant_id'] as String,
            name: i['name'] as String,
            type: i['type'] as String,
            referenceId: Value(i['reference_id'] as String?),
            updatedAt: Value(_ts(i['updated_at'])),
          ), mode: InsertMode.insertOrReplace);
        }
      });
    } catch (e) {
      debugPrint('[pullSync] inventory_locations failed: $e');
    }
  }

  Future<void> _pullInventoryBalances() async {
    try {
      final data = await _fetch('inventory_balances',
          'id, tenant_id, product_id, location_id, quantity, updated_at');
      if (data == null) return;
      await db.batch((batch) {
        for (final i in data) {
          batch.insert(db.inventoryBalances, InventoryBalancesCompanion.insert(
            id: i['id'] as String,
            tenantId: i['tenant_id'] as String,
            productId: i['product_id'] as String,
            locationId: Value(i['location_id'] as String?),
            quantity: Value((i['quantity'] as num?)?.toDouble()),
            updatedAt: Value(_ts(i['updated_at'])),
          ), mode: InsertMode.insertOrReplace);
        }
      });
    } catch (e) {
      debugPrint('[pullSync] inventory_balances failed: $e');
    }
  }

  Future<void> _pullProductBatches() async {
    try {
      // Only lots with stock left — a closed batch has no bearing on anything
      // the app displays, and this table grows with every purchase.
      final tenantId = await _currentTenantId();
      if (tenantId == null) return;
      final res = await supabase
          .from('product_batches')
          .select('id, tenant_id, product_id, purchase_id, supplier_id, warehouse_id, received_date, expiry_date, unit_cost, qty_received, qty_remaining, origin, cost_basis, note, updated_at')
          .eq('tenant_id', tenantId)
          .isFilter('deleted_at', null)
          .gt('qty_remaining', 0);
      final List<dynamic> data = res as List<dynamic>;
      await db.batch((batch) {
        for (final i in data) {
          batch.insert(db.productBatches, ProductBatchesCompanion.insert(
            id: i['id'] as String,
            tenantId: i['tenant_id'] as String,
            productId: i['product_id'] as String,
            purchaseId: Value(i['purchase_id'] as String?),
            supplierId: Value(i['supplier_id'] as String?),
            warehouseId: Value(i['warehouse_id'] as String?),
            receivedDate: Value(i['received_date'] as String?),
            expiryDate: Value(i['expiry_date'] as String?),
            unitCost: Value((i['unit_cost'] as num?)?.toDouble()),
            qtyReceived: Value((i['qty_received'] as num?)?.toDouble()),
            qtyRemaining: Value((i['qty_remaining'] as num?)?.toDouble()),
            origin: Value(i['origin'] as String?),
            costBasis: Value(i['cost_basis'] as String?),
            note: Value(i['note'] as String?),
            updatedAt: Value(_ts(i['updated_at'])),
          ), mode: InsertMode.insertOrReplace);
        }
      });
    } catch (e) {
      debugPrint('[pullSync] product_batches failed: $e');
    }
  }

  Future<void> _pullVehicles() async {
    try {
      // Note the camelCase columns — vehicles was created with quoted mixed-case
      // names server-side, unlike every other table here.
      final data = await _fetch('vehicles',
          'id, tenant_id, name, "plateNumber", type, status, capacity, "fuelType", updated_at');
      if (data == null) return;
      await db.batch((batch) {
        for (final i in data) {
          batch.insert(db.vehicles, VehiclesCompanion.insert(
            id: i['id'] as String,
            tenantId: i['tenant_id'] as String,
            name: Value(i['name'] as String?),
            plateNumber: Value(i['plateNumber'] as String?),
            type: Value(i['type'] as String?),
            status: Value(i['status'] as String?),
            capacity: Value((i['capacity'] as num?)?.toDouble()),
            fuelType: Value(i['fuelType'] as String?),
            updatedAt: Value(_ts(i['updated_at'])),
          ), mode: InsertMode.insertOrReplace);
        }
      });
    } catch (e) {
      debugPrint('[pullSync] vehicles failed: $e');
    }
  }

  Future<void> _pullRouteStops() async {
    try {
      final data = await _fetch('route_stops',
          'id, tenant_id, route_id, invoice_id, client_id, client_name, sequence, status, notes, cash_collected, items_delivered, visited_at, updated_at');
      if (data == null) return;
      await db.batch((batch) {
        for (final i in data) {
          batch.insert(db.routeStops, RouteStopsCompanion.insert(
            id: i['id'] as String,
            tenantId: i['tenant_id'] as String,
            routeId: i['route_id'] as String,
            invoiceId: Value(i['invoice_id'] as String?),
            clientId: Value(i['client_id'] as String?),
            clientName: Value(i['client_name'] as String?),
            sequence: Value((i['sequence'] as num?)?.toInt()),
            status: Value(i['status'] as String?),
            notes: Value(i['notes'] as String?),
            cashCollected: Value((i['cash_collected'] as num?)?.toDouble()),
            itemsDeliveredJson: Value(
                i['items_delivered'] == null ? null : jsonEncode(i['items_delivered'])),
            visitedAt: Value(_ts(i['visited_at'])),
            updatedAt: Value(_ts(i['updated_at'])),
          ), mode: InsertMode.insertOrReplace);
        }
      });
    } catch (e) {
      debugPrint('[pullSync] route_stops failed: $e');
    }
  }

  Future<void> _pullPurchaseReturns() async {
    try {
      final data = await _fetch('purchase_returns',
          'id, tenant_id, purchase_id, supplier_id, supplier_name, product_id, product_name, quantity, unit_price, total_amount, reason, date, updated_at');
      if (data == null) return;
      await db.batch((batch) {
        for (final i in data) {
          batch.insert(db.purchaseReturns, PurchaseReturnsCompanion.insert(
            id: i['id'] as String,
            tenantId: i['tenant_id'] as String,
            purchaseId: Value(i['purchase_id'] as String?),
            supplierId: Value(i['supplier_id'] as String?),
            supplierName: Value(i['supplier_name'] as String?),
            productId: Value(i['product_id'] as String?),
            productName: Value(i['product_name'] as String?),
            quantity: Value((i['quantity'] as num?)?.toDouble()),
            unitPrice: Value((i['unit_price'] as num?)?.toDouble()),
            totalAmount: Value((i['total_amount'] as num?)?.toDouble()),
            reason: Value(i['reason'] as String?),
            date: Value(i['date'] as String?),
            updatedAt: Value(_ts(i['updated_at'])),
          ), mode: InsertMode.insertOrReplace);
        }
      });
    } catch (e) {
      debugPrint('[pullSync] purchase_returns failed: $e');
    }
  }

  Future<void> _pullUsers() async {
    try {
      final data = await _fetch('users',
          'id, tenant_id, name, email, status, avatar_url, roles, permissions, updated_at');
      if (data == null) return;
      await db.batch((batch) {
        for (final i in data) {
          batch.insert(db.usersLocal, UsersLocalCompanion.insert(
            id: i['id'] as String,
            tenantId: i['tenant_id'] as String,
            name: Value(i['name'] as String?),
            email: Value(i['email'] as String?),
            status: Value(i['status'] as String?),
            avatarUrl: Value(i['avatar_url'] as String?),
            rolesJson: Value(i['roles'] == null ? null : jsonEncode(i['roles'])),
            permissionsJson: Value(i['permissions'] == null ? null : jsonEncode(i['permissions'])),
            updatedAt: Value(_ts(i['updated_at'])),
          ), mode: InsertMode.insertOrReplace);
        }
      });
    } catch (e) {
      debugPrint('[pullSync] users failed: $e');
    }
  }
}
