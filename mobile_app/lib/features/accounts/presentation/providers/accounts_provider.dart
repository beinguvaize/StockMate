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
}

final accountsProvider = FutureProvider<List<AccountModel>>((ref) async {
  final ctx = await ref.watch(tenantContextProvider.future);
  if (ctx == null) return [];
  try {
    // Fetch accounts — balance column doesn't exist; it's computed from
    // opening_balance + Σ IN − Σ OUT in account_transactions (mirrors web).
    final accountRows = await supabase
        .from('accounts')
        .select('id, name, type, opening_balance, is_default, upi_id')
        .eq('tenant_id', ctx.tenantId)
        .isFilter('deleted_at', null)
        .order('is_default', ascending: false)
        .order('name');

    final accounts = (accountRows as List).cast<Map<String, dynamic>>();
    if (accounts.isEmpty) return [];

    // Fetch transaction totals per account for this tenant.
    final txnRows = await supabase
        .from('account_transactions')
        .select('account_id, direction, amount')
        .eq('tenant_id', ctx.tenantId);

    // Aggregate: IN adds, OUT subtracts.
    final Map<String, double> txnNet = {};
    for (final t in (txnRows as List).cast<Map<String, dynamic>>()) {
      final acId = t['account_id'] as String? ?? '';
      final amt = (t['amount'] as num?)?.toDouble() ?? 0;
      final dir = (t['direction'] as String? ?? '').toUpperCase();
      txnNet[acId] = (txnNet[acId] ?? 0) + (dir == 'IN' ? amt : -amt);
    }

    return accounts.map((r) {
      final opening = (r['opening_balance'] as num?)?.toDouble() ?? 0;
      final id = r['id'] as String;
      return AccountModel(
        id: id,
        name: r['name'] as String? ?? '',
        type: (r['type'] as String? ?? 'CASH').toUpperCase(),
        balance: opening + (txnNet[id] ?? 0),
        isDefault: r['is_default'] as bool? ?? false,
        upiId: r['upi_id'] as String?,
      );
    }).toList();
  } catch (e) {
    debugPrint('[accountsProvider] failed: $e');
    return [];
  }
});
