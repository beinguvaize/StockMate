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
  final String? linkedBankAccountId;
  /// UPI handles of linked UPI accounts folded into this bank card (web parity).
  final List<String> linkedUpiHandles;

  const AccountModel({
    required this.id,
    required this.name,
    required this.type,
    required this.balance,
    required this.isDefault,
    this.upiId,
    this.linkedBankAccountId,
    this.linkedUpiHandles = const [],
  });

  AccountModel copyWith({double? balance, List<String>? linkedUpiHandles}) => AccountModel(
        id: id, name: name, type: type,
        balance: balance ?? this.balance,
        isDefault: isDefault, upiId: upiId,
        linkedBankAccountId: linkedBankAccountId,
        linkedUpiHandles: linkedUpiHandles ?? this.linkedUpiHandles,
      );
}

final accountsProvider = FutureProvider<List<AccountModel>>((ref) async {
  final ctx = await ref.watch(tenantContextProvider.future);
  if (ctx == null) return [];
  try {
    // Fetch accounts — balance column doesn't exist; it's computed from
    // opening_balance + Σ IN − Σ OUT in account_transactions (mirrors web).
    final accountRows = await supabase
        .from('accounts')
        .select('id, name, type, opening_balance, is_default, upi_id, linked_bank_account_id')
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

    final all = accounts.map((r) {
      final opening = (r['opening_balance'] as num?)?.toDouble() ?? 0;
      final id = r['id'] as String;
      return AccountModel(
        id: id,
        name: r['name'] as String? ?? '',
        type: (r['type'] as String? ?? 'CASH').toUpperCase(),
        balance: opening + (txnNet[id] ?? 0),
        isDefault: r['is_default'] as bool? ?? false,
        upiId: r['upi_id'] as String?,
        linkedBankAccountId: r['linked_bank_account_id'] as String?,
      );
    }).toList();

    return all;
  } catch (e) {
    debugPrint('[accountsProvider] failed: $e');
    return [];
  }
});


/// Web-parity display merge: UPI accounts linked to a bank are payment
/// handles, not money stores — fold each one's balance into its bank card
/// and surface the handle as a badge. Use for DISPLAY ONLY (the Accounts
/// screen); checkout tiles need the raw list so UPI stays selectable.
List<AccountModel> mergeLinkedUpiForDisplay(List<AccountModel> accounts) {
  final linkedUpi =
      accounts.where((a) => a.type == 'UPI' && a.linkedBankAccountId != null).toList();
  if (linkedUpi.isEmpty) return accounts;
  return accounts
      .where((a) => !(a.type == 'UPI' && a.linkedBankAccountId != null))
      .map((a) {
    final mine = linkedUpi.where((u) => u.linkedBankAccountId == a.id).toList();
    if (mine.isEmpty) return a;
    final folded = mine.fold<double>(0, (s, u) => s + u.balance);
    return a.copyWith(
      balance: a.balance + folded,
      linkedUpiHandles: mine.map((u) => u.upiId ?? u.name).toList(),
    );
  }).toList();
}
