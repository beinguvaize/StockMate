import 'package:mobile_app/features/sales/data/models/sale.dart';

/// How old one party's unpaid bills are.
///
/// The three bands are the ones on the Clients and Suppliers screens:
/// 0–30 days, 31–60 days, and older than 60.
class PartyAging {
  final double d0to30;
  final double d31to60;
  final double d60plus;

  /// The part of [d60plus] that is older than 90 days.
  final double d90plus;
  final int unpaidBills;

  /// Age in days of the oldest bill still unpaid; null when none is.
  final int? oldestDays;

  const PartyAging({
    this.d0to30 = 0,
    this.d31to60 = 0,
    this.d60plus = 0,
    this.d90plus = 0,
    this.unpaidBills = 0,
    this.oldestDays,
  });

  double get total => d0to30 + d31to60 + d60plus;

  /// 61 to 90 days.
  double get d61to90 => d60plus - d90plus;
}

/// Running totals for [PartyAging] while bills are added one at a time.
class _Acc {
  double a = 0, b = 0, c = 0, d = 0;
  int n = 0;
  int? oldest;

  void add(double unpaid, int days) {
    if (unpaid <= 0) return;
    if (days <= 30) {
      a += unpaid;
    } else if (days <= 60) {
      b += unpaid;
    } else {
      c += unpaid;
      if (days > 90) d += unpaid;
    }
    n++;
    if (oldest == null || days > oldest!) oldest = days;
  }

  PartyAging done() => PartyAging(
      d0to30: a,
      d31to60: b,
      d60plus: c,
      d90plus: d,
      unpaidBills: n,
      oldestDays: oldest);
}

int _daysSince(String? date, DateTime now) {
  if (date == null) return 0;
  final d = DateTime.tryParse(date);
  if (d == null) return 0;
  final days = now.difference(d).inDays;
  return days < 0 ? 0 : days;
}

/// Ageing of what each client owes, keyed by client id.
///
/// Each credit bill is aged from its date by what is still unpaid on it
/// (its total less what has been paid against it). Voided and failed bills
/// are left out.
Map<String, PartyAging> clientAging(List<Sale> sales, DateTime now) {
  final accs = <String, _Acc>{};
  for (final s in sales) {
    final id = s.shopId;
    if (id == null) continue;
    final st = (s.paymentStatus ?? '').toUpperCase();
    if (st == 'PAID' || st == 'VOIDED' || st == 'FAILED') continue;
    if ((s.status ?? '').toUpperCase() == 'VOIDED') continue;
    final due = (s.totalAmount ?? 0) - (s.paidAmount ?? 0);
    (accs[id] ??= _Acc()).add(due, _daysSince(s.date, now));
  }
  return {
    for (final e in accs.entries)
      if (e.value.n > 0) e.key: e.value.done(),
  };
}

/// [aging] scaled so its three bands add up to [owed], the party's balance.
///
/// The balance is the figure of record; the bills on the phone can lag it
/// (an advance, an opening balance, bills older than the phone holds). The
/// bands keep their proportions, so the bar under a total always adds up to
/// that total.
PartyAging agingScaledTo(PartyAging aging, double owed) {
  if (aging.total <= 0 || owed <= 0) return aging;
  final k = owed / aging.total;
  return PartyAging(
    d0to30: aging.d0to30 * k,
    d31to60: aging.d31to60 * k,
    d60plus: aging.d60plus * k,
    d90plus: aging.d90plus * k,
    unpaidBills: aging.unpaidBills,
    oldestDays: aging.oldestDays,
  );
}

/// Ageing of what is owed to each supplier, keyed by supplier id, from bill
/// rows holding `supplier_id`, `total_amount`, `paid_amount` and `date`.
Map<String, PartyAging> supplierAging(
    List<Map<String, dynamic>> bills, DateTime now) {
  final accs = <String, _Acc>{};
  for (final row in bills) {
    final sid = row['supplier_id'] as String?;
    if (sid == null) continue;
    final due = ((row['total_amount'] as num?)?.toDouble() ?? 0) -
        ((row['paid_amount'] as num?)?.toDouble() ?? 0);
    (accs[sid] ??= _Acc()).add(due, _daysSince(row['date'] as String?, now));
  }
  return {
    for (final e in accs.entries)
      if (e.value.n > 0) e.key: e.value.done(),
  };
}
