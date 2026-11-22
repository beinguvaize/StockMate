import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/dashboard/presentation/dashboard_logic.dart';
import 'package:mobile_app/features/sales/data/models/sale.dart';

Sale _sale(String id,
        {String date = '2026-11-22',
        String? status,
        String? paymentStatus,
        String? syncState,
        List<dynamic>? items}) =>
    Sale(
        id: id,
        date: date,
        status: status,
        paymentStatus: paymentStatus,
        syncState: syncState,
        items: items);

Map<String, dynamic> _line(String id, String name, num q, num rate) =>
    {'id': id, 'name': name, 'quantity': q, 'rate': rate};

void main() {
  final today = DateTime(2026, 11, 22);

  group('isCountableSale', () {
    test('mirrors the server rule', () {
      expect(isCountableSale(), isTrue);
      expect(isCountableSale(status: 'completed', paymentStatus: 'PAID'), isTrue);
      expect(isCountableSale(voidedAt: '2026-11-22T10:00:00Z'), isFalse);
      expect(isCountableSale(status: 'void'), isFalse);
      expect(isCountableSale(status: 'CANCELLED'), isFalse);
      expect(isCountableSale(paymentStatus: 'VOIDED'), isFalse);
      expect(isCountableSale(paymentStatus: 'failed'), isFalse);
      expect(isCountableSale(voidedAt: ''), isTrue);
    });
  });

  group('splitRupees', () {
    test('whole and paise from integer paise', () {
      expect(splitRupees(48250), (whole: 48250, paise: 0));
      expect(splitRupees(1234.5), (whole: 1234, paise: 50));
      expect(splitRupees(99.996), (whole: 100, paise: 0));
      expect(splitRupees(0), (whole: 0, paise: 0));
    });
  });

  group('periodRange', () {
    final now = DateTime(2026, 3, 2, 15);
    test('today, rolling week, month to date', () {
      expect(periodRange(now, DashPeriod.today),
          (from: '2026-03-02', to: '2026-03-02'));
      expect(periodRange(now, DashPeriod.week),
          (from: '2026-02-24', to: '2026-03-02'));
      expect(periodRange(now, DashPeriod.month),
          (from: '2026-03-01', to: '2026-03-02'));
    });
  });

  group('cumulativePoints', () {
    List<double> hourly(Map<int, double> at) =>
        List.generate(12, (i) => at[i] ?? 0);

    test('empty when nothing sold', () {
      expect(cumulativePoints(List.filled(12, 0), DateTime(2026, 11, 22, 15)),
          isEmpty);
      expect(cumulativePoints(const [], DateTime(2026, 11, 22, 15)), isEmpty);
    });

    test('running total, only up to the current hour', () {
      // 100 at 9, 200 at 10, 50 at 11, and 999 at 14 which has not happened.
      final h = hourly({0: 100, 1: 200, 2: 50, 5: 999});
      final pts = cumulativePoints(h, DateTime(2026, 11, 22, 11, 30));
      expect(pts.map((p) => p.dy).toList(), [0, 100, 300, 350]);
      expect(pts.first.dx, 0);
      expect(pts.last.dx, closeTo((2 + 0.5) / 12, 1e-9));
      for (var i = 1; i < pts.length; i++) {
        expect(pts[i].dx, greaterThan(pts[i - 1].dx));
        expect(pts[i].dy, greaterThanOrEqualTo(pts[i - 1].dy));
      }
    });

    test('after closing the line ends at the right edge', () {
      final pts = cumulativePoints(hourly({0: 10, 11: 5}), DateTime(2026, 11, 22, 22));
      expect(pts.last.dx, 1);
      expect(pts.last.dy, 15);
    });

    test('before 9 am stays on the axis, no NaN', () {
      final pts = cumulativePoints(hourly({0: 40}), DateTime(2026, 11, 22, 7));
      expect(pts.length, 2);
      expect(pts.last.dx.isNaN, isFalse);
      expect(pts.last.dx, greaterThan(0));
    });
  });

  group('splitSegments', () {
    test('cash / upi / credit, bank only when above zero', () {
      final s = splitSegments(
          {'cash': 22190, 'upi': 18340, 'credit': 7720, 'bank': 0});
      expect(s.map((e) => e.key), ['cash', 'upi', 'credit']);
      final b = splitSegments(
          {'cash': 100, 'upi': 0, 'credit': 0, 'bank': 50.5});
      expect(b.map((e) => e.key), ['cash', 'upi', 'credit', 'bank']);
      expect(b.last.amount, 50.5);
    });

    test('nothing to show for null, old server or empty day', () {
      expect(splitSegments(null), isEmpty);
      expect(splitSegments({'total': 10, 'bills': 1}), isEmpty);
      expect(splitSegments({'cash': 0, 'upi': 0, 'credit': 0, 'bank': 0}),
          isEmpty);
    });

    test('numeric strings are read', () {
      final s = splitSegments({'cash': '12.5', 'upi': null, 'credit': 'x'});
      expect(s.first.amount, 12.5);
      expect(s[1].amount, 0);
      expect(s[2].amount, 0);
    });
  });

  group('week bars', () {
    test('tallestIndex', () {
      expect(tallestIndex([1, 5, 3]), 1);
      expect(tallestIndex([0, 0]), -1);
      expect(tallestIndex(const []), -1);
    });

    test('compactRupees', () {
      expect(compactRupees(480), '₹480');
      expect(compactRupees(62000), '₹62k');
      expect(compactRupees(125000), '₹1.3L');
      expect(compactRupees(100000), '₹1L');
      expect(compactRupees(24000000), '₹2.4Cr');
    });
  });

  group('topDebtors', () {
    test('biggest first, only balances above zero, count is all of them', () {
      final r = topDebtors([
        (id: 'a', name: 'Ravi Traders', owed: 8800),
        (id: 'b', name: 'Paid Up', owed: 0),
        (id: 'c', name: 'Meena S', owed: 6200),
        (id: 'd', name: 'Gupta Kirana', owed: 8400),
        (id: 'e', name: 'Credit Note', owed: -50),
        (id: 'f', name: 'Small', owed: 10),
      ]);
      expect(r.count, 4);
      expect(r.top.map((d) => d.name), ['Ravi Traders', 'Gupta Kirana', 'Meena S']);
    });

    test('none owing', () {
      final r = topDebtors([(id: 'a', name: 'A', owed: 0)]);
      expect(r.count, 0);
      expect(r.top, isEmpty);
    });
  });

  group('initials', () {
    test('two words, one word, blanks', () {
      expect(initials('Ravi Traders'), 'RT');
      expect(initials('  meena   s '), 'MS');
      expect(initials('Gupta'), 'GU');
      expect(initials('X'), 'X');
      expect(initials('   '), '?');
      expect(initials('Amul Fresh Butter'), 'AB');
    });
  });

  group('reorderSoon', () {
    test('out first, then lowest; counts cover everything', () {
      final r = reorderSoon([
        (id: '1', name: 'Parle-G', stock: 2),
        (id: '2', name: 'Atta', stock: 0),
        (id: '3', name: 'Rice', stock: 500),
        (id: '4', name: 'Butter', stock: 3),
        (id: '5', name: 'Oil', stock: -1),
        (id: '6', name: 'Salt', stock: 10),
        (id: '7', name: 'Tea', stock: 11),
      ]);
      expect(r.out, 2);
      expect(r.low, 3);
      expect(r.top.map((e) => e.name), ['Oil', 'Atta', 'Parle-G']);
      expect(r.top.first.isOut, isTrue);
    });

    test('healthy shop has nothing to reorder', () {
      final r = reorderSoon([(id: '1', name: 'Rice', stock: 500)]);
      expect(r.top, isEmpty);
      expect(r.out + r.low, 0);
    });

    test('stockLeft', () {
      expect(stockLeft(2), '2 left');
      expect(stockLeft(2.5), '2.5 left');
    });
  });

  group('bestSellersToday', () {
    test('ranks by revenue, groups by id, sums across bills', () {
      final sales = [
        _sale('1', items: [
          _line('oil', 'Fortune Oil 1L', 10, 165),
          _line('atta', 'Atta 5kg', 4, 286),
        ]),
        _sale('2', items: [
          _line('oil', 'Fortune Oil 1L', 20, 165),
          _line('milk', 'Amul Milk', 66, 32),
        ]),
      ];
      final r = bestSellersToday(sales, today);
      expect(r.map((e) => e.name), ['Fortune Oil 1L', 'Amul Milk', 'Atta 5kg']);
      expect(r.first.revenue, 4950);
      expect(r.first.qty, 30);
      expect(r[1].revenue, 66 * 32);
    });

    test('skips voided, cancelled, refused and other days', () {
      final line = [_line('p', 'P', 1, 100)];
      final sales = [
        _sale('a', status: 'VOIDED', items: line),
        _sale('b', status: 'cancelled', items: line),
        _sale('c', paymentStatus: 'VOIDED', items: line),
        _sale('d', syncState: 'refused', items: line),
        _sale('e', date: '2026-11-21', items: line),
        _sale('f', date: '2026-11-22', items: line),
      ];
      final r = bestSellersToday(sales, today);
      expect(r.length, 1);
      expect(r.first.revenue, 100);
    });

    test('limit of three; ties break by name; bad lines ignored', () {
      final sales = [
        _sale('1', items: [
          _line('a', 'Alpha', 1, 10),
          _line('b', 'Bravo', 1, 10),
          _line('c', 'Charlie', 1, 10),
          _line('d', 'Delta', 1, 10),
          'junk',
          {'name': ''},
          _line('z', 'Zero qty', 0, 999),
        ]),
      ];
      final r = bestSellersToday(sales, today);
      expect(r.map((e) => e.name), ['Alpha', 'Bravo', 'Charlie']);
    });

    test('lines without an id group by lower-cased name', () {
      final sales = [
        _sale('1', items: [
          {'name': 'Loose Sugar', 'quantity': 2, 'rate': 40},
          {'name': 'loose sugar', 'quantity': 3, 'rate': 40},
        ]),
      ];
      final r = bestSellersToday(sales, today);
      expect(r.length, 1);
      expect(r.first.qty, 5);
      expect(r.first.revenue, 200);
    });

    test('empty when nothing sold today', () {
      expect(bestSellersToday(const [], today), isEmpty);
      expect(bestSellersToday([_sale('x', items: null)], today), isEmpty);
    });

    test('timestamp dates with a zone are read on the device clock', () {
      final line = [_line('p', 'P', 1, 100)];
      final local = DateTime(2026, 11, 22, 12).toUtc().toIso8601String();
      expect(bestSellersToday([_sale('t', date: local, items: line)], today),
          hasLength(1));
    });
  });

  group('deltaPill', () {
    test('null hides the pill', () {
      expect(deltaPill(null), isNull);
      expect(deltaPill(double.nan), isNull);
      expect(deltaPill(double.infinity), isNull);
    });
    test('rounded percent and direction', () {
      expect(deltaPill(12.4), (pct: 12, dir: 1));
      expect(deltaPill(-7.6), (pct: 8, dir: -1));
      expect(deltaPill(0.3), (pct: 0, dir: 0));
    });
  });
}
