import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { calculateGST } from '../../lib/gstEngine';
import { amt, rupees } from '../../lib/invoicePrintData';
import { INVOICE_MODEL_IDS } from '../../lib/printSettings';
import InvoiceModel, { modelData } from './invoiceModels';

/**
 * Every invoice model prints every field GST requires for the document type,
 * and its figures are the invoice's own: the figures calculateGST stored when
 * the invoice was made (no new arithmetic in a model).
 *
 * Sample names and figures below are made up.
 */
globalThis.React = React;

const SHOP = {
  name: 'Sample Traders', address: '1 Test Street, Testpur 560001', state: 'Karnataka',
  gst_no: '29AAAAA0000A1Z5', phone: '0000000000', tax_mode: 'EXCLUSIVE',
  upi_id: 'sample@upi', bank_name: 'Test Bank', account_no: 'XXXX0001', ifsc_code: 'TEST0000001',
};
const BUYER = { id: 'c1', name: 'Test Buyer Co', address: '9 Other Road, Testnagar 570001', state: 'Karnataka', gst_no: '29BBBBB0000B1Z5' };

const LINES = [
  { name: 'Item alpha', hsn_code: '1101', qty: 20, rate: 250, taxRate: 5, unit: 'BAG' },
  { name: 'Item beta', hsn_code: '1512', qty: 24, rate: 145, taxRate: 5, discountPercent: 2, unit: 'PCS' },
  { name: 'Item gamma', hsn_code: '3402', qty: 30, rate: 118.5, taxRate: 18, discountPercent: 5, unit: 'PCS' },
];

// An invoice as the app stores one made through calculateGST (the existing
// computation): line figures and totals saved on the row.
const storedInvoice = (gst, extra = {}) => ({
  id: 'inv-1', invoice_number: 'INV-T001', invoice_date: '2026-11-24', due_date: '2026-12-09',
  client_id: 'c1', items: gst.items,
  taxable_amount: gst.taxable, tax_total: gst.totalTax, cgst_amount: gst.cgst, sgst_amount: gst.sgst, igst_amount: gst.igst,
  round_off: gst.roundOff, grand_total: gst.grandTotal, paid_amount: 1000, payment_status: 'PARTIAL',
  is_interstate: gst.isInterstate, place_of_supply: BUYER.state,
  ...extra,
});

const text = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const render = (model, invoice, business = SHOP, client = BUYER) =>
  text(<InvoiceModel model={model} invoice={invoice} business={business} client={client} printPrefs={{}} />);

const near = (a, b) => Math.abs(a - b) < 0.011;

describe('tax invoice, registered shop: every model', () => {
  const gst = calculateGST(LINES, SHOP.state, BUYER.state, { taxMode: 'EXCLUSIVE' });
  const inv = storedInvoice(gst);

  for (const model of INVOICE_MODEL_IDS) {
    it(`${model} prints every rule 46 field`, () => {
      const t = render(model, inv);
      expect(t.toUpperCase()).toContain('TAX INVOICE');
      expect(t.toUpperCase()).toContain('ORIGINAL FOR RECIPIENT');
      // supplier
      expect(t).toContain(SHOP.name);
      expect(t).toContain('1 Test Street');
      expect(t).toContain(SHOP.gst_no);
      expect(t).toContain('Karnataka (29)');
      // number and date
      expect(t).toContain('INV-T001');
      expect(t).toContain('24 Nov 2026');
      // recipient
      expect(t).toContain(BUYER.name);
      expect(t).toContain('9 Other Road');
      expect(t).toContain(BUYER.gst_no);
      // place of supply with state code, reverse charge
      expect(t).toMatch(/Place of supply\s*:?\s*Karnataka \(29\)/i);
      expect(t).toMatch(/Reverse charge:?\s*No/i);
      // lines: description, HSN, qty, unit, rate, taxable value, rate of tax
      for (const l of gst.items) {
        expect(t).toContain(l.name);
        expect(t).toContain(l.hsn_code);
        expect(t).toContain(amt(l.rate));
        expect(t).toContain(amt(l.taxable));
      }
      expect(t).toContain('BAG');
      expect(t).toMatch(/HSN\/SAC/i);
      expect(t).toMatch(/Taxable value/i);
      expect(t).toContain('5%');
      expect(t).toContain('18%');
      // tax amounts and total: the stored figures
      expect(t).toContain('CGST');
      expect(t).toContain('SGST');
      expect(t).toContain(amt(gst.cgst));
      expect(t).toContain(amt(gst.sgst));
      expect(t).toContain(amt(gst.taxable));
      expect(t).toContain(rupees(gst.grandTotal));
      // signature
      expect(t).toMatch(/Authorised signatory/i);
    });
  }

  it('the tax summary adds up to the stored totals', () => {
    const d = modelData({ invoice: inv, business: SHOP, client: BUYER, printPrefs: {} });
    const sum = (k) => d.rateSummary.reduce((s, r) => s + r[k], 0);
    expect(near(sum('taxable'), gst.taxable)).toBe(true);
    expect(near(sum('cgst'), gst.cgst)).toBe(true);
    expect(near(sum('sgst'), gst.sgst)).toBe(true);
    expect(d.rateSummary.map((r) => r.rate)).toEqual([5, 18]);
    // totals are the stored ones, untouched
    expect(d.totals).toMatchObject({ taxable: gst.taxable, cgst: gst.cgst, sgst: gst.sgst, payable: gst.grandTotal, roundOff: gst.roundOff });
    expect(d.totals.balance).toBe(gst.grandTotal - 1000);
    // per line, what calculateGST stored
    d.lines.forEach((l, i) => {
      expect(l.taxable).toBe(gst.items[i].taxable);
      expect(l.cgst).toBe(gst.items[i].cgst);
      expect(l.total).toBe(gst.items[i].total);
    });
  });

  it('a regular shop cannot switch off GSTIN, HSN or the buyer address', () => {
    const t = text(<InvoiceModel model="model-modern" invoice={inv} business={SHOP} client={BUYER}
      printPrefs={{ invOpts: { gstin: false, hsn: false, clientAddr: false } }} />);
    expect(t).toContain(SHOP.gst_no);
    expect(t).toContain('1101');
    expect(t).toContain('9 Other Road');
  });
});

