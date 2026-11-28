import React, { useMemo, useRef, useState } from 'react';
import { useTenant } from '../../context/TenantContext';
import useReportData from './useReportData';
import PremiumReportView from './PremiumReportView';
import ReportPeriodBar, { useReportPeriod } from './ReportPeriodBar';
import { ReportButton, Banner, ErrorBlock, ReportBox, EmptyBlock } from './frame';
import { Eyebrow } from '../ui/FigureStrip';
import { loadError } from '../../lib/reportsView';
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

  const { data: purchases, loading, error: purchErr, refetch: refetchPurch } = useReportData({ table: 'purchases', select: '*', dateColumn: 'date', filters: { dateRange } });
  const { data: suppliers, error: supErr, refetch: refetchSup } = useReportData({ table: 'suppliers', select: 'id, name, gstin' });
  const booksError = loadError(purchErr, supErr);

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
    s === 'MATCHED' ? 'text-good-text'
    : s === 'MISMATCH' ? 'text-bad-text'
    : s === 'MISSING IN 2B' ? 'text-amber-text'
    : 'text-info-text';

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
        render: (val) => <span className="tabular-nums text-[11.5px] font-semibold">{val}</span> },
      { key: 'supplier', label: 'Supplier', width: 170,
        render: (val) => <span className="text-[12px] font-semibold text-ink-2">{val}</span> },
      { key: 'inum', label: 'Bill / Inv No', width: 130,
        render: (val) => <span className="tabular-nums text-[11.5px] font-semibold text-ink-2">{val}</span> },
      { key: 'booksTaxable', label: 'Taxable (Books)', type: 'currency', align: 'right', width: 150, render: (v) => <span className="tabular-nums">{formatINR(v)}</span> },
      { key: 'b2bTaxable', label: 'Taxable (2B)', type: 'currency', align: 'right', width: 150, render: (v) => <span className="tabular-nums">{formatINR(v)}</span> },
      { key: 'booksItc', label: 'ITC (Books)', type: 'currency', align: 'right', width: 140, render: (v) => <span className="tabular-nums font-semibold">{formatINR(v)}</span> },
      { key: 'b2bItc', label: 'ITC (2B)', type: 'currency', align: 'right', width: 140, render: (v) => <span className="tabular-nums font-semibold text-good-text">{formatINR(v)}</span> },
      { key: 'diff', label: 'Diff', type: 'currency', align: 'right', width: 130, render: (v) => <span className={`tabular-nums font-semibold ${Math.abs(v) < 1 ? 'text-body' : 'text-bad-text'}`}>{v < 0 ? `(${formatINR(Math.abs(v))})` : formatINR(v)}</span> },
      { key: 'status', label: 'Status', align: 'center', width: 150, render: (v) => <span className={`font-semibold text-[11.5px] uppercase tracking-[0.07em] ${statusColor(v)}`}>{v}</span> },
    ],
  } : null;

  const sum = recon?.summary;
  return (
    <div className="pb-4">
      <ReportPeriodBar {...period} />

      {/* Upload bar (reports-26) */}
      <div className="mb-4 flex flex-col gap-3 rounded-[14px] border border-line bg-surface px-4 py-3.5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <b className="block font-tight text-[14.5px] font-semibold text-ink">GSTR-2B Reconciliation</b>
          <small className="text-[12.5px] text-body">
            Upload the GSTR-2B JSON downloaded from the GST portal (Returns → GSTR-2B → Download JSON).
            {fileName && <b className="font-semibold text-good-text"> · {fileName}</b>}
          </small>
        </div>
        <input ref={fileRef} type="file" accept=".json,application/json" onChange={onFile} className="hidden" />
        <ReportButton tone="dark" icon={Upload} onClick={() => fileRef.current?.click()}>Upload GSTR-2B JSON</ReportButton>
      </div>

      {error && <Banner tone="bad" icon={FileWarning} role="alert">{error}</Banner>}

      {booksError && (
        <ErrorBlock title="Your purchase register could not load" message={booksError}
          hint="Nothing is matched until your own bills load. Try again in a moment."
          onRetry={() => { refetchPurch(); refetchSup(); }} />
      )}

      {recon && !booksError && (
        <>
          {/* Summary band (reports-27) */}
          <div className="mb-3.5 grid grid-cols-2 overflow-hidden rounded-[14px] border border-line md:grid-cols-5">
            {[
              { label: 'Matched', val: sum.matched, sub: 'invoices', cls: 'text-good-text' },
              { label: 'Mismatch', val: sum.mismatch, sub: 'review', cls: 'text-bad-text' },
              { label: 'Missing in 2B', val: sum.missingIn2B, sub: 'ITC at risk', cls: 'text-amber-text' },
              { label: 'Missing in Books', val: sum.missingInBooks, sub: 'unclaimed', cls: 'text-info-text' },
              { label: 'ITC at Risk', val: formatINR(sum.atRiskItc), sub: 'follow up', cls: 'text-bad-text' },
            ].map((c, i) => (
              <div key={i} className="border-l border-line px-4 py-3 first:border-l-0">
                <Eyebrow className="text-[10.5px]">{c.label}</Eyebrow>
                <b className={`my-[3px] block font-tight text-[20px] font-semibold tabular-nums ${c.cls}`}>{c.val}</b>
                <span className="text-[12px] text-mute">{c.sub}</span>
              </div>
            ))}
          </div>

          {sum.missingIn2B + sum.mismatch > 0 && (
            <Banner tone="amber" icon={AlertTriangle}>
              {formatINR(sum.atRiskItc)} of ITC may not be claimable yet — these invoices aren't in 2B or their values differ. Follow up before claiming.
            </Banner>
          )}

          {booksInvoices.noBill > 0 && (
            <Banner tone="info" icon={FileWarning}>
              {booksInvoices.noBill} purchase{booksInvoices.noBill > 1 ? 's have' : ' has'} no bill number — can't invoice-match (shown as "Missing in 2B"). Add the supplier bill no on the purchase to match.
            </Banner>
          )}

          <PremiumReportView title="GSTR-2B Reconciliation" tabs={[tab]} />
        </>
      )}

      {!recon && !error && !booksError && (
        <ReportBox>
          <EmptyBlock icon={ShieldCheck}
            title="Upload your GSTR-2B JSON to reconcile it against your purchase register."
            text="Matched invoice-by-invoice on supplier GSTIN + bill number." />
        </ReportBox>
      )}
    </div>
  );
};

export default GSTR2BReconReport;
