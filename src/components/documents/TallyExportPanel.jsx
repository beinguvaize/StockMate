import React, { useMemo, useState } from 'react';
import { Download, AlertTriangle, FileCode2 } from 'lucide-react';
import {
  buildSaleVoucher, buildPurchaseVoucher, buildTallyXml, tallyFileName, voucherImbalance,
} from '../../lib/tallyExport';

/**
 * The year, in a file the accountant's Tally will import.
 *
 * Every March the shop is asked for its books in Tally and the answer has been
 * "export a CSV and retype it". Tally imports XML directly, so this writes it.
 *
 * The date window is the Indian financial year by default, because that is the
 * only period anybody ever asks for -- 1 April to 31 March.
 *
 * NOTHING IS WRITTEN IF A SINGLE VOUCHER DOES NOT BALANCE. Tally rejects an
 * unbalanced voucher at the point it reaches it, part way through an import,
 * leaving half a year in the accountant's company file for somebody to unpick
 * by hand. buildTallyXml throws instead, and this panel shows which voucher
 * and by how much.
 */

/** 1 April of the financial year containing `d`, through 31 March after it. */
export function financialYear(d = new Date()) {
  const y = d.getFullYear();
  const startYear = d.getMonth() >= 3 ? y : y - 1;     // April is month 3
  return { from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` };
}

const inWindow = (date, from, to) => {
  const d = String(date || '').slice(0, 10);
  return !!d && d >= from && d <= to;
};

const TallyExportPanel = ({ sales = [], purchases = [], clients = [], suppliers = [], shopName = 'shop' }) => {
  const fy = financialYear();
  const [from, setFrom] = useState(fy.from);
  const [to, setTo] = useState(fy.to);
  const [error, setError] = useState('');

  const partyName = (id, list) => list.find((c) => c.id === id)?.name || '';

  const vouchers = useMemo(() => {
    const out = [];
    for (const s of sales) {
      if (s?.deleted_at || s?.voided_at) continue;      // a voided bill is not a voucher
      if (!inWindow(s.date, from, to)) continue;
      out.push(buildSaleVoucher({
        id: s.invoice_number || s.id,
        number: s.invoice_number || s.id,
        date: s.date,
        partyName: s.customerInfo?.name || partyName(s.shopId, clients),
        // The figures the bill was raised with, never recomputed here: the
        // file has to agree with the invoice the customer holds.
        taxable: Number(s.subtotal ?? 0) || (Number(s.totalAmount || 0) - Number(s.tax || 0)),
        cgst: Number(s.cgst_amount ?? (s.place_of_supply_interstate ? 0 : (Number(s.tax || 0) / 2))) || 0,
        sgst: Number(s.sgst_amount ?? (s.place_of_supply_interstate ? 0 : (Number(s.tax || 0) / 2))) || 0,
        igst: Number(s.igst_amount ?? (s.place_of_supply_interstate ? Number(s.tax || 0) : 0)) || 0,
        roundOff: Number(s.round_off || 0),
        narration: s.note || '',
      }));
    }
    for (const p of purchases) {
      if (p?.deleted_at) continue;
      if (!inWindow(p.date, from, to)) continue;
      const tax = Number(p.tax_amount || p.tax || 0);
      out.push(buildPurchaseVoucher({
        id: p.bill_no || p.id,
        number: p.bill_no || p.id,
        date: p.date,
        partyName: p.supplier_name || partyName(p.supplier_id, suppliers),
        taxable: Number(p.taxable_amount ?? ((Number(p.total_amount || 0)) - tax)),
        cgst: Number(p.cgst_amount ?? (tax / 2)) || 0,
        sgst: Number(p.sgst_amount ?? (tax / 2)) || 0,
        igst: Number(p.igst_amount || 0),
      }));
    }
    return out;
  }, [sales, purchases, clients, suppliers, from, to]);

  const unbalanced = useMemo(
    () => vouchers.map((v) => ({ v, off: voucherImbalance(v) })).filter(({ off }) => off !== 0),
    [vouchers],
  );

  const download = () => {
    setError('');
    try {
      const parties = [
        ...clients.map((c) => ({ ...c, group: 'Sundry Debtors' })),
        ...suppliers.map((s) => ({ ...s, group: 'Sundry Creditors' })),
      ].filter((p) => p?.name);

      const xml = buildTallyXml({ vouchers, parties });
      const blob = new Blob([xml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = tallyFileName(shopName, from, to);
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || String(err));
    }
  };

  const field = 'bg-white border border-border rounded-xl px-3 h-10 text-[13px] tabular-nums outline-none focus:ring-2 focus:ring-accent-signature/20';

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start gap-3">
        <FileCode2 size={18} className="mt-0.5 text-accent-text shrink-0" />
        <div>
          <p className="font-bold text-[15px]">Export to Tally</p>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Sales and purchase vouchers, plus party ledgers, as a Tally XML file.
            In Tally: <span className="font-semibold">Gateway → Import Data → Vouchers</span>.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={field} />
        </label>
        <button
          type="button"
          onClick={() => { const f = financialYear(); setFrom(f.from); setTo(f.to); }}
          className="h-10 px-4 rounded-pill border border-border text-[13px] font-semibold text-muted-foreground hover:text-foreground"
        >
          This financial year
        </button>
      </div>

      <div className="text-[13px] text-muted-foreground">
        {vouchers.length.toLocaleString('en-IN')} vouchers in this period
        {clients.length + suppliers.length > 0
          && ` · ${(clients.length + suppliers.length).toLocaleString('en-IN')} party ledgers`}
      </div>

      {unbalanced.length > 0 && (
        <div className="flex items-start gap-2 text-[13px] text-rose-600">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            {unbalanced.length} voucher{unbalanced.length === 1 ? '' : 's'} would not balance
            (first: {unbalanced[0].v.number}, off by {unbalanced[0].off.toFixed(2)}).
            Tally would refuse {unbalanced.length === 1 ? 'it' : 'them'} part way through the import,
            so nothing is written until this is fixed.
          </span>
        </div>
      )}

      {error && (
        <p className="text-[13px] text-rose-600 flex items-start gap-2">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}

      <button
        type="button"
        onClick={download}
        disabled={vouchers.length === 0 || unbalanced.length > 0}
        className="inline-flex items-center gap-2 px-5 h-11 rounded-pill bg-accent-signature hover:bg-accent-signature-hover text-white
                   text-[14px] font-bold disabled:opacity-40 disabled:pointer-events-none
                   transition-[background-color,transform] duration-150 active:scale-[0.97]"
      >
        <Download size={16} /> Download Tally XML
      </button>
    </div>
  );
};

export default TallyExportPanel;
