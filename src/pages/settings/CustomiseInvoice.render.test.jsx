import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

/** Smoke test for Customise invoice (approved invoices-22): it renders the
 *  options, the locked GST fields and a live preview for a registered shop. */
vi.mock('../../lib/supabase', () => ({ supabase: {}, uploadProductImage: async () => ({}) }));
vi.mock('../../context/TenantContext', () => ({
  useTenant: () => ({
    currentTenantId: 'T1',
    businessProfile: { name: 'Test Shop', gst_no: '29AAAAA0000A1Z5', state: 'Karnataka', tax_mode: 'EXCLUSIVE' },
    updateBusinessProfile: async () => ({ success: true }),
  }),
}));

globalThis.React = React;
const { default: CustomiseInvoice } = await import('./CustomiseInvoice.jsx');
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('Customise invoice renders', () => {
  it('a shop with no saved design: its Classic shown as chosen, Modern recommended', () => {
    const t = text(renderToStaticMarkup(<MemoryRouter><CustomiseInvoice /></MemoryRouter>));
    for (const s of ['Customise invoice', 'Tax invoice', 'Bill of supply', 'Classic GST', 'Modern minimal', 'Bold header', 'Compact',
      'Your current design', 'Classic (older)', 'Recommended', 'Accent colour', 'Show on the invoice', 'Discount column', 'Tax summary table', 'Required by GST',
      'Place of supply', 'HSN/SAC column', 'Live preview', 'Reset to default', 'Print a test page', 'Save', 'Test Shop']) {
      expect(t).toContain(s);
    }
  });
});
