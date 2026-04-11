import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/sales/data/models/sale.dart';

// Provides a list of recent sales directly from Supabase
final recentSalesProvider = FutureProvider<List<Sale>>((ref) async {
  final response = await supabase
      .from('sales')
      .select()
      .order('created_at', ascending: false)
      .limit(50);
      
  return (response as List).map((data) => Sale.fromJson(data)).toList();
});
