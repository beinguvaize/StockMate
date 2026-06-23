import React, { useMemo } from 'react';
import { useTenant } from '../../context/TenantContext';
import useReportData from './useReportData';
import PremiumReportView from './PremiumReportView';
import {
  FileCheck, TrendingUp, Package, Globe, CheckCircle2,
  Landmark, Wallet, ArrowDownToLine, ArrowUpFromLine, Tag
} from 'lucide-react';
import { formatINR, round2 } from '../../utils/financialCalculations';
import { buildGSTR3B, buildGSTR1, downloadGSTR3BJSON, downloadGSTR3BExcel, shareGSTWithCA, computeGstSetOff } from '../../utils/gstReporting';
import { Download } from 'lucide-react';

const fpNow = () => {
  const now = new Date();
  return `${String(now.getMonth() + 1).padStart(2, '0')}${now.getFullYear()}`;
};

/**
 * GSTR-3B — Monthly Summary Return
 * --------------------------------
 * Consolidated monthly return covering:
 *   Section 3.1: Outward supplies by taxability
 *   Section 3.2: Inter-state supplies to unregistered/composition/UIN
 *   Section 4:   Eligible ITC
 *   Section 5:   Exempt/nil-rated/non-GST inward supplies
 *   Section 6.1: Tax payable vs Tax paid
 */
