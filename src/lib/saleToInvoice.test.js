import { describe, it, expect } from 'vitest';
import { saleToInvoice } from './saleToInvoice';

/**
 * The desktop prints through SalePrintDispatcher and the phone through
 * ReceiptEmbed. Both now call this, so these pin the three fields where the two
 * old copies had already drifted.
 */
const sale = (o = {}) => ({
  id: 'SAL-ABCD1234', date: '2026-08-10',
  created_at: '2026-08-10T09:27:03Z',
  totalAmount: 1185, paidAmount: 1185,
  paymentMethod: 'CASH', paymentStatus: 'PAID',
  items: [{ name: 'Frootty plate 12"', quantity: 3, price: 120, taxRate: 18 }],
  ...o,
});

describe('the fields the two copies had drifted on', () => {
  it('carries created_at, so both surfaces can print the time', () => {
    // The embed dropped this, so the phone's slip lacked the time the
    // desktop's showed — from the same component.
    expect(saleToInvoice(sale()).created_at).toBe('2026-08-10T09:27:03Z');
  });

  it('reads a COMPLETED sale as paid', () => {
    // The embed did not. Such a sale would print "PAYMENT DUE" and a
    // scan-to-pay QR on the phone and nothing of the sort on the desktop.
    const m = saleToInvoice(sale({ status: 'COMPLETED', paymentStatus: 'PENDING' }));
    expect(m.payment_status).toBe('PAID');
  });

  it('still surfaces a voided sale as voided', () => {
    // The reason payment_status is passed through rather than collapsed: a
    // cancelled sale must not print a QR asking for money.
    expect(saleToInvoice(sale({ paymentStatus: 'VOIDED' })).payment_status).toBe('VOIDED');
  });

  it('falls back to clientId when shopId is absent', () => {
    // The embed only read shopId.
    expect(saleToInvoice(sale({ shopId: null, clientId: 'CL-9' })).client_id).toBe('CL-9');
    expect(saleToInvoice(sale({ shopId: 'SH-1', clientId: 'CL-9' })).client_id).toBe('SH-1');
  });
});

describe('the money it hands the receipt', () => {
  it('uses the sale total rather than recomputing it', () => {
    // POSReceipt does its own tax-mode arithmetic; the stored total is truth.
    expect(saleToInvoice(sale({ totalAmount: 1185 })).grand_total).toBeCloseTo(1185, 2);
  });

  it('falls back to the computed total only when there is none', () => {
    const m = saleToInvoice(sale({ totalAmount: null }));
    expect(m.grand_total).toBeCloseTo(360 + 64.8, 2);
  });

  it('keeps amount_received distinct from paid, and null when absent', () => {
    expect(saleToInvoice(sale({ amount_received: 1500 })).amount_received).toBe(1500);
    expect(saleToInvoice(sale()).amount_received).toBeNull();
  });

  it('reads a fractional quantity, since KG goods sell by weight', () => {
    const m = saleToInvoice(sale({
      items: [{ name: '16*20 White cover', quantity: 0.5, price: 125, taxRate: 18 }],
    }));
    expect(m.items[0].qty).toBeCloseTo(0.5, 3);
  });
});

describe('robustness', () => {
  it('returns null for no sale rather than a half-built invoice', () => {
    expect(saleToInvoice(null)).toBeNull();
  });

  it('survives a sale with no items', () => {
    const m = saleToInvoice(sale({ items: null, totalAmount: null }));
    expect(m.items).toEqual([]);
    expect(m.grand_total).toBe(0);
  });
});
