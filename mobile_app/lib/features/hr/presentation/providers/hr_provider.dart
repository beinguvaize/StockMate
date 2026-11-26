import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/database/offline_reads.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/hr/data/models/employee.dart';
import 'package:mobile_app/features/hr/data/pay_run.dart';
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

/// What everyone is owed for the current calendar month, worked out by the
/// server with the web's rules. Feeds the "Still to pay" figure and the
/// employee sheet. Needs a connection: there is no offline pay calculation,
/// on purpose -- a second set of rules on the phone is how the two would drift.
final monthPayRunProvider = FutureProvider<PayRun?>((ref) async {
  final ctx = await ref.watch(tenantContextProvider.future);
  if (ctx == null) return null;
  final now = DateTime.now();
  return fetchPayRun(
    tenantId: ctx.tenantId,
    from: isoDay(DateTime(now.year, now.month, 1)),
    to: isoDay(DateTime(now.year, now.month + 1, 0)),
  );
});

/// Attendance marks for a span of days: employee id -> day -> row.
///
/// Cleared marks are soft-deleted (web does the same), so they are filtered
/// out here; the old read ignored `deleted_at` and showed marks that had been
/// cleared on the web.
final attendanceRangeProvider = FutureProvider.family<
    Map<String, Map<String, Map<String, dynamic>>>,
    ({String from, String to})>((ref, span) async {
  final ctx = await ref.watch(tenantContextProvider.future);
  if (ctx == null) return {};
  final res = await supabase
      .from('attendance')
      .select('employee_id, day, status, custom_rate')
      .eq('tenant_id', ctx.tenantId)
      .isFilter('deleted_at', null)
      .gte('day', span.from)
      .lte('day', span.to)
      .limit(5000);
  final out = <String, Map<String, Map<String, dynamic>>>{};
  for (final r in (res as List)) {
    final m = Map<String, dynamic>.from(r as Map);
    (out['${m['employee_id']}'] ??= {})['${m['day']}'.substring(0, 10)] = m;
  }
  return out;
});

/// Mark one day for one person, or clear it when [status] is null.
///
/// Throws on failure -- the caller says so on screen. `deleted_at: null` matters:
/// a cleared day keeps its row, so re-marking it has to revive that row.
Future<void> writeAttendance({
  required String tenantId,
  required String employeeId,
  required String day,
  required String? status,
  double? customRate,
  bool keepRate = false,
}) async {
  if (status == null) {
    await supabase
        .from('attendance')
        .update({'deleted_at': DateTime.now().toUtc().toIso8601String()})
        .eq('tenant_id', tenantId)
        .eq('employee_id', employeeId)
        .eq('day', day);
    return;
  }
  await supabase.from('attendance').upsert({
    'tenant_id': tenantId,
    'employee_id': employeeId,
    'day': day,
    'status': status,
    if (!keepRate) 'custom_rate': customRate,
    'deleted_at': null,
  }, onConflict: 'tenant_id,employee_id,day');
}