describe('inter-state', () => {
  const gst = calculateGST(LINES, SHOP.state, 'Maharashtra', { taxMode: 'EXCLUSIVE' });
  const inv = storedInvoice(gst, { place_of_supply: 'Maharashtra' });
  for (const model of INVOICE_MODEL_IDS) {
    it(`${model} prints IGST, not CGST and SGST`, () => {
      const t = render(model, inv, SHOP, { ...BUYER, state: 'Maharashtra', gst_no: '27CCCCC0000C1Z5' });
      expect(t).toContain('IGST');
      expect(t).toContain(amt(gst.igst));
      expect(t).not.toContain('CGST');
      expect(t).toContain('Maharashtra (27)');
    });
  }
});

describe('an invoice saved by the counter (lines carry no stored tax split)', () => {
  // process_sale stores totals on the invoice row; its lines keep price and rate only.
  const inv = {
    id: 'inv-2', invoice_number: 'INV-T002', invoice_date: '2026-11-25', client_id: 'c1',
    items: [{ name: 'Item delta', hsn_code: '2201', quantity: 4, rate: 50, taxRate: 18 }],
    taxable_amount: 200, tax_total: 36, cgst_amount: 18, sgst_amount: 18, igst_amount: 0, round_off: 0, grand_total: 236, paid_amount: 0,
  };
  for (const model of INVOICE_MODEL_IDS) {
    it(`${model} prints the stored totals`, () => {
      const t = render(model, inv);
      expect(t).toContain('200.00');
      expect(t).toContain('18.00');
      expect(t).toContain(rupees(236));
    });
  }
});

describe('bill of supply, composition shop', () => {
  const comp = { ...SHOP, gst_registration_type: 'COMPOSITION' };
  const gst = calculateGST(LINES, SHOP.state, BUYER.state, { taxMode: 'NONE' });
  const inv = storedInvoice(gst);
  for (const model of INVOICE_MODEL_IDS) {
    it(`${model} reads Bill of Supply, with the declaration and no tax`, () => {
      const t = render(model, inv, comp);
      expect(t.toUpperCase()).toContain('BILL OF SUPPLY');
      expect(t).toContain('Composition taxable person, not eligible to collect tax on supplies');
      expect(t).toContain(SHOP.gst_no);
      expect(t).toContain('INV-T001');
      expect(t).toContain(BUYER.name);
      expect(t).not.toContain('CGST');
      expect(t).not.toContain('SGST');
      expect(t).not.toMatch(/Taxable value/i);
      expect(t).not.toMatch(/Reverse charge/i);
      expect(t).toContain(rupees(gst.grandTotal));
      expect(t).toMatch(/Authorised signatory/i);
    });
  }
});

describe('a shop with no GST registration', () => {
  const unreg = { ...SHOP, gst_no: '' };
  const gst = calculateGST(LINES, SHOP.state, BUYER.state, { taxMode: 'NONE' });
  const inv = storedInvoice(gst);
  for (const model of INVOICE_MODEL_IDS) {
    it(`${model} reads Invoice, with no shop GSTIN and no tax`, () => {
      const t = render(model, inv, unreg);
      expect(t.toUpperCase()).toContain('INVOICE');
      expect(t.toUpperCase()).not.toContain('TAX INVOICE');
      expect(t.toUpperCase()).not.toContain('BILL OF SUPPLY');
      expect(t).not.toContain('GSTIN 29AAAAA');
      expect(t).not.toContain('CGST');
      expect(t).toContain(rupees(gst.grandTotal));
    });
  }
});
