import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import fixtures from './__fixtures__/legacyPrint.json';
import InvoiceTemplate from './InvoiceTemplate';
import POSReceipt from './POSReceipt';
import { LEGACY_INVOICE, LEGACY_CLIENT, LEGACY_SHOPS, LEGACY_SALE } from './legacyPrint.cases';

/**
 * Owner's rule: nobody's printed invoice changes at release without them
 * choosing. A shop with no saved invoiceTemplate must print exactly what it
 * printed before the redesign branch.
 *
 * The fixture is the output of InvoiceTemplate.jsx and POSReceipt.jsx as they
 * were on main where this branch started (2bdc9ed5), rendered once with the
 * same props. The A4 comparison is the printable sheet (#invoice-print-area's
 * contents), which is what paper and the phone's /embed/invoice capture show;
 * the receipt comparison is the whole bare receipt, which is what
 * /embed/receipt renders. Shops cover a registered one, one with no GSTIN,
 * one with tax mode NONE, and one that saved other print settings but never a
 * design.
 */
globalThis.React = React;

const sheet = (html) => {
  const i = html.indexOf('id="invoice-print-area"');
  const start = html.indexOf('>', i) + 1;
  return html.slice(start);
};

describe('a shop with no saved design prints exactly as before', () => {
  for (const [k, biz] of Object.entries(LEGACY_SHOPS)) {
    it(`A4 invoice, ${k}`, () => {
      const now = renderToStaticMarkup(<InvoiceTemplate previewMode invoice={LEGACY_INVOICE} businessProfile={biz} client={LEGACY_CLIENT} onClose={() => {}} />);
      expect(now).not.toContain('data-model=');
      expect(sheet(now)).toBe(sheet(fixtures[`invoice:${k}`]));
    });
    it(`POS receipt, ${k}`, () => {
      const now = renderToStaticMarkup(<POSReceipt bare invoice={LEGACY_SALE} businessProfile={biz} client={LEGACY_CLIENT} tendered={600} onClose={() => {}} />);
      expect(now).toBe(fixtures[`receipt:${k}`]);
    });
  }
  it('the old title and tax lines stay, even with no GSTIN or tax mode NONE', () => {
    for (const k of ['noGstin', 'taxModeNone']) {
      const t = renderToStaticMarkup(<InvoiceTemplate previewMode invoice={LEGACY_INVOICE} businessProfile={LEGACY_SHOPS[k]} client={LEGACY_CLIENT} onClose={() => {}} />);
      expect(t).toContain('Tax Invoice');
      expect(t).not.toContain('Bill of Supply');
    }
  });
});
