import React, { useMemo, useRef, useState } from 'react';
import { useTenant } from '../../context/TenantContext';
import useReportData from './useReportData';
import PremiumReportView from './PremiumReportView';
import { Upload, ShieldCheck, AlertTriangle, FileWarning } from 'lucide-react';
import { formatINR, round2 } from '../../utils/financialCalculations';
import { parseGSTR2B, reconcile2B } from '../../utils/gstReporting';

/**
 * GSTR-2B Reconciliation
 * ----------------------
 * Upload the portal's auto-drafted GSTR-2B (JSON) and reconcile it against the
 * purchase register at supplier (GSTIN) level. Flags ITC at risk (booked but
 * supplier hasn't filed) and unclaimed ITC (in 2B but not in books).
 * Invoice-level match is a future step (needs a supplier bill-number on
 * purchases). Formal, print-oriented — no charts.
 */
const GSTR2BReconReport = () => {
  const { businessProfile } = useTenant();
  const fileRef = useRef(null);
  const [twoB, setTwoB] = useState(null);   // { byGstin, count }
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');

  const { data: purchases, loading } = useReportData({ table: 'purchases', select: '*', dateColumn: 'date' });
  const { data: suppliers } = useReportData({ table: 'suppliers', select: 'id, name, gstin' });

  // Aggregate the purchase register (books) by supplier GSTIN.
  const booksByGstin = useMemo(() => {
    const home = String(businessProfile?.gst_no || businessProfile?.gstin || '').slice(0, 2);
    const map = {};
    (purchases || []).forEach((p) => {
      const sup = (suppliers || []).find(s => s.id === p.supplier_id) || {};
      const gstin = String(sup.gstin || '').trim().toUpperCase();
      if (!gstin) return; // unregistered supplier → no ITC, skip
      const gross = Number(p.total_amount) || 0;
      const taxable = gross / 1.18;            // register uses an 18% default split
      const tax = gross - taxable;
      const inter = gstin.slice(0, 2) !== home;
      if (!map[gstin]) map[gstin] = { gstin, supplierName: sup.name || p.supplier_name || '', taxable: 0, igst: 0, cgst: 0, sgst: 0 };
      map[gstin].taxable += taxable;
      if (inter) map[gstin].igst += tax; else { map[gstin].cgst += tax / 2; map[gstin].sgst += tax / 2; }
    });
    Object.values(map).forEach(r => ['taxable', 'igst', 'cgst', 'sgst'].forEach(k => { r[k] = round2(r[k]); }));
    return map;
  }, [purchases, suppliers, businessProfile]);

  const recon = useMemo(
    () => twoB ? reconcile2B(booksByGstin, twoB.byGstin) : null,
    [booksByGstin, twoB]
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
    : s === 'MISSING IN 2B' ? 'text-amber-700'
    : 'text-sky-700';

  const tab = recon ? {
    id: 'GSTR2B_RECON',
    label: 'Supplier Reconciliation',
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
      { key: 'gstin', label: 'Supplier GSTIN', width: 170,
        render: (val) => <span className="font-mono text-[10px] font-bold">{val}</span> },
      { key: 'supplier', label: 'Supplier', width: 200,
        render: (val) => <span className="text-[11px] font-bold text-gray-600">{val}</span> },
      { key: 'booksTaxable', label: 'Taxable (Books)', type: 'currency', align: 'right', width: 150, render: (v) => <span className="tabular-nums">{formatINR(v)}</span> },
      { key: 'b2bTaxable', label: 'Taxable (2B)', type: 'currency', align: 'right', width: 150, render: (v) => <span className="tabular-nums">{formatINR(v)}</span> },
      { key: 'booksItc', label: 'ITC (Books)', type: 'currency', align: 'right', width: 140, render: (v) => <span className="tabular-nums font-bold">{formatINR(v)}</span> },
      { key: 'b2bItc', label: 'ITC (2B)', type: 'currency', align: 'right', width: 140, render: (v) => <span className="tabular-nums font-bold text-emerald-700">{formatINR(v)}</span> },
      { key: 'diff', label: 'Diff', type: 'currency', align: 'right', width: 130, render: (v) => <span className={`tabular-nums font-black ${Math.abs(v) < 1 ? 'text-gray-400' : 'text-rose-600'}`}>{v < 0 ? `(${formatINR(Math.abs(v))})` : formatINR(v)}</span> },
      { key: 'status', label: 'Status', align: 'center', width: 150, render: (v) => <span className={`font-black text-[10px] uppercase tracking-widest ${statusColor(v)}`}>{v}</span> },
    ],
  } : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Upload bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl border border-black/5 shadow-sm bg-white">
        <div className="flex-1">
          <div className="text-sm font-black text-ink-primary">GSTR-2B Reconciliation</div>
          <div className="text-[11px] text-gray-500 font-medium mt-0.5">
            Upload the GSTR-2B JSON downloaded from the GST portal (Returns → GSTR-2B → Download JSON).
            {fileName && <span className="text-emerald-600 font-bold"> · {fileName}</span>}
          </div>
        </div>
        <input ref={fileRef} type="file" accept=".json,application/json" onChange={onFile} className="hidden" />
        <button onClick={() => fileRef.current?.click()}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-ink-primary text-white text-[11px] font-black hover:opacity-90 transition-colors">
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
          <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-black/[0.07] rounded-2xl overflow-hidden border border-black/[0.07]">
            {[
              { label: 'Matched', val: recon.summary.matched, sub: 'suppliers', cls: 'text-emerald-600' },
              { label: 'Mismatch', val: recon.summary.mismatch, sub: 'review', cls: 'text-rose-600' },
              { label: 'Missing in 2B', val: recon.summary.missingIn2B, sub: 'ITC at risk', cls: 'text-amber-600' },
              { label: 'Missing in Books', val: recon.summary.missingInBooks, sub: 'unclaimed', cls: 'text-sky-600' },
              { label: 'ITC at Risk', val: formatINR(recon.summary.atRiskItc), sub: 'follow up', cls: 'text-rose-600', money: true },
            ].map((c, i) => (
              <div key={i} className="bg-white px-4 py-3">
                <div className="text-[9px] font-black uppercase tracking-widest text-gray-400">{c.label}</div>
                <div className={`text-lg font-black mt-0.5 ${c.cls}`}>{c.val}</div>
                <div className="text-[9px] font-bold text-gray-400">{c.sub}</div>
              </div>
            ))}
          </div>

          {recon.summary.missingIn2B + recon.summary.mismatch > 0 && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-100 text-amber-800 text-[12px] font-semibold">
              <AlertTriangle size={16} /> {formatINR(recon.summary.atRiskItc)} of ITC may not be claimable yet — these suppliers haven't filed or their values differ. Follow up before claiming.
            </div>
          )}

          <PremiumReportView title="GSTR-2B Reconciliation" tabs={[tab]} />
        </>
      )}

      {!recon && !error && (
        <div className="text-center py-16 text-gray-400">
          <ShieldCheck size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm font-bold">Upload your GSTR-2B JSON to reconcile it against your purchase register.</p>
          <p className="text-[11px] mt-1">Matched at supplier (GSTIN) level. Invoice-level match coming once bill numbers are captured on purchases.</p>
        </div>
      )}
    </div>
  );
};

export default GSTR2BReconReport;
