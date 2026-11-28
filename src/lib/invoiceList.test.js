import { describe, it, expect } from 'vitest';
import {
  resolveInvoiceStatus, invoiceOutstanding, inInvoiceDateRange, summarizeInvoices, filterInvoices,
  pageOf, invoiceCsvRows, paymentCheck, deliveryPill, daysUntil, dueWords, STATUS_LABEL,
} from './invoiceList';

const NOW = new Date(2026, 10, 27, 10, 0, 0); // 27 Nov 2026, 10:00 local (IST in tests)
const TODAY = '2026-11-27';

const inv = (o) => ({ id: o.id || o.invoice_number, grand_total: 1000, paid_amount: 0, payment_status: 'UNPAID', invoice_date: TODAY, ...o });

describe('status, as the page always decided it', () => {
  it('paid wins, then part paid, then a passed due date, else pending', () => {
    expect(resolveInvoiceStatus(inv({ payment_status: 'PAID', due_date: '2026-01-01' }), NOW)).toBe('PAID');
    expect(resolveInvoiceStatus(inv({ payment_status: 'PARTIAL', due_date: '2026-01-01' }), NOW)).toBe('PARTIAL');
    expect(resolveInvoiceStatus(inv({ due_date: '2026-11-20' }), NOW)).toBe('OVERDUE');
    expect(resolveInvoiceStatus(inv({ due_date: '2026-12-09' }), NOW)).toBe('UNPAID');
    expect(resolveInvoiceStatus(inv({}), NOW)).toBe('UNPAID');
  });
  it('labels part paid as the mockup does', () => {
    expect(STATUS_LABEL.PARTIAL).toBe('Part paid');
    expect(STATUS_LABEL.UNPAID).toBe('Pending');
  });
  it('outstanding never goes below zero', () => {
    expect(invoiceOutstanding(inv({ paid_amount: 1200 }))).toBe(0);
    expect(invoiceOutstanding(inv({ paid_amount: 250 }))).toBe(750);
  });
});

describe('date windows', () => {
  it('today, 7 and 30 days, custom', () => {
    const a = inv({ invoice_date: '2026-11-27' });
    const b = inv({ invoice_date: '2026-11-20' });
    const c = inv({ invoice_date: '2026-10-01' });
    expect(inInvoiceDateRange(a, 'TODAY', {}, TODAY)).toBe(true);
    expect(inInvoiceDateRange(b, 'TODAY', {}, TODAY)).toBe(false);
    expect(inInvoiceDateRange(b, '7D', {}, TODAY)).toBe(true);
    expect(inInvoiceDateRange(c, '30D', {}, TODAY)).toBe(false);
    expect(inInvoiceDateRange(c, 'CUSTOM', { from: '2026-10-01', to: '2026-10-31' }, TODAY)).toBe(true);
    expect(inInvoiceDateRange(a, 'CUSTOM', { from: '2026-10-01', to: '2026-10-31' }, TODAY)).toBe(false);
    expect(inInvoiceDateRange(inv({ invoice_date: null }), '7D', {}, TODAY)).toBe(false);
    expect(inInvoiceDateRange(inv({ invoice_date: null }), 'ALL', {}, TODAY)).toBe(true);
  });
});

describe('summary', () => {
  const rows = [
    inv({ invoice_number: 'A', payment_status: 'PAID', paid_amount: 1000 }),
    inv({ invoice_number: 'B', payment_status: 'PARTIAL', paid_amount: 400 }),
    inv({ invoice_number: 'C', due_date: '2026-11-01' }),
    inv({ invoice_number: 'D', due_date: '2026-12-30', grand_total: 500 }),
  ];
  it('billed, collected, outstanding and overdue, with the overdue count', () => {
    const s = summarizeInvoices(rows, () => true, NOW);
    expect(s.revenue).toBe(3500);
    expect(s.paidAmt).toBe(1000);
    expect(s.paidCt).toBe(1);
    expect(s.unpaidCt).toBe(3);
    expect(s.unpaidAmt).toBe(600 + 1000 + 500);
    expect(s.overdue).toBe(1000);
    expect(s.overdueCt).toBe(1);
    expect(s.count).toBe(4);
  });
});

