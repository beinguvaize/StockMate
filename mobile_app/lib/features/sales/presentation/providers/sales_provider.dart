import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:drift/drift.dart' show OrderingTerm, OrderingMode, Expression, ComparableExpr, BooleanExpressionOperators;
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/database/unsynced_sales.dart';
import 'package:mobile_app/core/database/offline_sales_ui.dart'
    show unsyncedSaleCountProvider, refusedJobCountProvider;
import 'package:mobile_app/features/sales/data/models/sale.dart';
import 'package:mobile_app/main.dart' show databaseProvider;

// Total quantity sold per product (from recent sales' items). Used to order
// the POS / Van product grid with best-sellers first.
final topSellingQtyProvider = FutureProvider<Map<String, double>>((ref) async {
  final sales = await ref.watch(recentSalesProvider.future);
  final m = <String, double>{};
  for (final s in sales) {
    for (final it in (s.items ?? const [])) {
      if (it is! Map) continue;
      final id = (it['id'] ?? it['productId'])?.toString();
      if (id == null || id.isEmpty) continue;
      final q = it['quantity'] ?? it['qty'] ?? 0;
      final qd = q is num ? q.toDouble() : (double.tryParse('$q') ?? 0);
      m[id] = (m[id] ?? 0) + qd;
    }
  }
  return m;
});

// Cache-first recent sales. Mirrors web useSales: tenant-scoped, newest first,
// 500-row cap. Falls back to local Drift sales table when offline.
//
// Either way, sales rung on this phone that the server has not confirmed yet
// are laid over the top from the outbox, tagged pending / refused, so the
// cashier never sees a sale "disappear" between ringing it and syncing it.
final recentSalesProvider = FutureProvider<List<Sale>>((ref) async {
  // Re-run when a queued sale is added, lands or is refused.
  ref.watch(unsyncedSaleCountProvider.select((v) => v.valueOrNull));
  ref.watch(refusedJobCountProvider.select((v) => v.valueOrNull));
  final ctx = await ref.watch(tenantContextProvider.future);
  if (ctx == null) return [];
  final db = ref.read(databaseProvider);

  List<Map<String, dynamic>> base;
  var offline = false;
  try {
    final response = await supabase
        .from('sales')
        .select().isFilter('deleted_at', null)
        .eq('tenant_id', ctx.tenantId)
        .order('created_at', ascending: false)
        .limit(500);
    base = (response as List).cast<Map<String, dynamic>>();
  } catch (e) {
    debugPrint('[recentSalesProvider] online failed, using Drift cache: $e');
    offline = true;
    final rows = await (db.select(db.sales)
          ..where((t) => t.tenantId.equals(ctx.tenantId))
          ..orderBy([
            (t) => OrderingTerm(expression: t.date, mode: OrderingMode.desc),
            (t) => OrderingTerm(expression: t.id,   mode: OrderingMode.desc),
          ])
          ..limit(500))
        .get();
    base = rows
        .map((r) => <String, dynamic>{
              'id': r.id,
              'tenant_id': r.tenantId,
              'shopId': r.clientId,
              'paymentMethod': r.paymentMethod,
              'paymentStatus': r.paymentStatus,
              'subtotal': r.subtotal,
              'tax': r.tax,
              'totalAmount': r.totalAmount,
              'paidAmount': r.paidAmount,
              'date': r.date.toIso8601String().split('T').first,
              'items': jsonDecode(r.itemsJson),
              if (r.createdAt != null) 'created_at': r.createdAt!.toIso8601String(),
              if (r.customerInfoJson != null) 'customerInfo': jsonDecode(r.customerInfoJson!),
            })
        .toList();
  }

  try {
    final ops = await unsyncedOps(db, ctx.tenantId, includeSynced: offline);
    if (ops.isNotEmpty) {
      final clients = await (db.select(db.clients)
            ..where((t) => t.tenantId.equals(ctx.tenantId)))
          .get();
      base = overlayUnsyncedSales(base, ops,
          clientNames: {for (final c in clients) c.id: c.name});
    }
  } catch (e) {
    debugPrint('[recentSalesProvider] outbox overlay failed: $e');
  }
  return base.map(Sale.fromJson).toList();
});

// ── Sales history (phone Sales screen) ───────────────────────────────────────
//
// recentSalesProvider above stays as it was for every other screen. The Sales
// history screen reads these instead: a date-bounded list that grows 100 rows
// at a time as the user scrolls, and server-side period totals so the headline
// is not "the sum of whatever 500 rows we happened to load".

const salesPageSize = 100;

/// (from, to, limit). from/to are yyyy-MM-dd, inclusive; null = unbounded.
typedef SalesHistoryQuery = ({String? from, String? to, int limit});

