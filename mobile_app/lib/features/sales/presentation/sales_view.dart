import 'package:intl/intl.dart';
import 'package:mobile_app/features/sales/data/models/sale.dart';

/// Pure helpers for the Sales history screen (no Flutter, no providers).

enum SalesPeriod { today, yesterday, week, month, all }

extension SalesPeriodLabel on SalesPeriod {
  String get label => switch (this) {
        SalesPeriod.today => 'Today',
        SalesPeriod.yesterday => 'Yesterday',
        SalesPeriod.week => 'This week',
        SalesPeriod.month => 'This month',
        SalesPeriod.all => 'All time',
      };
}

/// Inclusive date range for [p] as of [now]. Null bound = unbounded ("All
/// time"). Week starts Monday, as the screen always did.
({DateTime? from, DateTime? to}) periodRange(SalesPeriod p, DateTime now) {
  final today = DateTime(now.year, now.month, now.day);
  switch (p) {
    case SalesPeriod.today:
      return (from: today, to: today);
    case SalesPeriod.yesterday:
      final y = DateTime(today.year, today.month, today.day - 1);
      return (from: y, to: y);
    case SalesPeriod.week:
      return (
        from: DateTime(today.year, today.month, today.day - (today.weekday - 1)),
        to: today,
      );
    case SalesPeriod.month:
      return (from: DateTime(now.year, now.month, 1), to: today);
    case SalesPeriod.all:
      return (from: null, to: null);
  }
}

/// `2026-07-13`
String ymd(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// Last four characters of the sale id, uppercase: `SAL-3f9a1c2e` -> `1C2E`.
String shortSaleId(String id) {
  final s = id.trim();
  return (s.length <= 4 ? s : s.substring(s.length - 4)).toUpperCase();
}

/// `Today`, `Yesterday`, else `21 Nov`.
String dayLabel(DateTime day, DateTime now) {
  final today = DateTime(now.year, now.month, now.day);
  final d = DateTime(day.year, day.month, day.day);
  if (d == today) return 'Today';
  if (d == DateTime(today.year, today.month, today.day - 1)) return 'Yesterday';
  return DateFormat('d MMM').format(d);
}

/// Calendar day of a sale (its `date`, else created_at), or null.
DateTime? saleDay(Sale s) {
  final raw = s.date;
  final d = (raw == null || raw.isEmpty) ? s.createdAt?.toLocal() : DateTime.tryParse(raw);
  return d == null ? null : DateTime(d.year, d.month, d.day);
}

class DayGroup {
  final DateTime? day;
  final String label;
  final List<Sale> sales;
  final double total;
  DayGroup(this.day, this.label, this.sales, this.total);
}

/// Groups [sales] (already newest first) into consecutive days. Refused sales
/// are listed but are not takings, so they stay out of the day total.
List<DayGroup> groupByDay(List<Sale> sales, DateTime now) {
  final groups = <DayGroup>[];
  DateTime? cur;
  List<Sale>? bucket;
  double sum = 0;
  void flush() {
    if (bucket != null) {
      groups.add(DayGroup(cur, cur == null ? 'Undated' : dayLabel(cur, now), bucket, sum));
    }
  }

  for (final s in sales) {
    final d = saleDay(s);
    if (bucket == null || d != cur) {
      flush();
      cur = d;
      bucket = [];
      sum = 0;
    }
    bucket.add(s);
    if (s.syncState != 'refused') sum += s.totalAmount ?? 0;
  }
  flush();
  return groups;
}

/// `Cash`, `Card`, `UPI`.
String methodLabel(String? m) {
  final s = (m ?? '').trim();
  if (s.isEmpty) return '';
  if (s.length <= 3) return s.toUpperCase();
  return s[0].toUpperCase() + s.substring(1).toLowerCase();
}

/// `4:32 pm`
String timeLabel(DateTime? t) {
  if (t == null) return '';
  final l = t.toLocal();
  final h = l.hour % 12 == 0 ? 12 : l.hour % 12;
  return '$h:${l.minute.toString().padLeft(2, '0')} ${l.hour < 12 ? 'am' : 'pm'}';
}
