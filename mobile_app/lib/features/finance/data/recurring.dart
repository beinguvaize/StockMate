// Recurring expenses: how a template is described and how a new one is set up.
//
// This is the Dart side of a shared contract. The web side is
// src/lib/recurring.js (describeRecurring, recurringTemplateFor); both are
// checked against the same cases in shared/fixtures/recurring.json, so a
// change to one that the other does not make fails a test.
//
// Generation itself runs in the database (generate_due_recurring_expenses on
// pg_cron). The phone only inserts the template row and shows its label.

class Weekday {
  final int n; // ISO: 1 = Mon … 7 = Sun
  final String short;
  const Weekday(this.n, this.short);
}

const weekdays = [
  Weekday(1, 'Mon'), Weekday(2, 'Tue'), Weekday(3, 'Wed'), Weekday(4, 'Thu'),
  Weekday(5, 'Fri'), Weekday(6, 'Sat'), Weekday(7, 'Sun'),
];

/// JS parseInt: leading digits only, null when there are none.
int? _parseIntLoose(Object? v) {
  if (v == null) return null;
  final m = RegExp(r'^\s*([+-]?\d+)').firstMatch(v.toString());
  return m == null ? null : int.parse(m.group(1)!);
}

int _clampDay(Object? v) => (_parseIntLoose(v) ?? 1).clamp(1, 28);

/// Distinct ISO weekdays in 1..7, ascending.
List<int> _cleanWeekdays(Iterable<Object?>? days) {
  final out = <int>{};
  for (final d in days ?? const []) {
    final n = d is num ? d.toInt() : _parseIntLoose(d);
    if (n != null && n >= 1 && n <= 7) out.add(n);
  }
  return out.toList()..sort();
}

/// 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st, 22nd.
String ordinal(int n) {
  final v = n % 100;
  if (v >= 11 && v <= 13) return '${n}th';
  return '$n${const {1: 'st', 2: 'nd', 3: 'rd'}[n % 10] ?? 'th'}';
}

/// "Every day", "Every day except Sun", "Mon, Wed, Fri", "Monthly on the 5th".
String describeRecurring({
  required String? frequency,
  Iterable<Object?>? weekdays,
  Object? dayOfMonth,
}) {
  if ((frequency ?? '').toUpperCase() == 'DAILY') {
    final days = _cleanWeekdays(weekdays);
    if (days.isEmpty || days.length == 7) return 'Every day';
    final off = _weekdayNames(exclude: days);
    if (off.length <= 2) return 'Every day except ${off.join(' and ')}';
    return _weekdayNames(include: days).join(', ');
  }
  return 'Monthly on the ${ordinal(_clampDay(dayOfMonth))}';
}

List<String> _weekdayNames({List<int>? include, List<int>? exclude}) => [
      for (final w in weekdays)
        if ((include == null || include.contains(w.n)) &&
            (exclude == null || !exclude.contains(w.n)))
          w.short,
    ];

/// [describeRecurring] for a row as stored in recurring_expense_templates.
String describeRecurringRow(Map<String, dynamic> row) => describeRecurring(
      frequency: row['frequency'] as String?,
      weekdays: row['weekdays'] as Iterable<Object?>?,
      dayOfMonth: row['day_of_month'],
    );

/// The schedule fields of the template row for a new recurring expense,
/// given the one just logged. Dates are 'YYYY-MM-DD'; [today] is today in IST.
///
/// The logged expense covers its own date. The generator resumes the day
/// after `last_generated`, so that is the later of the expense date and
/// today: a back-dated expense must not make the first nightly run fill in
/// every day since.
Map<String, dynamic> recurringTemplateFor({
  required String frequency,
  Iterable<Object?>? weekdays,
  String? date,
  required String today,
}) {
  final raw = (date == null || date.isEmpty) ? today : date;
  final day = raw.length > 10 ? raw.substring(0, 10) : raw;
  final daily = frequency == 'DAILY';
  final wd = daily ? _cleanWeekdays(weekdays) : const <int>[];
  final parts = day.split('-');
  return {
    'frequency': daily ? 'DAILY' : 'MONTHLY',
    'weekdays': daily && wd.isNotEmpty && wd.length < 7 ? wd : null,
    'day_of_month': _clampDay(parts.length > 2 ? parts[2] : null),
    'start_date': day,
    'last_generated': day.compareTo(today) > 0 ? day : today,
  };
}

