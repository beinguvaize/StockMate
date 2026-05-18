import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/hr/data/models/employee.dart';

final employeesProvider = FutureProvider<List<Employee>>((ref) async {
  final ctx = await ref.watch(tenantContextProvider.future);
  if (ctx == null) return [];

  final response = await supabase
      .from('employees')
      .select()
      .eq('tenant_id', ctx.tenantId)
      .order('name', ascending: true);

  return (response as List).map((data) => Employee.fromJson(data)).toList();
});

final payrollRecordsProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final ctx = await ref.watch(tenantContextProvider.future);
  if (ctx == null) return [];
  final res = await supabase.from('payroll_records')
      .select()
      .eq('tenant_id', ctx.tenantId)
      .order('paid_at', ascending: false)
      .limit(200);
  return (res as List).cast<Map<String, dynamic>>();
});
