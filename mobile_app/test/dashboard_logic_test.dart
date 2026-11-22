import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/utils/stock_levels.dart';
import 'package:mobile_app/features/dashboard/presentation/dashboard_logic.dart';

void main() {
  group('paymentBucket', () {
    test('maps every method the apps write', () {
      expect(paymentBucket('CASH'), PayBucket.cash);
      expect(paymentBucket('cash'), PayBucket.cash);
      expect(paymentBucket('UPI'), PayBucket.upi);
      for (final m in ['CREDIT', 'CREDIT_SALE', 'UDHAAR']) {
        expect(paymentBucket(m), PayBucket.credit);
      }
      for (final m in ['BANK', 'CARD', 'CHEQUE', 'ONLINE', 'WHATEVER', '', null]) {
        expect(paymentBucket(m), PayBucket.bank);
      }
    });
  });

  group('PaymentSplit', () {
    test('absent keys give null so the bar is hidden', () {
      expect(PaymentSplit.fromSummary(null), isNull);
      expect(PaymentSplit.fromSummary({'total': 10, 'bills': 1}), isNull);
    });

    test('reads the server keys and builds the legend', () {
      final s = PaymentSplit.fromSummary(
          {'cash': 1200, 'upi': 300.5, 'bank': 0, 'credit': 50})!;
      expect(s.total, 1550.5);
      expect(s.legend(), contains('cash'));
      expect(s.legend(), contains('UPI'));
      expect(s.legend(), contains('credit'));
      expect(s.legend(), isNot(contains('bank')));
    });

    test('plus adds a queued bill to its bucket', () {
      final s = const PaymentSplit(cash: 100).plus('UDHAAR', 40).plus('UPI', 10);
      expect(s.credit, 40);
      expect(s.upi, 10);
      expect(s.cash, 100);
    });
  });

  group('low / out unification', () {
    test('StockLevels.counts matches the per-item rules the inventory uses', () {
      final stocks = [0, -2, 3, 10, 11, 42.5].map((e) => e.toDouble()).toList();
      final c = StockLevels.counts(stocks);
      expect(c.low, stocks.where(StockLevels.isLow).length);
      expect(c.out, stocks.where(StockLevels.isOutOfStock).length);
      expect((c.low, c.out), (2, 2));
    });

    test('attention rows hide zeros and use the same low / out numbers', () {
      final c = StockLevels.counts([0, 0, 0, 0, 5, 6, 7, 8, 9, 10, 1, 2, 3, 50]);
      final rows = attentionItems(
          toCollect: 0, customers: 0, low: c.low, out: c.out, notSent: 0);
      expect(rows.length, 1);
      expect(rows.single.kind, AttentionKind.stock);
      expect(rows.single.text, '9 low · 4 out of stock');

      expect(
          attentionItems(toCollect: 0, customers: 0, low: 0, out: 0, notSent: 0),
          isEmpty);
      final all = attentionItems(
          toCollect: 1200, customers: 1, low: 0, out: 2, notSent: 3);
      expect(all.map((e) => e.kind),
          [AttentionKind.collect, AttentionKind.stock, AttentionKind.notSent]);
      expect(all[0].text, contains('1 customer'));
      expect(all[1].text, '2 out of stock');
      expect(all[2].text, '3 sales not sent');
    });
  });
}
