import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DocItemGrid, PartyPicker, TotalsPanel, SaveToast } from './DocParts';
import { documentGst } from '../../lib/documentTotals';

/** Smoke test for the new-document redesign states (newdoc-02, 03, 08, 09). */
globalThis.React = React;
const text = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('document builder parts', () => {
  it('an empty item grid says so', () => {
    expect(text(<DocItemGrid lines={[]} products={[]} />)).toContain('No items yet. Add an item to start.');
    expect(text(<DocItemGrid lines={[]} products={[]} manual />)).toContain('No items yet. Add an item or pick a product.');
  });

  it('Add party is marked when Save was pressed without one', () => {
    const html = renderToStaticMarkup(<PartyPicker label="Returned by" party={null} onChange={() => {}} invalid />);
    expect(html).toContain('aria-invalid="true"');
    expect(renderToStaticMarkup(<PartyPicker label="Returned by" party={null} onChange={() => {}} />)).not.toContain('aria-invalid');
  });

  it('the totals panel shows the type note and the pinned total', () => {
    const gst = documentGst([{ qty: 3, rate: 145, disc: 0, taxRate: 5 }, { qty: 2, rate: 76, disc: 10, taxRate: 18 }], true, 'Karnataka', 'Kerala', 'EXCLUSIVE');
    const out = text(<TotalsPanel gst={gst} interstate charges="50" billDiscount="12.5" setCharges={() => {}} setBillDiscount={() => {}} note="Goes back into stock." />);
    expect(out).toContain('IGST');
    expect(out).toContain('₹655.50');
    expect(out).toContain('Goes back into stock.');
  });

  it('a save toast carries the title, reason and one action', () => {
    const out = text(<SaveToast title="Couldn't confirm this quotation" detail="It may have been saved." action={{ label: 'Open Estimates', onClick: () => {} }} onClose={() => {}} />);
    expect(out).toContain('confirm this quotation');
    expect(out).toContain('Open Estimates');
    expect(text(<SaveToast title="Not saved" detail="No open invoice for this party to settle." onClose={() => {}} />)).not.toContain('Open ');
  });
});
