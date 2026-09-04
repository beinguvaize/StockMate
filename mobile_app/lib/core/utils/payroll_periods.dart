/// Whether a pay run's period has already been paid.
///
/// The Dart mirror of `src/lib/payrollPeriods.js`. Mobile had the same hole web
/// did: nothing stopped the same window being processed twice, and each run
/// posts one Salary expense per employee, which `trg_expenses_post_ledger`
/// turns into a money-OUT. A second run therefore pushes a phantom payout into
/// DayBook, the P&L and the cash account.
///
/// This cannot be a string compare. Periods are stored in two shapes:
/// `YYYY-MM` for a whole month, `YYYY-MM-DD/YYYY-MM-DD` for a range. Mobile
/// only *writes* months, but web writes both — so a run of 1–8 Aug made on the
/// desktop must still block an August run made on the phone. Comparing the
/// strings would miss it entirely: '2026-08' and '2026-08-01/2026-08-08' share
/// no prefix a comparison would catch.
class PayrollPeriod {
  const PayrollPeriod(this.from, this.to);

  /// Inclusive first day, `YYYY-MM-DD`.
  final String from;

  /// Inclusive last day, `YYYY-MM-DD`.
  final String to;

  @override
  String toString() => '$from..$to';
}

String _pad(int n) => n.toString().padLeft(2, '0');

/// Parse a stored period, or null when it is neither shape.
///
/// Returns null rather than guessing. Callers must treat null as *unknown*, not
/// as safe — waving through an unreadable period is the double payment this
/// exists to stop.
PayrollPeriod? parsePeriod(String? period) {
  final s = (period ?? '').trim();
  if (s.isEmpty) return null;

  if (s.contains('/')) {
    final parts = s.split('/');
    if (parts.length != 2) return null;
    final a = _parseDay(parts[0]);
    final b = _parseDay(parts[1]);
    if (a == null || b == null) return null;
    // Tolerate a reversed range instead of reporting no overlap for one.
    return a.compareTo(b) <= 0 ? PayrollPeriod(a, b) : PayrollPeriod(b, a);
  }

  final m = RegExp(r'^(\d{4})-(\d{2})$').firstMatch(s);
  if (m == null) return null;
  final y = int.parse(m.group(1)!);
  final mo = int.parse(m.group(2)!);
  if (mo < 1 || mo > 12) return null;
  // Day 0 of the next month is the last day of this one, leap years included.
  final last = DateTime(y, mo + 1, 0).day;
  return PayrollPeriod('$y-${_pad(mo)}-01', '$y-${_pad(mo)}-${_pad(last)}');
}

String? _parseDay(String s) {
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(s.trim());
  if (m == null) return null;
  final mo = int.parse(m.group(2)!);
  final d = int.parse(m.group(3)!);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return m.group(0);
}

/// Do two windows share any day? Inclusive at both ends.
bool overlaps(PayrollPeriod? a, PayrollPeriod? b) {
  if (a == null || b == null) return false;
  // ISO dates compare correctly as strings, which is why they are kept as text.
  return a.from.compareTo(b.to) <= 0 && b.from.compareTo(a.to) <= 0;
}

/// The already-processed runs covering any part of [period].
///
/// [records] are rows from `payroll`; each needs `period` and, to be skipped,
/// `deleted_at`. A run whose own period cannot be parsed counts as overlapping:
/// better to ask about a payout that turns out to be unrelated than to pay one
/// twice.
List<Map<String, dynamic>> findOverlappingRuns(
  String? period,
  List<Map<String, dynamic>> records, {
  String? excludeId,
}) {
  final target = parsePeriod(period);
  if (target == null) return const [];

  return records.where((r) {
    if (r['deleted_at'] != null) return false;
    if (excludeId != null && r['id'] == excludeId) return false;
    final p = parsePeriod(r['period'] as String?);
    return p == null ? true : overlaps(target, p);
  }).toList();
}

/// '2026-08-01/2026-08-08' -> '1 Aug – 8 Aug'; '2026-08' -> 'August 2026'.
String describePeriod(String? period) {
  final s = (period ?? '').trim();
  final p = parsePeriod(s);
  if (p == null) return s;

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const short = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  if (!s.contains('/')) {
    final y = int.parse(p.from.substring(0, 4));
    final mo = int.parse(p.from.substring(5, 7));
    return '${months[mo - 1]} $y';
  }

  String day(String iso) {
    final d = int.parse(iso.substring(8, 10));
    final mo = int.parse(iso.substring(5, 7));
    return '$d ${short[mo - 1]}';
  }

  return p.from == p.to ? day(p.from) : '${day(p.from)} – ${day(p.to)}';
}
