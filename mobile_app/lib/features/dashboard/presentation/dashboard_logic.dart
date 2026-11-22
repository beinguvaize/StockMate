import 'dart:ui' show Offset;

import 'package:mobile_app/core/utils/stock_levels.dart';
import 'package:mobile_app/features/sales/data/models/sale.dart';

/// Pure logic for the phone Dashboard. No Flutter widgets, no providers, so the
/// numbers on the screen can be unit-tested without a tenant or a database.

// ── Which sales count ───────────────────────────────────────────────────────

const _dead = {'VOIDED', 'VOID', 'CANCELLED', 'FAILED', 'REFUNDED'};

/// Same rule as the server's `ai_countable(voided_at, status, paymentStatus)`
/// that `sales_period_summary` filters on, so the chart and the week bars add
/// up to the hero total instead of quietly disagreeing with it.
bool isCountableSale({Object? voidedAt, String? status, String? paymentStatus}) {
  if (voidedAt != null && voidedAt.toString().isNotEmpty) return false;
  if (_dead.contains((status ?? '').toUpperCase())) return false;
  if (_dead.contains((paymentStatus ?? '').toUpperCase())) return false;
  return true;
}

// ── Hero amount ─────────────────────────────────────────────────────────────

/// Splits an amount into whole rupees and paise from integer paise, so
/// 99.996 becomes 100 / 0 rather than 99 / 100.
({int whole, int paise}) splitRupees(double amount) {
  final cents = (amount * 100).round();
  return (whole: cents ~/ 100, paise: cents % 100);
}

// ── Period ──────────────────────────────────────────────────────────────────

enum DashPeriod { today, week, month }

