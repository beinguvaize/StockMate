import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/clients_suppliers/data/party_aging.dart';

void main() {
  final now = DateTime(2026, 11, 24);

  test('agingScaledTo keeps the proportions and adds up to the balance', () {
    const a = PartyAging(
        d0to30: 100, d31to60: 300, d60plus: 0, unpaidBills: 2, oldestDays: 40);
    final s = agingScaledTo(a, 200);
    expect(s.d0to30, 50);
    expect(s.d31to60, 150);
    expect(s.total, 200);
    expect(s.unpaidBills, 2);
    expect(s.oldestDays, 40);
    // Nothing to scale against: left as it is.
    expect(agingScaledTo(a, 0).total, 400);
  });

  group('supplierAging', () {
    test('ages what is left on each bill into the three bands', () {
      final a = supplierAging([
        {'supplier_id': 'S1', 'total_amount': 1000, 'paid_amount': 400, 'date': '2026-11-20'},
        {'supplier_id': 'S1', 'total_amount': 500, 'paid_amount': 0, 'date': '2026-10-10'},
        {'supplier_id': 'S1', 'total_amount': 300, 'paid_amount': 0, 'date': '2026-08-01'},
      ], now)['S1']!;
      expect(a.d0to30, 600);
      expect(a.d31to60, 500);
      expect(a.d60plus, 300);
      expect(a.unpaidBills, 3);
      expect(a.oldestDays, 115);
      expect(a.total, 1400);
    });

    test('a fully paid supplier is left out', () {
      final m = supplierAging([
        {'supplier_id': 'S2', 'total_amount': 250, 'paid_amount': 250, 'date': '2026-11-01'},
      ], now);
      expect(m.containsKey('S2'), isFalse);
    });

    test('bills with no supplier are skipped, a bad date counts as today', () {
      final m = supplierAging([
        {'supplier_id': null, 'total_amount': 99, 'paid_amount': 0, 'date': '2026-11-01'},
        {'supplier_id': 'S3', 'total_amount': 80, 'paid_amount': 0, 'date': 'not a date'},
      ], now);
      expect(m.length, 1);
      expect(m['S3']!.d0to30, 80);
      expect(m['S3']!.oldestDays, 0);
    });
  });
}
