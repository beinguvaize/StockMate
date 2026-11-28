import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/**
 * Smoke test for the invoice detail page (approved invoices-17): it renders
 * from an invoice and its stored figures, with the strip, the actions, the
 * document preview and the side cards. Data hooks are stubbed.
 */
const INV = {
  id: 'INV-T9', invoice_number: 'INV-T9', client_id: 'C1', sale_id: null,
  invoice_date: '2026-11-24', due_date: '2026-12-09', created_at: '2026-11-24T04:42:00Z',
  grand_total: 1180, taxable_amount: 1000, tax_total: 180, cgst_amount: 90, sgst_amount: 90, igst_amount: 0,
  paid_amount: 500, payment_status: 'PARTIAL', items: [{ name: 'Test item', qty: 2, rate: 500, taxRate: 18 }],
};

vi.mock('../../lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }) }) }) } }));
vi.mock('../../context/TenantContext', () => ({ useTenant: () => ({ currentTenantId: 'T1', currentTenant: { plan: 'PRO' }, businessProfile: { name: 'Test Shop', gst_no: '29AAAAA0000A1Z5', state: 'Karnataka' } }) }));
vi.mock('../../context/NotificationContext', () => ({ useNotifications: () => ({ addNotification: () => {} }) }));
vi.mock('../../hooks/useSales', () => ({ useSales: () => ({ invoices: [INV], salesReturns: [], loading: false, markInvoicePaid: async () => ({}), enqueueIrn: async () => ({}), refetch: () => {} }) }));
vi.mock('../../hooks/usePeople', () => ({ usePeople: () => ({ clients: [{ id: 'C1', name: 'Test Client', state: 'Karnataka', outstanding_balance: 680 }], users: [] }) }));

globalThis.React = React;
const { default: InvoiceDetail } = await import('./InvoiceDetail.jsx');

const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const render = (id) => text(renderToStaticMarkup(
  <MemoryRouter initialEntries={[`/invoices/${id}`]}>
    <Routes><Route path="/invoices/:invoiceId" element={<InvoiceDetail />} /></Routes>
  </MemoryRouter>,
));

describe('invoice detail renders', () => {
  it('shows the number, the strip, the actions and the side cards', () => {
    const t = render('INV-T9');
    expect(t).toContain('INV-T9');
    expect(t).toContain('Part paid');
    expect(t).toContain('Invoice total');
    expect(t).toContain('Balance due');
    expect(t).toContain('Collected');
    expect(t).toContain('42%');
    expect(t).toContain('Record payment');
    expect(t).toContain('Payments');
    expect(t).toContain('More actions');
    expect(t).toContain('Issue credit note');
    expect(t).toContain('Activity');
    expect(t).toContain('Invoice created');
    expect(t).toContain('Credit terms');
    expect(t).toContain('E-invoice IRN');
    expect(t).toContain('Needs delivery');
    expect(t).toContain('Test item');
  });
  it('says so when the invoice is not there', () => {
    expect(render('NOPE')).toContain('This invoice is not here');
  });
});
