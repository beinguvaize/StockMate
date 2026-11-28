import React, { useMemo, useState } from 'react';
import { Download, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/button';
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

  const nSales = vouchers.filter((v) => v.type === 'Sales').length;
  const nPurchases = vouchers.length - nSales;
  const field = 'h-9 w-full rounded-[10px] bg-surface px-3 text-[13.5px] tabular-nums text-ink shadow-[inset_0_0_0_1px_var(--color-line)] outline-none focus:shadow-[inset_0_0_0_2px_var(--color-ink)]';
  const eyebrow = 'mb-1 block font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute';

  // Web redesign (approved settings-14): one card, dates, the count, download.
  return (
    <section className="overflow-hidden rounded-[14px] border border-line bg-surface">
      <div className="border-b border-sep px-5 pb-3.5 pt-4">
        <h4 className="font-tight text-[15px] font-semibold text-ink">Export to Tally</h4>
        <p className="mt-0.5 text-[13px] text-body">
          Sales and purchase vouchers, with clients and suppliers as ledgers, as a Tally XML file.
          In Tally: Gateway, Import Data, Vouchers.
        </p>
      </div>
      <div className="space-y-3.5 px-5 py-4">
        <div className="grid max-w-[520px] grid-cols-2 gap-2.5">
          <label><span className={eyebrow}>From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={field} /></label>
          <label><span className={eyebrow}>To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={field} /></label>
        </div>
        <button type="button" onClick={() => { const f = financialYear(); setFrom(f.from); setTo(f.to); }}
          className="font-tight text-[13px] font-semibold text-amber-text underline-offset-4 hover:underline">
          This financial year
        </button>

        <div className="rounded-xl bg-tile px-3.5 py-[11px] text-[13px] tabular-nums text-body shadow-[inset_0_0_0_1px_var(--color-line)]">
          {nSales.toLocaleString('en-IN')} sale{nSales === 1 ? '' : 's'} and {nPurchases.toLocaleString('en-IN')} purchase{nPurchases === 1 ? '' : 's'} fall in these dates
          {clients.length + suppliers.length > 0
            && ` · ${(clients.length + suppliers.length).toLocaleString('en-IN')} party ledgers`}.
        </div>

        {unbalanced.length > 0 && (
          <div role="alert" className="flex items-start gap-2 rounded-xl bg-bad-soft px-3.5 py-[11px] text-[13px] text-bad-text">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              {unbalanced.length} voucher{unbalanced.length === 1 ? '' : 's'} would not balance
              (first: {unbalanced[0].v.number}, off by {unbalanced[0].off.toFixed(2)}).
              Tally would refuse {unbalanced.length === 1 ? 'it' : 'them'} part way through the import,
              so nothing is written until this is fixed.
            </span>
          </div>
        )}

        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-xl bg-bad-soft px-3.5 py-[11px] text-[13px] text-bad-text">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" /> {error}
          </div>
        )}
      </div>
      <div className="flex justify-end border-t border-sep bg-tile px-5 py-3">
        <Button onClick={download} disabled={vouchers.length === 0 || unbalanced.length > 0}>
          <Download aria-hidden="true" /> Download Tally file
        </Button>
      </div>
    </section>
  );
};

export default TallyExportPanel;
