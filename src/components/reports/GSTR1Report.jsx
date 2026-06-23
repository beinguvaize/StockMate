import React, { useMemo, useState } from 'react';
import { useTenant } from '../../context/TenantContext';
import useReportData from './useReportData';
import PremiumReportView from './PremiumReportView';
import {
  FileText, Users, Globe, ShoppingBag, Layers, BookOpen,
  Building2, Hash, Receipt, Calendar, Tag, Download, ChevronDown
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

  return (
    <div className="relative no-print">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black transition-colors"
      >
        <Download size={13} /> Export <ChevronDown size={11} className={open ? 'rotate-180' : ''} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-20 w-56 bg-white rounded-2xl border border-black/8 shadow-xl py-1.5 overflow-hidden">
            <div className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-gray-400">
              Portal Upload
            </div>
            <button
              onClick={() => { downloadGSTR1Excel(gstr1, { gstin: gstin || 'export', fp: currentFP() }); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-amber-50 text-left transition-colors"
            >
              <span className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
                <Download size={12} />
              </span>
              <div>
                <div className="text-[11px] font-black text-ink-primary">Excel Workbook (Offline Tool)</div>
                <div className="text-[9px] text-gray-400">b2b · b2cl · b2cs · hsn · docs sheets</div>
              </div>
            </button>
            <button
              onClick={() => { shareGSTWithCA({ kind: 'GSTR-1', gstin, fp: currentFP(), totals: gstr1.totals || {} }); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-green-50 text-left transition-colors"
            >
              <span className="w-6 h-6 rounded-lg bg-green-100 flex items-center justify-center text-green-600">
                <Download size={12} />
              </span>
              <div>
                <div className="text-[11px] font-black text-ink-primary">Share with CA (WhatsApp)</div>
                <div className="text-[9px] text-gray-400">Summary message — attach files after</div>
              </div>
            </button>
            <button
              onClick={handlePortalJSON}
              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-amber-50 text-left transition-colors"
            >
              <span className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600">
                <Download size={12} />
              </span>
              <div>
                <div className="text-[11px] font-black text-ink-primary">Download Portal JSON</div>
                <div className="text-[9px] text-gray-400">Upload directly to GST Portal</div>
              </div>
            </button>
            <div className="border-t border-black/5 mt-1 pt-1">
              <div className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-gray-400">
                CSV Downloads
              </div>
              {[
                { key: 'b2b',  label: 'B2B Invoices' },
                { key: 'b2cl', label: 'B2CL — Large B2C' },
                { key: 'b2cs', label: 'B2CS — Small B2C' },
                { key: 'hsn',  label: 'HSN Summary' },
              ].map(s => (
                <button
                  key={s.key}
                  onClick={() => handleCSV(s.key, s.key.toUpperCase())}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left transition-colors"
                >
                  <span className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500">
                    <FileText size={11} />
                  </span>
                  <span className="text-[11px] font-semibold text-ink-primary">{s.label}</span>
                </button>
              ))}
            </div>
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

  const { data: sales,    loading: l1 } = useReportData({ table: 'sales',    select: '*', dateColumn: 'date' });
  const { data: clients,  loading: l2 } = useReportData({ table: 'clients',  select: '*', nullFilters: { deleted_at: null } });
  // Invoices have pre-computed cgst_amount/sgst_amount/igst_amount — use as primary source
  const { data: invoices, loading: l3 } = useReportData({
    table: 'invoices',
    select: 'id, sale_id, client_id, client_name, invoice_number, invoice_date, date, taxable_amount, cgst_amount, sgst_amount, igst_amount, grand_total, is_interstate, items',
    dateColumn: 'date',
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
        render: (val) => <span className="font-mono text-[10px] bg-canvas px-2 py-0.5 rounded border border-black/5 font-bold">{val || '—'}</span> },
      { key: 'invoiceNo', label: 'Invoice #', sortable: true, width: 130,
        render: (val) => <span className="font-mono text-[10px] font-bold text-ink-primary">{val}</span> },
      { key: 'date', label: 'Invoice Date', type: 'date', sortable: true, width: 130 },
      { key: 'invoiceValue', label: 'Invoice Value', type: 'currency', align: 'right', sortable: true, width: 150, render: (val) => formatINR(val) },
      { key: 'placeOfSupply', label: 'Place of Supply', width: 180,
        render: (val) => <span className="text-[10px] font-bold text-gray-500">{val || '—'}</span> },
      { key: 'reverseCharge', label: 'RCM', width: 80, render: (val) => <span className="font-mono text-[10px]">{val}</span> },
      { key: 'invoiceType', label: 'Type', width: 110, render: (val) => <span className="text-[10px] font-bold text-gray-500">{val}</span> },
      { key: 'taxRate', label: 'Rate %', align: 'right', width: 90, render: (val) => <span className="font-mono font-bold">{val}%</span> },
      { key: 'taxable', label: 'Taxable', type: 'currency', align: 'right', sortable: true, width: 140, render: (val) => formatINR(val) },
      { key: 'cgst', label: 'CGST', type: 'currency', align: 'right', width: 120, render: (val) => val > 0 ? <span className="font-black text-amber-600">{formatINR(val)}</span> : '—' },
      { key: 'sgst', label: 'SGST', type: 'currency', align: 'right', width: 120, render: (val) => val > 0 ? <span className="font-black text-sky-600">{formatINR(val)}</span> : '—' },
      { key: 'igst', label: 'IGST', type: 'currency', align: 'right', width: 120, render: (val) => val > 0 ? <span className="font-black text-rose-500">{formatINR(val)}</span> : '—' },
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
      { key: 'igst', label: 'IGST', type: 'currency', align: 'right', width: 130, render: (val) => <span className="font-black text-rose-500">{formatINR(val)}</span> },
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
          <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[9px] font-black uppercase ${
            val === 'Inter-State' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
          }`}>{val}</span>
        ) },
      { key: 'state', label: 'State', sortable: true, width: 180,
        render: (val, row) => <span className="font-bold text-ink-primary">{row.stateCode ? `${row.stateCode} - ` : ''}{val}</span> },
      { key: 'taxRate', label: 'Rate %', align: 'right', sortable: true, width: 100, render: (val) => <span className="font-mono font-bold">{val}%</span> },
      { key: 'invoices', label: 'Invoices', align: 'right', sortable: true, width: 110 },
      { key: 'taxable', label: 'Taxable', type: 'currency', align: 'right', sortable: true, width: 140, render: (val) => formatINR(val) },
      { key: 'cgst', label: 'CGST', type: 'currency', align: 'right', width: 120, render: (val) => val > 0 ? <span className="font-black text-amber-600">{formatINR(val)}</span> : '—' },
      { key: 'sgst', label: 'SGST', type: 'currency', align: 'right', width: 120, render: (val) => val > 0 ? <span className="font-black text-sky-600">{formatINR(val)}</span> : '—' },
      { key: 'igst', label: 'IGST', type: 'currency', align: 'right', width: 120, render: (val) => val > 0 ? <span className="font-black text-rose-500">{formatINR(val)}</span> : '—' },
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
        render: (val) => <span className="font-mono text-[10px] bg-canvas px-2 py-0.5 rounded border border-black/5 font-bold">{val}</span> },
      { key: 'description', label: 'Description', width: 220,
        render: (val) => <span className="text-[10px] font-bold text-gray-500">{val || '—'}</span> },
      { key: 'uqc', label: 'UQC', width: 80, render: (val) => <span className="font-mono text-[10px] font-bold">{val}</span> },
      { key: 'qty', label: 'Qty', align: 'right', sortable: true, width: 100, render: (val) => <span className="font-mono">{val}</span> },
      { key: 'taxRate', label: 'Rate %', align: 'right', sortable: true, width: 90, render: (val) => `${val}%` },
      { key: 'taxable', label: 'Taxable', type: 'currency', align: 'right', sortable: true, width: 140, render: (val) => formatINR(val) },
      { key: 'cgst', label: 'CGST', type: 'currency', align: 'right', width: 120, render: (val) => val > 0 ? <span className="font-black text-amber-600">{formatINR(val)}</span> : '—' },
      { key: 'sgst', label: 'SGST', type: 'currency', align: 'right', width: 120, render: (val) => val > 0 ? <span className="font-black text-sky-600">{formatINR(val)}</span> : '—' },
      { key: 'igst', label: 'IGST', type: 'currency', align: 'right', width: 120, render: (val) => val > 0 ? <span className="font-black text-rose-500">{formatINR(val)}</span> : '—' },
      { key: 'totalValue', label: 'Total Value', type: 'currency', align: 'right', sortable: true, width: 150, render: (val) => <span className="font-black">{formatINR(val)}</span> },
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
        render: (val) => <span className="font-black text-ink-primary uppercase tracking-tight">{val}</span> },
      { key: 'from', label: 'Serial From', width: 180,
        render: (val) => <span className="font-mono text-[10px] font-bold">{val}</span> },
      { key: 'to', label: 'Serial To', width: 180,
        render: (val) => <span className="font-mono text-[10px] font-bold">{val}</span> },
      { key: 'total', label: 'Total Number', align: 'right', width: 130 },
      { key: 'cancelled', label: 'Cancelled', align: 'right', width: 120 },
      { key: 'net', label: 'Net Issued', align: 'right', width: 130, render: (val) => <span className="font-black text-emerald-600">{val}</span> },
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

  return (
    <div className="flex flex-col gap-4">
      {/* Compliance banner */}
      <div className="no-print flex items-center gap-3 px-4 py-3 rounded-2xl border border-black/5 shadow-sm bg-amber-50">
        <FileText className="text-amber-600" size={20} />
        <div className="flex-1">
          <div className="text-[11px] font-black uppercase tracking-widest text-amber-700">
            GSTR-1 · Outward Supplies Return · Business State: {businessState}
          </div>
          <div className="text-[10px] font-bold text-gray-500 mt-0.5 font-mono">
            Total Turnover: <span className="font-black text-ink-primary tabular-nums">{formatINR(gstr1.totals.taxable)}</span>
            {' · '}
            Tax Liability: <span className="font-black text-rose-600 tabular-nums">{formatINR(gstr1.totals.cgst + gstr1.totals.sgst + gstr1.totals.igst)}</span>
            {' · '}
            <span className="tabular-nums">{gstr1.totals.invoiceCount}</span> Invoices
            {businessGSTIN && (
              <span className="ml-2 font-mono text-amber-600">· GSTIN: {businessGSTIN}</span>
            )}
          </div>
        </div>
        <ExportMenu gstr1={gstr1} gstin={businessGSTIN} />
      </div>

      <PremiumReportView title="GSTR-1" tabs={[b2bTab, b2clTab, b2csTab, hsnTab, docsTab]} />
    </div>
  );
};

export default GSTR1Report;
