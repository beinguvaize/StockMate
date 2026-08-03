// What a bill is, pinned.
//
// Every defect that reached the screen today passed both `vite build` and
// eslint, because the logic sat inside a component where nothing could reach
// it. These cases are drawn from real FUTURE DISPO data, so a future edit that
// "simplifies" the grouping key breaks a test naming the supplier it would
// mis-bill rather than surfacing weeks later as a wrong payable.

import { describe, it, expect } from 'vitest';
import { groupPurchasesIntoBills, dueOf, paidOf, isCreditType } from './bills';

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
