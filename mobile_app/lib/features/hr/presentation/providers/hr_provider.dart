import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/hr/data/models/employee.dart';

final employeesProvider = FutureProvider<List<Employee>>((ref) async {
  final response = await supabase
      .from('employees')
      .select()
      .order('name', ascending: true);
      
  return (response as List).map((data) => Employee.fromJson(data)).toList();
});
