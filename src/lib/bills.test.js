// What a bill is, pinned.
//
// Every defect that reached the screen today passed both `vite build` and
// eslint, because the logic sat inside a component where nothing could reach
// it. These cases are drawn from real FUTURE DISPO data, so a future edit that
// "simplifies" the grouping key breaks a test naming the supplier it would
// mis-bill rather than surfacing weeks later as a wrong payable.

import { describe, it, expect } from 'vitest';
import { groupPurchasesIntoBills, filterBills, buildSupplierLedger, dueOf, paidOf, isCreditType } from './bills';

const row = (o) => ({
  id: o.id,
  supplier_id: o.sup ?? 'SUP1',
  supplier_name: o.supName ?? 'Supplier One',
  date: o.date ?? '2026-07-17',
  payment_type: o.type ?? 'CASH',
  created_at: o.at,
  total_amount: o.total ?? 0,
  paid_amount: o.paid,
  linked_product_id: o.prod,
});

describe('grouping purchase rows into bills', () => {
  it('collapses one submission into a single bill', () => {
    // RENO JOHN, 17 Jul: two products written 1.7s apart by the multi form.
    const bills = groupPurchasesIntoBills([
      row({ id: 'PUR-RLQXIA', at: '2026-07-17T08:38:40.532Z', total: 35501.76 }),
      row({ id: 'PUR-RNAZT0', at: '2026-07-17T08:38:42.190Z', total: 720 }),
    ]);
    expect(bills).toHaveLength(1);
    expect(bills[0].lines).toHaveLength(2);
    expect(bills[0].total).toBeCloseTo(36221.76, 2);
    expect(bills[0].id).toBe('PUR-RLQXIA'); // earliest line carries the reference
  });

  it('keeps a cash and a credit bill on the same day apart', () => {
    // SAJJAD ALAMCODU, 24 Jul: 59 seconds apart, different terms. Merging these
    // re-blurs the pair behind the duplicate Rs 6,900 payment.
    const bills = groupPurchasesIntoBills([
      row({ id: 'PUR-JGBHRX', date: '2026-07-24', type: 'CREDIT', at: '2026-07-24T14:05:58Z', total: 6900 }),
      row({ id: 'PUR-KQMKHD', date: '2026-07-24', type: 'CASH',   at: '2026-07-24T14:06:57Z', total: 3360 }),
    ]);
    expect(bills).toHaveLength(2);
  });

  it('does not fuse separate trips on the same day', () => {
    // MADEENA AGENCY, 9 May: rows spanning hours are separate deliveries. A
    // supplier+date key alone would make this one bill.
    const bills = groupPurchasesIntoBills([
      row({ id: 'A', date: '2026-05-09', at: '2026-05-09T06:00:00Z', total: 100 }),
      row({ id: 'B', date: '2026-05-09', at: '2026-05-09T08:55:00Z', total: 200 }),
    ]);
    expect(bills).toHaveLength(2);
  });

  it('chains rows that stay inside the burst window', () => {
    // Nine minutes apart each: one long submission, still one bill.
    const bills = groupPurchasesIntoBills([
      row({ id: 'A', at: '2026-07-17T10:00:00Z', total: 10 }),
      row({ id: 'B', at: '2026-07-17T10:09:00Z', total: 20 }),
      row({ id: 'C', at: '2026-07-17T10:18:00Z', total: 30 }),
    ]);
    expect(bills).toHaveLength(1);
    expect(bills[0].total).toBe(60);
  });

  it('separates different suppliers billing on the same day', () => {
    const bills = groupPurchasesIntoBills([
      row({ id: 'A', sup: 'SUP1', at: '2026-07-17T10:00:00Z', total: 10 }),
      row({ id: 'B', sup: 'SUP2', at: '2026-07-17T10:00:01Z', total: 20 }),
    ]);
    expect(bills).toHaveLength(2);
  });

  it('is not confused by rows arriving out of order', () => {
    const bills = groupPurchasesIntoBills([
      row({ id: 'LATER',   at: '2026-07-17T10:00:05Z', total: 20 }),
      row({ id: 'EARLIER', at: '2026-07-17T10:00:00Z', total: 10 }),
    ]);
    expect(bills).toHaveLength(1);
    expect(bills[0].id).toBe('EARLIER');
  });

  it('handles an empty list', () => {
    expect(groupPurchasesIntoBills([])).toEqual([]);
    expect(groupPurchasesIntoBills()).toEqual([]);
  });
});

