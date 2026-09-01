import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/clients_suppliers/data/client_products.dart';
import 'package:mobile_app/features/sales/data/models/sale.dart';

Sale _sale({
  required String id,
  String? shopId = 'CLI-1',
  String? date = '2026-08-01',
  String? status,
  List<dynamic>? items,
}) =>
    Sale(id: id, shopId: shopId, date: date, status: status, items: items);

void main() {
  group('aggregateClientProducts', () {
    test('rolls one product up across several sales', () {
      final sales = [
        _sale(id: 'S1', date: '2026-08-01', items: [
          {'id': 'P1', 'name': 'Frootty', 'quantity': 10, 'price': 100, 'unit': 'PCS'},
        ]),
        _sale(id: 'S2', date: '2026-08-05', items: [
          {'id': 'P1', 'name': 'Frootty', 'quantity': 5, 'price': 100, 'unit': 'PCS'},
        ]),
      ];
      final out = aggregateClientProducts(sales, 'CLI-1');
      expect(out.length, 1);
      expect(out.first.qty, 15);
      expect(out.first.value, 1500);
      expect(out.first.orders, 2);
      expect(out.first.lastDate, '2026-08-05');
    });

    test('only counts sales belonging to this client', () {
      final sales = [
        _sale(id: 'S1', shopId: 'CLI-1', items: [
          {'id': 'P1', 'name': 'Mine', 'quantity': 1, 'price': 10},
        ]),
        _sale(id: 'S2', shopId: 'CLI-2', items: [
          {'id': 'P2', 'name': 'Theirs', 'quantity': 1, 'price': 10},
        ]),
        _sale(id: 'S3', shopId: null, items: [
          {'id': 'P3', 'name': 'Walk-in', 'quantity': 1, 'price': 10},
        ]),
      ];
      final out = aggregateClientProducts(sales, 'CLI-1');
      expect(out.map((l) => l.name), ['Mine']);
    });

    test('sorts by spend, so the biggest line is first', () {
      final sales = [
        _sale(id: 'S1', items: [
          {'id': 'P1', 'name': 'Cheap', 'quantity': 100, 'price': 1},
          {'id': 'P2', 'name': 'Dear',  'quantity': 1,   'price': 5000},
        ]),
      ];
      final out = aggregateClientProducts(sales, 'CLI-1');
      expect(out.map((l) => l.name), ['Dear', 'Cheap']);
    });

    test('keeps fractional quantities intact', () {
      // Weight goods are sold as 0.25 KG; rounding these to whole units is the
      // bug that made RUBBER BAND report a negative margin.
      final sales = [
        _sale(id: 'S1', items: [
          {'id': 'P1', 'name': 'Rice', 'quantity': 0.25, 'price': 80, 'unit': 'KG'},
        ]),
        _sale(id: 'S2', items: [
          {'id': 'P1', 'name': 'Rice', 'quantity': 0.5, 'price': 80, 'unit': 'KG'},
        ]),
      ];
      final out = aggregateClientProducts(sales, 'CLI-1');
      expect(out.first.qty, closeTo(0.75, 1e-9));
      expect(out.first.value, closeTo(60, 1e-9));
      expect(out.first.unit, 'KG');
    });

    test('groups by product id, not name, when a product was renamed', () {
      // Splitting one product into two rows would misreport both.
      final sales = [
        _sale(id: 'S1', date: '2026-07-01', items: [
          {'id': 'P1', 'name': 'Old name', 'quantity': 1, 'price': 100},
        ]),
        _sale(id: 'S2', date: '2026-08-01', items: [
          {'id': 'P1', 'name': 'New name', 'quantity': 1, 'price': 100},
        ]),
      ];
      final out = aggregateClientProducts(sales, 'CLI-1');
      expect(out.length, 1);
      expect(out.first.name, 'New name', reason: 'the most recent name wins');
      expect(out.first.qty, 2);
    });

    test('counts a sale once per product even if it has two lines of it', () {
      final sales = [
        _sale(id: 'S1', items: [
          {'id': 'P1', 'name': 'Frootty', 'quantity': 2, 'price': 10},
          {'id': 'P1', 'name': 'Frootty', 'quantity': 3, 'price': 10},
        ]),
      ];
      final out = aggregateClientProducts(sales, 'CLI-1');
      expect(out.first.qty, 5);
      expect(out.first.orders, 1, reason: 'one sale, however many lines');
    });

    test('prefers a line total that already accounts for a discount', () {
      final sales = [
        _sale(id: 'S1', items: [
          {'id': 'P1', 'name': 'Discounted', 'quantity': 2, 'price': 100, 'total': 150},
        ]),
      ];
      expect(aggregateClientProducts(sales, 'CLI-1').first.value, 150);
    });

    test('excludes voided and cancelled sales', () {
      final sales = [
        _sale(id: 'S1', status: 'VOIDED', items: [
          {'id': 'P1', 'name': 'Voided', 'quantity': 1, 'price': 10},
        ]),
        _sale(id: 'S2', status: 'CANCELLED', items: [
          {'id': 'P2', 'name': 'Cancelled', 'quantity': 1, 'price': 10},
        ]),
        _sale(id: 'S3', status: 'COMPLETED', items: [
          {'id': 'P3', 'name': 'Real', 'quantity': 1, 'price': 10},
        ]),
      ];
      expect(aggregateClientProducts(sales, 'CLI-1').map((l) => l.name), ['Real']);
    });

    test('survives the messy rows real data actually contains', () {
      final sales = [
        _sale(id: 'S1', items: null),
        _sale(id: 'S2', items: []),
        _sale(id: 'S3', items: ['not a map', 42]),
        _sale(id: 'S4', items: [
          {'name': '', 'quantity': 1, 'price': 10},              // no id, no name
          {'name': 'Strings', 'quantity': '2', 'price': '50'},   // numbers as strings
          {'id': 'P9', 'name': 'No price', 'quantity': 3},       // missing price
        ]),
      ];
      final out = aggregateClientProducts(sales, 'CLI-1');
      final byName = {for (final l in out) l.name: l};
      expect(byName.containsKey('Strings'), isTrue);
      expect(byName['Strings']!.value, 100);
      expect(byName['No price']!.value, 0);
      expect(byName['No price']!.qty, 3);
      expect(out.length, 2, reason: 'the unlabelled line is skipped, not counted blank');
    });

    test('returns nothing for a client who has bought nothing', () {
      expect(aggregateClientProducts([], 'CLI-1'), isEmpty);
    });
  });
}
