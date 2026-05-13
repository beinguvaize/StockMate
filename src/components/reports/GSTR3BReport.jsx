import React, { useMemo } from 'react';
import { useTenant } from '../../context/TenantContext';
import useReportData from './useReportData';
import ReportShell from './ReportShell';
import {
  FileCheck, TrendingUp, Package, Globe, CheckCircle2,
  Landmark, Wallet, ArrowDownToLine, ArrowUpFromLine, Tag
} from 'lucide-react';
import { formatINR, round2 } from '../../utils/financialCalculations';
import { buildGSTR3B } from '../../utils/gstReporting';

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
      { key: 'centralTax', label: 'CGST', type: 'currency', align: 'right', width: 140, render: (val) => val > 0 ? <span className="font-black text-indigo-600">{formatINR(val)}</span> : '—' },
      { key: 'stateTax', label: 'SGST/UTGST', type: 'currency', align: 'right', width: 140, render: (val) => val > 0 ? <span className="font-black text-sky-600">{formatINR(val)}</span> : '—' },
      { key: 'cess', label: 'Cess', type: 'currency', align: 'right', width: 100, render: (val) => val > 0 ? formatINR(val) : '—' },
    ],
    kpis,
    chartConfig: {
      title: 'Outward tax composition',
      type: 'pie',
      data: [
        { name: 'IGST', value: gstr3b.section3_1[0].integratedTax },
        { name: 'CGST', value: gstr3b.section3_1[0].centralTax },
        { name: 'SGST', value: gstr3b.section3_1[0].stateTax },
      ].filter((d) => d.value > 0),
    },
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
    chartConfig: {
      title: 'Inter-state IGST by destination',
      type: 'bar',
      data: Object.values(
        gstr3b.section3_2.reduce((acc, r) => {
          const k = r.placeOfSupply;
          if (!acc[k]) acc[k] = { name: k, value: 0 };
          acc[k].value += r.igst;
          return acc;
        }, {})
      ),
      series: [{ key: 'value', name: 'IGST', color: '#ef4444' }],
    },
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
      { key: 'centralTax', label: 'CGST', type: 'currency', align: 'right', width: 150, render: (val) => val > 0 ? <span className="font-black text-indigo-600">{formatINR(val)}</span> : '—' },
      { key: 'stateTax', label: 'SGST/UTGST', type: 'currency', align: 'right', width: 150, render: (val) => val > 0 ? <span className="font-black text-sky-600">{formatINR(val)}</span> : '—' },
      { key: 'cess', label: 'Cess', type: 'currency', align: 'right', width: 100, render: (val) => val > 0 ? formatINR(val) : '—' },
    ],
    kpis,
    chartConfig: {
      title: 'ITC composition (Net Available)',
      type: 'bar',
      data: [
        { name: 'IGST', value: gstr3b.section4[2].integratedTax },
        { name: 'CGST', value: gstr3b.section4[2].centralTax },
        { name: 'SGST', value: gstr3b.section4[2].stateTax },
      ],
      series: [{ key: 'value', name: 'Net ITC Available', color: '#10b981' }],
    },
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
    chartConfig: {
      title: 'Cash vs ITC Payment',
      type: 'bar',
      data: gstr3b.section6_1.map((r) => ({ name: r.row, ITC: r.paidThroughITC, Cash: r.paidInCash })),
      series: [
        { key: 'ITC', name: 'Paid via ITC', color: '#10b981' },
        { key: 'Cash', name: 'Paid in Cash', color: '#f59e0b' },
      ],
    },
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Compliance summary banner */}
      <div className="no-print flex items-center gap-3 px-4 py-3 rounded-xl border bg-emerald-50 border-emerald-200">
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

      <ReportShell tabs={[section3_1Tab, section3_2Tab, section4Tab, section6_1Tab]} />
    </div>
  );
};

export default GSTR3BReport;