final salesHistoryProvider =
    FutureProvider.family<List<Sale>, SalesHistoryQuery>((ref, q) async {
  // Follow every existing invalidation of the recent list (realtime, add sale,
  // collect, void) and the outbox, so this screen never goes stale.
  ref.watch(recentSalesProvider);
  ref.watch(unsyncedSaleCountProvider.select((v) => v.valueOrNull));
  ref.watch(refusedJobCountProvider.select((v) => v.valueOrNull));
  final ctx = await ref.watch(tenantContextProvider.future);
  if (ctx == null) return [];
  final db = ref.read(databaseProvider);

  // sales.date may be a DATE or a timestamp: bound with < next day so both work.
  String? nextDay(String? ymd) {
    final d = ymd == null ? null : DateTime.tryParse(ymd);
    if (d == null) return null;
    final n = DateTime(d.year, d.month, d.day + 1);
    return '${n.year.toString().padLeft(4, '0')}-${n.month.toString().padLeft(2, '0')}-${n.day.toString().padLeft(2, '0')}';
  }

  List<Map<String, dynamic>> base;
  var offline = false;
  try {
    var query = supabase
        .from('sales')
        .select()
        .isFilter('deleted_at', null)
        .eq('tenant_id', ctx.tenantId);
    if (q.from != null) query = query.gte('date', q.from!);
    final nd = nextDay(q.to);
    if (nd != null) query = query.lt('date', nd);
    final response =
        await query.order('created_at', ascending: false).limit(q.limit);
    base = (response as List).cast<Map<String, dynamic>>();
  } catch (e) {
    debugPrint('[salesHistoryProvider] online failed, using Drift cache: $e');
    offline = true;
    final from = q.from == null ? null : DateTime.tryParse(q.from!);
    final to = q.to == null ? null : DateTime.tryParse(q.to!);
    final rows = await (db.select(db.sales)
          ..where((t) {
            Expression<bool> p = t.tenantId.equals(ctx.tenantId);
            if (from != null) p = p & t.date.isBiggerOrEqualValue(from);
            if (to != null) {
              p = p & t.date.isSmallerThanValue(DateTime(to.year, to.month, to.day + 1));
            }
            return p;
          })
          ..orderBy([
            (t) => OrderingTerm(expression: t.date, mode: OrderingMode.desc),
            (t) => OrderingTerm(expression: t.id, mode: OrderingMode.desc),
          ])
          ..limit(q.limit))
        .get();
    base = rows
        .map((r) => <String, dynamic>{
              'id': r.id,
              'tenant_id': r.tenantId,
              'shopId': r.clientId,
              'paymentMethod': r.paymentMethod,
              'paymentStatus': r.paymentStatus,
              'subtotal': r.subtotal,
              'tax': r.tax,
              'totalAmount': r.totalAmount,
              'paidAmount': r.paidAmount,
              'date': r.date.toIso8601String().split('T').first,
              'items': jsonDecode(r.itemsJson),
              if (r.createdAt != null) 'created_at': r.createdAt!.toIso8601String(),
              if (r.customerInfoJson != null) 'customerInfo': jsonDecode(r.customerInfoJson!),
            })
        .toList();
  }

  try {
    final ops = await unsyncedOps(db, ctx.tenantId, includeSynced: offline);
    if (ops.isNotEmpty) {
      final clients = await (db.select(db.clients)
            ..where((t) => t.tenantId.equals(ctx.tenantId)))
          .get();
      base = overlayUnsyncedSales(base, ops,
          clientNames: {for (final c in clients) c.id: c.name});
    }
  } catch (e) {
    debugPrint('[salesHistoryProvider] outbox overlay failed: $e');
  }
  var sales = base.map(Sale.fromJson).toList();
  // Queued sales outside the chosen period do not belong in this view.
  if (q.from != null || q.to != null) {
    sales = sales.where((s) {
      if (s.syncState == null) return true;
      final d = s.date == null ? null : DateTime.tryParse(s.date!);
      if (d == null) return true;
      final day = '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
      return (q.from == null || day.compareTo(q.from!) >= 0) &&
          (q.to == null || day.compareTo(q.to!) <= 0);
    }).toList();
  }
  return sales;
});

/// Server totals for a period: {total, bills, due, credit_bills}. Null when the
/// server cannot be reached (the screen then sums what it has loaded).
final salesPeriodSummaryProvider =
    FutureProvider.family<Map<String, dynamic>?, ({String? from, String? to})>(
        (ref, q) async {
  ref.watch(recentSalesProvider);
  final ctx = await ref.watch(tenantContextProvider.future);
  if (ctx == null) return null;
  try {
    final r = await supabase
        .rpc('sales_period_summary', params: {'p_from': q.from, 'p_to': q.to});
    return r is Map ? Map<String, dynamic>.from(r) : null;
  } catch (e) {
    debugPrint('[salesPeriodSummaryProvider] $e');
    return null;
  }
});
