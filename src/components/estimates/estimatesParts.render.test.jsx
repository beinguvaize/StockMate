import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Smoke test: the Estimates and Orders panels and dialogs render. Portals
 * are drawn in place so the server renderer can see them.
 */
vi.mock('react-dom', async (orig) => ({ ...(await orig()), createPortal: (node) => node }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ is: () => Promise.resolve({ data: [] }) }) }) }) } }));

globalThis.React = React;
if (typeof globalThis.document === "undefined") globalThis.document = { body: {} };
const { default: EstimatePanel } = await import('./EstimatePanel.jsx');
const { ShareDialog, ConvertDialog, DeleteEstimateDialog } = await import('./EstimateDialogs.jsx');
const { default: QuotationSheet } = await import('./QuotationSheet.jsx');
const { default: EstimateEditor } = await import('./EstimateEditor.jsx');
const { default: OrderPanel } = await import('../orders/OrderPanel.jsx');
const { default: OrderForm } = await import('../orders/OrderForm.jsx');
const { ConvertOrderDialog, CancelOrderDialog, DeleteOrderDialog } = await import('../orders/OrderDialogs.jsx');

const noop = () => {};
const est = {
  id: 'a', estimate_number: 'EST-2026-0017', client_name: 'Client A', client_id: 'C1', client_phone: '9845012214', client_gstin: '29AAAAA0000A1Z5',
  status: 'SENT', doc_type: 'QUOTATION', estimate_date: '2026-11-25', valid_until: '2026-12-05', place_of_supply: 'Karnataka',
  items: [{ id: 'P1', name: 'Rice 25 kg', qty: 4, rate: 2150, taxRate: 5, hsn_code: '1006' }],
  taxable_amount: 8600, cgst_amount: 215, sgst_amount: 215, igst_amount: 0, tax_total: 430, round_off: 0, grand_total: 9030, notes: 'Two lots',
};
const order = {
  id: 'o1', order_number: 'SO-0024', client_name: 'Client A', client_id: 'C1', status: 'CONFIRMED', order_type: 'B2B', price_tier: 'WHOLESALE',
  grand_total: 8600, items: [{ productId: 'P1', productName: 'Rice', qty: 4, unitPrice: 2150, total: 8600 }], created_at: '2026-11-26T05:00:00Z', notes: 'Back gate',
};
const r = (el) => renderToStaticMarkup(el);

describe('estimate parts', () => {
  it('panel: dates, masked phone, items, tax split, actions', () => {
    const out = r(<EstimatePanel estimate={est} today="2026-11-26" onClose={noop} onSetStatus={noop} onShare={noop} onPrint={noop} onEdit={noop} onConvert={noop} />);
    expect(out).toContain('5 Dec 2026 · 9 days left');
    expect(out).toContain('98450 ••• 214');
    expect(out).toContain('HSN 1006 · GST 5%');
    expect(out).toContain('CGST');
    expect(out).toContain('₹9,030.00');
    expect(out).toContain('Convert to sale');
  });
  it('share, convert, delete dialogs', () => {
    expect(r(<ShareDialog estimate={est} shopName="Shop" onClose={noop} />)).toContain('Open WhatsApp');
    const share = r(<ShareDialog estimate={{ ...est, status: 'DRAFT' }} shopName="Shop" onClose={noop} />);
    expect(share).toContain('Mark as sent');
    const conv = r(<ConvertDialog estimate={est} onNewSale={noop} onClose={noop} />);
    expect(conv).toContain('marked <b>Billed</b> only once the sale is saved');
    expect(conv).toContain('stays <b>Sent</b>');
    expect(r(<DeleteEstimateDialog estimate={est} onDelete={noop} onClose={noop} />)).toContain('Keep it');
  });
  it('print sheet says it is not a tax invoice', () => {
    const out = r(<QuotationSheet estimate={est} businessProfile={{ name: 'Shop' }} onClose={noop} />);
    expect(out).toContain('This is a quotation, not a tax invoice.');
    expect(out).toContain('Quote to');
  });
  it('editor', () => {
    const out = r(<EstimateEditor estimate={est} tenantId="t1" clients={[]} products={[]} businessProfile={{ state: 'Karnataka' }} onSave={noop} onClose={noop} />);
    expect(out).toContain('Edit estimate');
    expect(out).toContain('Update estimate');
    expect(out).toContain('Rice 25 kg');
  });
});

describe('order parts', () => {
  it('panel: track, items, next stage', () => {
    const out = r(<OrderPanel order={order} onClose={noop} onAdvance={noop} onConvert={noop} onCancel={noop} onDelete={noop} onEdit={noop} onToggleDelivery={noop} onViewInvoice={noop} />);
    expect(out).toContain('Mark dispatched');
    expect(out).toContain('Cancel order');
    expect(out).toContain('GST is added when it is billed as a sale.');
    expect(out).toContain('26 Nov');
  });
  it('form, new and edit', () => {
    expect(r(<OrderForm clients={[]} products={[]} onSubmit={noop} onClose={noop} />)).toContain('No items yet. Use Add item.');
    const edit = r(<OrderForm order={{ ...order, status: 'DRAFT' }} clients={[]} products={[{ id: 'P1', name: 'Rice' }]} onSubmit={noop} onClose={noop} />);
    expect(edit).toContain('Edit order SO-0024');
    expect(edit).toContain('Grand total');
  });
  it('convert, cancel, delete', () => {
    const conv = r(<ConvertOrderDialog order={{ ...order, status: 'DELIVERED' }} onOpenSale={noop} onClose={noop} />);
    expect(conv).toContain('Open in New sale');
    expect(conv).toContain('stays <b>Delivered</b>');
    expect(r(<CancelOrderDialog order={order} onCancel={noop} onClose={noop} />)).toContain('Keep order');
    expect(r(<DeleteOrderDialog order={{ ...order, status: 'CANCELLED' }} onDelete={noop} onClose={noop} />)).toContain('a cancelled order already keeps the record');
  });
});