describe('what a bill has been paid', () => {
  it('sums paid across every line and reports the balance', () => {
    // SAJJAD, 1 Aug: three lines settled, one Rs 100 short, one untouched.
    const [bill] = groupPurchasesIntoBills([
      row({ id: 'L1', date: '2026-08-01', type: 'CREDIT', at: '2026-08-01T12:44:47Z', total: 6750, paid: 6750 }),
      row({ id: 'L2', date: '2026-08-01', type: 'CREDIT', at: '2026-08-01T12:44:48Z', total: 8400, paid: 8400 }),
      row({ id: 'L3', date: '2026-08-01', type: 'CREDIT', at: '2026-08-01T12:44:51Z', total: 3360, paid: 3360 }),
      row({ id: 'L4', date: '2026-08-01', type: 'CREDIT', at: '2026-08-01T12:44:53Z', total: 3360, paid: 3260 }),
      row({ id: 'L5', date: '2026-08-01', type: 'CREDIT', at: '2026-08-01T12:44:54Z', total: 6900, paid: 0 }),
    ]);
    expect(bill.lines).toHaveLength(5);
    expect(bill.total).toBe(28770);
    expect(bill.paid).toBe(21770);
    expect(bill.due).toBe(7000);
  });

  it('reports a cash bill with a balance rather than forcing it to zero', () => {
    // dueOf used to return 0 for anything non-credit, which would have hidden
    // exactly this. Cash bills carry paid_amount now.
    const p = row({ id: 'X', type: 'CASH', total: 1000, paid: 400 });
    expect(dueOf(p)).toBe(600);
    expect(paidOf(p)).toBe(400);
  });

  it('never reports a negative balance on an overpaid bill', () => {
    expect(dueOf(row({ id: 'X', total: 100, paid: 250 }))).toBe(0);
  });

  it('treats a missing paid_amount as nothing paid', () => {
    expect(paidOf(row({ id: 'X', total: 100 }))).toBe(0);
    expect(dueOf(row({ id: 'X', total: 100 }))).toBe(100);
  });
});

describe('filtering whole bills', () => {
  // SAJJAD, 1 Aug: three lines settled, one Rs 100 short, one untouched.
  const sajjad = () => groupPurchasesIntoBills([
    row({ id: 'L1', date: '2026-08-01', type: 'CREDIT', at: '2026-08-01T12:44:47Z', total: 6750, paid: 6750, prod: 'P1' }),
    row({ id: 'L2', date: '2026-08-01', type: 'CREDIT', at: '2026-08-01T12:44:48Z', total: 8400, paid: 8400, prod: 'P2' }),
    row({ id: 'L3', date: '2026-08-01', type: 'CREDIT', at: '2026-08-01T12:44:51Z', total: 3360, paid: 3360, prod: 'P3' }),
    row({ id: 'L4', date: '2026-08-01', type: 'CREDIT', at: '2026-08-01T12:44:53Z', total: 3360, paid: 3260, prod: 'P4' }),
    row({ id: 'L5', date: '2026-08-01', type: 'CREDIT', at: '2026-08-01T12:44:54Z', total: 6900, paid: 0,    prod: 'P5' }),
  ]);

  it('keeps every line of an unpaid bill, not just the unpaid ones', () => {
    // The bug this exists for: filtering the rows before grouping dropped the
    // three settled lines, so the bill read Rs 10,260 with Rs 3,260 paid.
    const [bill] = filterBills(sajjad(), { onlyUnpaid: true });
    expect(bill.lines).toHaveLength(5);
    expect(bill.total).toBe(28770);
    expect(bill.paid).toBe(21770);
    expect(bill.due).toBe(7000);
  });

  it('matches on one line but returns the whole bill', () => {
    const names = { P4: 'HM Cover 1"' };
    const [bill] = filterBills(sajjad(), { q: 'HM Cover', productNameOf: (id) => names[id] || '' });
    expect(bill.lines).toHaveLength(5);
    expect(bill.total).toBe(28770);
  });

  it('drops a settled bill under the unpaid filter', () => {
    const settled = groupPurchasesIntoBills([
      row({ id: 'S1', at: '2026-07-01T10:00:00Z', total: 500, paid: 500 }),
    ]);
    expect(filterBills(settled, { onlyUnpaid: true })).toHaveLength(0);
  });

  it('separates cash from credit', () => {
    const bills = groupPurchasesIntoBills([
      row({ id: 'C1', type: 'CREDIT', at: '2026-07-01T10:00:00Z', total: 100 }),
      row({ id: 'K1', type: 'CASH',   at: '2026-07-02T10:00:00Z', total: 200 }),
    ]);
    expect(filterBills(bills, { pay: 'CREDIT' })).toHaveLength(1);
    expect(filterBills(bills, { pay: 'CASH' })).toHaveLength(1);
    expect(filterBills(bills, { pay: 'ALL' })).toHaveLength(2);
  });

  it('returns everything when nothing is asked of it', () => {
    expect(filterBills(sajjad(), {})).toHaveLength(1);
    expect(filterBills(sajjad())).toHaveLength(1);
  });
});

