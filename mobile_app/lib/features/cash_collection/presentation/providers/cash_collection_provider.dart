import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/supabase/client.dart';

class CollectableClient {
  final String id;
  final String name;
  final double outstandingBalance;
  final String? phone;

  const CollectableClient({
    required this.id,
    required this.name,
    required this.outstandingBalance,
    this.phone,
  });

  factory CollectableClient.fromJson(Map<String, dynamic> m) => CollectableClient(
        id: m['id'] as String,
        name: m['name'] as String? ?? '',
        outstandingBalance: (m['outstanding_balance'] as num?)?.toDouble() ?? 0,
        phone: m['phone'] as String?,
      );
}

final collectableClientsProvider = FutureProvider<List<CollectableClient>>((ref) async {
  final ctx = await ref.watch(tenantContextProvider.future);
  if (ctx == null) return [];
  try {
    final rows = await supabase
        .from('clients')
        .select('id, name, outstanding_balance, phone')
        .eq('tenant_id', ctx.tenantId)
        .isFilter('deleted_at', null)
        .gt('outstanding_balance', 0)
        .order('outstanding_balance', ascending: false);
    return (rows as List).map((r) => CollectableClient.fromJson(r as Map<String, dynamic>)).toList();
  } catch (e) {
    debugPrint('[collectableClientsProvider] failed: $e');
    return [];
  }
});
