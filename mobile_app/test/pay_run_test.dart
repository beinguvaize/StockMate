import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/hr/data/pay_run.dart';

PayLine line(Map<String, dynamic> m) => PayLine({'employeeId': 'x', 'employeeName': 'X', ...m});

void main() {
  group('payLineNote — the wording on the approved Run Payroll boards', () {
    test('monthly, whole month, leave used', () {
      final n = payLineNote(line({'payType': 'MONTHLY', 'periodDays': 30, 'cycleDays': 30, 'leaveUsed': 1, 'leaveAllowed': 2, 'lopDays': 0}));
      expect(n.text, 'Monthly salary · leave 1 of 2');
      expect(n.cut, isNull);
    });
    test('monthly with an absence shows the cut apart', () {
      final n = payLineNote(line({'payType': 'MONTHLY', 'periodDays': 30, 'cycleDays': 30, 'lopDays': 1, 'lopAmount': 300}));
      expect(n.text, 'Monthly salary');
      expect(n.cut, '1 absent −₹300');
    });
    test('part of a month', () {
      expect(payLineNote(line({'payType': 'MONTHLY', 'periodDays': 7, 'cycleDays': 30})).text, '7 of 30 days of salary');
    });
    test('weekly over a month, some already paid', () {
      expect(payLineNote(line({'payType': 'WEEKLY', 'periodDays': 30, 'cycleDays': 7, 'alreadyPaid': 8400})).text,
          'Weekly salary · ₹8,400 already paid');
    });
    test('weekly over two days', () {
      expect(payLineNote(line({'payType': 'WEEKLY', 'periodDays': 2, 'cycleDays': 7})).text, '2 of 7 days of salary');
    });
    test('day rate with half days and earlier pay', () {
      expect(payLineNote(line({'payType': 'DAILY', 'daysWorked': 20.5, 'dailyRate': 450, 'alreadyPaid': 8325})).text,
          '20½ days × ₹450 · ₹8,325 already paid');
      expect(payLineNote(line({'payType': 'DAILY', 'daysWorked': 1, 'dailyRate': 400})).text, '1 day × ₹400');
      expect(payLineNote(line({'payType': 'DAILY', 'daysWorked': 0.5, 'dailyRate': 400})).text, '½ days × ₹400');
    });
  });

  test('weeks run Monday to Sunday', () {
    expect(isoDay(weekStart(DateTime(2026, 11, 23))), '2026-11-23'); // a Monday
    expect(isoDay(weekStart(DateTime(2026, 11, 22))), '2026-11-16'); // a Sunday
    expect(isoDay(weekStart(DateTime(2026, 11, 18))), '2026-11-16');
  });

  test('a month of days has every date once, even across a clock change', () {
    // 1 Nov 2026 and 8 Mar 2026 are clock changes in the Americas, where these
    // tests run. Adding 24-hour blocks repeated the 1st and dropped the 30th.
    for (final start in [DateTime(2026, 11, 1), DateTime(2026, 3, 1), DateTime(2026, 10, 1)]) {
      final end = DateTime(start.year, start.month + 1, 0);
      final n = daysInclusive(start, end);
      expect(n, end.day);
      final days = [for (var i = 0; i < n; i++) addDays(start, i)];
      expect(days.map((d) => d.day).toList(), [for (var i = 1; i <= end.day; i++) i]);
      expect(days.every((d) => d.hour == 0), isTrue);
    }
    expect(isoDay(weekStart(DateTime(2026, 11, 4))), '2026-11-02');
    expect(isoDay(addDays(weekStart(DateTime(2026, 11, 1)), 6)), '2026-11-01');
    expect(daysInclusive(DateTime(2026, 11, 22), DateTime(2026, 11, 23)), 2);
  });

  test('range labels', () {
    expect(rangeLabel(DateTime(2026, 11, 16), DateTime(2026, 11, 22)), '16 – 22 Nov 2026');
    expect(rangeLabel(DateTime(2026, 11, 30), DateTime(2026, 12, 6)), '30 Nov – 6 Dec 2026');
    expect(rangeLabel(DateTime(2026, 11, 23), DateTime(2026, 11, 23), year: false), '23 Nov');
  });

  test('a run reads the server reply without changing a figure', () {
    final run = PayRun.fromJson({
      'period': '2026-11',
      'run': {
        'from': '2026-11-01', 'to': '2026-11-30', 'totalBase': 49725, 'totalNet': 25000,
        'items': [
          {'employeeId': 'ks', 'employeeName': 'Kiran', 'payType': 'DAILY', 'netPay': 800, 'alreadyPaid': 8000, 'basePay': 8800},
        ],
        'held': [{'employeeId': 'sp', 'employeeName': 'Suresh', 'payType': 'MONTHLY', 'netPay': 12000}],
      },
      'already_paid_runs': [{'id': 'r', 'period': '2026-11-16/2026-11-22', 'total_net': 8642}],
      'must_confirm_already_paid': true,
    });
    expect(run.totalNet, 25000);
    expect(run.alreadyPaid, 8000);
    expect(run.items.single.netPay, 800);
    expect(run.held.single.name, 'Suresh');
    expect(run.lineFor('sp')!.netPay, 12000);
    expect(run.earlierRuns.single.totalNet, 8642);
    expect(run.mustConfirm, isTrue);
    // The saved line is the server's own, key for key.
    expect(run.items.single.raw['basePay'], 8800);
  });
}