describe('filter, search and order', () => {
  const rows = [
    inv({ invoice_number: 'INV-0002', invoice_date: '2026-11-26', client_name: 'Client Two' }),
    inv({ invoice_number: 'INV-0003', invoice_date: '2026-11-26', client_name: 'Client Three', payment_status: 'PAID' }),
    inv({ invoice_number: 'INV-0001', invoice_date: '2026-11-25', client_name: 'Client One' }),
  ];
  it('newest date first, then number descending', () => {
    expect(filterInvoices(rows, { now: NOW }).map(r => r.invoice_number)).toEqual(['INV-0003', 'INV-0002', 'INV-0001']);
  });
  it('matches the number or the client name', () => {
    expect(filterInvoices(rows, { query: 'one', now: NOW }).map(r => r.invoice_number)).toEqual(['INV-0001']);
    expect(filterInvoices(rows, { query: '0002', now: NOW }).map(r => r.invoice_number)).toEqual(['INV-0002']);
  });
  it('a status filter keeps only that status', () => {
    expect(filterInvoices(rows, { status: 'PAID', now: NOW }).map(r => r.invoice_number)).toEqual(['INV-0003']);
  });
  it('CSV keeps its old columns', () => {
    const [r] = invoiceCsvRows([rows[2]], (i) => i.client_name, NOW);
    expect(Object.keys(r)).toEqual(['date', 'invoice', 'client', 'taxable', 'grand_total', 'paid_amount', 'outstanding', 'status']);
    expect(r.outstanding).toBe(1000);
  });
});

describe('paging', () => {
  const rows = Array.from({ length: 120 }, (_, i) => ({ id: i }));
  it('pages of fifty with the words under the table', () => {
    const p = pageOf(rows, 1, 50);
    expect(p.from).toBe(51); expect(p.to).toBe(100); expect(p.total).toBe(120);
    expect(p.hasPrev).toBe(true); expect(p.hasNext).toBe(true);
    const last = pageOf(rows, 9, 50);
    expect(last.page).toBe(2); expect(last.rows.length).toBe(20); expect(last.hasNext).toBe(false);
    expect(pageOf([], 0).from).toBe(0);
  });
});

describe('record payment checks', () => {
  const i = inv({ grand_total: 17759, paid_amount: 8000, payment_status: 'PARTIAL' });
  it('refuses nothing, negatives and more than the balance', () => {
    expect(paymentCheck(i, '').ok).toBe(false);
    expect(paymentCheck(i, '-5').ok).toBe(false);
    expect(paymentCheck(i, '9759.01').ok).toBe(false);
  });
  it('part payment leaves the rest; the full balance settles', () => {
    const p = paymentCheck(i, '5000');
    expect(p).toMatchObject({ ok: true, full: false, left: 4759, statusAfter: 'PARTIAL' });
    expect(paymentCheck(i, '9759')).toMatchObject({ ok: true, full: true, left: 0, statusAfter: 'PAID' });
  });
});

describe('delivery pill and due words', () => {
  it('delivery shows only when required', () => {
    expect(deliveryPill(inv({}))).toBeNull();
    expect(deliveryPill(inv({ delivery_required: true })).label).toBe('Awaiting dispatch');
    expect(deliveryPill(inv({ delivery_required: true, delivery_status: 'IN_TRANSIT' })).label).toBe('In transit');
  });
  it('days to the due date in plain words', () => {
    expect(daysUntil('2026-12-09', TODAY)).toBe(12);
    expect(dueWords('2026-12-09', TODAY)).toBe('in 12 days');
    expect(dueWords(TODAY, TODAY)).toBe('today');
    expect(dueWords('2026-11-24', TODAY)).toBe('3 days ago');
  });
});
