import React, { useMemo, useRef, useState } from 'react';
import { useTenant } from '../../context/TenantContext';
import useReportData from './useReportData';
import PremiumReportView from './PremiumReportView';
import ReportPeriodBar, { useReportPeriod } from './ReportPeriodBar';
import { Upload, ShieldCheck, AlertTriangle, FileWarning } from 'lucide-react';
import { formatINR, round2 } from '../../utils/financialCalculations';
import { parseGSTR2B, reconcile2BInvoices } from '../../utils/gstReporting';

/**
 * GSTR-2B Reconciliation
 * ----------------------
 * Upload the portal's auto-drafted GSTR-2B (JSON) and reconcile it against the
 * purchase register invoice-by-invoice (supplier GSTIN + bill number). Flags
 * ITC at risk (booked but not in 2B / values differ) and unclaimed ITC (in 2B
 * but not in books). Formal, print-oriented — no charts.
 */
const GSTR2BReconReport = () => {
  const { businessProfile } = useTenant();
  const fileRef = useRef(null);
  const [twoB, setTwoB] = useState(null);   // { byGstin, count }
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');

  // Period scoping — books should match the 2B return period being reconciled.
  const period = useReportPeriod('THIS_MONTH');
  const dateRange = { start: period.range.from, end: period.range.to };

  const { data: purchases, loading } = useReportData({ table: 'purchases', select: '*', dateColumn: 'date', filters: { dateRange } });
  const { data: suppliers } = useReportData({ table: 'suppliers', select: 'id, name, gstin' });

  // Aggregate the purchase register (books) into invoices, keyed by supplier
  // GSTIN + supplier bill number. Lines of one bill collapse into one invoice.
  const booksInvoices = useMemo(() => {
    const home = String(businessProfile?.gst_no || businessProfile?.gstin || '').slice(0, 2);
    const map = {};
    let noBill = 0;
    (purchases || []).forEach((p) => {
      const sup = (suppliers || []).find(s => s.id === p.supplier_id) || {};
      const gstin = String(sup.gstin || '').trim().toUpperCase();
      if (!gstin) return; // unregistered supplier → no ITC, skip
      const bill = String(p.bill_no || '').trim();
      if (!bill) noBill += 1;
      const key = `${gstin}|${bill || `__NOBILL_${p.id}`}`;   // no bill no → unique → never matches
      const gross = Number(p.total_amount) || 0;
      const taxable = gross / 1.18;            // register uses an 18% default split
      const tax = gross - taxable;
      const inter = gstin.slice(0, 2) !== home;
      if (!map[key]) map[key] = { gstin, inum: bill, supplierName: sup.name || p.supplier_name || '', date: p.date || '', taxable: 0, igst: 0, cgst: 0, sgst: 0, itc: 0, hasBill: !!bill };
      const r = map[key];
      r.taxable += taxable; r.itc += tax;
      if (inter) r.igst += tax; else { r.cgst += tax / 2; r.sgst += tax / 2; }
    });
    const arr = Object.values(map);
    arr.forEach(r => ['taxable', 'igst', 'cgst', 'sgst', 'itc'].forEach(k => { r[k] = round2(r[k]); }));
    return { arr, noBill };
  }, [purchases, suppliers, businessProfile]);

  const recon = useMemo(
    () => twoB ? reconcile2BInvoices(booksInvoices.arr, twoB.invoices) : null,
    [booksInvoices, twoB]
  );

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name); setError('');
    try {
      const text = await f.text();
      const parsed = parseGSTR2B(text);
      if (parsed.error) { setError(parsed.error); setTwoB(null); return; }
      if (!parsed.count) { setError('No supplier invoices found in this 2B file.'); setTwoB(null); return; }
      setTwoB(parsed);
    } catch {
      setError('Could not read the file.');
    }
  };

  const statusColor = (s) =>
    s === 'MATCHED' ? 'text-emerald-700'
    : s === 'MISMATCH' ? 'text-rose-600'
    : s === 'MISSING IN 2B' ? 'text-accent-signature-hover'
    : 'text-sky-700';

  const tab = recon ? {
    id: 'GSTR2B_RECON',
    label: 'Invoice Reconciliation',
    icon: <ShieldCheck size={18} />,
    data: recon.rows,
    loading,
    totals: {
      booksTaxable: round2(recon.rows.reduce((a, r) => a + r.booksTaxable, 0)),
      b2bTaxable: round2(recon.rows.reduce((a, r) => a + r.b2bTaxable, 0)),
      booksItc: recon.summary.booksItc,
      b2bItc: recon.summary.b2bItc,
    },
    columns: [
      { key: 'gstin', label: 'Supplier GSTIN', width: 160,
        render: (val) => <span className="font-mono text-[10px] font-bold">{val}</span> },
      { key: 'supplier', label: 'Supplier', width: 170,
        render: (val) => <span className="text-[11px] font-bold text-gray-600">{val}</span> },
      { key: 'inum', label: 'Bill / Inv No', width: 130,
        render: (val) => <span className="font-mono text-[10px] font-bold text-gray-700">{val}</span> },
      { key: 'booksTaxable', label: 'Taxable (Books)', type: 'currency', align: 'right', width: 150, render: (v) => <span className="tabular-nums">{formatINR(v)}</span> },
      { key: 'b2bTaxable', label: 'Taxable (2B)', type: 'currency', align: 'right', width: 150, render: (v) => <span className="tabular-nums">{formatINR(v)}</span> },
      { key: 'booksItc', label: 'ITC (Books)', type: 'currency', align: 'right', width: 140, render: (v) => <span className="tabular-nums font-bold">{formatINR(v)}</span> },
      { key: 'b2bItc', label: 'ITC (2B)', type: 'currency', align: 'right', width: 140, render: (v) => <span className="tabular-nums font-bold text-emerald-700">{formatINR(v)}</span> },
      { key: 'diff', label: 'Diff', type: 'currency', align: 'right', width: 130, render: (v) => <span className={`tabular-nums font-semibold ${Math.abs(v) < 1 ? 'text-muted-foreground' : 'text-rose-600'}`}>{v < 0 ? `(${formatINR(Math.abs(v))})` : formatINR(v)}</span> },
      { key: 'status', label: 'Status', align: 'center', width: 150, render: (v) => <span className={`font-semibold text-[10px] uppercase tracking-widest ${statusColor(v)}`}>{v}</span> },
    ],
  } : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Period selector — matches the P&L / accounting reports */}
      <ReportPeriodBar {...period} />

      {/* Upload bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl border border-border/60 shadow-sm bg-white">
        <div className="flex-1">
          <div className="text-sm font-semibold text-foreground">GSTR-2B Reconciliation</div>
          <div className="text-[11px] text-muted-foreground font-medium mt-0.5">
            Upload the GSTR-2B JSON downloaded from the GST portal (Returns → GSTR-2B → Download JSON).
            {fileName && <span className="text-emerald-600 font-bold"> · {fileName}</span>}
          </div>
        </div>
        <input ref={fileRef} type="file" accept=".json,application/json" onChange={onFile} className="hidden" />
        <button onClick={() => fileRef.current?.click()}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-ink-primary text-white text-[11px] font-semibold hover:opacity-90 transition-colors">
          <Upload size={14} /> Upload GSTR-2B JSON
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-[12px] font-semibold">
          <FileWarning size={16} /> {error}
        </div>
      )}

      {recon && (
        <>
          {/* Summary band */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-black/[0.07] rounded-2xl overflow-hidden border border-border/60">
            {[
              { label: 'Matched', val: recon.summary.matched, sub: 'invoices', cls: 'text-emerald-600' },
              { label: 'Mismatch', val: recon.summary.mismatch, sub: 'review', cls: 'text-rose-600' },
              { label: 'Missing in 2B', val: recon.summary.missingIn2B, sub: 'ITC at risk', cls: 'text-accent-signature' },
              { label: 'Missing in Books', val: recon.summary.missingInBooks, sub: 'unclaimed', cls: 'text-sky-600' },
              { label: 'ITC at Risk', val: formatINR(recon.summary.atRiskItc), sub: 'follow up', cls: 'text-rose-600', money: true },
            ].map((c, i) => (
              <div key={i} className="bg-white px-4 py-3">
                <div className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">{c.label}</div>
                <div className={`text-lg font-semibold mt-0.5 ${c.cls}`}>{c.val}</div>
                <div className="text-[9px] font-bold text-muted-foreground">{c.sub}</div>
              </div>
            ))}
          </div>

          {recon.summary.missingIn2B + recon.summary.mismatch > 0 && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-accent-signature/10 border border-accent-signature/15 text-accent-signature-hover text-[12px] font-semibold">
              <AlertTriangle size={16} /> {formatINR(recon.summary.atRiskItc)} of ITC may not be claimable yet — these invoices aren't in 2B or their values differ. Follow up before claiming.
            </div>
          )}

          {booksInvoices.noBill > 0 && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-sky-50 border border-sky-100 text-sky-800 text-[12px] font-semibold">
              <FileWarning size={16} /> {booksInvoices.noBill} purchase{booksInvoices.noBill > 1 ? 's have' : ' has'} no bill number — can't invoice-match (shown as "Missing in 2B"). Add the supplier bill no on the purchase to match.
            </div>
          )}

          <PremiumReportView title="GSTR-2B Reconciliation" tabs={[tab]} />
        </>
      )}

      {!recon && !error && (
        <div className="text-center py-16 text-muted-foreground">
          <ShieldCheck size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm font-bold">Upload your GSTR-2B JSON to reconcile it against your purchase register.</p>
          <p className="text-[11px] mt-1">Matched invoice-by-invoice on supplier GSTIN + bill number.</p>
        </div>
      )}
    </div>
  );
};

export default GSTR2BReconReport;
