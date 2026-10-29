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

/// "Every day", "Every day except Sun", "Mon, Wed, Fri", "Monthly on day 5".
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
  return 'Monthly on day ${_clampDay(dayOfMonth)}';
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
Map<String, dynamic> recurringTemplateRow({
  required String id,
  required String tenantId,
  required String? note,
  required double amount,
  required String category,
  required String paymentMethod,
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
      ...recurringTemplateFor(
          frequency: frequency, weekdays: weekdays, date: date, today: today),
      'active': true,
    };
