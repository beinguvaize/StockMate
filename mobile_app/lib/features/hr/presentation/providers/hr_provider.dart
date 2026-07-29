import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/database/offline_reads.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/hr/data/models/employee.dart';
import 'package:mobile_app/main.dart' show databaseProvider;

// Cache-first, matching clientsProvider: Supabase first, Drift cache on any
// network or server failure. Before schema v6 there was no local employees
// table, so the HR screen threw and rendered nothing with no connection.
final employeesProvider = FutureProvider<List<Employee>>((ref) async {
  final ctx = await ref.watch(tenantContextProvider.future);
  if (ctx == null) return [];

  try {
    final response = await supabase
        .from('employees')
        .select()
        .eq('tenant_id', ctx.tenantId)
        .isFilter('deleted_at', null)
        .order('name', ascending: true);

    return (response as List).map((data) => Employee.fromJson(data)).toList();
  } catch (e) {
    debugPrint('[employeesProvider] online failed, using Drift cache: $e');
    final rows = await cachedEmployees(ref.read(databaseProvider), ctx.tenantId);
    return rows.map(Employee.fromJson).toList();
  }
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
