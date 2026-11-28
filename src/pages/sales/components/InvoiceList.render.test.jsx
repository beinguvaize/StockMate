import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

/**
 * Smoke test for the Sales history additions (sales-09): the Revenue
 * comparison line and the Best sellers card render from the list's own sales.
 */
vi.mock('../../../lib/supabase', () => ({ supabase: { rpc: () => Promise.resolve({ data: [], error: null }) } }));

globalThis.React = React;
const { default: InvoiceList } = await import('./InvoiceList.jsx');
const { todayISOInAppTZ } = await import('../../../lib/utils');
const { addDays } = await import('../../../lib/dashboardFigures');

const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const render = (sales) => text(renderToStaticMarkup(
  <MemoryRouter><InvoiceList sales={sales} clients={[]} /></MemoryRouter>,
));

describe('Sales history renders', () => {
  const today = todayISOInAppTZ();
  const lastWeek = addDays(today, -7);
  const line = (id, name, quantity, rate) => ({ id, name, quantity, rate });

  it('best sellers for today, ranked by value', () => {
    const t = render([
      { id: 'SAL-1', date: today, totalAmount: 300, paymentStatus: 'PAID', items: [line('a', 'Item A', 2, 100), line('b', 'Item B', 10, 10)] },
      { id: 'SAL-2', date: today, totalAmount: 50, paymentStatus: 'VOIDED', items: [line('b', 'Item B', 50, 10)] },
    ]);
    expect(t).toContain('Best sellers today');
    expect(t.indexOf('Item A')).toBeLessThan(t.indexOf('Item B'));
    expect(t).toContain('Top 2 made');
  });

  it('revenue compared with the same weekday last week, earlier in the day', () => {
    const t = render([
      { id: 'SAL-1', date: today, totalAmount: 1200, paymentStatus: 'PAID', items: [] },
      // Midnight-ish last week: always before "now" in the day.
      { id: 'SAL-0', date: lastWeek, created_at: `${lastWeek}T00:00:00+05:30`, totalAmount: 1000, paymentStatus: 'PAID', items: [] },
    ]);
    expect(t).toMatch(/▲ ₹200(\.00)? \(20%\) vs last \w+day/);
    expect(t).toContain('same time');
  });

  it('nothing to compare with keeps the plain caption', () => {
    const t = render([{ id: 'SAL-1', date: today, totalAmount: 1200, paymentStatus: 'PAID', items: [] }]);
    expect(t).toContain('failed bills left out');
    expect(t).not.toContain('vs last');
  });
});
