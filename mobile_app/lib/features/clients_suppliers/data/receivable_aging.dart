// How old the money customers owe is.
//
// This is the Dart side of a shared contract. The web side is
// src/lib/receivableAging.js; both are checked against the same cases in
// shared/fixtures/receivable_aging.json, so a change to one that the other
// does not make fails a test.
//
// Rows come from get_unpaid_sales, the one definition of what is owed on a
// sale. Bills carry no due dates (invoices.due_date is empty on every row), so
// this ages from the sale date and says "unpaid for", never "overdue": nothing
// tells us what was agreed.

const ageBuckets = ['0-30', '31-60', '61-90', '91-120', '120+'];

/// JS Math.round, so a half rounds the same way on both surfaces, negatives
/// included. Dart's round() takes -2.5 to -3; Math.round takes it to -2.
double _r2(num n) => ((n * 100) + 0.5).floorToDouble() / 100;

/// Number(v) || 0: amounts arrive as numbers or strings, or not at all.
double _num(Object? v) {
  if (v is num) return v.toDouble();
  return double.tryParse(v?.toString() ?? '') ?? 0;
}

int _dayNo(Object? s) {
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(s?.toString() ?? '');
  // A row with no readable date cannot be aged. Fail the load: filing it under
  // a made-up age would be a wrong figure with nothing to say so.
  if (m == null) throw FormatException('Unreadable sale date', s);
  final utc = DateTime.utc(
      int.parse(m.group(1)!), int.parse(m.group(2)!), int.parse(m.group(3)!));
  return utc.millisecondsSinceEpoch ~/ Duration.millisecondsPerDay;
}

int daysUnpaid(Object? saleDate, String today) {
  final d = _dayNo(today) - _dayNo(saleDate);
  return d < 0 ? 0 : d;
}

String ageBucket(int days) {
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  if (days <= 120) return '91-120';
  return '120+';
}

class AgedBill {
  final String saleId;
  final String? clientId;
  final String clientName;
  final String phone;
  final String? saleDate;
  final String? invoiceId;
  final double total;
  final double paid;
  final double unpaid;
  final int days;
  final String bucket;

  const AgedBill({
    required this.saleId,
    required this.clientId,
    required this.clientName,
    required this.phone,
    required this.saleDate,
    required this.invoiceId,
    required this.total,
    required this.paid,
    required this.unpaid,
    required this.days,
    required this.bucket,
  });
}

class AgedCustomer {
  final String? clientId;
  final String clientName;
  final String phone;
  double total = 0;
  int bills = 0;
  int oldest = 0;
  final Map<String, double> buckets = {for (final b in ageBuckets) b: 0};
  final List<AgedBill> billRows = [];

  AgedCustomer(this.clientId, this.clientName, this.phone);
}

class ReceivableAging {
  final List<AgedBill> bills; // oldest first
  final List<AgedCustomer> customers; // most owed first
  final Map<String, double> totals;
  final double total;
  final double over30;
  final double over90;
  final double outstanding;

  /// Bills minus client balances. Shown, never hidden: customer credit, a
  /// balance out of step with its sales, or a sale with no customer on it.
  final double difference;

  const ReceivableAging({
    required this.bills,
    required this.customers,
    required this.totals,
    required this.total,
    required this.over30,
    required this.over90,
    required this.outstanding,
    required this.difference,
  });
}

