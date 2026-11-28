import { describe, it, expect } from 'vitest';
import {
  stageOf, invoiceToStage, normalizeInvoice, mergePipeline, filterOrders, stageCounts, orderFigures,
  lineFigures, orderActions, trackSteps, orderHandoff, formTotal, formProblem,
} from './orderView';

const ord = (id, status, more = {}) => ({ id, order_number: `SO-${id}`, client_name: `Client ${id}`, status, grand_total: 100, created_at: '2026-11-20T06:00:00Z', ...more });

describe('stages', () => {
  it('next stage chain; unknown reads Draft; Cancelled has its own', () => {
    expect(stageOf('DRAFT').next).toBe('CONFIRMED');
    expect(stageOf('DELIVERED').next).toBe('INVOICED');
    expect(stageOf('INVOICED').next).toBeNull();
    expect(stageOf('CANCELLED').label).toBe('Cancelled');
    expect(stageOf('PICKING').id).toBe('DRAFT');
  });
  it('invoice stage from payment and delivery (unchanged)', () => {
    expect(invoiceToStage({ payment_status: 'PAID' })).toBe('INVOICED');
    expect(invoiceToStage({ delivery_status: 'delivered' })).toBe('DELIVERED');
    expect(invoiceToStage({ delivery_status: 'IN_TRANSIT' })).toBe('DISPATCHED');
    expect(invoiceToStage({})).toBe('CONFIRMED');
  });
});

describe('pipeline', () => {
  it('invoices join unless an order links them; newest first; # stripped', () => {
    const orders = [ord('1', 'DRAFT', { invoice_id: 'INV-A', created_at: '2026-11-21T00:00:00Z' })];
    const invoices = [
      { id: 'INV-A', invoice_number: 'INV-0001', created_at: '2026-11-25T00:00:00Z' },
      { id: 'INV-B', invoice_number: '#INV-0002', created_at: '2026-11-22T00:00:00Z', delivery_required: true, grand_total: 500 },
    ];
    const all = mergePipeline(orders, invoices);
    expect(all.map((o) => o.id)).toEqual(['INV-B', '1']);
    expect(all[0]).toMatchObject({ _source: 'invoice', order_number: 'INV-0002', _delivery_required: true, grand_total: 500, status: 'CONFIRMED' });
  });
  it('normalizeInvoice falls back to a short number', () => {
    expect(normalizeInvoice({ id: 'abcdef123456' }).order_number).toBe('INV-123456');
  });
  it('filters by stage and search', () => {
    const rows = [ord('1', 'DRAFT'), ord('2', 'CANCELLED'), ord('3', 'CONFIRMED', { client_name: 'Anand' })];
    expect(filterOrders(rows, { stage: 'ALL' }).length).toBe(3);
    expect(filterOrders(rows, { stage: 'CANCELLED' }).map((o) => o.id)).toEqual(['2']);
    expect(filterOrders(rows, { query: 'anand' }).map((o) => o.id)).toEqual(['3']);
    expect(filterOrders(rows, { query: 'so-1' }).map((o) => o.id)).toEqual(['1']);
  });
  it('counts: All leaves out cancelled', () => {
    const c = stageCounts([ord('1', 'DRAFT'), ord('2', 'CANCELLED'), ord('3', 'CONFIRMED'), ord('4', 'CONFIRMED')]);
    expect(c).toMatchObject({ ALL: 3, DRAFT: 1, CONFIRMED: 2, CANCELLED: 1, INVOICED: 0 });
  });
  it('figures: open value skips invoiced and cancelled; today in shop time', () => {
    const rows = [
      ord('1', 'CONFIRMED', { grand_total: 26800, created_at: '2026-11-25T19:30:00Z' }), // 1:00 am on the 26th in India
      ord('2', 'INVOICED', { grand_total: 3120 }),
      ord('3', 'CANCELLED', { grand_total: 1850 }),
      ord('4', 'DRAFT', { grand_total: 11472, created_at: '2026-11-26T08:00:00Z' }),
    ];
    expect(orderFigures(rows, '2026-11-26')).toEqual({ open: 38272, active: 3, today: 2, toDispatch: 1 });
  });
});

describe('lines', () => {
  it('reads every stored shape (unchanged)', () => {
    expect(lineFigures({ productName: 'Rice', qty: 4, unitPrice: 2150, total: 8600 })).toEqual({ name: 'Rice', qty: 4, rate: 2150, amount: 8600, has: true });
    expect(lineFigures({ name: 'Oil', quantity: 3, price: 50 })).toMatchObject({ qty: 3, rate: 50, amount: 150 });
    expect(lineFigures({ name: 'Tea', qty: 2, taxable: 100, totalTax: 5 })).toMatchObject({ amount: 105, rate: 52.5 });
    expect(lineFigures({})).toMatchObject({ name: 'Item', qty: 1, has: false });
  });
});

describe('actions', () => {
  it('draft: advance to Confirmed, edit, cancel, delete', () => {
    expect(orderActions(ord('1', 'DRAFT', { items: [{}] }))).toMatchObject({ advance: 'CONFIRMED', convert: false, edit: true, cancel: true, remove: true, expand: true });
  });
  it('delivered: the advance is Convert to sale', () => {
    expect(orderActions(ord('1', 'DELIVERED'))).toMatchObject({ advance: 'INVOICED', convert: true, edit: false, cancel: true, remove: false, expand: false });
  });
  it('invoiced: nothing but view; cancelled: delete only', () => {
    expect(orderActions(ord('1', 'INVOICED'))).toMatchObject({ advance: null, cancel: false, remove: false, edit: false });
    expect(orderActions(ord('1', 'CANCELLED'))).toMatchObject({ advance: null, cancel: false, remove: true });
  });
  it('an invoice row: delivery switch until dispatched, and a link', () => {
    expect(orderActions({ _source: 'invoice', status: 'CONFIRMED' })).toMatchObject({ isInvoice: true, delivery: true, viewInvoice: true, advance: null, cancel: false, remove: false });
    expect(orderActions({ _source: 'invoice', status: 'DISPATCHED' }).delivery).toBe(false);
  });
});

describe('track, handoff and form', () => {
  it('track: done up to the current stage; only the first has a day', () => {
    const t = trackSteps(ord('1', 'CONFIRMED', { created_at: '2026-11-25T20:00:00Z' }));
    expect(t.map((s) => s.done)).toEqual([true, true, false, false, false]);
    expect(t[1].current).toBe(true);
    expect(t[0].day).toBe('2026-11-26');
    expect(t[1].day).toBe('');
  });
  it('handoff maps lines for the till and carries the order id; never a status', () => {
    const h = orderHandoff(ord('1', 'DELIVERED', { client_id: 'C1', items: [{ productId: 'P1', productName: 'Rice', qty: 4, unitPrice: 2150 }] }));
    expect(h).toEqual({ orderId: '1', clientId: 'C1', items: [{ id: 'P1', name: 'Rice', qty: 4, rate: 2150, taxRate: 0 }] });
    expect(orderHandoff(ord('2', 'DELIVERED', { items: [] }))).toBeNull();
  });
  it('form total and problems', () => {
    expect(formTotal([{ total: 3360 }, { total: '3480' }])).toBe(6840);
    expect(formProblem([])).toBe('Add at least one item.');
    expect(formProblem([{ productId: '' }])).toBe('Choose a product on every line.');
    expect(formProblem([{ productId: 'P1' }])).toBe('');
  });
});
