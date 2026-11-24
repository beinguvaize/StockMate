import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/utils/stock_levels.dart';

/// These pin the two bugs that made three screens disagree about how much
/// stock this shop has. Both were found on live data, not by reading code.
void main() {
  group('parse', () {
    test('a fractional quantity is not silently read as zero', () {
      // int.tryParse('42.5') is null. The dashboard fell back to 0 and so
      // reported a full shelf as low stock -- exactly one product on the live
      // tenant, which is why its badge read 11 where the rule computes 10.
      expect(StockLevels.parse('42.5'), 42.5);
      expect(StockLevels.parse(42.5), 42.5);
      expect(StockLevels.parse(42), 42);
    });

    test('missing or unparseable stock is zero, not a crash', () {
      expect(StockLevels.parse(null), 0);
      expect(StockLevels.parse(''), 0);
      expect(StockLevels.parse('not a number'), 0);
    });
  });

  group('one rule, not three', () {
    test('exactly at the threshold is low', () {
      // The dashboard used `< 10` and the inventory screen `<= 10`, so a
      // product sitting on exactly 10 was low on one screen and fine on the
      // other. It is low.
      expect(StockLevels.isLow(10), isTrue);
      expect(StockLevels.needsRestock(10), isTrue);
      expect(StockLevels.isHealthy(10), isFalse);
    });

    test('just over the threshold is healthy', () {
      expect(StockLevels.isLow(10.5), isFalse);
      expect(StockLevels.isHealthy(10.5), isTrue);
    });

    test('out of stock is its own state, not a low one', () {
      expect(StockLevels.isOutOfStock(0), isTrue);
      expect(StockLevels.isLow(0), isFalse);
      // But it still needs the shopkeeper, which is what the single badge means.
      expect(StockLevels.needsRestock(0), isTrue);
    });

    test('half a unit left is low, and NOT out', () {
      // stock.toInt() truncated 0.5 to 0, so the row said "Out of Stock"
      // while there was still half a kilo on the shelf.
      expect(StockLevels.isOutOfStock(0.5), isFalse);
      expect(StockLevels.isLow(0.5), isTrue);
    });

    test('negative stock counts as out, not as a low positive', () {
      expect(StockLevels.isOutOfStock(-3), isTrue);
      expect(StockLevels.isLow(-3), isFalse);
    });

    test("a product's own threshold wins over the default", () {
      expect(StockLevels.isLow(25, threshold: 50), isTrue);
      expect(StockLevels.isLow(25), isFalse);
    });

    test('the three states partition every quantity exactly once', () {
      for (final stock in [-1.0, 0.0, 0.5, 9.99, 10.0, 10.01, 1000.0]) {
        final states = [
          StockLevels.isOutOfStock(stock),
          StockLevels.isLow(stock),
          StockLevels.isHealthy(stock),
        ].where((b) => b).length;
        expect(states, 1, reason: 'stock $stock landed in $states states');
      }
    });
  });
}
