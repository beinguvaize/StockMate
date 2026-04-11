import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/finance/data/models/expense.dart';

final expensesProvider = FutureProvider<List<Expense>>((ref) async {
  final response = await supabase
      .from('expenses')
      .select()
      .order('created_at', ascending: false)
      .limit(100);
      
  return (response as List).map((data) => Expense.fromJson(data)).toList();
});
