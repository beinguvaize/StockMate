import React, { useMemo, useState } from 'react';
import { isCountableSale } from './reportUtils';
import { useTenant } from '../../context/TenantContext';
import useReportData from './useReportData';
import { loadError } from '../../lib/reportsView';
import PremiumReportView from './PremiumReportView';
import ReportPeriodBar, { useReportPeriod } from './ReportPeriodBar';
import { ReportButton } from './frame';
import {
  FileText, Users, Globe, ShoppingBag, Layers, BookOpen,
  Building2, Hash, Receipt, Calendar, Tag, Download, ChevronDown, FileSpreadsheet, Share2
} from 'lucide-react';
import { formatINR, round2 } from '../../utils/financialCalculations';
import { buildGSTR1, downloadGSTR1JSON, downloadGSTR1Excel, shareGSTWithCA } from '../../utils/gstReporting';

// ── Helper: derive filing period string "MMYYYY" from today or selected month ──
const currentFP = () => {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${mm}${yyyy}`;
};

// ── Export dropdown ──
const ExportMenu = ({ gstr1, gstin }) => {
  const [open, setOpen] = useState(false);

  const handlePortalJSON = () => {
    const fp = currentFP();
    downloadGSTR1JSON(gstr1, {
      gstin: gstin || 'GSTIN_NOT_SET',
      fp,
      filename: `GSTR1_${gstin || 'export'}_${fp}.json`,
    });
    setOpen(false);
  };

  const handleCSV = (section, label) => {
    const rows = gstr1[section] || [];
    if (!rows.length) { setOpen(false); return; }
    const headers = Object.keys(rows[0]);
    const csvLines = [
      headers.join(','),
      ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(',')),
    ];
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `GSTR1_${label}_${currentFP()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    setOpen(false);
  };

  const item = 'flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition-colors duration-(--dur-press) hover:bg-tile';
  const head = 'px-2.5 pt-2 pb-1 font-tight text-[10.5px] font-semibold uppercase tracking-[0.07em] text-mute';
  const ico = 'grid h-7 w-7 shrink-0 place-items-center rounded-[8px] bg-tile text-ink-2';
  return (
    <div className="relative no-print">
      <ReportButton tone="primary" icon={Download} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        Export <ChevronDown size={13} className={`chevron-turn ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </ReportButton>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div role="menu" className="menu-pop absolute right-0 top-10 z-20 w-64 rounded-[14px] bg-surface p-1.5 shadow-[0_0_0_1px_rgba(17,20,24,.06),0_18px_40px_-14px_rgba(17,20,24,.35)]">
            <div className={head}>Portal Upload</div>
            <button data-card role="menuitem" onClick={() => { downloadGSTR1Excel(gstr1, { gstin: gstin || 'export', fp: currentFP() }); setOpen(false); }} className={item}>
              <span className={ico}><FileSpreadsheet size={14} /></span>
              <div>
                <div className="font-tight text-[13px] font-semibold text-ink">Excel Workbook (Offline Tool)</div>
                <div className="text-[11.5px] text-mute">b2b · b2cl · b2cs · hsn · docs sheets</div>
              </div>
            </button>
            <button data-card role="menuitem" onClick={() => { shareGSTWithCA({ kind: 'GSTR-1', gstin, fp: currentFP(), totals: gstr1.totals || {} }); setOpen(false); }} className={item}>
              <span className={ico}><Share2 size={14} /></span>
              <div>
                <div className="font-tight text-[13px] font-semibold text-ink">Share with CA (WhatsApp)</div>
                <div className="text-[11.5px] text-mute">Summary message — attach files after</div>
              </div>
            </button>
            <button data-card role="menuitem" onClick={handlePortalJSON} className={item}>
              <span className={ico}><Download size={14} /></span>
              <div>
                <div className="font-tight text-[13px] font-semibold text-ink">Download Portal JSON</div>
                <div className="text-[11.5px] text-mute">Upload directly to GST Portal</div>
              </div>
            </button>
            <hr className="my-1 border-sep" />
            <div className={head}>CSV Downloads</div>
            {[
              { key: 'b2b',  label: 'B2B Invoices' },
              { key: 'b2cl', label: 'B2CL — Large B2C' },
              { key: 'b2cs', label: 'B2CS — Small B2C' },
              { key: 'hsn',  label: 'HSN Summary' },
            ].map(s => (
              <button data-card role="menuitem" key={s.key} onClick={() => handleCSV(s.key, s.key.toUpperCase())} className={item}>
                <span className={ico}><FileText size={13} /></span>
                <span className="font-tight text-[13px] font-semibold text-ink">{s.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

/**
 * GSTR-1 Report — Outward Supplies
 * --------------------------------
 * Monthly/Quarterly return of sales.
 * Sections: B2B · B2CL · B2CS · HSN Summary · Docs Issued
 *
 * Compatible with GST Portal JSON schema (can be exported and uploaded).
 */
const GSTR1Report = () => {
  const { businessProfile } = useTenant();
  const businessState = businessProfile?.state || businessProfile?.business_state || 'KERALA';
  const businessGSTIN  = businessProfile?.gstin || businessProfile?.gst_no || '';

  // Period scoping — GST returns are filed per period. Defaults to This Month.
  const period = useReportPeriod('THIS_MONTH');
  const dateRange = { start: period.range.from, end: period.range.to };

  const { data: salesRaw,    loading: l1, error: rdErr1, refetch: rdRe1 } = useReportData({ table: 'sales',    select: '*', dateColumn: 'date', filters: { dateRange } });
  // Voided and cancelled sales are not revenue and were being counted here.
  const sales = useMemo(() => (salesRaw || []).filter(isCountableSale), [salesRaw]);
  const { data: clients,  loading: l2, error: rdErr2, refetch: rdRe2 } = useReportData({ table: 'clients',  select: '*', nullFilters: { deleted_at: null } });
  // Invoices have pre-computed cgst_amount/sgst_amount/igst_amount — use as primary source
  const { data: invoices, loading: l3, error: rdErr3, refetch: rdRe3 } = useReportData({
    table: 'invoices',
    select: 'id, sale_id, client_id, client_name, invoice_number, invoice_date, date, taxable_amount, cgst_amount, sgst_amount, igst_amount, grand_total, is_interstate, items',
    dateColumn: 'date',
    filters: { dateRange },
  });

  const loading = l1 || l2 || l3;

  const gstr1 = useMemo(
    () => buildGSTR1(sales, { businessState, clients, invoices }),
    [sales, clients, invoices, businessState]
  );

  // Shared KPIs for all tabs
  const kpis = useMemo(() => {
    const taxTotal = gstr1.totals.cgst + gstr1.totals.sgst + gstr1.totals.igst;
    return [
      { id: 'turnover', label: 'Total Turnover (Taxable)', value: gstr1.totals.taxable, trend: 0, trendDir: 'up', color: 'indigo',
        chartData: gstr1.hsn.slice(0, 6).map((h) => ({ value: h.taxable })) },
      { id: 'tax', label: 'Total Tax Liability', value: taxTotal, trend: 0, trendDir: 'up', color: 'rose',
        chartData: [{ value: gstr1.totals.cgst }, { value: gstr1.totals.sgst }, { value: gstr1.totals.igst }] },
      { id: 'invoices', label: 'Invoices', value: gstr1.totals.invoiceCount, trend: 0, trendDir: 'none', color: 'emerald', chartData: [] },
      { id: 'b2b', label: 'B2B Count', value: gstr1.b2b.length, trend: 0, trendDir: 'up', color: 'amber', chartData: [] },
    ];
  }, [gstr1]);

  // --- B2B Tab (4A, 4B, 4C, 6B, 6C) ---
  const b2bTab = {
    id: 'GSTR1_B2B',
    label: '4A — B2B Invoices',
    icon: <Users size={18} />,
    data: gstr1.b2b,
    loading: loading,
    totals: {
      taxable: round2(gstr1.b2b.reduce((a, r) => a + r.taxable, 0)),
      cgst: round2(gstr1.b2b.reduce((a, r) => a + r.cgst, 0)),
      sgst: round2(gstr1.b2b.reduce((a, r) => a + r.sgst, 0)),
      igst: round2(gstr1.b2b.reduce((a, r) => a + r.igst, 0)),
      invoiceValue: round2(gstr1.b2b.reduce((a, r) => a + r.invoiceValue, 0)),
    },
    columns: [
      { key: 'gstin', label: 'Recipient GSTIN', sortable: true, width: 170,
        render: (val) => <span className="tabular-nums text-[11.5px] bg-tile px-2 py-0.5 rounded border border-border/60 font-semibold">{val || '—'}</span> },
      { key: 'invoiceNo', label: 'Invoice #', sortable: true, width: 130,
        render: (val) => <span className="tabular-nums text-[11.5px] font-semibold text-ink">{val}</span> },
      { key: 'date', label: 'Invoice Date', type: 'date', sortable: true, width: 130 },
      { key: 'invoiceValue', label: 'Invoice Value', type: 'currency', align: 'right', sortable: true, width: 150, render: (val) => formatINR(val) },
      { key: 'placeOfSupply', label: 'Place of Supply', width: 180,
        render: (val) => <span className="text-[11.5px] font-semibold text-body">{val || '—'}</span> },
      { key: 'reverseCharge', label: 'RCM', width: 80, render: (val) => <span className="tabular-nums text-[11.5px]">{val}</span> },
      { key: 'invoiceType', label: 'Type', width: 110, render: (val) => <span className="text-[11.5px] font-semibold text-body">{val}</span> },
      { key: 'taxRate', label: 'Rate %', align: 'right', width: 90, render: (val) => <span className="tabular-nums font-semibold">{val}%</span> },
      { key: 'taxable', label: 'Taxable', type: 'currency', align: 'right', sortable: true, width: 140, render: (val) => formatINR(val) },
      { key: 'cgst', label: 'CGST', type: 'currency', align: 'right', width: 120, render: (val) => val > 0 ? <span className="font-semibold text-amber-text">{formatINR(val)}</span> : '—' },
      { key: 'sgst', label: 'SGST', type: 'currency', align: 'right', width: 120, render: (val) => val > 0 ? <span className="font-semibold text-info-text">{formatINR(val)}</span> : '—' },
      { key: 'igst', label: 'IGST', type: 'currency', align: 'right', width: 120, render: (val) => val > 0 ? <span className="font-semibold text-bad-text">{formatINR(val)}</span> : '—' },
    ],
    kpis,
    detailFields: [
      { key: 'invoiceValue', label: 'Invoice Value', type: 'currency', isHero: true },
      { key: 'gstin', label: 'Recipient GSTIN', icon: <Hash size={12} /> },
      { key: 'invoiceNo', label: 'Invoice Number', icon: <Receipt size={12} /> },
      { key: 'date', label: 'Date', type: 'date', icon: <Calendar size={12} /> },
      { key: 'placeOfSupply', label: 'Place of Supply', icon: <Globe size={12} /> },
      { key: 'taxable', label: 'Taxable Value', type: 'currency' },
      { key: 'cgst', label: 'CGST', type: 'currency' },
      { key: 'sgst', label: 'SGST', type: 'currency' },
      { key: 'igst', label: 'IGST', type: 'currency' },
    ],
  };

  // --- B2CL Tab (5A) ---
  const b2clTab = {
    id: 'GSTR1_B2CL',
    label: '5A — B2C Large',
    icon: <Building2 size={18} />,
    data: gstr1.b2cl,
    loading: loading,
    totals: {
      taxable: round2(gstr1.b2cl.reduce((a, r) => a + r.taxable, 0)),
      igst: round2(gstr1.b2cl.reduce((a, r) => a + r.igst, 0)),
      invoiceValue: round2(gstr1.b2cl.reduce((a, r) => a + r.invoiceValue, 0)),
    },
    columns: [
      { key: 'invoiceNo', label: 'Invoice #', sortable: true, width: 130 },
      { key: 'date', label: 'Date', type: 'date', sortable: true, width: 130 },
      { key: 'invoiceValue', label: 'Invoice Value', type: 'currency', align: 'right', sortable: true, width: 150, render: (val) => formatINR(val) },
      { key: 'placeOfSupply', label: 'Place of Supply', width: 180 },
      { key: 'taxRate', label: 'Rate %', align: 'right', width: 90, render: (val) => `${val}%` },
      { key: 'taxable', label: 'Taxable', type: 'currency', align: 'right', width: 140, render: (val) => formatINR(val) },
      { key: 'igst', label: 'IGST', type: 'currency', align: 'right', width: 130, render: (val) => <span className="font-semibold text-bad-text">{formatINR(val)}</span> },
      { key: 'cess', label: 'Cess', type: 'currency', align: 'right', width: 100 },
    ],
    kpis,
    detailFields: [
      { key: 'invoiceValue', label: 'Invoice Value', type: 'currency', isHero: true },
      { key: 'invoiceNo', label: 'Invoice Number', icon: <Receipt size={12} /> },
      { key: 'date', label: 'Date', type: 'date', icon: <Calendar size={12} /> },
      { key: 'placeOfSupply', label: 'Place of Supply', icon: <Globe size={12} /> },
      { key: 'taxable', label: 'Taxable Value', type: 'currency' },
      { key: 'igst', label: 'IGST', type: 'currency' },
    ],
  };

  // --- B2CS Tab (7) ---
  const b2csTab = {
    id: 'GSTR1_B2CS',
    label: '7 — B2C Small (Consolidated)',
    icon: <ShoppingBag size={18} />,
    data: gstr1.b2cs,
    loading: loading,
    totals: {
      taxable: round2(gstr1.b2cs.reduce((a, r) => a + r.taxable, 0)),
      cgst: round2(gstr1.b2cs.reduce((a, r) => a + r.cgst, 0)),
      sgst: round2(gstr1.b2cs.reduce((a, r) => a + r.sgst, 0)),
      igst: round2(gstr1.b2cs.reduce((a, r) => a + r.igst, 0)),
    },
    columns: [
      { key: 'type', label: 'Type', sortable: true, width: 140,
        render: (val) => (
          <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[12px] font-semibold uppercase ${
            val === 'Inter-State' ? 'bg-bad-soft text-bad-text' : 'bg-good-soft text-good-text'
          }`}>{val}</span>
        ) },
      { key: 'state', label: 'State', sortable: true, width: 180,
        render: (val, row) => <span className="font-semibold text-ink">{row.stateCode ? `${row.stateCode} - ` : ''}{val}</span> },
      { key: 'taxRate', label: 'Rate %', align: 'right', sortable: true, width: 100, render: (val) => <span className="tabular-nums font-semibold">{val}%</span> },
      { key: 'invoices', label: 'Invoices', align: 'right', sortable: true, width: 110 },
      { key: 'taxable', label: 'Taxable', type: 'currency', align: 'right', sortable: true, width: 140, render: (val) => formatINR(val) },
      { key: 'cgst', label: 'CGST', type: 'currency', align: 'right', width: 120, render: (val) => val > 0 ? <span className="font-semibold text-amber-text">{formatINR(val)}</span> : '—' },
      { key: 'sgst', label: 'SGST', type: 'currency', align: 'right', width: 120, render: (val) => val > 0 ? <span className="font-semibold text-info-text">{formatINR(val)}</span> : '—' },
      { key: 'igst', label: 'IGST', type: 'currency', align: 'right', width: 120, render: (val) => val > 0 ? <span className="font-semibold text-bad-text">{formatINR(val)}</span> : '—' },
    ],
    kpis,
    detailFields: [
      { key: 'taxable', label: 'Taxable Value', type: 'currency', isHero: true },
      { key: 'type', label: 'Supply Type', icon: <Tag size={12} /> },
      { key: 'state', label: 'State', icon: <Globe size={12} /> },
      { key: 'taxRate', label: 'Tax Rate' },
      { key: 'invoices', label: 'Invoice Count' },
      { key: 'cgst', label: 'CGST', type: 'currency' },
      { key: 'sgst', label: 'SGST', type: 'currency' },
      { key: 'igst', label: 'IGST', type: 'currency' },
    ],
  };

  // --- HSN Summary Tab (12) ---
  const hsnTab = {
    id: 'GSTR1_HSN',
    label: '12 — HSN Summary',
    icon: <Layers size={18} />,
    data: gstr1.hsn,
    loading: loading,
    totals: {
      qty: gstr1.hsn.reduce((a, r) => a + r.qty, 0),
      taxable: round2(gstr1.hsn.reduce((a, r) => a + r.taxable, 0)),
      cgst: round2(gstr1.hsn.reduce((a, r) => a + r.cgst, 0)),
      sgst: round2(gstr1.hsn.reduce((a, r) => a + r.sgst, 0)),
      igst: round2(gstr1.hsn.reduce((a, r) => a + r.igst, 0)),
      totalValue: round2(gstr1.hsn.reduce((a, r) => a + r.totalValue, 0)),
    },
    columns: [
      { key: 'hsn', label: 'HSN / SAC', sortable: true, width: 130,
        render: (val) => <span className="tabular-nums text-[11.5px] bg-tile px-2 py-0.5 rounded border border-border/60 font-semibold">{val}</span> },
      { key: 'description', label: 'Description', width: 220,
        render: (val) => <span className="text-[11.5px] font-semibold text-body">{val || '—'}</span> },
      { key: 'uqc', label: 'UQC', width: 80, render: (val) => <span className="tabular-nums text-[11.5px] font-semibold">{val}</span> },
      { key: 'qty', label: 'Qty', align: 'right', sortable: true, width: 100, render: (val) => <span className="tabular-nums">{val}</span> },
      { key: 'taxRate', label: 'Rate %', align: 'right', sortable: true, width: 90, render: (val) => `${val}%` },
      { key: 'taxable', label: 'Taxable', type: 'currency', align: 'right', sortable: true, width: 140, render: (val) => formatINR(val) },
      { key: 'cgst', label: 'CGST', type: 'currency', align: 'right', width: 120, render: (val) => val > 0 ? <span className="font-semibold text-amber-text">{formatINR(val)}</span> : '—' },
      { key: 'sgst', label: 'SGST', type: 'currency', align: 'right', width: 120, render: (val) => val > 0 ? <span className="font-semibold text-info-text">{formatINR(val)}</span> : '—' },
      { key: 'igst', label: 'IGST', type: 'currency', align: 'right', width: 120, render: (val) => val > 0 ? <span className="font-semibold text-bad-text">{formatINR(val)}</span> : '—' },
      { key: 'totalValue', label: 'Total Value', type: 'currency', align: 'right', sortable: true, width: 150, render: (val) => <span className="font-semibold">{formatINR(val)}</span> },
    ],
    kpis,
    // Formal HSN summary — Table 12 is a tabular statutory schedule; no chart.
    detailFields: [
      { key: 'totalValue', label: 'Total Value', type: 'currency', isHero: true },
      { key: 'hsn', label: 'HSN/SAC Code' },
      { key: 'description', label: 'Description' },
      { key: 'uqc', label: 'Unit of Measurement' },
      { key: 'qty', label: 'Quantity' },
      { key: 'taxRate', label: 'Tax Rate' },
      { key: 'taxable', label: 'Taxable Value', type: 'currency' },
      { key: 'cgst', label: 'CGST', type: 'currency' },
      { key: 'sgst', label: 'SGST', type: 'currency' },
      { key: 'igst', label: 'IGST', type: 'currency' },
    ],
  };

  // --- Documents Issued Tab (13) ---
  const docsTab = {
    id: 'GSTR1_DOCS',
    label: '13 — Documents Issued',
    icon: <BookOpen size={18} />,
    data: gstr1.docs,
    loading: loading,
    totals: {
      total: gstr1.docs.reduce((a, r) => a + (r.total || 0), 0),
      cancelled: gstr1.docs.reduce((a, r) => a + (r.cancelled || 0), 0),
      net: gstr1.docs.reduce((a, r) => a + (r.net || 0), 0),
    },
    columns: [
      { key: 'natureOfDoc', label: 'Nature of Document', width: 320,
        render: (val) => <span className="font-semibold text-ink uppercase tracking-tight">{val}</span> },
      { key: 'from', label: 'Serial From', width: 180,
        render: (val) => <span className="tabular-nums text-[11.5px] font-semibold">{val}</span> },
      { key: 'to', label: 'Serial To', width: 180,
        render: (val) => <span className="tabular-nums text-[11.5px] font-semibold">{val}</span> },
      { key: 'total', label: 'Total Number', align: 'right', width: 130 },
      { key: 'cancelled', label: 'Cancelled', align: 'right', width: 120 },
      { key: 'net', label: 'Net Issued', align: 'right', width: 130, render: (val) => <span className="font-semibold text-good-text">{val}</span> },
    ],
    kpis,
    detailFields: [
      { key: 'net', label: 'Net Issued', isHero: true },
      { key: 'natureOfDoc', label: 'Nature' },
      { key: 'from', label: 'From' },
      { key: 'to', label: 'To' },
      { key: 'total', label: 'Total' },
      { key: 'cancelled', label: 'Cancelled' },
    ],
  };

  const gstLoadError = loadError(rdErr1, rdErr2, rdErr3);
  return (
    <div>
      {/* Period selector — matches the P&L / accounting reports */}
      <ReportPeriodBar {...period} />

      {/* Compliance banner (reports-19). Hidden while a load has failed, so
          its totals never read as ₹0. */}
      {!gstLoadError && (
        <div className="no-print mb-4 flex flex-wrap items-center gap-3 rounded-[14px] border border-[#F6DDB8] bg-amber-soft px-3.5 py-3">
          <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-surface text-ink-2" aria-hidden="true"><FileText size={17} /></span>
          <div className="min-w-0 flex-1">
            <b className="block font-tight text-[13.5px] font-semibold text-ink">
              GSTR-1 · Outward Supplies Return · Business State: {businessState}
            </b>
            <small className="text-[12.5px] text-body tabular-nums">
              Total Turnover: <span className="font-semibold text-ink">{formatINR(gstr1.totals.taxable)}</span>
              {' · '}
              Tax Liability: <span className="font-semibold text-bad-text">{formatINR(gstr1.totals.cgst + gstr1.totals.sgst + gstr1.totals.igst)}</span>
              {' · '}
              <span>{gstr1.totals.invoiceCount}</span> Invoices
              {businessGSTIN && <span> · GSTIN: {businessGSTIN}</span>}
            </small>
          </div>
          <ExportMenu gstr1={gstr1} gstin={businessGSTIN} />
        </div>
      )}

      <PremiumReportView error={gstLoadError} onRetry={() => { rdRe1(); rdRe2(); rdRe3(); }} title="GSTR-1" tabs={[b2bTab, b2clTab, b2csTab, hsnTab, docsTab]} />
    </div>
  );
};

export default GSTR1Report;
