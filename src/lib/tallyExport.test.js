import { describe, it, expect } from 'vitest';
import {
  tallyDate, esc, debit, credit, voucherImbalance,
  buildSaleVoucher, buildPurchaseVoucher, buildTallyXml, ledgerXml, tallyFileName,
} from './tallyExport.js';

/**
 * The file the accountant imports.
 * ==========================================================================
 *
 * Two failures are worth more than all the formatting put together:
 *
 *   1. AN UNBALANCED VOUCHER. Tally rejects it at the END of a long import,
 *      after everything before it is already in, leaving a half-imported year
 *      somebody unpicks by hand.
 *   2. SIGNS THE WRONG WAY ROUND. That file imports perfectly and reverses the
 *      shop's profit, which is worse than one that fails.
 *
 * Most of what follows is about those two.
 */

const sale = (over = {}) => ({
  id: 'INV-1', date: '2026-10-12', partyName: 'Acme Traders',
  taxable: 1000, cgst: 90, sgst: 90, igst: 0, ...over,
});

describe('a voucher balances, or nothing is written', () => {
  it('balances an ordinary intra-state sale', () => {
    expect(voucherImbalance(buildSaleVoucher(sale()))).toBe(0);
  });

  it('balances an inter-state sale', () => {
    expect(voucherImbalance(buildSaleVoucher(sale({ cgst: 0, sgst: 0, igst: 180 })))).toBe(0);
  });

  it('balances a sale with no tax at all', () => {
    expect(voucherImbalance(buildSaleVoucher(sale({ cgst: 0, sgst: 0 })))).toBe(0);
  });

  it('balances with a round-off in either direction', () => {
    expect(voucherImbalance(buildSaleVoucher(sale({ roundOff: 0.4 })))).toBe(0);
    expect(voucherImbalance(buildSaleVoucher(sale({ roundOff: -0.35 })))).toBe(0);
  });

  it('balances a purchase', () => {
    expect(voucherImbalance(buildPurchaseVoucher({
      id: 'PUR-1', date: '2026-10-12', partyName: 'Hassan Traders',
      taxable: 500, cgst: 45, sgst: 45,
    }))).toBe(0);
  });

  it('refuses to write a file containing an unbalanced voucher', () => {
    // Rather than let Tally find it half way through the year.
    const bent = buildSaleVoucher(sale());
    bent.entries.push(credit('Mystery', 10));
    expect(() => buildTallyXml({ vouchers: [bent] })).toThrow(/does not balance \(off by 10\.00\)/);
  });

  it('names how many vouchers are affected, and writes none of them', () => {
    const good = buildSaleVoucher(sale());
    const bad = buildSaleVoucher(sale({ id: 'INV-2' }));
    bad.entries.push(debit('Oops', 5));
    expect(() => buildTallyXml({ vouchers: [good, bad] })).toThrow(/1 of 2 vouchers/);
  });
});

