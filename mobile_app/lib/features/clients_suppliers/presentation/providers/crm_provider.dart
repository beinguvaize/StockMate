import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/clients_suppliers/data/models/client.dart';
import 'package:mobile_app/features/clients_suppliers/data/models/supplier.dart';

final clientsProvider = FutureProvider<List<Client>>((ref) async {
  final response = await supabase
      .from('clients')
      .select()
      .order('name', ascending: true);
      
  return (response as List).map((data) => Client.fromJson(data)).toList();
});

final suppliersProvider = FutureProvider<List<Supplier>>((ref) async {
  final response = await supabase
      .from('suppliers')
      .select()
      .order('name', ascending: true);
      
  return (response as List).map((data) => Supplier.fromJson(data)).toList();
});
