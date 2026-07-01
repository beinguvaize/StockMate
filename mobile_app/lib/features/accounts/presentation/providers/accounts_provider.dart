import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/supabase/client.dart';

class AccountModel {
  final String id;
  final String name;
  final String type; // CASH, BANK, UPI, LOAN
  final double balance;
  final bool isDefault;
  final String? upiId;

  const AccountModel({
    required this.id,
    required this.name,
    required this.type,
    required this.balance,
    required this.isDefault,
    this.upiId,
  });

  factory AccountModel.fromJson(Map<String, dynamic> m) => AccountModel(
        id: m['id'] as String,
        name: m['name'] as String? ?? '',
        type: (m['type'] as String? ?? 'CASH').toUpperCase(),
        balance: (m['balance'] as num?)?.toDouble() ?? 0,
        isDefault: m['is_default'] as bool? ?? false,
        upiId: m['upi_id'] as String?,
      );
}

final accountsProvider = FutureProvider<List<AccountModel>>((ref) async {
  final ctx = await ref.watch(tenantContextProvider.future);
  if (ctx == null) return [];
  try {
    final rows = await supabase
        .from('accounts')
        .select('id, name, type, balance, is_default, upi_id')
        .eq('tenant_id', ctx.tenantId)
        .isFilter('deleted_at', null)
        .order('is_default', ascending: false)
        .order('name');
    return (rows as List).map((r) => AccountModel.fromJson(r as Map<String, dynamic>)).toList();
  } catch (e) {
    debugPrint('[accountsProvider] failed: $e');
    return [];
  }
});