describe('the supplier ledger', () => {
  // RENO JOHN, as the screen shows him: four bills, three paid at the counter,
  // one credit bill part-settled the next day.
  const reno = () => {
    const bills = groupPurchasesIntoBills([
      row({ id: 'PUR-66RDMX', date: '2026-06-02', at: '2026-06-02T12:28:50Z', total: 33120, paid: 33120 }),
      row({ id: 'PUR-RLQXIA', date: '2026-07-17', at: '2026-07-17T08:38:40Z', total: 35501.76, paid: 35501.76 }),
      row({ id: 'PUR-RNAZT0', date: '2026-07-17', at: '2026-07-17T08:38:42Z', total: 720, paid: 720 }),
      row({ id: 'PUR-W8VUB4', date: '2026-07-31', type: 'CREDIT', at: '2026-07-31T05:49:43Z', total: 29960, paid: 10000 }),
    ]);
    const payments = [{ id: 'SUPP-1', date: '2026-08-01', amount: 10000, purchase_id: 'PUR-W8VUB4' }];
    return buildSupplierLedger({ bills, payments });
  };

  it('closes on what is still owed', () => {
    const rows = reno();
    expect(rows[rows.length - 1].balance).toBeCloseTo(19960, 2);
  });

  it('credits money paid at the counter and money settled later, each once', () => {
    // The bill carries paid 10,000 AND a linked payment row of 10,000. Crediting
    // both would close at 9,960 instead of 19,960.
    //
    // Counter money now sits on the bill row rather than a row of its own, so
    // the guard counts credits across every row -- the double-credit risk is
    // unchanged, only where the credit is written.
    const credits = reno().reduce((s, r) => s + r.credit, 0);
    expect(credits).toBeCloseTo(33120 + 36221.76 + 10000, 2);
  });

  it('does not give money paid at the counter a row of its own', () => {
    // A cash bill was a debit and a credit that cancel: two lines for one
    // transaction, and a ledger twice as long as the trade it records.
    const rows = reno();
    const cash = rows.find(r => r.kind === 'BILL' && r.bill.id === 'PUR-66RDMX');
    expect(cash.debit).toBeCloseTo(33120, 2);
    expect(cash.credit).toBeCloseTo(33120, 2);   // settled on the same row
    expect(cash.atBill).toBeCloseTo(33120, 2);
    expect(cash.balance).toBeCloseTo(0, 2);      // and it nets to nothing
    expect(rows.filter(r => r.kind === 'PAY' && r.atBill)).toHaveLength(0);
  });

  it('puts a debit note in date order, not in a block at the end', () => {
    // The defect this pins: returns were rendered after every bill regardless
    // of when they happened, and a genuine one went missing from the ledger.
    const bills = groupPurchasesIntoBills([
      row({ id: 'B1', date: '2026-05-09', at: '2026-05-09T10:00:00Z', type: 'CREDIT', total: 10660 }),
      row({ id: 'B2', date: '2026-05-30', at: '2026-05-30T10:00:00Z', type: 'CREDIT', total: 9425 }),
    ]);
    const rows = buildSupplierLedger({
      bills,
      returns: [{ id: 'PRN-1', date: '2026-05-12', total_amount: 2100, product_name: 'Straw Small' }],
    });

    const kinds = rows.map(r => r.kind);
    expect(kinds).toEqual(['BILL', 'RETURN', 'BILL']);      // 9 May, 12 May, 30 May
    expect(rows[rows.length - 1].balance).toBeCloseTo(10660 - 2100 + 9425, 2);
  });

  it('names the line a payment hit when the bill has more than one', () => {
    // HASSAN, 5 Aug: one Rs 30,000 payment split FIFO across four bills. The
    // 3 Aug bill is two lines (U04UUB + U27SJH), so Rs 14,400 and Rs 9,790 both
    // rendered as #R-U04UUB — two same-day rows, one reference, different
    // amounts, which reads as a duplicate. Both were correct; the label was not.
    const bills = groupPurchasesIntoBills([
      row({ id: 'PUR-U04UUB', date: '2026-08-03', at: '2026-08-03T10:00:00Z', type: 'CREDIT', total: 14400, paid: 14400 }),
      row({ id: 'PUR-U27SJH', date: '2026-08-03', at: '2026-08-03T10:00:05Z', type: 'CREDIT', total: 13800, paid: 9790 }),
    ]);
    expect(bills).toHaveLength(1);          // one bill, two lines

    const rows = buildSupplierLedger({
      bills,
      payments: [
        { id: 'SUPP-A',   date: '2026-08-05', amount: 14400, purchase_id: 'PUR-U04UUB' },
        { id: 'SUPP-A-1', date: '2026-08-05', amount: 9790,  purchase_id: 'PUR-U27SJH' },
      ],
    });

    // One handover of Rs 24,190 across two lines of the same bill is ONE
    // payment. It used to render as two same-day rows carrying one reference
    // for different amounts, which reads as a duplicate -- the exact appearance
    // that set off the duplicate-payment hunt.
    const pays = rows.filter(r => r.kind === 'PAY');
    expect(pays).toHaveLength(1);
    expect(pays[0].credit).toBeCloseTo(24190, 2);
    expect(pays[0].allocations).toHaveLength(2);
    expect(pays[0].allocations.map(a => a.amount).sort((x, y) => x - y))
      .toEqual([9790, 14400]);
    expect(rows[rows.length - 1].balance).toBeCloseTo(4010, 2);
  });

  it('does not add a line reference on a single-line bill', () => {
    const bills = groupPurchasesIntoBills([
      row({ id: 'PUR-SOLO', date: '2026-08-03', at: '2026-08-03T10:00:00Z', type: 'CREDIT', total: 500, paid: 500 }),
    ]);
    const rows = buildSupplierLedger({
      bills,
      payments: [{ id: 'SUPP-B', date: '2026-08-04', amount: 500, purchase_id: 'PUR-SOLO' }],
    });
    expect(rows.find(r => r.kind === 'PAY').lineRef).toBeNull();
  });

  it('includes a return even when it is the only entry', () => {
    const rows = buildSupplierLedger({
      returns: [{ id: 'PRN-1', date: '2026-05-12', total_amount: 2100 }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('RETURN');
    expect(rows[0].balance).toBeCloseTo(-2100, 2);
  });

  it('credits an on-account advance', () => {
    const bills = groupPurchasesIntoBills([
      row({ id: 'B1', date: '2026-07-18', type: 'CREDIT', at: '2026-07-18T10:00:00Z', total: 8200 }),
    ]);
    const rows = buildSupplierLedger({
      bills,
      onAccountPayments: [{ id: 'ADV', date: '2026-06-29', amount: 2390 }],
    });
    expect(rows[0].kind).toBe('PAY');                        // 29 Jun precedes the bill
    expect(rows[rows.length - 1].balance).toBeCloseTo(5810, 2);
  });

  it('has nothing to show for a supplier with no activity', () => {
    expect(buildSupplierLedger({})).toEqual([]);
    expect(buildSupplierLedger()).toEqual([]);
  });
});

describe('credit terms', () => {
  it('recognises every spelling used in the data', () => {
    ['CREDIT', 'credit', 'UDHAAR', 'POST-CAPITAL'].forEach((t) =>
      expect(isCreditType(t)).toBe(true));
  });

  it('treats cash, bank and a missing type as not credit', () => {
    ['CASH', 'BANK', 'UPI', '', null, undefined].forEach((t) =>
      expect(isCreditType(t)).toBe(false));
  });
});

describe('groupPurchasesIntoBills — bill_id is the bill', () => {
  const row = (o) => ({
    id: 'P1', supplier_id: 'S1', date: '2026-08-01', payment_type: 'CASH',
    total_amount: 100, created_at: '2026-08-01T10:00:00Z', ...o,
  });

  it('groups by bill_id, not by the old key', () => {
    // Same bill, different dates — which is exactly what a bill-level date edit
    // produces mid-flight. The old key would have split these into two bills.
    const bills = groupPurchasesIntoBills([
      row({ id: 'A', bill_id: 'B1' }),
      row({ id: 'B', bill_id: 'B1', date: '2026-08-05' }),
    ]);
    expect(bills).toHaveLength(1);
    expect(bills[0].lines.map(l => l.id).sort()).toEqual(['A', 'B']);
    expect(bills[0].bill_id).toBe('B1');
  });

  it('keeps different bill_ids apart even when every other field matches', () => {
    // The SAJJAD / NISHAD case: same supplier and day, genuinely two bills.
    const bills = groupPurchasesIntoBills([
      row({ id: 'A', bill_id: 'B1' }),
      row({ id: 'B', bill_id: 'B2' }),
    ]);
    expect(bills).toHaveLength(2);
  });

  it('falls back to the old heuristic for rows with no bill_id', () => {
    // Written before the column existed, or queued offline by an older client.
    // They must still group, not scatter into one bill each.
    const bills = groupPurchasesIntoBills([
      row({ id: 'A', created_at: '2026-08-01T10:00:00Z' }),
      row({ id: 'B', created_at: '2026-08-01T10:00:30Z' }),
    ]);
    expect(bills).toHaveLength(1);
    expect(bills[0].bill_id).toBe('A');
  });

  it('still splits a legacy burst more than 10 minutes apart', () => {
    const bills = groupPurchasesIntoBills([
      row({ id: 'A', created_at: '2026-08-01T10:00:00Z' }),
      row({ id: 'B', created_at: '2026-08-01T12:00:00Z' }),
    ]);
    expect(bills).toHaveLength(2);
  });

  it('handles a mix of stamped and legacy rows without merging them', () => {
    const bills = groupPurchasesIntoBills([
      row({ id: 'A', bill_id: 'B1' }),
      row({ id: 'B', bill_id: 'B1' }),
      row({ id: 'C', created_at: '2026-08-01T18:00:00Z' }),
    ]);
    expect(bills).toHaveLength(2);
    expect(bills.find(b => b.bill_id === 'B1').lines).toHaveLength(2);
    expect(bills.find(b => b.bill_id === 'C').lines).toHaveLength(1);
  });

  it('totals the bill from its lines', () => {
    const bills = groupPurchasesIntoBills([
      row({ id: 'A', bill_id: 'B1', total_amount: 4876 }),
      row({ id: 'B', bill_id: 'B1', total_amount: 11684 }),
      row({ id: 'C', bill_id: 'B1', total_amount: 19125 }),
    ]);
    // The live HASSAN bill: 3 lines, Rs 35,685.
    expect(bills[0].total).toBeCloseTo(35685, 2);
  });
});
