import 'package:intl/intl.dart';

/// Is this line's price far from what the item last cost?
///
/// A line entered against the wrong product looks like a normal line. "10*13
/// Cover PKT" was saved at Rs 9.15 a unit when its other purchases were Rs 6.00
/// and Rs 5.90, and nothing said so. A price that far from the last purchase
/// is a real change or a mistake, and only the person at the bill knows which,
/// so it is asked once before saving. It never stops the save.
///
/// Same rule, threshold and wording as the web app
/// (src/pages/purchases/lib/priceCheck.js). Change both together.
class PriceCheck {
  PriceCheck._();

  /// A line more than this many percent above or below the last purchase is
  /// asked about. Exactly this much is not.
  static const int pricePct = 20;

  static double _round2(double n) => (n * 100).round() / 100;

  static String _day(Object? d) {
    if (d == null) return '';
    if (d is DateTime) {
      return '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    }
    final s = d.toString();
    return s.length >= 10 ? s.substring(0, 10) : s;
  }

  /// The newest real purchase of [productId] among [purchases] (rows shaped
  /// like the `purchases` table): deleted and cancelled rows left out, newest
  /// by date, then by when it was entered. [excludeIds] drops rows, so an
  /// edited line is never compared with itself.
  static LastPurchase? lastPurchase(
    List<Map<String, dynamic>> purchases,
    String? productId, {
    Set<String> excludeIds = const {},
  }) {
    if (productId == null) return null;
    Map<String, dynamic>? best;
    for (final p in purchases) {
      if (p['linked_product_id'] != productId) continue;
      if (p['deleted_at'] != null || excludeIds.contains(p['id'])) continue;
      if ((p['status'] ?? '').toString().toUpperCase() == 'CANCELLED') continue;
      final qty = (p['quantity'] as num?)?.toDouble() ?? 0;
      if (qty <= 0) continue;
      if (best != null) {
        var cmp = _day(p['date']).compareTo(_day(best['date']));
        if (cmp == 0) {
          cmp = (p['created_at'] ?? '').toString().compareTo((best['created_at'] ?? '').toString());
        }
        if (cmp <= 0) continue;
      }
      best = p;
    }
    if (best == null) return null;
    final qty = (best['quantity'] as num).toDouble();
    final total = (best['total_amount'] as num?)?.toDouble() ?? 0;
    return LastPurchase(
      id: best['id']?.toString() ?? '',
      unitCost: _round2(total / qty),
      date: _day(best['date']),
    );
  }

  /// Every line more than [pricePct] away from its product's last purchase,
  /// in bill order. No previous purchase, or a last cost of 0, is skipped.
  static List<PriceFlag> check(
    List<PriceCheckLine> lines,
    List<Map<String, dynamic>> purchases, {
    int pct = pricePct,
  }) {
    final flagged = <PriceFlag>[];
    for (final line in lines) {
      if (line.quantity <= 0 || line.total < 0) continue;
      final last = lastPurchase(purchases, line.productId,
          excludeIds: {if (line.id != null) line.id!});
      if (last == null || last.unitCost <= 0) continue;
      final newCost = _round2(line.total / line.quantity);
      final change = (newCost - last.unitCost) / last.unitCost * 100;
      if (change.abs() <= pct + 1e-9) continue;
      flagged.add(PriceFlag(
        index: line.index,
        name: line.name,
        newCost: newCost,
        lastCost: last.unitCost,
        lastDate: last.date,
        higher: change > 0,
        pct: change.abs().round(),
      ));
    }
    return flagged;
  }

  static final NumberFormat _inr = NumberFormat('#,##,##0.00', 'en_IN');
  static String inr(num n) => '₹${_inr.format(n)}';

  static const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /// "29 Oct", or "29 Oct 2025" when it is not this year.
  static String shortDate(String ymd, {DateTime? today}) {
    final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(ymd);
    if (m == null) return '';
    final base = '${int.parse(m[3]!)} ${_months[int.parse(m[2]!) - 1]}';
    final year = int.parse(m[1]!);
    return year == (today ?? DateTime.now()).year ? base : '$base $year';
  }

  /// "10*13 Cover PKT: ₹9.15 per unit. Last bought at ₹5.90 on 29 Oct, 55% higher."
  static String message(PriceFlag f, {DateTime? today}) =>
      '${f.name}: ${inr(f.newCost)} per unit. Last bought at ${inr(f.lastCost)} '
      'on ${shortDate(f.lastDate, today: today)}, ${f.pct}% ${f.higher ? 'higher' : 'lower'}.';
}

class LastPurchase {
  final String id;
  final double unitCost;
  final String date;
  const LastPurchase({required this.id, required this.unitCost, required this.date});
}

/// A bill line as the check sees it. Quantity is in the base unit, as stored.
/// [id] is set only for a line that already exists as a purchase row.
class PriceCheckLine {
  final int index;
  final String? productId;
  final String name;
  final double quantity;
  final double total;
  final String? id;
  const PriceCheckLine({
    required this.index,
    required this.productId,
    required this.name,
    required this.quantity,
    required this.total,
    this.id,
  });
}

class PriceFlag {
  final int index;
  final String name;
  final double newCost;
  final double lastCost;
  final String lastDate;
  final bool higher;
  final int pct;
  const PriceFlag({
    required this.index,
    required this.name,
    required this.newCost,
    required this.lastCost,
    required this.lastDate,
    required this.higher,
    required this.pct,
  });
}
