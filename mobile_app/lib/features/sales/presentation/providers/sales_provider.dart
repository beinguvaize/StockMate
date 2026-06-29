import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:drift/drift.dart' show OrderingTerm, OrderingMode;
import 'package:mobile_app/core/supabase/client.dart';
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
final recentSalesProvider = FutureProvider<List<Sale>>((ref) async {
  final ctx = await ref.watch(tenantContextProvider.future);
  if (ctx == null) return [];

  try {
    final response = await supabase
        .from('sales')
        .select()
        .eq('tenant_id', ctx.tenantId)
        .order('created_at', ascending: false)
        .limit(500);

    return (response as List).map((data) => Sale.fromJson(data)).toList();
  } catch (e) {
    debugPrint('[recentSalesProvider] online failed, using Drift cache: $e');
    final db = ref.read(databaseProvider);
    final rows = await (db.select(db.sales)
          ..where((t) => t.tenantId.equals(ctx.tenantId))
          // Drift schema has no createdAt yet so we order by date desc
          // then id desc as a stable tiebreaker. Online path uses the
          // server's created_at timestamp — this offline fallback is
          // close enough for sales placed on different days, and only
          // fires when supabase is unreachable.
          ..orderBy([
            (t) => OrderingTerm(expression: t.date, mode: OrderingMode.desc),
            (t) => OrderingTerm(expression: t.id,   mode: OrderingMode.desc),
          ])
          ..limit(500))
        .get();
    return rows
        .map((r) => Sale.fromJson({
              'id': r.id,
              'tenant_id': r.tenantId,
              'paymentMethod': r.paymentMethod,
              'paymentStatus': r.paymentStatus,
              'subtotal': r.subtotal,
              'tax': r.tax,
              'totalAmount': r.totalAmount,
              'paidAmount': r.paidAmount,
              'date': r.date.toIso8601String().split('T').first,
              'items': jsonDecode(r.itemsJson),
            }))
        .toList();
  }
});
