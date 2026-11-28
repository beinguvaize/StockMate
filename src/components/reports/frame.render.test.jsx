import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Smoke test of the shared report frame (web redesign). Figures are the
 * reports' own; this checks the frame draws them, and that a failed load
 * shows the error state and never a figure.
 */
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => true }) }));
vi.mock('../../context/TenantContext', () => ({ useTenant: () => ({ businessProfile: { name: 'Sample Shop' }, currentTenant: {} }) }));

globalThis.React = React;
const { default: PremiumReportView } = await import('./PremiumReportView.jsx');
const { default: ReportHeader } = await import('./ReportHeader.jsx');
const { ExportMenu, ErrorBlock, FigureTile } = await import('./frame.jsx');

const tab = {
  id: 'T1', label: 'Journal Entries',
  data: [{ name: 'Tea 500 g', amount: 420 }, { name: 'Salt 1 kg', amount: 28 }],
  totals: { amount: 448 },
  columns: [
    { key: 'name', label: 'Item', sortable: true },
    { key: 'amount', label: 'Amount', type: 'currency', align: 'right' },
  ],
  kpis: [{ id: 'k', label: 'Total Revenue', value: 396860 }],
};
const html = (el) => renderToStaticMarkup(el);

describe('PremiumReportView', () => {
  it('draws the title, KPI card, table rows, totals and paging', () => {
    const out = html(<PremiumReportView title="General Ledger" tabs={[tab]} />);
    expect(out).toContain('General Ledger');
    expect(out).toContain('Journal Entries — Sample Shop');
    expect(out).toContain('₹3.97L');
    expect(out).toContain('Tea 500 g');
    expect(out).toContain('Total');
    expect(out).toContain('2 records');
    expect(out).toContain('Toggle columns');
    expect(out).toContain('Export');
  });

  it('shows view tabs only when a report has more than one', () => {
    expect(html(<PremiumReportView title="R" tabs={[tab]} />)).not.toContain('role="tablist"');
    const two = html(<PremiumReportView title="R" tabs={[tab, { ...tab, id: 'T2', label: 'Account Summary' }]} />);
    expect(two).toContain('role="tablist"');
    expect(two).toContain('Account Summary');
  });

  it('shows the error state instead of any figure when a load failed', () => {
    const out = html(<PremiumReportView title="Cash Flow" tabs={[tab]} error="request timed out" onRetry={() => {}} />);
    expect(out).toContain('role="alert"');
    expect(out).toContain('Cash Flow could not load');
    expect(out).toContain('request timed out');
    expect(out).toContain('Retry');
    expect(out).not.toContain('₹3.97L');
    expect(out).not.toContain('Tea 500 g');
    expect(out).not.toContain('Export');
  });

  it('says access denied when no tab is allowed', () => {
    expect(html(<PremiumReportView title="R" tabs={[]} />)).toContain('Access denied');
  });
});

describe('ReportHeader', () => {
  const base = { title: 'Daily Sales', subtitle: '2026-11-26', preset: 'TODAY', onPreset() {} };

  it('draws the presets with Custom, and the export button', () => {
    const out = html(<ReportHeader {...base} onExport={() => {}} exportLabel="Export CSV" />);
    ['Today', 'This Week', 'This Month', 'Quarter', 'This Year', 'Custom', 'Export CSV'].forEach((t) => expect(out).toContain(t));
    expect(out).toContain('aria-pressed="true"');
  });

  it('opens the from / to row with Apply on Custom', () => {
    expect(html(<ReportHeader {...base} showCustom />)).toContain('Apply');
  });

  it('on a failed load shows the error, drops export, and hides what follows', () => {
    const out = html(<ReportHeader {...base} onExport={() => {}} error="permission denied" />);
    expect(out).toContain('Daily Sales could not load');
    expect(out).toContain('permission denied');
    expect(out).not.toContain('>Export<');
    expect(out).toContain('data-report-failed="true"');
    expect(out).toContain('[&amp;~*]:!hidden');
  });
});

describe('frame parts', () => {
  it('ExportMenu renders one button for a lone CSV and a menu otherwise', () => {
    expect(html(<ExportMenu onCSV={() => {}} />)).not.toContain('aria-haspopup');
    expect(html(<ExportMenu onCSV={() => {}} onExcel={() => {}} />)).toContain('aria-haspopup="menu"');
    expect(html(<ExportMenu />)).toBe('');
  });

  it('ErrorBlock is an alert with the message', () => {
    const out = html(<ErrorBlock title="X could not load" message="boom" />);
    expect(out).toContain('role="alert"');
    expect(out).toContain('boom');
  });

  it('FigureTile shows a placeholder, not a figure, while loading', () => {
    expect(html(<FigureTile label="Revenue" value="₹0.00" loading />)).not.toContain('₹0.00');
    expect(html(<FigureTile label="Revenue" value="₹10.00" tone="pos" />)).toContain('₹10.00');
  });
});
