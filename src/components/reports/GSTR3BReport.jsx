import React, { useMemo } from 'react';
import { isCountableSale } from './reportUtils';
import { useTenant } from '../../context/TenantContext';
import useReportData from './useReportData';
import { loadError } from '../../lib/reportsView';
import PremiumReportView from './PremiumReportView';
import ReportPeriodBar, { useReportPeriod } from './ReportPeriodBar';
import { ReportButton } from './frame';
import {
  FileCheck, TrendingUp, Package, Globe, CheckCircle2,
  Landmark, Wallet, ArrowDownToLine, ArrowUpFromLine, Tag
} from 'lucide-react';
import { formatINR, round2 } from '../../utils/financialCalculations';
import { buildGSTR3B, buildGSTR1, downloadGSTR3BJSON, downloadGSTR3BExcel, shareGSTWithCA, computeGstSetOff } from '../../utils/gstReporting';
import { Download, Share2 } from 'lucide-react';

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

  // Period scoping — GSTR-3B is a monthly return. Defaults to This Month.
  const period = useReportPeriod('THIS_MONTH');
  const dateRange = { start: period.range.from, end: period.range.to };

  const { data: salesRaw,    loading: l1, error: rdErr1, refetch: rdRe1 } = useReportData({ table: 'sales',    select: '*', dateColumn: 'date', filters: { dateRange } });
  // Voided and cancelled sales are not revenue and were being counted here.
  const sales = useMemo(() => (salesRaw || []).filter(isCountableSale), [salesRaw]);
  const { data: clients,  loading: l2, error: rdErr2, refetch: rdRe2 } = useReportData({ table: 'clients',  select: '*', nullFilters: { deleted_at: null } });
  const { data: purchases,loading: l3, error: rdErr3, refetch: rdRe3 } = useReportData({ table: 'purchases',select: '*', dateColumn: 'date', filters: { dateRange } });
  const { data: expenses, loading: l4, error: rdErr4, refetch: rdRe4 } = useReportData({ table: 'expenses', select: '*', dateColumn: 'date', filters: { dateRange } });
  const { data: invoices, loading: l5, error: rdErr5, refetch: rdRe5 } = useReportData({
    table: 'invoices',
    select: 'id, sale_id, client_id, client_name, invoice_number, invoice_date, date, taxable_amount, cgst_amount, sgst_amount, igst_amount, grand_total, is_interstate, items',
    dateColumn: 'date',
    filters: { dateRange },
  });
  // Suppliers — needed so ITC only counts GST-registered suppliers.
  const { data: suppliers, loading: l6, error: rdErr6, refetch: rdRe6 } = useReportData({
    table: 'suppliers', select: 'id, name, gstin', nullFilters: { deleted_at: null },
  });

  const loading = l1 || l2 || l3 || l4 || l5 || l6;

  const gstr3b = useMemo(
    () => buildGSTR3B(sales, purchases, expenses, { businessState, clients, invoices, suppliers }),
    [sales, purchases, expenses, clients, invoices, suppliers, businessState]
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
        render: (val) => <span className="font-semibold text-ink uppercase tracking-tight text-[12px]">{val}</span> },
      { key: 'taxable', label: 'Total Taxable Value', type: 'currency', align: 'right', width: 170, render: (val) => formatINR(val) },
      { key: 'integratedTax', label: 'IGST', type: 'currency', align: 'right', width: 140, render: (val) => val > 0 ? <span className="font-semibold text-bad-text">{formatINR(val)}</span> : '—' },
      { key: 'centralTax', label: 'CGST', type: 'currency', align: 'right', width: 140, render: (val) => val > 0 ? <span className="font-semibold text-amber-text">{formatINR(val)}</span> : '—' },
      { key: 'stateTax', label: 'SGST/UTGST', type: 'currency', align: 'right', width: 140, render: (val) => val > 0 ? <span className="font-semibold text-info-text">{formatINR(val)}</span> : '—' },
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
        render: (val) => <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[12px] font-semibold uppercase bg-accent-signature/10 text-amber-text">{val}</span> },
      { key: 'placeOfSupply', label: 'Place of Supply', width: 220,
        render: (val) => <span className="font-semibold text-ink">{val}</span> },
      { key: 'taxable', label: 'Taxable Value', type: 'currency', align: 'right', sortable: true, width: 160, render: (val) => formatINR(val) },
      { key: 'igst', label: 'IGST', type: 'currency', align: 'right', sortable: true, width: 140, render: (val) => <span className="font-semibold text-bad-text">{formatINR(val)}</span> },
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
        render: (val) => <span className="font-semibold text-ink uppercase tracking-tight text-[12px]">{val}</span> },
      { key: 'integratedTax', label: 'IGST', type: 'currency', align: 'right', width: 150, render: (val) => val > 0 ? <span className="font-semibold text-bad-text">{formatINR(val)}</span> : '—' },
      { key: 'centralTax', label: 'CGST', type: 'currency', align: 'right', width: 150, render: (val) => val > 0 ? <span className="font-semibold text-amber-text">{formatINR(val)}</span> : '—' },
      { key: 'stateTax', label: 'SGST/UTGST', type: 'currency', align: 'right', width: 150, render: (val) => val > 0 ? <span className="font-semibold text-info-text">{formatINR(val)}</span> : '—' },
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
        render: (val) => <span className="font-semibold text-ink uppercase tracking-tight text-[12px]">{val}</span> },
      { key: 'taxPayable', label: 'Tax Payable', type: 'currency', align: 'right', width: 170, render: (val) => <span className="font-semibold">{formatINR(val)}</span> },
      { key: 'paidThroughITC', label: 'Paid via ITC', type: 'currency', align: 'right', width: 170, render: (val) => val > 0 ? <span className="font-semibold text-good-text">{formatINR(val)}</span> : '—' },
      { key: 'paidInCash', label: 'Paid in Cash', type: 'currency', align: 'right', width: 170, render: (val) => val > 0 ? <span className="font-semibold text-amber-text">{formatINR(val)}</span> : '—' },
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
        render: (val) => <span className="font-semibold text-ink uppercase tracking-tight text-[12px]">{val}</span> },
      { key: 'liability', label: 'Output Liability', type: 'currency', align: 'right', width: 180,
        render: (val) => val > 0 ? <span className="font-semibold tabular-nums">{formatINR(val)}</span> : '—' },
      { key: 'viaItc', label: 'Set-off via ITC', type: 'currency', align: 'right', width: 180,
        render: (val) => val > 0 ? <span className="font-semibold tabular-nums text-good-text">({formatINR(val)})</span> : '—' },
      { key: 'cash', label: 'Payable in Cash', type: 'currency', align: 'right', width: 180,
        render: (val) => <span className={`font-semibold tabular-nums ${val > 0 ? 'text-amber-text' : 'text-good-text'}`}>{formatINR(val)}</span> },
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
        render: (val) => <span className="font-semibold text-ink uppercase tracking-tight text-[12px]">{val}</span> },
      { key: 'gstr1', label: 'GSTR-1', type: 'currency', align: 'right', width: 170,
        render: (val) => <span className="font-semibold tabular-nums">{formatINR(val)}</span> },
      { key: 'gstr3b', label: 'GSTR-3B (3.1)', type: 'currency', align: 'right', width: 170,
        render: (val) => <span className="font-semibold tabular-nums">{formatINR(val)}</span> },
      { key: 'variance', label: 'Variance', type: 'currency', align: 'right', width: 150,
        render: (val) => <span className={`font-semibold tabular-nums ${Math.abs(val) < 1 ? 'text-good-text' : 'text-bad-text'}`}>{val < 0 ? `(${formatINR(Math.abs(val))})` : formatINR(val)}</span> },
      { key: 'status', label: 'Status', align: 'center', width: 120,
        render: (val) => <span className={`font-semibold text-[11.5px] uppercase tracking-[0.07em] ${val === 'MATCHED' ? 'text-good-text' : 'text-bad-text'}`}>{val}</span> },
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
        render: (val) => <span className="font-semibold text-ink uppercase tracking-tight text-[12px]">{val}</span> },
      { key: 'opening',  label: 'Opening',  type: 'currency', align: 'right', width: 130,
        render: (val) => <span className="tabular-nums text-body">{formatINR(val)}</span> },
      { key: 'availed',  label: 'Availed',  type: 'currency', align: 'right', width: 140,
        render: (val) => val > 0 ? <span className="font-semibold tabular-nums text-good-text">{formatINR(val)}</span> : '—' },
      { key: 'reversed', label: 'Reversed', type: 'currency', align: 'right', width: 140,
        render: (val) => val > 0 ? <span className="font-semibold tabular-nums text-bad-text">({formatINR(val)})</span> : '—' },
      { key: 'utilised', label: 'Utilised', type: 'currency', align: 'right', width: 140,
        render: (val) => val > 0 ? <span className="font-semibold tabular-nums">({formatINR(val)})</span> : '—' },
      { key: 'closing',  label: 'Closing Balance', type: 'currency', align: 'right', width: 160,
        render: (val) => <span className="font-semibold tabular-nums text-ink">{formatINR(val)}</span> },
    ],
    kpis,
  };

  const gstin = businessProfile?.gst_no || businessProfile?.gstin || '';
  const gstLoadError = loadError(rdErr1, rdErr2, rdErr3, rdErr4, rdErr5, rdErr6);
  // Hidden while a load has failed: an export or a banner of zeros would
  // read as a real return.
  const exportBar = gstLoadError ? null : (
    <div className="no-print mb-3.5 flex flex-wrap justify-end gap-2">
      <ReportButton tone="ghost" icon={Download} onClick={() => downloadGSTR3BExcel(gstr3b, { gstin, fp: fpNow() })}>Excel Summary</ReportButton>
      <ReportButton tone="dark" icon={Download} onClick={() => downloadGSTR3BJSON(gstr3b, { gstin, fp: fpNow() })}>Portal JSON</ReportButton>
      <ReportButton tone="ghost" icon={Share2} onClick={() => shareGSTWithCA({ kind: 'GSTR-3B', gstin, fp: fpNow(), totals: { taxable: gstr3b.summary.totalTurnover, cgst: gstr3b.section3_1?.[0]?.centralTax, sgst: gstr3b.section3_1?.[0]?.stateTax, igst: gstr3b.section3_1?.[0]?.integratedTax } })}>
        Share with CA
      </ReportButton>
    </div>
  );
  const fig = (label, value, cls) => (
    <div>
      <small className="block font-tight text-[10.5px] font-semibold uppercase tracking-[0.06em] text-mute">{label}</small>
      <b className={`mt-0.5 block font-tight text-[15px] font-semibold tabular-nums ${cls}`}>{value}</b>
    </div>
  );
  return (
    <div>
      {exportBar}
      <ReportPeriodBar {...period} />

      {/* Compliance summary banner (reports-21) */}
      {!gstLoadError && (
        <div className="no-print mb-4 flex items-center gap-3 rounded-[14px] border border-[#CDEBD8] bg-good-soft px-3.5 py-3">
          <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-surface text-ink-2" aria-hidden="true"><CheckCircle2 size={17} /></span>
          <div className="grid flex-1 grid-cols-2 gap-4 md:grid-cols-4">
            {fig('Taxable Turnover', formatINR(gstr3b.summary.totalTurnover), 'text-ink')}
            {fig('Gross Tax', formatINR(gstr3b.summary.grossTax), 'text-bad-text')}
            {fig('ITC Available', formatINR(gstr3b.summary.totalITC), 'text-good-text')}
            {fig('Net Payable', formatINR(gstr3b.summary.netTaxDue), 'text-amber-text')}
          </div>
        </div>
      )}

      <PremiumReportView error={gstLoadError} onRetry={() => { rdRe1(); rdRe2(); rdRe3(); rdRe4(); rdRe5(); rdRe6(); }} title="GSTR-3B" tabs={[section3_1Tab, section3_2Tab, section4Tab, itcLedgerTab, setoffTab, section6_1Tab, tieoutTab]} />
    </div>
  );
};

export default GSTR3BReport;
