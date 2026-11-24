/// One line of a client's ledger, oldest first: a bill (debit) or money
/// received (credit).
typedef LedgerEntry = ({String date, double debit, double credit});

/// What a statement shows for one date range.
class StatementWindow {
  final double opening;
  final double billed;
  final double received;
  final int bills;
  final int payments;
  const StatementWindow({
    this.opening = 0,
    this.billed = 0,
    this.received = 0,
    this.bills = 0,
    this.payments = 0,
  });

  double get closing => opening + billed - received;
}

String _day(String d) => d.length >= 10 ? d.substring(0, 10) : d;

/// True when [date] falls inside [fromIso]..[toIso], both included.
bool inStatementRange(String date, String fromIso, String toIso) {
  final d = _day(date);
  return d.compareTo(fromIso) >= 0 && d.compareTo(toIso) <= 0;
}

/// What the client owed before the first entry in [asc].
///
/// The phone holds only recent sales, so the entries rarely add up to what the
/// client owes today. Whatever is missing is carried here, so the last balance
/// on the statement is always [owedNow], the same figure every other screen
/// shows.
double carriedBalance(List<LedgerEntry> asc, double owedNow) =>
    owedNow - asc.fold<double>(0, (t, e) => t + e.debit - e.credit);

/// The balance after each entry of [asc].
List<double> runningBalances(List<LedgerEntry> asc, double owedNow) {
  var run = carriedBalance(asc, owedNow);
  return [
    for (final e in asc) run += e.debit - e.credit,
  ];
}

/// Opening balance, totals and counts for one date range.
StatementWindow statementWindow(
  List<LedgerEntry> asc,
  double owedNow,
  String fromIso,
  String toIso,
) {
  var opening = carriedBalance(asc, owedNow);
  double billed = 0, received = 0;
  var bills = 0, payments = 0;
  for (final e in asc) {
    final d = _day(e.date);
    if (d.compareTo(fromIso) < 0) {
      opening += e.debit - e.credit;
    } else if (d.compareTo(toIso) <= 0) {
      if (e.debit > 0) {
        billed += e.debit;
        bills++;
      }
      if (e.credit > 0) {
        received += e.credit;
        payments++;
      }
    }
  }
  return StatementWindow(
    opening: opening,
    billed: billed,
    received: received,
    bills: bills,
    payments: payments,
  );
}
