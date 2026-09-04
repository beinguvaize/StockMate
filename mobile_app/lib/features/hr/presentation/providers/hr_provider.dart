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

/// Pay history.
///
/// This read used to hit `payroll_records`, which does not exist -- the table is
/// `payroll`, which is what web writes. So mobile's pay history has always come
/// back empty and every run recorded on web was invisible here.
///
/// `payroll` holds one row per pay *run*, with the per-employee lines in an
/// `items` JSONB array. The card below this is per employee, so flatten each run
/// into one map per line, keyed the way the card already reads it.
final payrollRecordsProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final ctx = await ref.watch(tenantContextProvider.future);
  if (ctx == null) return [];
  final res = await supabase.from('payroll')
      .select()
      .eq('tenant_id', ctx.tenantId)
      .isFilter('deleted_at', null)
      .order('created_at', ascending: false)
      .limit(200);

  final out = <Map<String, dynamic>>[];
  for (final run in (res as List).cast<Map<String, dynamic>>()) {
    // period is either YYYY-MM (a month) or YYYY-MM-DD/YYYY-MM-DD (a range).
    final period = (run['period'] ?? run['month'] ?? '') as String;
    String start, end;
    if (period.contains('/')) {
      final parts = period.split('/');
      start = parts.first;
      end = parts.length > 1 ? parts[1] : parts.first;
    } else if (RegExp(r'^\d{4}-\d{2}$').hasMatch(period)) {
      final y = int.parse(period.substring(0, 4));
      final m = int.parse(period.substring(5, 7));
      start = '$period-01';
      end = '$period-${DateTime(y, m + 1, 0).day.toString().padLeft(2, '0')}';
    } else {
      start = period;
      end = period;
    }
    final paidAt = (run['processed_at'] ?? run['created_at']) as String?;

    final items = (run['items'] as List?) ?? const [];
    for (final raw in items) {
      final item = Map<String, dynamic>.from(raw as Map);
      out.add({
        'id': '${run['id']}-${item['employeeId']}',
        'employee_id': item['employeeId'],
        'employee_name': item['employeeName'],
        'base_pay': item['basePay'],
        'bonus': item['bonus'],
        'deductions': item['deductions'],
        'net_pay': item['netPay'],
        'status': 'PAID',
        'pay_period_start': start,
        'pay_period_end': end,
        'paid_at': paidAt,
      });
    }
  }
  return out;
});