String _ymd(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// yyyy-MM-dd bounds, inclusive. "Week" is the rolling seven days ending today
/// (the same seven bars the week card draws); "Month" is the calendar month so
/// far.
({String from, String to}) periodRange(DateTime now, DashPeriod p) {
  final today = DateTime(now.year, now.month, now.day);
  switch (p) {
    case DashPeriod.today:
      return (from: _ymd(today), to: _ymd(today));
    case DashPeriod.week:
      return (
        from: _ymd(DateTime(today.year, today.month, today.day - 6)),
        to: _ymd(today)
      );
    case DashPeriod.month:
      return (from: _ymd(DateTime(today.year, today.month, 1)), to: _ymd(today));
  }
}

// ── Today's running total (sparkline) ───────────────────────────────────────

const int _firstHour = 9;
const int _hours = 12;

/// Running total of today's takings as points on a 9 am - 9 pm axis.
/// x is 0..1 across that window, y is rupees so far. Only runs up to [now]:
/// the line must not promise sales that have not happened. Empty when nothing
/// has been sold.
List<Offset> cumulativePoints(List<double> hourly, DateTime now) {
  if (hourly.isEmpty || hourly.every((v) => v <= 0)) return const [];
  final n = hourly.length < _hours ? hourly.length : _hours;
  final cur = (now.hour - _firstHour).clamp(0, n - 1);
  final pts = <Offset>[const Offset(0, 0)];
  var run = 0.0;
  for (var i = 0; i <= cur; i++) {
    run += hourly[i];
    double x;
    if (i < cur) {
      x = (i + 1) / _hours;
    } else if (now.hour >= _firstHour + _hours) {
      x = 1;
    } else if (now.hour < _firstHour) {
      x = 0.02;
    } else {
      x = (i + now.minute / 60) / _hours;
      if (x <= pts.last.dx) x = pts.last.dx + 0.01;
    }
    pts.add(Offset(x.clamp(0.0, 1.0), run));
  }
  return pts;
}

// ── Payment split ───────────────────────────────────────────────────────────

class SplitSegment {
  final String key;
  final String label;
  final double amount;
  const SplitSegment(this.key, this.label, this.amount);
}

double _d(Object? v) =>
    v is num ? v.toDouble() : (double.tryParse('${v ?? ''}') ?? 0);

/// Cash / UPI / Credit always (when the server sent the split), Bank only when
/// it is above zero. Returns empty when the keys are missing (older server) or
/// nothing was sold: a split of nothing is not a card.
List<SplitSegment> splitSegments(Map<String, dynamic>? summary) {
  if (summary == null) return const [];
  if (!(summary.containsKey('cash') ||
      summary.containsKey('upi') ||
      summary.containsKey('credit'))) {
    return const [];
  }
  final cash = _d(summary['cash']);
  final upi = _d(summary['upi']);
  final bank = _d(summary['bank']);
  final credit = _d(summary['credit']);
  if (cash + upi + bank + credit <= 0) return const [];
  return [
    SplitSegment('cash', 'Cash', cash),
    SplitSegment('upi', 'UPI', upi),
    SplitSegment('credit', 'Credit', credit),
    if (bank > 0) SplitSegment('bank', 'Bank', bank),
  ];
}

// ── Week bars ───────────────────────────────────────────────────────────────

/// Index of the tallest bar, or -1 when every day is zero.
int tallestIndex(List<double> v) {
  var best = -1;
  var max = 0.0;
  for (var i = 0; i < v.length; i++) {
    if (v[i] > max) {
      max = v[i];
      best = i;
    }
  }
  return best;
}

/// 62,000 -> "62k", 1,25,000 -> "1.3L", 2.4 crore -> "2.4Cr". Whole rupees
/// below a thousand. For bar labels only; never for a figure of record.
String compactRupees(double v) {
  final a = v.abs();
  String t(double x) {
    final s = x.toStringAsFixed(1);
    return s.endsWith('.0') ? s.substring(0, s.length - 2) : s;
  }

  if (a >= 10000000) return '₹${t(v / 10000000)}Cr';
  if (a >= 100000) return '₹${t(v / 100000)}L';
  if (a >= 1000) return '₹${(v / 1000).round()}k';
  return '₹${v.round()}';
}

// ── Money owed ──────────────────────────────────────────────────────────────

class Debtor {
  final String id;
  final String name;
  final double owed;
  const Debtor(this.id, this.name, this.owed);
}

/// Customers with a balance above zero, biggest first.
({int count, List<Debtor> top}) topDebtors(
  Iterable<({String id, String name, double owed})> clients, {
  int limit = 3,
}) {
  final owing = clients.where((c) => c.owed > 0.004).toList()
    ..sort((a, b) => b.owed.compareTo(a.owed));
  return (
    count: owing.length,
    top: owing.take(limit).map((c) => Debtor(c.id, c.name, c.owed)).toList(),
  );
}

String initials(String name) {
  final parts =
      name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  String first(String s) => String.fromCharCode(s.runes.first).toUpperCase();
  if (parts.length == 1) {
    final r = parts.first.runes.toList();
    return r.length > 1
        ? String.fromCharCodes(r.take(2)).toUpperCase()
        : first(parts.first);
  }
  return first(parts.first) + first(parts.last);
}

// ── Reorder soon ────────────────────────────────────────────────────────────

class ReorderItem {
  final String id;
  final String name;
  final double stock;
  const ReorderItem(this.id, this.name, this.stock);
  bool get isOut => StockLevels.isOutOfStock(stock);
}

/// Same rule as Inventory (StockLevels.needsRestock). Out of stock first, then
/// the lowest remaining, so the emptiest shelf is read first.
({int out, int low, List<ReorderItem> top}) reorderSoon(
  Iterable<({String id, String name, double stock})> products, {
  int limit = 3,
}) {
  final need = <ReorderItem>[
    for (final p in products)
      if (StockLevels.needsRestock(p.stock)) ReorderItem(p.id, p.name, p.stock),
  ]..sort((a, b) {
      if (a.isOut != b.isOut) return a.isOut ? -1 : 1;
      final c = a.stock.compareTo(b.stock);
      return c != 0 ? c : a.name.toLowerCase().compareTo(b.name.toLowerCase());
    });
  final out = need.where((e) => e.isOut).length;
  return (out: out, low: need.length - out, top: need.take(limit).toList());
}

String stockLeft(double stock) {
  final s = stock == stock.roundToDouble()
      ? stock.round().toString()
      : stock.toStringAsFixed(1);
  return '$s left';
}

// ── Best sellers ────────────────────────────────────────────────────────────

class BestSeller {
  final String key;
  final String name;
  final double revenue;
  final double qty;
  const BestSeller(this.key, this.name, this.revenue, this.qty);
}

bool _sameDay(String? raw, DateTime day) {
  if (raw == null || raw.isEmpty) return false;
  final parsed = DateTime.tryParse(raw);
  if (parsed == null) return false;
  // A bare yyyy-MM-dd is already the shop's calendar day; a timestamp with a
  // zone is converted to the device clock first.
  final d = (raw.length > 10 && parsed.isUtc) ? parsed.toLocal() : parsed;
  return d.year == day.year && d.month == day.month && d.day == day.day;
}

/// Top products by revenue from today's countable sales. Revenue is
/// quantity x rate on the line (before bill-level tax and discount), the only
/// per-product figure a sale line carries. Voided/cancelled bills and bills the
/// server refused (not in the books) are skipped.
List<BestSeller> bestSellersToday(
  Iterable<Sale> sales,
  DateTime today, {
  int limit = 3,
}) {
  final acc = <String, ({String name, double rev, double qty})>{};
  for (final s in sales) {
    if (s.syncState == 'refused') continue;
    if (!isCountableSale(status: s.status, paymentStatus: s.paymentStatus)) {
      continue;
    }
    if (!_sameDay(s.date, today)) continue;
    for (final it in (s.items ?? const [])) {
      if (it is! Map) continue;
      final id = (it['id'] ?? it['productId'])?.toString() ?? '';
      final name = (it['name'] ?? '').toString().trim();
      if (id.isEmpty && name.isEmpty) continue;
      final qty = _d(it['quantity'] ?? it['qty']);
      final rev = qty * _d(it['rate']);
      if (qty <= 0) continue;
      final key = id.isNotEmpty ? id : name.toLowerCase();
      final prev = acc[key];
      acc[key] = (
        name: name.isNotEmpty ? name : (prev?.name ?? 'Item'),
        rev: (prev?.rev ?? 0) + rev,
        qty: (prev?.qty ?? 0) + qty,
      );
    }
  }
  final list = [
    for (final e in acc.entries)
      BestSeller(e.key, e.value.name, e.value.rev, e.value.qty),
  ]..sort((a, b) {
      final c = b.revenue.compareTo(a.revenue);
      return c != 0 ? c : a.name.compareTo(b.name);
    });
  return list.take(limit).toList();
}

String qtyText(double q) =>
    q == q.roundToDouble() ? q.round().toString() : q.toStringAsFixed(1);

// ── Comparison pill ─────────────────────────────────────────────────────────

/// null => no pill. Otherwise the rounded whole-percent change and direction.
({int pct, int dir})? deltaPill(double? deltaPct) {
  if (deltaPct == null || deltaPct.isNaN || deltaPct.isInfinite) return null;
  final r = deltaPct.round();
  return (pct: r.abs(), dir: r > 0 ? 1 : (r < 0 ? -1 : 0));
}