const GSTR3BReport = () => {
  const { businessProfile } = useTenant();
  const businessState = businessProfile?.state || businessProfile?.business_state || 'KERALA';

  const { data: sales,    loading: l1 } = useReportData({ table: 'sales',    select: '*', dateColumn: 'date' });
  const { data: clients,  loading: l2 } = useReportData({ table: 'clients',  select: '*', nullFilters: { deleted_at: null } });
  const { data: purchases,loading: l3 } = useReportData({ table: 'purchases',select: '*', dateColumn: 'date' });
  const { data: expenses, loading: l4 } = useReportData({ table: 'expenses', select: '*', dateColumn: 'date' });
  const { data: invoices, loading: l5 } = useReportData({
    table: 'invoices',
    select: 'id, sale_id, client_id, client_name, invoice_number, invoice_date, date, taxable_amount, cgst_amount, sgst_amount, igst_amount, grand_total, is_interstate, items',
    dateColumn: 'date',
  });

  const loading = l1 || l2 || l3 || l4 || l5;

  const gstr3b = useMemo(
    () => buildGSTR3B(sales, purchases, expenses, { businessState, clients, invoices }),
    [sales, purchases, expenses, clients, invoices, businessState]
  );

  // Statutory credit set-off (Sec 49/49A/49B) → exact cash payable per head.
  const setoff = useMemo(() => {
    const out = gstr3b.section3_1?.[0] || {};
    const net = gstr3b.section4?.[2] || {};
    return computeGstSetOff(
      { igst: out.integratedTax, cgst: out.centralTax, sgst: out.stateTax, cess: out.cess },
      { igst: net.integratedTax, cgst: net.centralTax, sgst: net.stateTax, cess: net.cess },
    );
  }, [gstr3b]);

  const setoffRows = useMemo(() => {
    const out = gstr3b.section3_1?.[0] || {};
    return [
      { head: 'Integrated Tax (IGST)', liability: out.integratedTax || 0, viaItc: setoff.itcUsed.igst, cash: setoff.cash.igst },
      { head: 'Central Tax (CGST)',    liability: out.centralTax    || 0, viaItc: setoff.itcUsed.cgst, cash: setoff.cash.cgst },
      { head: 'State/UT Tax (SGST)',   liability: out.stateTax      || 0, viaItc: setoff.itcUsed.sgst, cash: setoff.cash.sgst },
      { head: 'Cess',                  liability: out.cess          || 0, viaItc: setoff.itcUsed.cess, cash: setoff.cash.cess },
    ];
  }, [gstr3b, setoff]);

  // GSTR-1 ↔ GSTR-3B ↔ Books tie-out — the auditor's cross-check that the
  // outward tax filed in GSTR-1 agrees with GSTR-3B 3.1 and the books.
  const gstr1 = useMemo(
    () => buildGSTR1(sales, { businessState, clients, invoices }),
    [sales, businessState, clients, invoices]
  );
  const tieoutRows = useMemo(() => {
    const out = gstr3b.section3_1?.[0] || {};
    const g1 = gstr1.totals || {};
    const row = (metric, a, b) => {
      const variance = round2((a || 0) - (b || 0));
      return { metric, gstr1: round2(a || 0), gstr3b: round2(b || 0), variance, status: Math.abs(variance) < 1 ? 'MATCHED' : 'REVIEW' };
    };
    return [
      row('Taxable Value', g1.taxable, out.taxable),
      row('IGST', g1.igst, out.integratedTax),
      row('CGST', g1.cgst, out.centralTax),
      row('SGST / UTGST', g1.sgst, out.stateTax),
      row('Total Tax', (g1.igst || 0) + (g1.cgst || 0) + (g1.sgst || 0),
                       (out.integratedTax || 0) + (out.centralTax || 0) + (out.stateTax || 0)),
    ];
  }, [gstr3b, gstr1]);

  // ITC utilisation ledger — mirrors the electronic credit ledger:
  // Opening + Availed − Reversed − Utilised = Closing, per head.
  // Opening starts at 0 (the app does not yet carry a prior-period ITC balance).
  const itcLedgerRows = useMemo(() => {
    const A = gstr3b.section4?.[0] || {}; // ITC available (gross)
    const B = gstr3b.section4?.[1] || {}; // ITC reversed
    const heads = [
      { head: 'Integrated Tax (IGST)', k: 'integratedTax', uk: 'igst' },
      { head: 'Central Tax (CGST)',    k: 'centralTax',    uk: 'cgst' },
      { head: 'State/UT Tax (SGST)',   k: 'stateTax',      uk: 'sgst' },
      { head: 'Cess',                  k: 'cess',          uk: 'cess' },
    ];
    return heads.map(({ head, k, uk }) => {
      const opening = 0;
      const availed = round2(A[k] || 0);
      const reversed = round2(B[k] || 0);
      const utilised = round2(setoff.itcUsed[uk] || 0);
      const closing = round2(opening + availed - reversed - utilised);
      return { head, opening, availed, reversed, utilised, closing };
    });
  }, [gstr3b, setoff]);

  // KPIs across all tabs
  const kpis = useMemo(() => ([
    {
      id: 'turnover', label: 'Taxable Turnover', value: gstr3b.summary.totalTurnover,
      trend: 0, trendDir: 'up', color: 'indigo',
      chartData: [{ value: gstr3b.summary.totalTurnover }],
    },
    {
      id: 'gross', label: 'Gross Tax (Outward)', value: gstr3b.summary.grossTax,
      trend: 0, trendDir: 'up', color: 'rose',
      chartData: [{ value: gstr3b.summary.grossTax }],
    },
    {
      id: 'itc', label: 'Total ITC Claimed', value: gstr3b.summary.totalITC,
      trend: 0, trendDir: 'up', color: 'emerald',
      chartData: [{ value: gstr3b.summary.totalITC }],
    },
    {
      id: 'net', label: 'Net Tax Payable (Cash)', value: gstr3b.summary.netTaxDue,
      trend: 0,
      trendDir: gstr3b.summary.netTaxDue > 0 ? 'up' : 'down',
      color: gstr3b.summary.netTaxDue > 0 ? 'amber' : 'emerald',
      chartData: [{ value: gstr3b.summary.netTaxDue }],
    },
  ]), [gstr3b]);

  // --- Section 3.1: Outward supplies ---
  const section3_1Tab = {
    id: 'GSTR3B_3_1',
    label: '3.1 — Outward Supplies',
    icon: <ArrowUpFromLine size={18} />,
    data: gstr3b.section3_1,
    loading,
    totals: {
      taxable: round2(gstr3b.section3_1.reduce((a, r) => a + r.taxable, 0)),
      integratedTax: round2(gstr3b.section3_1.reduce((a, r) => a + r.integratedTax, 0)),
      centralTax: round2(gstr3b.section3_1.reduce((a, r) => a + r.centralTax, 0)),
      stateTax: round2(gstr3b.section3_1.reduce((a, r) => a + r.stateTax, 0)),
      cess: 0,
    },
    columns: [
      { key: 'row', label: 'Nature of Supply', width: 380,
        render: (val) => <span className="font-black text-ink-primary uppercase tracking-tight text-[11px]">{val}</span> },
      { key: 'taxable', label: 'Total Taxable Value', type: 'currency', align: 'right', width: 170, render: (val) => formatINR(val) },
      { key: 'integratedTax', label: 'IGST', type: 'currency', align: 'right', width: 140, render: (val) => val > 0 ? <span className="font-black text-rose-500">{formatINR(val)}</span> : '—' },
      { key: 'centralTax', label: 'CGST', type: 'currency', align: 'right', width: 140, render: (val) => val > 0 ? <span className="font-black text-amber-600">{formatINR(val)}</span> : '—' },
      { key: 'stateTax', label: 'SGST/UTGST', type: 'currency', align: 'right', width: 140, render: (val) => val > 0 ? <span className="font-black text-sky-600">{formatINR(val)}</span> : '—' },
      { key: 'cess', label: 'Cess', type: 'currency', align: 'right', width: 100, render: (val) => val > 0 ? formatINR(val) : '—' },
    ],
    kpis,
  };

  // --- Section 3.2: Inter-state supplies ---
  const section3_2Tab = {
    id: 'GSTR3B_3_2',
    label: '3.2 — Inter-State',
    icon: <Globe size={18} />,
    data: gstr3b.section3_2,
    loading,
    totals: {
      taxable: round2(gstr3b.section3_2.reduce((a, r) => a + r.taxable, 0)),
      igst: round2(gstr3b.section3_2.reduce((a, r) => a + r.igst, 0)),
    },
    columns: [
      { key: 'recipientType', label: 'Recipient Type', width: 180,
        render: (val) => <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[9px] font-black uppercase bg-amber-50 text-amber-600">{val}</span> },
      { key: 'placeOfSupply', label: 'Place of Supply', width: 220,
        render: (val) => <span className="font-bold text-ink-primary">{val}</span> },
      { key: 'taxable', label: 'Taxable Value', type: 'currency', align: 'right', sortable: true, width: 160, render: (val) => formatINR(val) },
      { key: 'igst', label: 'IGST', type: 'currency', align: 'right', sortable: true, width: 140, render: (val) => <span className="font-black text-rose-500">{formatINR(val)}</span> },
    ],
    kpis,
    detailFields: [
      { key: 'taxable', label: 'Taxable Value', type: 'currency', isHero: true },
      { key: 'recipientType', label: 'Recipient Type' },
      { key: 'placeOfSupply', label: 'Place of Supply' },
      { key: 'igst', label: 'IGST', type: 'currency' },
    ],
  };

  // --- Section 4: ITC ---
  const section4Tab = {
    id: 'GSTR3B_4',
    label: '4 — Input Tax Credit',
    icon: <ArrowDownToLine size={18} />,
    data: gstr3b.section4,
    loading,
    totals: {
      integratedTax: round2(gstr3b.section4.reduce((a, r) => a + r.integratedTax, 0)),
      centralTax: round2(gstr3b.section4.reduce((a, r) => a + r.centralTax, 0)),
      stateTax: round2(gstr3b.section4.reduce((a, r) => a + r.stateTax, 0)),
    },
    columns: [
      { key: 'row', label: 'ITC Detail', width: 380,
        render: (val) => <span className="font-black text-ink-primary uppercase tracking-tight text-[11px]">{val}</span> },
      { key: 'integratedTax', label: 'IGST', type: 'currency', align: 'right', width: 150, render: (val) => val > 0 ? <span className="font-black text-rose-500">{formatINR(val)}</span> : '—' },
      { key: 'centralTax', label: 'CGST', type: 'currency', align: 'right', width: 150, render: (val) => val > 0 ? <span className="font-black text-amber-600">{formatINR(val)}</span> : '—' },
      { key: 'stateTax', label: 'SGST/UTGST', type: 'currency', align: 'right', width: 150, render: (val) => val > 0 ? <span className="font-black text-sky-600">{formatINR(val)}</span> : '—' },
      { key: 'cess', label: 'Cess', type: 'currency', align: 'right', width: 100, render: (val) => val > 0 ? formatINR(val) : '—' },
    ],
    kpis,
  };

  // --- Section 6.1: Tax payment ---
  const section6_1Tab = {
    id: 'GSTR3B_6_1',
    label: '6.1 — Tax Payment',
    icon: <Wallet size={18} />,
    data: gstr3b.section6_1,
    loading,
    totals: {
      taxPayable: round2(gstr3b.section6_1.reduce((a, r) => a + r.taxPayable, 0)),
      paidThroughITC: round2(gstr3b.section6_1.reduce((a, r) => a + r.paidThroughITC, 0)),
      paidInCash: round2(gstr3b.section6_1.reduce((a, r) => a + r.paidInCash, 0)),
    },
    columns: [
      { key: 'row', label: 'Description', width: 260,
        render: (val) => <span className="font-black text-ink-primary uppercase tracking-tight text-[11px]">{val}</span> },
      { key: 'taxPayable', label: 'Tax Payable', type: 'currency', align: 'right', width: 170, render: (val) => <span className="font-black">{formatINR(val)}</span> },
      { key: 'paidThroughITC', label: 'Paid via ITC', type: 'currency', align: 'right', width: 170, render: (val) => val > 0 ? <span className="font-black text-emerald-600">{formatINR(val)}</span> : '—' },
      { key: 'paidInCash', label: 'Paid in Cash', type: 'currency', align: 'right', width: 170, render: (val) => val > 0 ? <span className="font-black text-amber-600">{formatINR(val)}</span> : '—' },
    ],
    kpis,
  };

  // --- Set-off worksheet (formal — no chart) ---
  const setoffTab = {
    id: 'GSTR3B_SETOFF',
    label: 'Set-off & Cash Payable',
    icon: <Landmark size={18} />,
    data: setoffRows,
    loading,
    totals: {
      liability: round2(setoffRows.reduce((a, r) => a + r.liability, 0)),
      viaItc: round2(setoffRows.reduce((a, r) => a + r.viaItc, 0)),
      cash: round2(setoffRows.reduce((a, r) => a + r.cash, 0)),
    },
    columns: [
      { key: 'head', label: 'Tax Head', width: 320,
        render: (val) => <span className="font-black text-ink-primary uppercase tracking-tight text-[11px]">{val}</span> },
      { key: 'liability', label: 'Output Liability', type: 'currency', align: 'right', width: 180,
        render: (val) => val > 0 ? <span className="font-bold tabular-nums">{formatINR(val)}</span> : '—' },
      { key: 'viaItc', label: 'Set-off via ITC', type: 'currency', align: 'right', width: 180,
        render: (val) => val > 0 ? <span className="font-bold tabular-nums text-emerald-700">({formatINR(val)})</span> : '—' },
      { key: 'cash', label: 'Payable in Cash', type: 'currency', align: 'right', width: 180,
        render: (val) => <span className={`font-black tabular-nums ${val > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{formatINR(val)}</span> },
    ],
    kpis,
  };

  // --- GSTR-1 ↔ 3B ↔ Books tie-out (formal — no chart) ---
  const tieoutTab = {
    id: 'GSTR3B_TIEOUT',
    label: 'Reconciliation (1 ↔ 3B)',
    icon: <FileCheck size={18} />,
    data: tieoutRows,
    loading,
    totals: {
      gstr1: round2(tieoutRows.find(r => r.metric === 'Total Tax')?.gstr1 || 0),
      gstr3b: round2(tieoutRows.find(r => r.metric === 'Total Tax')?.gstr3b || 0),
    },
    columns: [
      { key: 'metric', label: 'Particular', width: 240,
        render: (val) => <span className="font-black text-ink-primary uppercase tracking-tight text-[11px]">{val}</span> },
      { key: 'gstr1', label: 'GSTR-1', type: 'currency', align: 'right', width: 170,
        render: (val) => <span className="font-bold tabular-nums">{formatINR(val)}</span> },
      { key: 'gstr3b', label: 'GSTR-3B (3.1)', type: 'currency', align: 'right', width: 170,
        render: (val) => <span className="font-bold tabular-nums">{formatINR(val)}</span> },
      { key: 'variance', label: 'Variance', type: 'currency', align: 'right', width: 150,
        render: (val) => <span className={`font-black tabular-nums ${Math.abs(val) < 1 ? 'text-emerald-700' : 'text-rose-600'}`}>{val < 0 ? `(${formatINR(Math.abs(val))})` : formatINR(val)}</span> },
      { key: 'status', label: 'Status', align: 'center', width: 120,
        render: (val) => <span className={`font-black text-[10px] uppercase tracking-widest ${val === 'MATCHED' ? 'text-emerald-700' : 'text-rose-600'}`}>{val}</span> },
    ],
    kpis,
  };

  // --- ITC utilisation ledger (formal — no chart) ---
  const itcLedgerTab = {
    id: 'GSTR3B_ITC_LEDGER',
    label: 'ITC Ledger',
    icon: <ArrowDownToLine size={18} />,
    data: itcLedgerRows,
    loading,
    totals: {
      opening:  round2(itcLedgerRows.reduce((a, r) => a + r.opening, 0)),
      availed:  round2(itcLedgerRows.reduce((a, r) => a + r.availed, 0)),
      reversed: round2(itcLedgerRows.reduce((a, r) => a + r.reversed, 0)),
      utilised: round2(itcLedgerRows.reduce((a, r) => a + r.utilised, 0)),
      closing:  round2(itcLedgerRows.reduce((a, r) => a + r.closing, 0)),
    },
    columns: [
      { key: 'head', label: 'Tax Head', width: 240,
        render: (val) => <span className="font-black text-ink-primary uppercase tracking-tight text-[11px]">{val}</span> },
      { key: 'opening',  label: 'Opening',  type: 'currency', align: 'right', width: 130,
        render: (val) => <span className="tabular-nums text-gray-500">{formatINR(val)}</span> },
      { key: 'availed',  label: 'Availed',  type: 'currency', align: 'right', width: 140,
        render: (val) => val > 0 ? <span className="font-bold tabular-nums text-emerald-700">{formatINR(val)}</span> : '—' },
      { key: 'reversed', label: 'Reversed', type: 'currency', align: 'right', width: 140,
        render: (val) => val > 0 ? <span className="font-bold tabular-nums text-rose-600">({formatINR(val)})</span> : '—' },
      { key: 'utilised', label: 'Utilised', type: 'currency', align: 'right', width: 140,
        render: (val) => val > 0 ? <span className="font-bold tabular-nums">({formatINR(val)})</span> : '—' },
      { key: 'closing',  label: 'Closing Balance', type: 'currency', align: 'right', width: 160,
        render: (val) => <span className="font-black tabular-nums text-ink-primary">{formatINR(val)}</span> },
    ],
    kpis,
  };

  const gstin = businessProfile?.gst_no || businessProfile?.gstin || '';
  const exportBar = (
    <div className="no-print flex justify-end gap-2 mb-3">
      <button onClick={() => downloadGSTR3BExcel(gstr3b, { gstin, fp: fpNow() })}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black transition-colors">
        <Download size={13} /> Excel Summary
      </button>
      <button onClick={() => downloadGSTR3BJSON(gstr3b, { gstin, fp: fpNow() })}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-ink-primary text-white text-[11px] font-black hover:opacity-90 transition-colors">
        <Download size={13} /> Portal JSON
      </button>
      <button onClick={() => shareGSTWithCA({ kind: 'GSTR-3B', gstin, fp: fpNow(), totals: { taxable: gstr3b.summary.totalTurnover, cgst: gstr3b.section3_1?.[0]?.centralTax, sgst: gstr3b.section3_1?.[0]?.stateTax, igst: gstr3b.section3_1?.[0]?.integratedTax } })}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#25D366] text-white text-[11px] font-black hover:opacity-90 transition-colors">
        <Download size={13} /> Share with CA
      </button>
    </div>
  );
  return (
    <>
    {exportBar}
    <div className="flex flex-col gap-4">
      {/* Compliance summary banner */}
      <div className="no-print flex items-center gap-3 px-4 py-3 rounded-2xl border border-black/5 shadow-sm bg-emerald-50">
        <CheckCircle2 className="text-emerald-600" size={20} />
        <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-[9px] font-black uppercase tracking-widest text-gray-500">Taxable Turnover</div>
            <div className="text-sm font-black text-ink-primary mt-0.5">{formatINR(gstr3b.summary.totalTurnover)}</div>
          </div>
          <div>
            <div className="text-[9px] font-black uppercase tracking-widest text-gray-500">Gross Tax</div>
            <div className="text-sm font-black text-rose-600 mt-0.5">{formatINR(gstr3b.summary.grossTax)}</div>
          </div>
          <div>
            <div className="text-[9px] font-black uppercase tracking-widest text-gray-500">ITC Available</div>
            <div className="text-sm font-black text-emerald-600 mt-0.5">{formatINR(gstr3b.summary.totalITC)}</div>
          </div>
          <div>
            <div className="text-[9px] font-black uppercase tracking-widest text-gray-500">Net Payable</div>
            <div className="text-sm font-black text-amber-600 mt-0.5">{formatINR(gstr3b.summary.netTaxDue)}</div>
          </div>
        </div>
      </div>

      <PremiumReportView title="GSTR-3B" tabs={[section3_1Tab, section3_2Tab, section4Tab, itcLedgerTab, setoffTab, section6_1Tab, tieoutTab]} />
    </div>
    </>
  );
};

export default GSTR3BReport;