/// [unpaid] are get_unpaid_sales rows, [balances] the shop's
/// clients.outstanding_balance values, [today] 'YYYY-MM-DD' in the shop's day.
ReceivableAging buildAging(
  List<Map<String, dynamic>> unpaid,
  Iterable<Object?> balances,
  String today,
) {
  final indexed = <(int, AgedBill)>[];
  for (var i = 0; i < unpaid.length; i++) {
    final s = unpaid[i];
    final days = daysUnpaid(s['sale_date'], today);
    indexed.add((
      i,
      AgedBill(
        saleId: '${s['sale_id'] ?? ''}',
        clientId: s['client_id'] as String?,
        clientName: '${s['client_name'] ?? ''}',
        phone: (s['phone'] as String?) ?? '',
        saleDate: s['sale_date']?.toString(),
        invoiceId: s['invoice_id'] as String?,
        total: _num(s['total']),
        paid: _num(s['paid']),
        unpaid: _r2(_num(s['unpaid'])),
        days: days,
        bucket: ageBucket(days),
      )
    ));
  }
  // Dart's sort is not stable, and the web's is. The index keeps a same-age
  // list in the same order on both.
  indexed.sort((a, b) {
    final byAge = b.$2.days.compareTo(a.$2.days);
    return byAge != 0 ? byAge : a.$1.compareTo(b.$1);
  });
  final bills = [for (final e in indexed) e.$2];

  final byClient = <String, AgedCustomer>{};
  final totals = <String, double>{for (final b in ageBuckets) b: 0};
  double total = 0;
  for (final b in bills) {
    final id = b.clientId;
    final key = (id != null && id.isNotEmpty) ? id : 'name:${b.clientName}';
    final c = byClient.putIfAbsent(
        key, () => AgedCustomer(id, b.clientName, b.phone));
    c.buckets[b.bucket] = _r2(c.buckets[b.bucket]! + b.unpaid);
    c.total = _r2(c.total + b.unpaid);
    c.bills += 1;
    if (b.days > c.oldest) c.oldest = b.days;
    c.billRows.add(b);
    totals[b.bucket] = _r2(totals[b.bucket]! + b.unpaid);
    total = _r2(total + b.unpaid);
  }

  final indexedCustomers = byClient.values.toList().asMap().entries.toList()
    ..sort((a, b) {
      final byTotal = b.value.total.compareTo(a.value.total);
      return byTotal != 0 ? byTotal : a.key.compareTo(b.key);
    });

  final outstanding = _r2(balances.fold<double>(0, (s, v) => s + _num(v)));
  return ReceivableAging(
    bills: bills,
    customers: [for (final e in indexedCustomers) e.value],
    totals: totals,
    total: total,
    over30: _r2(total - totals['0-30']!),
    over90: _r2(totals['91-120']! + totals['120+']!),
    outstanding: outstanding,
    difference: _r2(total - outstanding),
  );
}

/// The line under the report. The total must agree with what the rest of the
/// app says customers owe; if it does not, say by how much rather than leave
/// two numbers to be found.
String tieOutLine(ReceivableAging a, String Function(num) fmt) {
  if (!(a.total > 0 || a.outstanding > 0.5)) return 'No customer owes anything.';
  final gap = a.difference.abs();
  if (gap < 0.5) {
    return 'Aged from the sale date. Matches customer balances of ${fmt(a.outstanding)}.';
  }
  final why = a.difference > 0
      ? 'less than these bills (customer credit, or a sale with no customer on it)'
      : 'more than these bills (an opening balance, or an entry not tied to a sale)';
  return 'Aged from the sale date. Customer balances total ${fmt(a.outstanding)}: ${fmt(gap)} $why.';
}

/// Most rows one report will read. Hitting it fails the load: a total summed
/// over part of the rows is the wrong answer this screen exists to avoid.
const agingRowCeiling = 50000;
const agingPageSize = 1000;

/// Every page of a query. PostgREST answers with at most 1000 rows and no
/// error, so one request would quietly under-report a big shop.
Future<List<Map<String, dynamic>>> fetchAllPages(
  Future<List<dynamic>> Function(int from, int to) page,
) async {
  final out = <Map<String, dynamic>>[];
  for (var from = 0; from < agingRowCeiling; from += agingPageSize) {
    final batch = await page(from, from + agingPageSize - 1);
    out.addAll(batch.map((e) => Map<String, dynamic>.from(e as Map)));
    if (batch.length < agingPageSize) return out;
  }
  throw StateError('More than $agingRowCeiling rows; the total would be incomplete');
}
