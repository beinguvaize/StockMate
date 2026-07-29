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
import 'package:supabase_flutter/supabase_flutter.dart' show PostgrestException, AuthException;

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

  // Network attempts are bounded — on slow/flaky connections we fall back to
  // the offline queue after 6s instead of freezing the UI for the platform
  // default (60s+).
  static const _netTimeout = Duration(seconds: 6);

  /// True when a failure looks like a connectivity problem (worth queueing),
  /// false when the server answered and rejected the call.
  ///
  /// Queueing a server rejection is harmful: the mutation can never succeed on
  /// replay, it burns retries until FAILED, and the caller is told "saved
  /// offline" for something that will never land. A real DB error must surface
  /// instead — that's how a broken RPC (adjust_inventory_atomic overload
  /// ambiguity) stayed invisible. Mirrors the desktop isOfflineError split.
  bool _isNetworkError(Object e) {
    if (e is PostgrestException) return false; // server responded → logic/data error
    if (e is AuthException) return false;      // auth rejection → not connectivity
    return true;                               // socket / timeout / DNS → offline
  }

  Future<bool> upsertOnlineOrQueue(String table, Map<String, dynamic> row) async {
    try {
      await supabase.from(table).upsert(row).timeout(_netTimeout);
      return false;
    } catch (e) {
      debugPrint('[sync] upsert($table) failed online — queueing: $e');
      await queueMutation(targetTable: table, action: 'upsert', payload: row);
      return true;
    }
  }

  Future<bool> deleteOnlineOrQueue(String table, String id) async {
    try {
      // Soft delete — rows are flagged, never dropped (recoverable + audit).
      await supabase.from(table).update({'deleted_at': DateTime.now().toUtc().toIso8601String()}).eq('id', id).timeout(_netTimeout);
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
      await supabase.rpc(name, params: params).timeout(_netTimeout);
      return false;
    } catch (e) {
      if (!_isNetworkError(e)) {
        // Server rejected it — replaying would never help. Surface the real
        // reason to the caller instead of a false "saved offline".
        debugPrint('[sync] rpc($name) REJECTED by server — not queueing: $e');
        rethrow;
      }
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

  String? _cachedTenantId;
  Future<String?> _currentTenantId() async {
    if (_cachedTenantId != null) return _cachedTenantId;
    final u = supabase.auth.currentUser;
    if (u == null) return null;
    _cachedTenantId = u.userMetadata?['tenant_id'] as String?
        ?? (await supabase.from('users').select('tenant_id').eq('id', u.id).maybeSingle())?['tenant_id'] as String?;
    return _cachedTenantId;
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
          // Stamp the live tenant on tenant-scoped rows. Older queued items
          // could carry a stale/null tenant_id → RLS rejects them (42501).
          if (payload.containsKey('tenant_id')) {
            final tid = await _currentTenantId();
            if (tid != null) payload['tenant_id'] = tid;
          }
          // Bounded — a hung supabase call would otherwise stall the whole
          // queue and latch _flushing, leaving the app stuck on "Syncing…".
          await supabase.from(job.targetTable).upsert(payload).timeout(_netTimeout);
          break;
        case 'delete':
          final id = payload['id'];
          if (id == null) throw Exception('delete payload missing id');
          // Soft delete — flag, don't drop.
          await supabase.from(job.targetTable).update({'deleted_at': DateTime.now().toUtc().toIso8601String()}).eq('id', id).timeout(_netTimeout);
          break;
        case 'rpc':
          final name = job.rpcName;
          if (name == null || name.isEmpty) {
            throw Exception('rpc job missing rpcName');
          }
          await supabase.rpc(name, params: payload).timeout(_netTimeout);
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

  /// One-shot manual retry — used by the "Retry sync" button.
  ///
  /// Resets BOTH FAILED jobs and PENDING jobs that are still parked
  /// behind their exponential-backoff timer (nextAttemptAt in the
  /// future). Without the PENDING reset, a job that failed a few times
  /// — e.g. while a server-side bug like an RPC overload was being
  /// fixed — would sit unsynced for up to an hour with no way for the
  /// cashier to push it immediately. For a POS that's unacceptable:
  /// staff need to confirm a sale reached the server on demand.
  Future<void> retryFailed() async {
    await (db.update(db.syncMutations)
          ..where((t) =>
              t.status.equals('FAILED') | t.status.equals('PENDING')))
        .write(SyncMutationsCompanion(
          status: const Value('PENDING'),
          attempts: const Value(0),
          nextAttemptAt: Value(DateTime.now()),
          lastError: const Value(null),
        ));
    await sync();
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
      final tenantId = supabase.auth.currentUser?.userMetadata?['tenant_id'] as String?
          ?? (await supabase.from('users').select('tenant_id').eq('id', supabase.auth.currentUser!.id).maybeSingle())?['tenant_id'] as String?;
      var q = supabase.from('products').select().isFilter('deleted_at', null);
      if (tenantId != null) q = q.eq('tenant_id', tenantId);
      final response = await q;
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
          .select('id, tenant_id, "shopId", "paymentMethod", "paymentStatus", subtotal, tax, "totalAmount", "paidAmount", date, items')
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
          .select('id, tenant_id, category, amount, note, date').isFilter('deleted_at', null)
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
          .select('id, tenant_id, supplier_id, product_id, quantity, total_amount, date').isFilter('deleted_at', null)
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

  /// Fetch a tenant-scoped, non-deleted slice of [table].
  Future<List<dynamic>?> _fetch(String table, String columns, {int? limit}) async {
    final tenantId = await _currentTenantId();
    if (tenantId == null) return null;
    var q = supabase.from(table).select(columns).eq('tenant_id', tenantId).isFilter('deleted_at', null);
    final res = limit == null ? await q : await q.limit(limit);
    return res as List<dynamic>;
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
