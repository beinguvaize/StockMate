import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:drift/drift.dart' show OrderingTerm, OrderingMode;
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/finance/data/models/expense.dart';
import 'package:mobile_app/main.dart' show databaseProvider;

// Cache-first expenses. Falls back to local Drift cache when offline.
final expensesProvider = FutureProvider<List<Expense>>((ref) async {
  final ctx = await ref.watch(tenantContextProvider.future);
  if (ctx == null) return [];

  try {
    final response = await supabase
        .from('expenses')
        .select()
        .eq('tenant_id', ctx.tenantId)
        .order('created_at', ascending: false)
        .limit(100);
    return (response as List).map((data) => Expense.fromJson(data)).toList();
  } catch (e) {
    debugPrint('[expensesProvider] online failed, using Drift cache: $e');
    final db = ref.read(databaseProvider);
    final rows = await (db.select(db.expenses)
          ..where((t) => t.tenantId.equals(ctx.tenantId))
          ..orderBy([(t) => OrderingTerm(
                expression: t.date, mode: OrderingMode.desc)])
          ..limit(100))
        .get();
    return rows
        .map((r) => Expense.fromJson({
              'id': r.id,
              'tenant_id': r.tenantId,
              'category': r.category,
              'amount': r.amount,
              'note': r.note,
              'date': r.date.toIso8601String().split('T').first,
            }))
        .toList();
  }
});

/// Per-tenant custom expense categories. Stored in `settings` under the
/// `expense_categories` key as a JSON array — same shape the web app uses.
final customExpenseCategoriesProvider =
    FutureProvider<List<String>>((ref) async {
  final ctx = await ref.watch(tenantContextProvider.future);
  if (ctx == null) return [];
  try {
    final row = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'expense_categories')
        .eq('tenant_id', ctx.tenantId)
        .maybeSingle();
    final value = row?['value'];
    if (value is List) {
      return value
          .map((e) => (e ?? '').toString().trim())
          .where((s) => s.isNotEmpty)
          .toList();
    }
    return [];
  } catch (e) {
    debugPrint('[customExpenseCategoriesProvider] failed: $e');
    return [];
  }
});

/// Persist the full custom-category list (upsert on key+tenant_id).
Future<void> saveExpenseCategories(
    WidgetRef ref, String tenantId, List<String> list) async {
  final clean = <String>{
    for (final s in list) s.trim(),
  }.where((s) => s.isNotEmpty).toList();
  await supabase.from('settings').upsert(
    {'key': 'expense_categories', 'value': clean, 'tenant_id': tenantId},
    onConflict: 'key,tenant_id',
  );
  ref.invalidate(customExpenseCategoriesProvider);
}