describe('which side of the book each entry lands on', () => {
  it('debits the customer and credits sales', () => {
    // Backwards here is a file that imports cleanly and reverses the profit.
    const v = buildSaleVoucher(sale());
    const party = v.entries.find((e) => e.ledger === 'Acme Traders');
    const sales = v.entries.find((e) => e.ledger === 'Sales');
    expect(party.amount).toBeLessThan(0);          // debit
    expect(party.deemedPositive).toBe(true);
    expect(sales.amount).toBeGreaterThan(0);       // credit
    expect(sales.deemedPositive).toBe(false);
    expect(party.amount).toBe(-1180);              // 1000 + 90 + 90
  });

  it('credits the supplier and debits purchases', () => {
    const v = buildPurchaseVoucher({ id: 'P1', date: '2026-10-12', partyName: 'Hassan', taxable: 500, cgst: 45, sgst: 45 });
    expect(v.entries.find((e) => e.ledger === 'Hassan').amount).toBeGreaterThan(0);
    expect(v.entries.find((e) => e.ledger === 'Purchase').amount).toBeLessThan(0);
  });

  it('keeps output and input tax in different ledgers', () => {
    // GST collected is a liability; GST paid is a claim. One ledger for both
    // would net them and understate the shop's liability.
    const s = buildSaleVoucher(sale());
    const p = buildPurchaseVoucher({ id: 'P1', date: '2026-10-12', partyName: 'H', taxable: 100, cgst: 9, sgst: 9 });
    expect(s.entries.map((e) => e.ledger)).toContain('CGST');
    expect(p.entries.map((e) => e.ledger)).toContain('Input CGST');
  });

  it('books a walk-in against Cash rather than inventing a debtor', () => {
    // A receivable nobody can collect would sit in the accountant's books
    // forever.
    const v = buildSaleVoucher(sale({ partyName: '' }));
    expect(v.party).toBe('Cash');
    expect(v.entries[0].ledger).toBe('Cash');
  });

  it('takes the tax split from the sale rather than recomputing it', () => {
    // The file must agree with the invoice the customer was given, even when
    // the sale was billed oddly.
    const v = buildSaleVoucher(sale({ cgst: 12.34, sgst: 12.34 }));
    expect(v.entries.find((e) => e.ledger === 'CGST').amount).toBe(12.34);
    expect(voucherImbalance(v)).toBe(0);
  });
});

describe('the XML itself', () => {
  it('escapes a party name with an ampersand', () => {
    // "Ram & Sons" is an ordinary shop name and an unescaped & makes the whole
    // file unparseable — Tally then reports a line number and the shopkeeper
    // is told their data is corrupt.
    const xml = buildTallyXml({ vouchers: [buildSaleVoucher(sale({ partyName: 'Ram & Sons <Retail>' }))] });
    expect(xml).toContain('Ram &amp; Sons &lt;Retail&gt;');
    expect(xml).not.toMatch(/Ram & Sons/);
  });

  it('writes dates the way Tally reads them', () => {
    expect(tallyDate('2026-10-12')).toBe('20261012');
    expect(tallyDate('2026-10-12T09:30:00Z')).toBe('20261012');
    expect(tallyDate('')).toBe('');
  });

  it('writes amounts to two places', () => {
    const xml = buildTallyXml({ vouchers: [buildSaleVoucher(sale({ taxable: 1000.5, cgst: 0, sgst: 0 }))] });
    expect(xml).toContain('<AMOUNT>1000.50</AMOUNT>');
    expect(xml).toContain('<AMOUNT>-1000.50</AMOUNT>');
  });

  it('wraps everything in the envelope Tally expects', () => {
    const xml = buildTallyXml({ vouchers: [buildSaleVoucher(sale())] });
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<TALLYREQUEST>Import Data</TALLYREQUEST>');
    expect(xml).toContain('<VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>');
    // Equal numbers of opening and closing tags for the repeated elements.
    const opens = (xml.match(/<ALLLEDGERENTRIES.LIST>/g) || []).length;
    const closes = (xml.match(/<\/ALLLEDGERENTRIES.LIST>/g) || []).length;
    expect(opens).toBe(closes);
  });

  it('carries a party GSTIN so Tally files the right return', () => {
    const xml = ledgerXml({ name: 'Acme', gst_no: '29ABCDE1234F1Z5', state: 'Karnataka' });
    expect(xml).toContain('<PARTYGSTIN>29ABCDE1234F1Z5</PARTYGSTIN>');
    expect(xml).toContain('<LEDSTATENAME>Karnataka</LEDSTATENAME>');
  });

  it('leaves the GST fields out for a party without one', () => {
    const xml = ledgerXml({ name: 'Walk-in' });
    expect(xml).not.toContain('PARTYGSTIN');
  });

  it('escapes names in masters too', () => {
    expect(ledgerXml({ name: 'A & B' })).toContain('A &amp; B');
  });
});

describe('the file name', () => {
  it('says which shop and which period', () => {
    expect(tallyFileName('Demo Kirana Store', '2026-04-01', '2027-03-31'))
      .toBe('tally-demo-kirana-store-2026-04-01-to-2027-03-31.xml');
  });
});
