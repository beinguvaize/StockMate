import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/database/offline_reads.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/returns/data/models/sales_return.dart';
import 'package:mobile_app/features/returns/data/models/purchase_return.dart';
import 'package:mobile_app/features/returns/data/models/sales_return_item.dart';
import 'package:mobile_app/features/returns/data/repositories/returns_repository.dart';
import 'package:mobile_app/main.dart' show databaseProvider;

final returnsRepositoryProvider = Provider<ReturnsRepository>((ref) {
  return ReturnsRepository(supabase);
});

final salesReturnsProvider = FutureProvider.family<List<SalesReturn>, String>(
  (ref, tenantId) async {
    final data = await supabase
        .from('sales_returns')
        .select().isFilter('deleted_at', null)
        .eq('tenant_id', tenantId)
        .order('created_at', ascending: false)
        .limit(200);
    return (data as List).map((r) => SalesReturn.fromMap(r as Map<String, dynamic>)).toList();
  },
);

/// Lines of one sales return, from sales_return_items. Fetched only when a
/// row is opened, so the list itself stays one query.
final salesReturnItemsProvider = FutureProvider.family<List<SalesReturnItem>, String>(
  (ref, returnId) async {
    final data = await supabase
        .from('sales_return_items')
        .select()
        .eq('return_id', returnId)
        .isFilter('deleted_at', null)
        .order('line_no', ascending: true);
    return (data as List)
        .map((r) => SalesReturnItem.fromMap(r as Map<String, dynamic>))
        .toList();
  },
);

final purchaseReturnsProvider = FutureProvider.family<List<PurchaseReturn>, String>(
  (ref, tenantId) async {
    try {
      final data = await supabase
          .from('purchase_returns')
          .select()
          .eq('tenant_id', tenantId)
          .order('created_at', ascending: false)
          .limit(200);
      return (data as List).map((r) => PurchaseReturn.fromMap(r as Map<String, dynamic>)).toList();
    } catch (e) {
      debugPrint('[purchaseReturnsProvider] online failed, using Drift cache: $e');
      final rows = await cachedPurchaseReturns(ref.read(databaseProvider), tenantId);
      return rows.map(PurchaseReturn.fromMap).toList();
    }
  },
);
