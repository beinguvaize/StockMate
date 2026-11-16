import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:drift/drift.dart' show OrderingTerm, OrderingMode;
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
