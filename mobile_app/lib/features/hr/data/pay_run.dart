import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:supabase_flutter/supabase_flutter.dart'
    show FunctionException, PostgrestException;

/// Pay runs on the phone.
///
/// The phone does not work out anyone's pay. It asks the `payroll-run` server
/// function, which runs the same rules the web page uses, and saves through
/// `process_payroll_run` in the database, which writes the run and its salary
/// expenses together. Nothing here adds, subtracts or rounds money.

double _n(dynamic v) => v is num ? v.toDouble() : double.tryParse('$v') ?? 0;

/// One person's line in a run, as the server worked it out.
class PayLine {
  /// The server's own line, sent back untouched when the run is saved so the
  /// record matches what the web would have stored.
  final Map<String, dynamic> raw;
  const PayLine(this.raw);

  String get employeeId => '${raw['employeeId']}';
  String get name => (raw['employeeName'] ?? '') as String;
  String get payType => '${raw['payType'] ?? ''}'.toUpperCase();
  bool get isDayRate => payType == 'DAILY' || payType == 'HOURLY';
  bool get isWeekly => payType == 'WEEKLY';
  double get daysWorked => _n(raw['daysWorked']);
  double get dailyRate => _n(raw['dailyRate']);
  double get basePay => _n(raw['basePay']);
  double get lopDays => _n(raw['lopDays']);
  double get lopAmount => _n(raw['lopAmount']);
  int get periodDays => _n(raw['periodDays']).round();
  int get cycleDays => _n(raw['cycleDays']).round();
  double get alreadyPaid => _n(raw['alreadyPaid']);
  double get statutoryTotal => _n(raw['statutoryTotal']);
  double get bonus => _n(raw['bonus']);
  double get deductions => _n(raw['deductions']);
  double get netPay => _n(raw['netPay']);
  int get leaveDays => _n(raw['leaveDays']).round();
  int get sickDays => _n(raw['sickDays']).round();
  int get leaveUsed => _n(raw['leaveUsed']).round();
  int get leaveAllowed => _n(raw['leaveAllowed']).round();
  bool get leaveExceeded => raw['leaveExceeded'] == true;
}

class EarlierRun {
  final String period;
  final double totalNet;
  const EarlierRun(this.period, this.totalNet);
}

class PayRun {
  /// 'YYYY-MM' for a whole month, else 'from/to' — what the run is saved under.
  final String period;
  final String from;
  final String to;
  final List<PayLine> items;

  /// Staff on leave, left out unless switched in.
  final List<PayLine> held;
  final double totalBase;
  final double totalNet;
  final List<EarlierRun> earlierRuns;

  /// True when saving would pay somebody twice for days already paid.
  final bool mustConfirm;

  const PayRun({
    required this.period,
    required this.from,
    required this.to,
    required this.items,
    required this.held,
    required this.totalBase,
    required this.totalNet,
    required this.earlierRuns,
    required this.mustConfirm,
  });

  double get alreadyPaid => items.fold(0, (t, i) => t + i.alreadyPaid);

  PayLine? lineFor(String employeeId) {
    for (final l in [...items, ...held]) {
      if (l.employeeId == employeeId) return l;
    }
    return null;
  }

  factory PayRun.fromJson(Map<String, dynamic> j) {
    final run = Map<String, dynamic>.from(j['run'] as Map);
    List<PayLine> lines(dynamic v) => ((v as List?) ?? const [])
        .map((e) => PayLine(Map<String, dynamic>.from(e as Map)))
        .toList();
    return PayRun(
      period: '${j['period']}',
      from: '${run['from']}',
      to: '${run['to']}',
      items: lines(run['items']),
      held: lines(run['held']),
      totalBase: _n(run['totalBase']),
      totalNet: _n(run['totalNet']),
      earlierRuns: ((j['already_paid_runs'] as List?) ?? const [])
          .map((e) => EarlierRun('${(e as Map)['period']}', _n(e['total_net'])))
          .toList(),
      mustConfirm: j['must_confirm_already_paid'] == true,
    );
  }
}

