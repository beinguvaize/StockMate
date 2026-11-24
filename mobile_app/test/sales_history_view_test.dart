import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/features/inventory/presentation/inventory_screen.dart'
    show marginColor, stockLevelFraction;
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/sales/data/models/sale.dart';
import 'package:mobile_app/features/sales/presentation/sales_view.dart';

Sale sale(String id, String date, double total, {String? status, String? sync}) =>
    Sale(id: id, date: date, totalAmount: total, paymentStatus: status, syncState: sync);

void main() {
  test('short id is the last 4 characters, uppercase', () {
    expect(shortSaleId('SAL-3f9a1c2e'), '1C2E');
    expect(shortSaleId('ab'), 'AB');
  });

  test('groups by day with labels and day totals', () {
    final now = DateTime(2026, 11, 21, 10);
    final g = groupByDay([
      sale('a', '2026-11-21', 100),
      sale('b', '2026-11-21T09:00:00', 50),
      sale('c', '2026-11-20', 200),
      sale('d', '2026-11-20', 999, sync: 'refused'),
      sale('e', '2026-11-05', 10),
    ], now);
    expect(g.map((e) => e.label), ['Today', 'Yesterday', '5 Nov']);
    expect(g.map((e) => e.total), [150, 200, 10]);
    expect(g[1].sales.length, 2);
  });

  test('period ranges', () {
    final now = DateTime(2026, 11, 21); // Saturday
    expect(periodRange(SalesPeriod.today, now), (from: DateTime(2026, 11, 21), to: DateTime(2026, 11, 21)));
    expect(periodRange(SalesPeriod.yesterday, now).from, DateTime(2026, 11, 20));
    expect(periodRange(SalesPeriod.week, now).from, DateTime(2026, 11, 16));
    expect(periodRange(SalesPeriod.month, now).from, DateTime(2026, 11, 1));
    expect(periodRange(SalesPeriod.all, now), (from: null, to: null));
    // month boundary: yesterday of the 1st
    expect(periodRange(SalesPeriod.yesterday, DateTime(2026, 12, 1)).from, DateTime(2026, 11, 30));
    expect(ymd(DateTime(2026, 1, 5)), '2026-01-05');
  });

  test('Indian number format', () {
    expect(Money.inr(1760), '₹1,760');
    expect(Money.inr(647218), '₹6,47,218');
    expect(Money.inr(12345678), '₹1,23,45,678');
  });

  test('time and method labels', () {
    expect(timeLabel(DateTime(2026, 1, 1, 16, 5)), '4:05 pm');
    expect(timeLabel(DateTime(2026, 1, 1, 0, 30)), '12:30 am');
    expect(methodLabel('CASH'), 'Cash');
    expect(methodLabel('upi'), 'UPI');
  });

  test('inventory margin colour and level bar', () {
    expect(marginColor(3), AppColors.danger);
    expect(marginColor(10), AppColors.warning);
    expect(marginColor(30), AppColors.onSurfaceVariant);
    expect(stockLevelFraction(5), 0.25);
    expect(stockLevelFraction(50), 1.0);
  });
}
