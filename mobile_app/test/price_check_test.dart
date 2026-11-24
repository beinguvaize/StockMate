import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/utils/price_check.dart';
import 'package:mobile_app/core/widgets/price_check_dialog.dart';

/// The purchase price check: a line far from what the item last cost is asked
/// about once before saving. Same rule as the web (priceCheck.test.js).
void main() {
  Map<String, dynamic> pur(String id, String date, num qty, num total,
          {String product = 'P1', String? status, String? deletedAt, String? createdAt}) =>
      {
        'id': id,
        'date': date,
        'created_at': createdAt ?? '${date}T10:00:00Z',
        'linked_product_id': product,
        'quantity': qty,
        'total_amount': total,
        'status': status,
        'deleted_at': deletedAt,
      };

  PriceCheckLine line(num total, {num qty = 100, String product = 'P1', String? id, int index = 0}) =>
      PriceCheckLine(
          index: index, productId: product, name: '10*13 Cover PKT',
          quantity: qty.toDouble(), total: total.toDouble(), id: id);

  final history = [pur('A', '2026-10-01', 100, 600), pur('B', '2026-10-29', 100, 590)]; // last 5.90

  group('lastPurchase', () {
    test('newest real purchase, by date then entry time', () {
      final rows = [
        ...history,
        pur('C', '2026-10-29', 100, 610, createdAt: '2026-10-29T09:00:00Z'),
        pur('D', '2026-11-01', 100, 900, deletedAt: '2026-11-02'),
        pur('E', '2026-11-02', 100, 900, status: 'CANCELLED'),
        pur('F', '2026-11-03', 100, 900, product: 'P2'),
      ];
      final last = PriceCheck.lastPurchase(rows, 'P1')!;
      expect([last.id, last.unitCost, last.date], ['B', 5.9, '2026-10-29']);
    });

    test('null for an item never bought', () {
      expect(PriceCheck.lastPurchase(history, 'NOPE'), isNull);
    });
  });

  group('check', () {
    test('the wrong-product case from the shop', () {
      final f = PriceCheck.check([line(915)], history).single;
      expect([f.newCost, f.lastCost, f.higher, f.pct], [9.15, 5.9, true, 55]);
      expect(PriceCheck.message(f, today: DateTime(2026, 11, 11)),
          '10*13 Cover PKT: ₹9.15 per unit. Last bought at ₹5.90 on 29 Oct, 55% higher.');
    });

    test('lower for a drop', () {
      final f = PriceCheck.check([line(400)], history).single;
      expect([f.higher, f.pct], [false, 32]);
      expect(PriceCheck.message(f, today: DateTime(2026, 11, 11)), endsWith('32% lower.'));
    });

    test('exactly 20% either way is not asked about; just past it is', () {
      expect(PriceCheck.pricePct, 20);
      final last5 = [pur('A', '2026-10-29', 100, 500)];
      expect(PriceCheck.check([line(600)], last5), isEmpty);
      expect(PriceCheck.check([line(400)], last5), isEmpty);
      expect(PriceCheck.check([line(601)], last5), hasLength(1));
      expect(PriceCheck.check([line(399)], last5), hasLength(1));
    });

    test('nothing to compare with on a first purchase', () {
      expect(PriceCheck.check([line(915)], const []), isEmpty);
    });

    test('a last cost of 0 is skipped', () {
      expect(PriceCheck.check([line(915)], [pur('A', '2026-10-29', 100, 0)]), isEmpty);
    });

    test('an existing line is compared with the purchase before it, not itself', () {
      final rows = [pur('A', '2026-10-01', 100, 590), pur('B', '2026-11-05', 100, 915)];
      final f = PriceCheck.check([line(915, id: 'B')], rows).single;
      expect([f.lastCost, f.lastDate, f.pct], [5.9, '2026-10-01', 55]);
      expect(PriceCheck.check([line(915)], rows), isEmpty);
    });

    test('lists every flagged line in bill order', () {
      final rows = [...history, pur('X', '2026-10-29', 10, 50, product: 'P2')];
      final flagged = PriceCheck.check([
        line(915, index: 0),
        line(52, qty: 10, product: 'P2', index: 1),
        line(20, qty: 10, product: 'P2', index: 2),
      ], rows);
      expect(flagged.map((f) => f.index), [0, 2]);
    });

    test('a date from another year carries the year', () {
      expect(PriceCheck.shortDate('2025-03-04', today: DateTime(2026, 11, 11)), '4 Mar 2025');
    });

    test('rupees use Indian grouping', () {
      expect(PriceCheck.inr(123456.5), '₹1,23,456.50');
    });
  });

  group('dialog', () {
    final flagged = PriceCheck.check([line(915)], history);

    Future<List<bool?>> open(WidgetTester tester) async {
      final results = <bool?>[];
      await tester.pumpWidget(MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: TextButton(
                onPressed: () async => results.add(await showPriceCheckDialog(context, flagged)),
                child: const Text('Save'),
              ),
            ),
          ),
        ),
      ));
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      return results;
    }

    testWidgets('lists the line and "Yes" goes on to save', (tester) async {
      final results = await open(tester);
      expect(find.text('Is this price right?'), findsOneWidget);
      expect(find.textContaining('10*13 Cover PKT: ₹9.15 per unit. Last bought at ₹5.90 on 29 Oct'),
          findsOneWidget);
      await tester.tap(find.text('Yes, these prices are right'));
      await tester.pumpAndSettle();
      expect(results, [true]);
      expect(find.text('Is this price right?'), findsNothing);
    });

    testWidgets('"Change it" does not save', (tester) async {
      final results = await open(tester);
      await tester.tap(find.text('Change it'));
      await tester.pumpAndSettle();
      expect(results, [false]);
    });
  });
}
