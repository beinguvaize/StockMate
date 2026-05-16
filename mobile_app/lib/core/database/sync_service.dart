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

  // ── Offline-first helpers ──────────────────────────────────────────────────
  // Each helper tries the network first while online; on transient failure
  // (network, 5xx, timeout) it falls back to enqueueing the mutation. Returns
  // true if the operation was queued for later (caller can show "saved offline"
  // UI), false if it completed online immediately.

  Future<bool> upsertOnlineOrQueue(String table, Map<String, dynamic> row) async {
    try {
      await supabase.from(table).upsert(row);
      return false;
    } catch (e) {
      debugPrint('[sync] upsert($table) failed online — queueing: $e');
      await queueMutation(targetTable: table, action: 'upsert', payload: row);
      return true;
    }
  }

  Future<bool> deleteOnlineOrQueue(String table, String id) async {
    try {
      await supabase.from(table).delete().eq('id', id);
      return false;
    } catch (e) {
      debugPrint('[sync] delete($table) failed online — queueing: $e');
      await queueMutation(
        targetTable: table,
        action: 'delete',
        payload: {'id': id},
      );
      return true;
    }
  }

  Future<bool> rpcOnlineOrQueue(String name, Map<String, dynamic> params) async {
    try {
      await supabase.rpc(name, params: params);
      return false;
    } catch (e) {
      debugPrint('[sync] rpc($name) failed online — queueing: $e');
      await queueMutation(
        targetTable: 'rpc:$name',
        action: 'rpc',
        rpcName: name,
        payload: params,
      );
      return true;
    }
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
  /// Each table is independent — if one fails the others still proceed.
  Future<void> pullSync() async {
    await Future.wait([
      _pullProducts(),
      _pullClients(),
      _pullSuppliers(),
      _pullInvoices(),
      _pullBusinessProfile(),
    ]);
  }

  Future<void> _pullProducts() async {
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
      debugPrint('[pullSync] products failed: $e');
    }
  }

  Future<void> _pullClients() async {
    try {
      final response = await supabase
          .from('clients')
          .select('id, tenant_id, name, email, phone, address, balance, outstanding_balance');
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
          .select('id, tenant_id, invoice_number, client_id, client_name, sale_id, invoice_date, due_date, taxable_amount, grand_total, paid_amount, payment_status, irn, irn_status, ack_no, signed_qr, items')
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
          .select('tenant_id, name, address, phone, email, currency, gst_no, pan_no, upi_id, invoice_terms, footer_message, auto_irn_enabled')
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
          footerMessage:   Value(item['footer_message']  as String?),
          autoIrnEnabled:  Value(item['auto_irn_enabled'] == true),
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
          .select('id, tenant_id, name, contact_person, phone, balance');
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
}
