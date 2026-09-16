import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/clients_suppliers/data/statement_credits.dart';

void main() {
  // The real case: a 5,745 bill on 10 Aug, 3,775 taken at the till, 1,185
  // collected on 31 Aug. Crediting all 4,960 on the 10th showed three weeks of
  // debt as settled earlier than it was. Mirrors the web test in
  // src/lib/clientStatement.test.js — change one, change both.
  final receipts = [
    {'id': 'ATX-1', 'ref_type': 'SALE', 'ref_id': 'SAL-1', 'date': '2026-08-10',
     'amount': 3775, 'note': 'POS sale (edited)'},
    {'id': 'ATX-2', 'ref_type': 'SALE', 'ref_id': 'SAL-1', 'date': '2026-08-31',
     'amount': 1185, 'note': 'Collection on sale'},
  ];

  List<StatementCredit> run({List<Map<String, dynamic>>? r, double paid = 4960}) =>
      creditsForSale(
        saleId: 'SAL-1', fallbackAmount: paid, fallbackDate: '2026-08-10',
        receipts: r ?? receipts,
      );

  test('credits each part on the day it arrived', () {
    final c = run();
    expect(c.map((x) => [x.date, x.amount]), [
      ['2026-08-10', 3775.0],
      ['2026-08-31', 1185.0],
    ]);
  });

  test('totals the same money — only the dates moved', () {
    expect(run().fold<double>(0, (t, c) => t + c.amount), 4960);
  });

  test('marks only the later one', () {
    final c = run();
    expect(c.first.collectedLater, isFalse);
    expect(c.last.collectedLater, isTrue);
  });

  test('falls back to one credit on the sale date when the ledger has nothing', () {
    // Offline, or a query that failed. Still right whenever nothing was
    // collected late, so the statement degrades rather than emptying.
    final c = run(r: const []);
    expect(c.length, 1);
    expect(c.single.date, '2026-08-10');
    expect(c.single.amount, 4960);
    expect(c.single.collectedLater, isFalse);
  });

  test('ignores rows belonging to another sale or another ref type', () {
    final c = run(r: [
      ...receipts,
      {'ref_type': 'SALE', 'ref_id': 'SAL-OTHER', 'date': '2026-08-31', 'amount': 999},
      {'ref_type': 'EXPENSE', 'ref_id': 'SAL-1', 'date': '2026-08-31', 'amount': 500},
    ]);
    expect(c.fold<double>(0, (t, x) => t + x.amount), 4960);
  });

  test('handles amounts that arrive as strings', () {
    final c = run(r: [
      {'ref_type': 'SALE', 'ref_id': 'SAL-1', 'date': '2026-08-10', 'amount': '250.50'},
    ]);
    expect(c.single.amount, 250.5);
  });

  test('trims a timestamp down to the day', () {
    final c = run(r: [
      {'ref_type': 'SALE', 'ref_id': 'SAL-1', 'date': '2026-08-31T10:15:00Z', 'amount': 100},
    ]);
    expect(c.single.date, '2026-08-31');
  });

  test('emits nothing when there is no money either way', () {
    expect(run(r: const [], paid: 0), isEmpty);
    expect(run(r: [
      {'ref_type': 'SALE', 'ref_id': 'SAL-1', 'date': '2026-08-10', 'amount': 0},
    ]), isEmpty);
  });
}
