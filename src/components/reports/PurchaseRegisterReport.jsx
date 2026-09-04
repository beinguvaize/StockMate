import React, { useMemo } from 'react';
import useReportData from './useReportData';
import PremiumReportView from './PremiumReportView';
import ReportPeriodBar, { useReportPeriod } from './ReportPeriodBar';
import { Download, Building2 } from 'lucide-react';
import { useTenant } from '../../context/TenantContext';
import { round2 } from '../../utils/financialCalculations';
import { isInterstate } from '../../utils/gstReporting';

// GST Purchase Register — inward supplies for ITC review.
// Bill-level register with supplier GSTIN and a derived tax split
// (purchases store gross totals; tax is backed out from the stored
// tax_rate when present, default 18%). Exportable as Excel for the CA.

const monthStart = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};
const today = () => new Date().toISOString().slice(0, 10);

const PurchaseRegisterReport = () => {
  const { businessProfile } = useTenant();
  const businessState = businessProfile?.state || '';
  const period = useReportPeriod('THIS_MONTH');
  const range = { start: period.range.from, end: period.range.to };
  const filters = useMemo(() => ({ dateRange: range }), [range.start, range.end]);

  const { data: purchases, loading } = useReportData({
    table: 'purchases', select: '*', dateColumn: 'date', filters,
  });
  const { data: suppliers } = useReportData({
    table: 'suppliers', select: 'id, name, gstin, address',
  });

  const rows = useMemo(() => purchases.map(p => {
    const sup = suppliers.find(s => s.id === p.supplier_id) || {};
    const gross = Number(p.total_amount || 0);
    const taxRate = Number(p.tax_rate ?? p.taxRate ?? 18);
    const taxable = gross / (1 + taxRate / 100);
    const tax = gross - taxable;
    const inter = sup.gstin ? String(sup.gstin).slice(0, 2) !== String(businessProfile?.gst_no || '').slice(0, 2)
      : isInterstate(businessState, sup.state || '');
    return {
      ...p,
      _supplier: p.supplier_name || sup.name || 'Direct',
      _gstin: sup.gstin || '—',
      _taxable: round2(taxable),
      _taxRate: taxRate,
      _cgst: inter ? 0 : round2(tax / 2),
      _sgst: inter ? 0 : round2(tax / 2),
      _igst: inter ? round2(tax) : 0,
      _gross: round2(gross),
    };
  }), [purchases, suppliers, businessState, businessProfile?.gst_no]);

  const totals = useMemo(() => rows.reduce((t, r) => ({
    taxable: t.taxable + r._taxable, cgst: t.cgst + r._cgst,
    sgst: t.sgst + r._sgst, igst: t.igst + r._igst, gross: t.gross + r._gross,
  }), { taxable: 0, cgst: 0, sgst: 0, igst: 0, gross: 0 }), [rows]);

  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const aoa = [
      ['GST Purchase Register (Inward Supplies)'],
      ['Business', businessProfile?.name || '', 'GSTIN', businessProfile?.gst_no || ''],
      ['Period', `${range.start} to ${range.end}`],
      [],
      ['Date', 'Bill / Ref', 'Supplier', 'Supplier GSTIN', 'Taxable Value', 'Rate %', 'CGST', 'SGST', 'IGST', 'Invoice Value'],
      ...rows.map(r => [r.date, r.id, r._supplier, r._gstin, r._taxable, r._taxRate, r._cgst, r._sgst, r._igst, r._gross]),
      [],
      ['TOTAL', '', '', '', round2(totals.taxable), '', round2(totals.cgst), round2(totals.sgst), round2(totals.igst), round2(totals.gross)],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 24 }, { wch: 18 }, { wch: 14 }, { wch: 8 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Purchase Register');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `Purchase_Register_${range.start}_${range.end}.xlsx`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  const tab = {
    id: 'register',
    label: 'Purchase Register',
    kpis: [
      { id: 'gross', label: 'Invoice Value', value: totals.gross, format: 'currency' },
      { id: 'taxable', label: 'Taxable Value', value: totals.taxable, format: 'currency' },
      { id: 'itc', label: 'Tax (ITC candidate)', value: totals.cgst + totals.sgst + totals.igst, format: 'currency' },
      { id: 'bills', label: 'Bills', value: rows.length, format: 'number' },
    ],
    columns: [
      { key: 'date', label: 'Date', type: 'date', sortable: true, width: 110 },
      {
        key: '_supplier', label: 'Supplier', sortable: true, width: 200,
        render: (val) => (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
              <Building2 size={10} className="text-blue-500" />
            </div>
            <span className="font-semibold text-foreground">{val}</span>
          </div>
        ),
      },
      { key: '_gstin', label: 'GSTIN', width: 160, render: v => <span className="tabular-nums text-[11px]">{v}</span> },
      { key: '_taxable', label: 'Taxable', type: 'currency', align: 'right', sortable: true },
      { key: '_taxRate', label: 'Rate %', align: 'right', width: 70 },
      { key: '_cgst', label: 'CGST', type: 'currency', align: 'right' },
      { key: '_sgst', label: 'SGST', type: 'currency', align: 'right' },
      { key: '_igst', label: 'IGST', type: 'currency', align: 'right' },
      { key: '_gross', label: 'Invoice Value', type: 'currency', align: 'right', sortable: true },
    ],
    data: rows,
    loading,
  };

  return (
    <>
      <div className="no-print flex flex-wrap items-center gap-2 mb-3">
        <ReportPeriodBar {...period} />
        <button onClick={exportExcel}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent-signature hover:bg-accent-signature-hover text-white text-[11px] font-semibold transition-colors">
          <Download size={13} /> Excel for CA
        </button>
      </div>
      <p className="no-print text-[11px] text-muted-foreground mb-2 text-right">
        Tax split derived from bill totals (rate-backed-out). Verify against supplier invoices before claiming ITC.
      </p>
      <PremiumReportView title="GST Purchase Register" subtitle={`${range.start} → ${range.end}`} tabs={[tab]} />
    </>
  );
};

export default PurchaseRegisterReport;
