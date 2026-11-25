import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/clients_suppliers/data/statement_window.dart';

void main() {
  const entries = <LedgerEntry>[
    (date: '2026-10-10', debit: 4200, credit: 0),
    (date: '2026-11-12', debit: 7745, credit: 0),
    (date: '2026-11-14T09:30:00', debit: 0, credit: 2000),
    (date: '2026-11-21', debit: 3750, credit: 0),
  ];

  test('older debt the phone does not hold is carried into the opening', () {
    // Entries add up to 13,695 but the client owes 15,695.
    expect(carriedBalance(entries, 15695), 2000);
    expect(runningBalances(entries, 15695), [6200, 13945, 11945, 15695]);
  });

  test('a range covering everything closes on what is owed today', () {
    final w = statementWindow(entries, 15695, '2026-10-01', '2026-11-22');
    expect(w.opening, 2000);
    expect(w.billed, 15695);
    expect(w.received, 2000);
    expect(w.bills, 3);
    expect(w.payments, 1);
    expect(w.closing, 15695);
  });

  test('entries before the range move into the opening balance', () {
    final w = statementWindow(entries, 15695, '2026-11-01', '2026-11-30');
    expect(w.opening, 6200);
    expect(w.billed, 11495);
    expect(w.received, 2000);
    expect(w.closing, 15695);
  });

  test('entries after the range are left out of the closing balance', () {
    final w = statementWindow(entries, 15695, '2026-10-01', '2026-10-31');
    expect(w.opening, 2000);
    expect(w.bills, 1);
    expect(w.closing, 6200);
  });

  test('no entries: the whole balance is the opening', () {
    final w = statementWindow(const [], 500, '2026-11-01', '2026-11-30');
    expect(w.opening, 500);
    expect(w.closing, 500);
    expect(runningBalances(const [], 500), isEmpty);
  });

  test('a timestamp on the last day still counts as inside the range', () {
    expect(inStatementRange('2026-11-14T23:10:00', '2026-11-01', '2026-11-14'),
        isTrue);
    expect(inStatementRange('2026-11-15', '2026-11-01', '2026-11-14'), isFalse);
  });
}
