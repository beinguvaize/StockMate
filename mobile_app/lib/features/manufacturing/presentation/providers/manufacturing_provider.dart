import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/supabase/client.dart';

class BomModel {
  final String id;
  final String name;
  final String? finishedProductId;
  final double outputQty;

  const BomModel({required this.id, required this.name, this.finishedProductId, required this.outputQty});

  factory BomModel.fromJson(Map<String, dynamic> m) => BomModel(
        id: m['id'] as String,
        name: m['name'] as String? ?? '',
        finishedProductId: m['finished_product_id'] as String?,
        outputQty: (m['output_qty'] as num?)?.toDouble() ?? 1,
      );
}

class ProductionOrderModel {
  final String id;
  final String? bomId;
  final String? bomName;
  final double qty;
  final String status; // PLANNED, IN_PROGRESS, COMPLETED, CANCELLED
  final String? startDate;

  const ProductionOrderModel({
    required this.id,
    this.bomId,
    this.bomName,
    required this.qty,
    required this.status,
    this.startDate,
  });

  factory ProductionOrderModel.fromJson(Map<String, dynamic> m) => ProductionOrderModel(
        id: m['id'] as String,
        bomId: m['bom_id'] as String?,
        bomName: m['bom_name'] as String?,
        qty: (m['qty'] as num?)?.toDouble() ?? 1,
        status: (m['status'] as String? ?? 'PLANNED').toUpperCase(),
        startDate: m['start_date'] as String?,
      );
}

final bomsProvider = FutureProvider<List<BomModel>>((ref) async {
  final ctx = await ref.watch(tenantContextProvider.future);
  if (ctx == null) return [];
  try {
    final rows = await supabase
        .from('bom')
        .select('id, name, finished_product_id, output_qty')
        .eq('tenant_id', ctx.tenantId)
        .isFilter('deleted_at', null)
        .order('created_at', ascending: false);
    return (rows as List).map((r) => BomModel.fromJson(r as Map<String, dynamic>)).toList();
  } catch (e) {
    debugPrint('[bomsProvider] failed: $e');
    return [];
  }
});

final productionOrdersProvider = FutureProvider<List<ProductionOrderModel>>((ref) async {
  final ctx = await ref.watch(tenantContextProvider.future);
  if (ctx == null) return [];
  try {
    final rows = await supabase
        .from('production_orders')
        .select('id, bom_id, bom_name, qty, status, start_date')
        .eq('tenant_id', ctx.tenantId)
        .isFilter('deleted_at', null)
        .order('created_at', ascending: false)
        .limit(100);
    return (rows as List).map((r) => ProductionOrderModel.fromJson(r as Map<String, dynamic>)).toList();
  } catch (e) {
    debugPrint('[productionOrdersProvider] failed: $e');
    return [];
  }
});
