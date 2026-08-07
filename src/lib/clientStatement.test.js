import { describe, it, expect } from 'vitest';
import { buildClientStatement, closingBalance, parseItems } from './clientStatement';

/**
 * THOLIKUZHI VEG SHOP, exactly as production holds it on 7 Aug 2026.
 *
 * Chosen because it is the client whose stored outstanding (₹206) does NOT
 * equal its unpaid invoices (₹238): a ₹32 receipt sits unallocated against no
 * particular invoice. That gap was once "corrected" in production and had to be
 * reverted — it is a genuine advance. A statement that cannot reproduce ₹206
 * from these rows is wrong, so this is the case worth pinning.
 */
const CID = 'CLI-1782716633819-928';
const client = { id: CID, name: 'THOLIKUZHI VEG SHOP' };

const sale = (id, date, total, paid, method, status) => ({
  id, date, created_at: `${date}T10:00:00Z`,
  shopId: CID, clientId: CID,
  totalAmount: total, paidAmount: paid,
  paymentMethod: method, paymentStatus: status, items: [],
});

const sales = [
  sale('SAL-8BA640F7', '2026-06-29', 440, 440, 'CASH', 'PAID'),
  sale('SAL-479CA1A1', '2026-06-29', 320, 320, 'CREDIT', 'PAID'),
  sale('SAL-333E2671', '2026-07-06', 57.5, 57.5, 'CASH', 'PAID'),
  sale('SAL-0C748200', '2026-07-13', 374, 200, 'CASH', 'PARTIAL'),
  sale('SAL-0E4B139F', '2026-07-20', 168, 168, 'CASH', 'PAID'),
  sale('SAL-72E83CC3', '2026-07-27', 320, 320, 'CASH', 'PAID'),
  sale('SAL-52BF3D3C', '2026-08-03', 414, 350, 'CASH', 'PARTIAL'),
];

const invoices = [
  { id: 'INV-SAL-479CA1A1', client_id: CID, sale_id: 'SAL-479CA1A1', invoice_number: 'INV-0039',
    invoice_date: '2026-06-29', created_at: '2026-06-29T10:00:00Z',
    grand_total: 320, paid_amount: 320, payment_status: 'PAID', items: [] },
  { id: 'INV-SAL-0C748200', client_id: CID, sale_id: 'SAL-0C748200', invoice_number: 'INV-0052',
    invoice_date: '2026-07-13', created_at: '2026-07-13T10:00:00Z',
    grand_total: 374, paid_amount: 200, payment_status: 'PARTIAL', items: [] },
  { id: 'INV-SAL-52BF3D3C', client_id: CID, sale_id: 'SAL-52BF3D3C', invoice_number: 'INV-0095',
    invoice_date: '2026-08-03', created_at: '2026-08-03T10:00:00Z',
    grand_total: 414, paid_amount: 350, payment_status: 'PARTIAL', items: [] },
];

const paymentHistory = [
  { id: 'r1', date: '2026-06-30', amount: 200, payment_method: 'CASH' },
  { id: 'r2', date: '2026-07-06', amount: 120, payment_method: 'CASH' },
  { id: 'r3', date: '2026-07-20', amount: 32,  payment_method: 'CASH' },
];

const build = (over = {}) =>
  buildClientStatement({ client, sales, invoices, paymentHistory, ...over });

