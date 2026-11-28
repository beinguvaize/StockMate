import React, { useMemo, useState } from 'react';
import { Download, AlertTriangle, FileCode2 } from 'lucide-react';
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
  const field = 'h-10 w-[170px] rounded-[10px] bg-surface px-3 text-[13.5px] tabular-nums text-ink shadow-[inset_0_0_0_1px_var(--color-line)] outline-none focus:shadow-[inset_0_0_0_2px_var(--color-ink)]';
  const lbl = 'mb-1.5 block font-tight text-[12px] font-semibold text-ink-2';
  const nParties = clients.length + suppliers.length;

  // Web redesign (approved mockups import-08 and import-09): dates, the count,
  // the balance check, download. Same vouchers, same file, same refusal.
  return (
    <section>
      <div className="mb-3.5 flex items-center gap-2.5">
        <div className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[11px] bg-tile text-ink-2">
          <FileCode2 size={19} strokeWidth={1.8} aria-hidden="true" />
        </div>
        <div>
          <b className="font-tight text-[15px] font-semibold text-ink">Export to Tally</b>
          <p className="text-[13px] text-body">
            Sales and purchase vouchers, plus party ledgers, as a Tally XML file. In Tally: Gateway, Import Data, Vouchers.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label><span className={lbl}>From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={field} /></label>
        <label><span className={lbl}>To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={field} /></label>
        <Button variant="secondary" onClick={() => { const f = financialYear(); setFrom(f.from); setTo(f.to); }}>
          This financial year
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-[14px] bg-tile px-[18px] py-4">
        <div>
          <small className="text-[12.5px] text-body">In this period</small>
          <b className="block font-tight text-[30px] font-semibold tabular-nums text-ink">{vouchers.length.toLocaleString('en-IN')}</b>
        </div>
        <div className="min-w-0 flex-1 text-[13px] tabular-nums text-body">
          vouchers ({nSales.toLocaleString('en-IN')} sale{nSales === 1 ? '' : 's'}, {nPurchases.toLocaleString('en-IN')} purchase{nPurchases === 1 ? '' : 's'})
          {nParties > 0 && ` · ${nParties.toLocaleString('en-IN')} party ledgers (${clients.length.toLocaleString('en-IN')} clients as Sundry Debtors, ${suppliers.length.toLocaleString('en-IN')} suppliers as Sundry Creditors)`}
        </div>
      </div>

      {unbalanced.length > 0 && (
        <div role="alert" className="mt-3.5 flex items-start gap-2.5 rounded-xl bg-bad-soft px-3.5 py-[11px] text-[12.5px] text-bad-text">
          <AlertTriangle size={16} className="mt-px shrink-0" aria-hidden="true" />
          <span>
            <b className="font-tight text-[13px] font-semibold">{unbalanced.length} voucher{unbalanced.length === 1 ? '' : 's'} would not balance</b>
            {' '}(first: {unbalanced[0].v.number}, off by {unbalanced[0].off.toFixed(2)}).
            Tally would stop part way through the import, so nothing is downloaded until this is fixed.
          </span>
        </div>
      )}

      {error && (
        <div role="alert" className="mt-3.5 flex items-start gap-2.5 rounded-xl bg-bad-soft px-3.5 py-[11px] text-[12.5px] text-bad-text">
          <AlertTriangle size={16} className="mt-px shrink-0" aria-hidden="true" /> {error}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <span className="min-w-0 flex-1 text-[12px] text-mute">Voided bills are left out. Figures are the ones each bill was raised with.</span>
        <Button onClick={download} disabled={vouchers.length === 0 || unbalanced.length > 0}>
          <Download aria-hidden="true" /> Download Tally XML
        </Button>
      </div>
    </section>
  );
};

export default TallyExportPanel;