const _monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const _dowShort = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; // DateTime.weekday 1..7

DateTime? _utcDate(Object? v) {
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(v?.toString() ?? '');
  if (m == null) return null;
  return DateTime.utc(int.parse(m.group(1)!), int.parse(m.group(2)!), int.parse(m.group(3)!));
}

String _isoDate(DateTime d) => '${d.year.toString().padLeft(4, '0')}-'
    '${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// The next date the nightly job will log this template, by the database's
/// own rule (generate_due_recurring_expenses): it resumes the day after
/// last_generated and logs on the first due day. Null when last_generated is
/// missing or no due day falls in the next 62 days.
String? nextRun(Map<String, dynamic> t) {
  final last = _utcDate(t['last_generated']);
  if (last == null) return null;
  final daily = (t['frequency']?.toString() ?? '').toUpperCase() == 'DAILY';
  final days = [
    for (final d in (t['weekdays'] as Iterable<Object?>?) ?? const [])
      if (d is num) d.toInt() else if (_parseIntLoose(d) != null) _parseIntLoose(d)!,
  ];
  final dom = _clampDay(t['day_of_month']);
  for (var i = 0; i < 62; i++) {
    // Day arithmetic in UTC: no DST or local zone can shift the date.
    final d = last.add(Duration(days: 1 + i));
    final due = daily ? (days.isEmpty || days.contains(d.weekday)) : d.day == dom;
    if (due) return _isoDate(d);
  }
  return null;
}

/// "Every day except Sun · next Fri 30 Oct" -- what the form promises.
/// `asked_day` is the day of the month the person picked; past the 28th the
/// line says the schedule is capped.
String scheduleLine(Map<String, dynamic> t) {
  final next = _utcDate(nextRun(t));
  final when = next == null
      ? ''
      : 'next ${_dowShort[next.weekday - 1]} ${next.day} ${_monthShort[next.month - 1]}';
  final asked = _parseIntLoose(t['asked_day']);
  final capped = (t['frequency']?.toString() ?? '').toUpperCase() != 'DAILY' &&
          asked != null && asked > 28
      ? " (29th–31st aren't in every month)"
      : '';
  return '${describeRecurringRow(t)}$capped${when.isEmpty ? '' : ' · $when'}';
}

/// Today's date in IST as 'YYYY-MM-DD' -- the shop's day, whatever the
/// phone's own time zone.
String todayIst([DateTime? now]) {
  final ist = (now ?? DateTime.now()).toUtc().add(const Duration(hours: 5, minutes: 30));
  return '${ist.year.toString().padLeft(4, '0')}-'
      '${ist.month.toString().padLeft(2, '0')}-'
      '${ist.day.toString().padLeft(2, '0')}';
}

/// The full row to insert into recurring_expense_templates for a new
/// recurring expense: what was logged, plus the schedule from
/// [recurringTemplateFor]. Same columns the web's addRecurringTemplate writes.
/// Store, P&L flag and GST are the values the expense itself was saved with;
/// the nightly job copies them onto every logged expense.
Map<String, dynamic> recurringTemplateRow({
  required String id,
  required String tenantId,
  required String? note,
  required double amount,
  required String category,
  required String paymentMethod,
  String? locationId,
  bool excludeFromPl = false,
  double? gstRate,
  double? gstAmount,
  String? vendorGstin,
  required String frequency,
  Iterable<Object?>? weekdays,
  required String date,
  required String today,
}) =>
    {
      'id': id,
      'tenant_id': tenantId,
      'note': note,
      'amount': amount,
      'category': category,
      'payment_method': paymentMethod,
      'location_id': locationId,
      'exclude_from_pl': excludeFromPl,
      'gst_rate': gstRate,
      'gst_amount': gstAmount,
      'vendor_gstin': vendorGstin,
      ...recurringTemplateFor(
          frequency: frequency, weekdays: weekdays, date: date, today: today),
      'active': true,
    };

const _payLabel = {'CASH': 'Cash', 'BANK': 'Bank', 'UPI': 'UPI', 'CARD': 'Card', 'CHEQUE': 'Cheque'};

/// "Cash", "UPI" -- never a title-cased "Upi". Blank means cash; a method
/// not in the map is shown as stored.
String paymentLabel(String? m) {
  final raw = (m == null || m.isEmpty) ? null : m;
  return _payLabel[(raw ?? 'CASH').toUpperCase()] ?? raw ?? 'Cash';
}