describe('buildClientStatement — THOLIKUZHI, real data', () => {
  it('closes at the outstanding balance production stores', () => {
    // 1,108 billed − 902 credited = 206, which is clients.outstanding_balance.
    expect(closingBalance(build())).toBeCloseTo(206, 2);
  });

  it('bills 1,108 and credits 902', () => {
    const rows = build();
    expect(rows.reduce((s, r) => s + r.debit, 0)).toBeCloseTo(1108, 2);
    expect(rows.reduce((s, r) => s + r.credit, 0)).toBeCloseTo(902, 2);
  });

  it('does NOT credit a credit sale twice', () => {
    // INV-0039 is a CREDIT sale carrying paid_amount 320, and its money also
    // arrives as receipts. Crediting the invoice as well would close at -114
    // instead of 206 -- the same double-credit that got through on the supplier
    // side and was only caught when a closing balance disagreed with the debt.
    const rows = build();
    expect(rows.filter(r => r.id === 'INV-SAL-479CA1A1-orphan')).toHaveLength(0);
    expect(rows.find(r => r.id === 'INV-SAL-479CA1A1').debit).toBeCloseTo(320, 2);
  });

  it('DOES credit money taken at the counter on a cash sale', () => {
    // A cash sale has no receipt row, so without this the statement would show
    // a debt that was already partly settled.
    const rows = build();
    const orphans = rows.filter(r => String(r.id).endsWith('-orphan'));
    expect(orphans.map(r => r.credit).sort((a, b) => a - b)).toEqual([200, 350]);
  });

  it('leaves fully paid cash sales off the statement entirely', () => {
    // They never entered the credit ledger. Four of the seven sales are these.
    const rows = build();
    for (const id of ['SAL-8BA640F7', 'SAL-333E2671', 'SAL-0E4B139F', 'SAL-72E83CC3']) {
      expect(rows.some(r => String(r.id).startsWith(id))).toBe(false);
    }
  });

  it('does not bill an invoiced sale twice', () => {
    // Each of the three invoiced sales appears once, as its invoice.
    const rows = build();
    expect(rows.filter(r => r.type === 'INVOICE')).toHaveLength(3);
    expect(rows.filter(r => r.type === 'SALE')).toHaveLength(0);
  });

  it('keeps the unallocated ₹32 receipt as a credit', () => {
    // This is the whole reason 206 and 238 differ. Dropping it would report
    // ₹32 more owed than the client actually owes.
    const rows = build();
    expect(rows.find(r => r.id === 'r3').credit).toBeCloseTo(32, 2);
  });

  it('runs oldest first with a balance that only moves by its own row', () => {
    const rows = build();
    let running = 0;
    for (const r of rows) {
      running += r.debit - r.credit;
      expect(r.balance).toBeCloseTo(running, 2);
    }
    const dates = rows.map(r => r.date);
    expect([...dates].sort()).toEqual(dates);
  });
});

describe('buildClientStatement — edges', () => {
  it('returns nothing without a client, rather than throwing', () => {
    expect(buildClientStatement({})).toEqual([]);
    expect(buildClientStatement()).toEqual([]);
    expect(closingBalance([])).toBe(0);
  });

  it('ignores another client\'s rows', () => {
    const rows = build({
      sales: [...sales, sale('SAL-OTHER', '2026-07-01', 999, 0, 'CREDIT', 'UNPAID')].map(
        s => (s.id === 'SAL-OTHER' ? { ...s, shopId: 'OTHER', clientId: 'OTHER' } : s)),
      invoices: [...invoices, { id: 'INV-OTHER', client_id: 'OTHER', grand_total: 999,
                                paid_amount: 0, payment_status: 'UNPAID', invoice_date: '2026-07-01' }],
    });
    expect(closingBalance(rows)).toBeCloseTo(206, 2);
  });

  it('drops a cash-at-POS invoice that was settled at checkout', () => {
    // PAID with paid_amount 0 never entered the credit ledger.
    const rows = build({
      invoices: [...invoices, { id: 'INV-CASH', client_id: CID, grand_total: 500,
                                paid_amount: 0, payment_status: 'PAID',
                                invoice_date: '2026-07-02' }],
    });
    expect(rows.some(r => r.id === 'INV-CASH')).toBe(false);
    expect(closingBalance(rows)).toBeCloseTo(206, 2);
  });

  it('shows a part-paid cash sale that has no invoice, both sides of it', () => {
    const rows = build({
      sales: [...sales, sale('SAL-NOINV', '2026-08-04', 500, 120, 'CASH', 'PARTIAL')],
    });
    expect(rows.find(r => r.id === 'SAL-NOINV-cash-debit').debit).toBeCloseTo(500, 2);
    expect(rows.find(r => r.id === 'SAL-NOINV-cash-credit').credit).toBeCloseTo(120, 2);
    expect(closingBalance(rows)).toBeCloseTo(206 + 380, 2);
  });

  it('parses items whether they arrive as an array or a string', () => {
    expect(parseItems([{ n: 1 }])).toEqual([{ n: 1 }]);
    expect(parseItems('[{"n":1}]')).toEqual([{ n: 1 }]);
    expect(parseItems('not json')).toEqual([]);
    expect(parseItems(null)).toEqual([]);
  });
});
