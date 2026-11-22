import 'package:mobile_app/core/utils/money.dart';

/// Which bar segment a sale's paymentMethod falls in. Mirrors the SQL in
/// 20261123_sales_period_summary_split.sql: CASH, UPI, CREDIT-ish
/// (CREDIT, CREDIT_SALE, UDHAAR), everything else (BANK, CARD, CHEQUE,
/// ONLINE, unknown) is bank.
enum PayBucket { cash, upi, bank, credit }

PayBucket paymentBucket(String? method) {
  switch ((method ?? '').trim().toUpperCase()) {
    case 'CASH':
      return PayBucket.cash;
    case 'UPI':
      return PayBucket.upi;
    case 'CREDIT':
    case 'CREDIT_SALE':
    case 'UDHAAR':
      return PayBucket.credit;
    default:
      return PayBucket.bank;
  }
}

/// Today's takings by how they were paid.
class PaymentSplit {
  final double cash, upi, bank, credit;
  const PaymentSplit({this.cash = 0, this.upi = 0, this.bank = 0, this.credit = 0});

  double get total => cash + upi + bank + credit;

  /// From the server summary. Null when the keys are absent (server not yet
  /// migrated): the screen then shows no split rather than a wrong one.
  static PaymentSplit? fromSummary(Map<String, dynamic>? m) {
    if (m == null) return null;
    const keys = ['cash', 'upi', 'bank', 'credit'];
    if (!keys.every(m.containsKey)) return null;
    double v(String k) => (m[k] as num?)?.toDouble() ?? 0;
    return PaymentSplit(cash: v('cash'), upi: v('upi'), bank: v('bank'), credit: v('credit'));
  }

  PaymentSplit plus(String? method, double amount) {
    switch (paymentBucket(method)) {
      case PayBucket.cash:
        return PaymentSplit(cash: cash + amount, upi: upi, bank: bank, credit: credit);
      case PayBucket.upi:
        return PaymentSplit(cash: cash, upi: upi + amount, bank: bank, credit: credit);
      case PayBucket.bank:
        return PaymentSplit(cash: cash, upi: upi, bank: bank + amount, credit: credit);
      case PayBucket.credit:
        return PaymentSplit(cash: cash, upi: upi, bank: bank, credit: credit + amount);
    }
  }

  /// "₹x cash · ₹y UPI · ₹z credit"; empty buckets are left out.
  String legend() => [
        if (cash > 0) '${Money.inr(cash)} cash',
        if (upi > 0) '${Money.inr(upi)} UPI',
        if (bank > 0) '${Money.inr(bank)} bank',
        if (credit > 0) '${Money.inr(credit)} credit',
      ].join(' · ');
}

enum AttentionKind { collect, stock, notSent }

typedef AttentionItem = ({AttentionKind kind, String text});

/// The "Needs attention" rows. Zero rows are hidden. [low] and [out] must come
/// from StockLevels.counts so the numbers equal the Inventory screen's.
List<AttentionItem> attentionItems({
  required double toCollect,
  required int customers,
  required int low,
  required int out,
  required int notSent,
}) {
  return [
    if (toCollect > 0 && customers > 0)
      (
        kind: AttentionKind.collect,
        text: '${Money.inr(toCollect)} to collect · $customers '
            '${customers == 1 ? 'customer' : 'customers'}',
      ),
    if (low > 0 || out > 0)
      (
        kind: AttentionKind.stock,
        text: [
          if (low > 0) '$low low',
          if (out > 0) '$out out of stock',
        ].join(' · '),
      ),
    if (notSent > 0)
      (
        kind: AttentionKind.notSent,
        text: '$notSent ${notSent == 1 ? 'sale' : 'sales'} not sent',
      ),
  ];
}
