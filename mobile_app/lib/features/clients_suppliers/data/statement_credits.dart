/// When money against a sale actually arrived.
///
/// A sale is dated when the BILL was raised. Crediting its whole paidAmount on
/// that date is wrong the moment part of it was collected later: a 10 Aug bill
/// showed the full 4,960 on the 10th though 1,185 was not handed over until the
/// 31st. `post_sale_to_ledger` writes one row per payment event with its own
/// date, so those rows decide the dates.
///
/// Kept out of the widget so it can be checked without opening the app — the
/// web twin (src/lib/clientStatement.js) was lifted out of its component for
/// exactly this reason, after a double-credit survived until a closing balance
/// visibly disagreed with what was owed.
library;

/// One credit to show on the statement.
class StatementCredit {
  final String date;
  final double amount;
  /// True when this arrived after the bill — worth saying on screen, because a
  /// later collection is a different event from money taken at the till.
  final bool collectedLater;

  const StatementCredit({
    required this.date,
    required this.amount,
    required this.collectedLater,
  });
}

double _num(dynamic v) {
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v) ?? 0;
  return 0;
}

/// Credits for one sale, one per payment event.
///
/// Falls back to a single credit of [fallbackAmount] on [fallbackDate] when the
/// ledger has nothing for this sale — offline, or a query that failed. That is
/// still correct whenever nothing was collected late, which is the ordinary
/// case, so the statement degrades rather than emptying.
List<StatementCredit> creditsForSale({
  required String saleId,
  required double fallbackAmount,
  required String fallbackDate,
  required List<Map<String, dynamic>> receipts,
}) {
  final events = receipts.where((r) {
    if ((r['ref_id'] ?? '').toString() != saleId) return false;
    // Only sale rows: an expense or a client payment against the same id space
    // would be somebody else's money.
    final t = (r['ref_type'] ?? 'SALE').toString().toUpperCase();
    return t == 'SALE';
  }).toList();

  if (events.isEmpty) {
    return fallbackAmount > 0
        ? [StatementCredit(
            date: fallbackDate, amount: fallbackAmount, collectedLater: false)]
        : const [];
  }

  final out = <StatementCredit>[];
  for (final e in events) {
    final amt = _num(e['amount']);
    if (amt == 0) continue;
    out.add(StatementCredit(
      date: (e['date'] ?? fallbackDate).toString().split('T').first,
      amount: amt,
      collectedLater: (e['note'] ?? '').toString().startsWith('Collection'),
    ));
  }
  // Every event summed to zero (a posting and its reversal): show nothing
  // rather than a zero-value row.
  return out;
}
