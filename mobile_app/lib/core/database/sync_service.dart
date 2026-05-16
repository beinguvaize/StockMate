// Offline-first sync service.
//
// Pattern mirrors the server-side e_invoice_irn queue:
//   • every mutation goes into a local sync_mutations table first (Drift/SQLite)
//   • a worker pass picks PENDING jobs whose next_attempt_at <= now()
//   • on success → status=SUCCESS, isSynced=true
//   • on failure → exponential backoff up to MAX_ATTEMPTS, then status=FAILED
//   • a Connectivity stream listener auto-flushes the queue when the device
//     transitions from offline → online (no manual user action needed)

import 'dart:async';
import 'dart:convert';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:drift/drift.dart';
import 'package:flutter/foundation.dart';
import 'package:mobile_app/core/database/database.dart';
import 'package:mobile_app/core/supabase/client.dart';

enum SyncAction { upsert, delete, rpc }

class SyncService {
  final AppDatabase db;

  /// Cap on retries before a job is marked FAILED.
  static const int kMaxAttempts = 6;

  /// Backoff schedule (seconds) per attempt index. After this many seconds
  /// since last attempt the worker may retry. Last value is the cap.
  static const List<int> kBackoffSeconds = [
    10, 30, 120, 300, 900, 1800, 3600,
  ];

  StreamSubscription<ConnectivityResult>? _connSub;
  bool _flushing = false;

  SyncService(this.db) {
    // Auto-flush on connectivity restore.
    _connSub = Connectivity().onConnectivityChanged.listen((result) {
      if (result != ConnectivityResult.none) {
        // Fire and forget — flush errors are logged inside sync().
        sync();
      }
    });
  }

  void dispose() {
    _connSub?.cancel();
  }

  // ── Queue API ──────────────────────────────────────────────────────────────

  /// Queue a mutation. Returns the row id of the queued job.
  /// Caller may opt-in to a synchronous best-effort flush attempt.
  Future<int> queueMutation({
    required String targetTable,
    required String action, // 'upsert' | 'delete' | 'rpc'
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
      // Don't block the caller — flush in background.
      // ignore: unawaited_futures
      sync();
    }
    return id;
  }

  // ── Counters / observability ───────────────────────────────────────────────

  /// Count of jobs still owed to the server (PENDING + FAILED retryable).
  Future<int> pendingCount() async {
    final q = await db.customSelect(
      "SELECT COUNT(*) AS c FROM sync_mutations WHERE status IN ('PENDING','PROCESSING')",
    ).getSingle();
    return q.read<int>('c');
  }

  /// Stream of pending count — recomputed via watcher.
  Stream<int> watchPendingCount() {
    return db
        .customSelect(
          "SELECT COUNT(*) AS c FROM sync_mutations WHERE status IN ('PENDING','PROCESSING')",
          readsFrom: {db.syncMutations},
        )
        .watchSingle()
        .map((r) => r.read<int>('c'));
  }

  Future<int> failedCount() async {
    final q = await db.customSelect(
      "SELECT COUNT(*) AS c FROM sync_mutations WHERE status = 'FAILED'",
    ).getSingle();
    return q.read<int>('c');
  }

  // ── Worker ─────────────────────────────────────────────────────────────────

  /// Process queued mutations. Idempotent + reentrant-safe via _flushing latch.
  /// Each job is attempted independently — one failure does NOT block siblings.
  Future<void> sync() async {
    if (_flushing) return;
    _flushing = true;
    try {
      final conn = await Connectivity().checkConnectivity();
      if (conn == ConnectivityResult.none) return;

      final now = DateTime.now();
      final due = await (db.select(db.syncMutations)
            ..where((t) =>
                (t.status.equals('PENDING') | t.status.equals('PROCESSING')) &
                t.nextAttemptAt.isSmallerOrEqualValue(now))
            ..orderBy([(t) => OrderingTerm(expression: t.nextAttemptAt)])
            ..limit(50))
          .get();

      for (final job in due) {
        await _processJob(job);
      }
    } catch (e) {
      debugPrint('[sync] outer error: $e');
    } finally {
      _flushing = false;
    }
  }

  Future<void> _processJob(SyncMutation job) async {
    // Mark PROCESSING
    await (db.update(db.syncMutations)..where((t) => t.id.equals(job.id))).write(
      SyncMutationsCompanion(
        status: const Value('PROCESSING'),
        lastAttemptAt: Value(DateTime.now()),
        attempts: Value(job.attempts + 1),
      ),
    );

    try {
      final payload = jsonDecode(job.payload) as Map<String, dynamic>;

      switch (job.action) {
        case 'upsert':
          await supabase.from(job.targetTable).upsert(payload);
          break;
        case 'delete':
          final id = payload['id'];
          if (id == null) throw Exception('delete payload missing id');
          await supabase.from(job.targetTable).delete().eq('id', id);
          break;
        case 'rpc':
          final name = job.rpcName;
          if (name == null || name.isEmpty) {
            throw Exception('rpc job missing rpcName');
          }
          await supabase.rpc(name, params: payload);
          break;
        default:
          throw Exception('unknown action ${job.action}');
      }

      // SUCCESS
      await (db.update(db.syncMutations)..where((t) => t.id.equals(job.id))).write(
        const SyncMutationsCompanion(
          status: Value('SUCCESS'),
          isSynced: Value(true),
          lastError: Value(null),
        ),
      );
      debugPrint('[sync] OK job=${job.id} ${job.action} ${job.targetTable}');
    } catch (e) {
      final attempts = job.attempts + 1;
      final shouldRetry = attempts < kMaxAttempts;
      final backoff = kBackoffSeconds[
          attempts.clamp(0, kBackoffSeconds.length - 1)];

      await (db.update(db.syncMutations)..where((t) => t.id.equals(job.id))).write(
        SyncMutationsCompanion(
          status: Value(shouldRetry ? 'PENDING' : 'FAILED'),
          lastError: Value(e.toString()),
          nextAttemptAt: Value(
              DateTime.now().add(Duration(seconds: backoff))),
        ),
      );
      debugPrint(
          '[sync] FAIL job=${job.id} attempt=$attempts retry=$shouldRetry: $e');
    }
  }

  /// One-shot retry for FAILED jobs — used by manual "Retry sync" button.
  Future<void> retryFailed() async {
    await (db.update(db.syncMutations)
          ..where((t) => t.status.equals('FAILED')))
        .write(SyncMutationsCompanion(
          status: const Value('PENDING'),
          attempts: const Value(0),
          nextAttemptAt: Value(DateTime.now()),
          lastError: const Value(null),
        ));
    await sync();
  }

  // ── Pull sync (server → local) ─────────────────────────────────────────────

  /// Initial full sync from Supabase. RLS limits to the current tenant.
  Future<void> pullSync() async {
    try {
      final response = await supabase.from('products').select();
      final List<dynamic> data = response as List<dynamic>;

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
              costPrice: Value((item['costPrice'] ?? 0).toDouble()),
              sellingPrice: Value((item['sellingPrice'] ?? 0).toDouble()),
              stock: Value((item['stock'] ?? 0).toDouble()),
              taxRate: Value((item['taxRate'] ?? 0).toDouble()),
              image: Value(item['image']),
            ),
            mode: InsertMode.insertOrReplace,
          );
        }
      });
    } catch (e) {
      debugPrint('[pullSync] failed: $e');
      // Stay offline — local cache from previous sync is still valid.
    }
  }
}
