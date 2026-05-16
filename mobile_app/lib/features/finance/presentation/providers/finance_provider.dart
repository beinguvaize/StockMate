import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:drift/drift.dart' show OrderingTerm, OrderingMode;
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/finance/data/models/expense.dart';
import 'package:mobile_app/main.dart' show databaseProvider;

// Cache-first expenses. Falls back to local Drift cache when offline.
final expensesProvider = FutureProvider<List<Expense>>((ref) async {
  try {
    final response = await supabase
        .from('expenses')
        .select()
        .order('created_at', ascending: false)
        .limit(100);
    return (response as List).map((data) => Expense.fromJson(data)).toList();
  } catch (e) {
    debugPrint('[expensesProvider] online failed, using Drift cache: $e');
    final db = ref.read(databaseProvider);
    final rows = await (db.select(db.expenses)
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