String isoDay(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// The real reason a call failed, never `Instance of ...`.
String payrollError(Object e) {
  if (e is FunctionException) {
    final d = e.details;
    if (d is Map && d['message'] != null) return '${d['message']}';
    return 'Server answered ${e.status}${d != null ? ': $d' : ''}';
  }
  if (e is PostgrestException) {
    return [
      e.message,
      if (e.details != null && '${e.details}'.isNotEmpty) '${e.details}',
      if (e.code != null && e.code!.isNotEmpty) '(${e.code})',
    ].join(' — ');
  }
  return '$e';
}

/// Ask the server what everyone is owed for [from]..[to].
Future<PayRun> fetchPayRun({
  required String tenantId,
  required String from,
  required String to,
  Iterable<String> includeOnLeave = const [],
  Map<String, Map<String, num>> adjustments = const {},
}) async {
  final res = await supabase.functions.invoke('payroll-run', body: {
    'tenant_id': tenantId,
    'from': from,
    'to': to,
    'include_on_leave': includeOnLeave.toList(),
    'adjustments': adjustments,
  });
  return PayRun.fromJson(Map<String, dynamic>.from(res.data as Map));
}

/// Save a run. The database writes the run and one salary expense per person
/// in a single step. Sending the same [runId] again returns the run already
/// saved, so a retry after a lost reply cannot pay twice.
Future<({int expenses, bool replayed})> savePayRun({
  required String tenantId,
  required String runId,
  required String period,
  required String paymentMethod,
  required List<PayLine> lines,
}) async {
  final data = await supabase.rpc('process_payroll_run', params: {
    'p_tenant_id': tenantId,
    'p_run_id': runId,
    'p_period': period,
    'p_payment_method': paymentMethod,
    'p_items': lines.map((l) => l.raw).toList(),
    'p_processed_at': DateTime.now().toUtc().toIso8601String(),
  });
  final m = data is Map ? data : const {};
  return (
    expenses: _n(m['expenses']).round(),
    replayed: m['replayed'] == true
  );
}

// ── Wording ────────────────────────────────────────────────────────────────

/// 22 → '22', 20.5 → '20½'.
String daysLabel(double days) {
  final whole = days.floor();
  final half = (days - whole) >= 0.5;
  if (half) return whole == 0 ? '½' : '$whole½';
  return '$whole';
}

/// The grey line under a name on the Run Payroll list, and the red part of it
/// (an absence cut) kept apart so it can be coloured.
({String text, String? cut}) payLineNote(PayLine l) {
  final parts = <String>[];
  String? cut;
  if (l.isDayRate) {
    final d = l.daysWorked;
    parts.add('${daysLabel(d)} ${d == 1 ? 'day' : 'days'} × ${Money.inr(l.dailyRate)}');
  } else {
    final wholeCycle = l.cycleDays > 0 && l.periodDays >= l.cycleDays;
    parts.add(wholeCycle
        ? (l.isWeekly ? 'Weekly salary' : 'Monthly salary')
        : '${l.periodDays} of ${l.cycleDays} days of salary');
    if (l.leaveAllowed > 0 && l.leaveUsed > 0) {
      parts.add('leave ${l.leaveUsed} of ${l.leaveAllowed}');
    }
    if (l.lopDays > 0) {
      cut = '${daysLabel(l.lopDays)} absent −${Money.inr(l.lopAmount)}';
    }
  }
  if (l.alreadyPaid > 0) parts.add('${Money.inr(l.alreadyPaid)} already paid');
  return (text: parts.join(' · '), cut: cut);
}

/// [d] moved by [n] calendar days.
///
/// Never `d.add(Duration(days: n))`: that adds 24-hour blocks, so across a
/// clock change it lands at 23:00 the day before and a month of days comes out
/// with one repeated and the last one missing.
DateTime addDays(DateTime d, int n) => DateTime(d.year, d.month, d.day + n);

/// How many calendar days from [a] to [b], counting both.
int daysInclusive(DateTime a, DateTime b) =>
    DateTime.utc(b.year, b.month, b.day)
        .difference(DateTime.utc(a.year, a.month, a.day))
        .inDays +
    1;

/// Monday of the week [d] falls in.
DateTime weekStart(DateTime d) {
  final day = DateTime(d.year, d.month, d.day);
  return addDays(day, 1 - day.weekday);
}

const _mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/// '16 – 22 Nov 2026', '28 Nov – 4 Dec 2026', '23 Nov 2026'.
String rangeLabel(DateTime a, DateTime b, {bool year = true}) {
  final y = year ? ' ${b.year}' : '';
  if (a.year == b.year && a.month == b.month && a.day == b.day) {
    return '${a.day} ${_mon[a.month - 1]}$y';
  }
  if (a.year == b.year && a.month == b.month) {
    return '${a.day} – ${b.day} ${_mon[b.month - 1]}$y';
  }
  return '${a.day} ${_mon[a.month - 1]} – ${b.day} ${_mon[b.month - 1]}$y';
}

String dayLabel(DateTime d) => '${d.day} ${_mon[d.month - 1]} ${d.year}';
