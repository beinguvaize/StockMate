import React, { useMemo, useState } from 'react';
import { Plus, Trash2, ScanLine, Search } from 'lucide-react';
import Dialog from '../ui/Dialog';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

// Shared building blocks for the document builder (PartyPicker, DocItemGrid,
// TotalsPanel). Extracted from CreateDocument so the same parts can power
// other builders later. All presentational — state stays with the parent.
//
// Web redesign (approved invoices-08 to 11): same props, same behaviour, the
// phone app's look.

export const inr = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const Eyebrow = ({ children, className }) => (
  <span className={cn('block font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute', className)}>{children}</span>
);

const fieldCls = 'h-9 w-full rounded-[10px] bg-surface px-3 text-[13.5px] text-ink shadow-[inset_0_0_0_1px_var(--color-line)] outline-none placeholder:text-mute focus:shadow-[inset_0_0_0_2px_var(--color-ink)]';

export const Field = ({ label, value, mono, muted }) => (
  <div>
    <Eyebrow>{label}</Eyebrow>
    <b className={cn('mt-[3px] block font-tight text-[13.5px] font-semibold', muted ? 'text-mute' : 'text-ink', mono && 'tabular-nums')}>{value}</b>
  </div>
);

export const Row = ({ label, value, muted, tone }) => (
  <div className="flex items-center justify-between py-1 text-[13px] text-body">
    <span>{label}</span>
    <span className={cn('font-tight font-medium tabular-nums', tone || (muted ? 'text-mute' : 'text-ink-2'))}>{value}</span>
  </div>
);

const initials = (name = '') => String(name).trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';

export const PartyPicker = ({ label, party, clients = [], onChange, manual = false }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? clients.filter(c => `${c.name || ''} ${c.gstin || ''} ${c.phone || ''}`.toLowerCase().includes(s)) : clients;
  }, [clients, q]);
  return (
    <div className="rounded-[14px] border border-line bg-surface px-5 py-[18px]">
      <Eyebrow>{label}</Eyebrow>
      {manual && (
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <input value={party?.name || ''} placeholder="Customer name" aria-label="Customer name"
            onChange={(e) => onChange({ ...(party || {}), name: e.target.value, manual: true })}
            className={cn(fieldCls, 'col-span-2 font-semibold')} />
          <input value={party?.gstin || ''} placeholder="GSTIN (optional)" aria-label="GSTIN"
            onChange={(e) => onChange({ ...(party || {}), gstin: e.target.value.toUpperCase(), manual: true })}
            className={cn(fieldCls, 'tabular-nums')} />
          <input value={party?.state || ''} placeholder="State or place of supply" aria-label="State or place of supply"
            onChange={(e) => onChange({ ...(party || {}), state: e.target.value, manual: true })}
            className={fieldCls} />
          <button type="button" onClick={() => setOpen((v) => !v)}
            className="col-span-2 text-left font-tight text-[12.5px] font-semibold text-amber-text hover:underline underline-offset-4">
            {open ? 'Hide clients' : 'Pick an existing client instead'}
          </button>
        </div>
      )}
      {!manual && (party ? (
        <div className="mt-2.5 flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-soft font-tight text-[12.5px] font-semibold text-amber-text">{initials(party.name)}</span>
          <div className="min-w-0">
            <b className="block truncate font-tight text-[15px] font-semibold text-ink">{party.name}</b>
            <small className="block truncate text-[12.5px] text-mute">{party.gstin ? `GSTIN ${party.gstin} · ` : ''}{party.state || '—'}</small>
          </div>
          <Button variant="secondary" size="xs" className="ml-auto" onClick={() => setOpen(true)}>Change</Button>
        </div>
      ) : (
        <button type="button" data-card onClick={() => setOpen(true)}
          className="m-press mt-2.5 w-full rounded-xl py-7 font-tight text-[13.5px] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile">
          <Plus size={15} className="mr-1 inline -mt-0.5" />Add party
        </button>
      ))}
      {open && (
        <Dialog open onClose={() => setOpen(false)} title="Choose a client" width={460}>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mute" size={16} />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients" aria-label="Search clients"
              className="h-10 w-full rounded-pill bg-well pl-10 pr-4 text-[13.5px] text-ink outline-none placeholder:text-mute focus:shadow-[inset_0_0_0_2px_var(--color-ink)]" />
          </div>
          <div className="max-h-[52vh] overflow-auto">
            {clients.length === 0 && <div className="py-6 text-center text-[13px] text-mute">No clients yet.</div>}
            {clients.length > 0 && list.length === 0 && <div className="py-6 text-center text-[13px] text-mute">No clients match.</div>}
            {list.map((c) => (
              <button key={c.id} type="button" data-card onClick={() => { onChange(c); setOpen(false); setQ(''); }}
                className="flex w-full items-center gap-3 rounded-lg border-t border-sep px-1 py-2.5 text-left first:border-t-0 hover:bg-tile">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-well font-tight text-[12px] font-semibold text-body">{initials(c.name)}</span>
                <span className="min-w-0">
                  <b className="block truncate font-tight text-[13.5px] font-semibold text-ink">{c.name}</b>
                  <small className="block truncate text-[12px] text-mute">{[c.gstin && `GSTIN ${c.gstin}`, c.state].filter(Boolean).join(' · ') || '—'}</small>
                </span>
              </button>
            ))}
          </div>
        </Dialog>
      )}
    </div>
  );
};

const cellCls = 'h-[30px] w-full rounded-lg bg-surface px-[9px] font-tight text-[13px] font-medium tabular-nums text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)] outline-none focus:shadow-[inset_0_0_0_2px_var(--color-ink)]';

export const DocItemGrid = ({ lines = [], products = [], gstOn = true, onAdd, onPatch, onRemove, manual = false, onAddBlank }) => {
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 50);
    return products.filter((p) => `${p.name} ${p.sku || ''}`.toLowerCase().includes(q)).slice(0, 50);
  }, [products, query]);
  const closePicker = () => { setPicker(false); setQuery(''); };

  return (
    <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="bg-tile font-tight text-[11.5px] font-semibold text-mute">
              <th className="w-7 px-2.5 py-[9px] text-left">#</th>
              <th className="px-2.5 py-[9px] text-left">Item or service</th>
              <th className="px-2.5 py-[9px] text-left">HSN or SAC</th>
              <th className="px-2.5 py-[9px] text-right">Qty</th>
              <th className="px-2.5 py-[9px] text-right">Rate</th>
              <th className="px-2.5 py-[9px] text-right">Disc %</th>
              <th className="px-2.5 py-[9px] text-right">Tax</th>
              <th className="px-2.5 py-[9px] text-right">Amount</th>
              <th className="w-9 px-2.5 py-[9px]"><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const lineAmt = (Number(l.qty) || 0) * (Number(l.rate) || 0) * (1 - (Number(l.disc) || 0) / 100);
              return (
                <tr key={l.uid} className="border-t border-sep">
                  <td className="px-2.5 py-2 text-mute">{i + 1}</td>
                  <td className="px-2.5 py-2 min-w-[160px]">
                    {manual
                      ? <input value={l.name} onChange={(e) => onPatch(l.uid, { name: e.target.value })} placeholder="Item name" aria-label={`Item ${i + 1} name`} className={cn(cellCls, 'font-semibold text-ink')} />
                      : <b className="block truncate font-tight text-[13.5px] font-semibold text-ink">{l.name}</b>}
                  </td>
                  <td className="w-[96px] px-2.5 py-2"><input value={l.hsn} onChange={(e) => onPatch(l.uid, { hsn: e.target.value.replace(/[^0-9]/g, '') })} className={cellCls} placeholder="HSN" aria-label={`Item ${i + 1} HSN`} /></td>
                  <td className="w-[70px] px-2.5 py-2"><input type="number" value={l.qty} onChange={(e) => onPatch(l.uid, { qty: e.target.value })} className={cn(cellCls, 'text-right')} aria-label={`Item ${i + 1} quantity`} /></td>
                  <td className="w-[96px] px-2.5 py-2"><input type="number" value={l.rate} onChange={(e) => onPatch(l.uid, { rate: e.target.value })} className={cn(cellCls, 'text-right')} aria-label={`Item ${i + 1} rate`} /></td>
                  <td className="w-[74px] px-2.5 py-2"><input type="number" value={l.disc} onChange={(e) => onPatch(l.uid, { disc: e.target.value })} className={cn(cellCls, 'text-right')} aria-label={`Item ${i + 1} discount percent`} /></td>
                  <td className="w-[70px] px-2.5 py-2 text-right text-mute">
                    {manual && gstOn
                      ? <input type="number" value={l.taxRate} onChange={(e) => onPatch(l.uid, { taxRate: e.target.value })} className={cn(cellCls, 'text-right')} aria-label={`Item ${i + 1} tax rate`} />
                      : (gstOn ? `${l.taxRate}%` : '—')}
                  </td>
                  <td className="px-2.5 py-2 text-right font-tight font-medium tabular-nums text-ink whitespace-nowrap">{inr(lineAmt)}</td>
                  <td className="px-2.5 py-2 text-right">
                    <button type="button" onClick={() => onRemove(l.uid)} aria-label={`Remove ${l.name || `item ${i + 1}`}`} title="Remove"
                      className="m-press grid h-7 w-7 place-items-center rounded-xl text-mute hover:bg-bad-soft hover:text-bad-text">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2 border-t border-sep p-2.5">
        <button type="button" onClick={() => (manual ? onAddBlank?.() : setPicker(true))}
          className="m-press flex h-10 flex-1 items-center justify-center gap-1.5 rounded-pill font-tight text-[13.5px] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile">
          <Plus size={15} /> Add item
        </button>
        {manual
          ? <button type="button" onClick={() => setPicker(true)} className="m-press flex h-10 items-center gap-1.5 rounded-pill px-4 font-tight text-[13.5px] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile">Pick product</button>
          : <button type="button" className="m-press flex h-10 items-center gap-1.5 rounded-pill px-4 font-tight text-[13.5px] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile"><ScanLine size={15} /> Scan</button>}
      </div>

      {picker && (
        <Dialog open onClose={closePicker} width={500} label="Add item" header={(
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mute" size={16} />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products" aria-label="Search products"
              className="h-9 w-full rounded-pill bg-well pl-10 pr-4 text-[14px] text-ink outline-none placeholder:text-mute focus:shadow-[inset_0_0_0_2px_var(--color-ink)]" />
          </div>
        )}>
          <div className="max-h-[56vh] overflow-auto">
            {filtered.map((p) => (
              <button key={p.id} type="button" data-card onClick={() => { onAdd(p); closePicker(); }}
                className="flex w-full items-center gap-3 rounded-lg border-t border-sep px-1 py-2.5 text-left first:border-t-0 hover:bg-tile">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-tile font-tight text-[12px] font-semibold text-body">{initials(p.name)}</span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate font-tight text-[13.5px] font-semibold text-ink">{p.name}</b>
                  <small className="block truncate text-[12px] text-mute">{[p.sku, p.hsn_code && `HSN ${p.hsn_code}`, `${p.taxRate || 0}% GST`].filter(Boolean).join(' · ')}</small>
                </span>
                <span className="font-tight text-[13.5px] font-semibold tabular-nums text-ink">{inr(p.sellingPrice)}</span>
              </button>
            ))}
            {filtered.length === 0 && <div className="py-6 text-center text-[13px] text-mute">No products match.</div>}
          </div>
        </Dialog>
      )}
    </div>
  );
};

const miniInput = 'h-[30px] w-[110px] rounded-lg bg-surface px-2.5 text-right font-tight text-[13px] tabular-nums text-ink shadow-[inset_0_0_0_1px_var(--color-line)] outline-none placeholder:text-mute focus:shadow-[inset_0_0_0_2px_var(--color-ink)]';

/** Two to four choices in a light pill track (Cash · Bank · UPI · Credit). */
export const Seg = ({ value, onChange, options, ariaLabel, className }) => (
  <div role="radiogroup" aria-label={ariaLabel} className={cn('inline-flex rounded-pill bg-well p-[3px]', className)}>
    {options.map(([val, label]) => (
      <button key={val} type="button" role="radio" aria-checked={value === val} onClick={() => onChange(val)}
        className={cn('m-press rounded-pill px-3 py-1 font-tight text-[12.5px] font-semibold transition-colors duration-(--dur-press)',
          value === val ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(17,20,24,0.12)]' : 'text-body hover:text-ink')}>
        {label}
      </button>
    ))}
  </div>
);

/** On/off switch, the redesign's. */
export const Switch = ({ checked, onChange, label, id }) => (
  <button id={id} type="button" role="switch" aria-checked={!!checked} aria-label={label} onClick={() => onChange(!checked)}
    className={cn('relative h-5 w-[34px] shrink-0 rounded-pill transition-colors duration-(--dur-press)', checked ? 'bg-ink' : 'bg-line')}>
    <span className={cn('absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-[0_1px_2px_rgba(17,20,24,0.25)] transition-transform duration-(--dur-press)', checked && 'translate-x-[14px]')} />
  </button>
);

/**
 * The tax-mode switch.
 *
 * Inclusive and exclusive are not a formatting choice, they change what the
 * customer pays: at 18%, a Rs 125 line is Rs 147.50 exclusive and Rs 125
 * inclusive. So the control says which one is in force on THIS document rather
 * than leaving the reader to infer it from the arithmetic.
 *
 * Rendered read-only where the server owns the answer -- see the note in
 * CreateDocument -- because a control that looks settable and is then
 * overruled on save is worse than a label.
 */
export const TaxModeToggle = ({ value = 'EXCLUSIVE', onChange, locked = false, hint }) => (
  <div className={cn('mb-1.5 flex justify-between gap-2.5 border-b border-sep pb-2.5 text-[13px] text-body', locked ? 'items-start' : 'items-center')}>
    <span>
      Prices are
      {hint && <small className="block max-w-[190px] text-[11.5px] text-mute">{hint}</small>}
    </span>
    {locked ? (
      <b className="font-tight text-[13px] font-semibold text-ink">
        {value === 'INCLUSIVE' ? 'Tax included' : value === 'NONE' ? 'No GST' : 'Tax extra'}
      </b>
    ) : (
      <Seg value={value} onChange={onChange} ariaLabel="Prices are"
        options={[['EXCLUSIVE', 'Tax extra'], ['INCLUSIVE', 'Tax included']]} />
    )}
  </div>
);

export const TotalsPanel = ({
  gst, gstOn = true, interstate = false, showPayment = false,
  markPaid, setMarkPaid, payMethod, setPayMethod,
  charges = '', setCharges, billDiscount = '', setBillDiscount,
  received = '', setReceived,
  taxMode, setTaxMode, taxModeLocked = false, taxModeHint,
  note,
}) => {
  const base = gstOn ? Number(gst.grandTotal) || 0 : Number(gst.subtotal) || 0;
  const total = Math.max(0, base + (Number(charges) || 0) - (Number(billDiscount) || 0));
  const balance = Math.max(0, total - (Number(received) || 0));
  return (
    <div className="rounded-[14px] border border-line bg-surface px-[18px] py-4">
      {gstOn && taxMode && (
        <TaxModeToggle value={taxMode} onChange={setTaxMode} locked={taxModeLocked} hint={taxModeHint} />
      )}
      <Row label="Taxable value" value={inr(gst.taxable)} />
      {gstOn && interstate ? (
        <Row label="IGST" value={inr(gst.igst)} />
      ) : gstOn ? (
        <>
          <Row label="CGST" value={inr(gst.cgst)} />
          <Row label="SGST" value={inr(gst.sgst)} />
        </>
      ) : null}
      {!!gst.roundOff && <Row label="Round off" value={inr(gst.roundOff)} muted />}
      {setCharges && (
        <label className="flex items-center justify-between py-1 text-[13px] text-body">
          <span>Additional charges</span>
          <input type="number" value={charges} onChange={(e) => setCharges(e.target.value)} placeholder="0.00" className={miniInput} />
        </label>
      )}
      {setBillDiscount && (
        <label className="flex items-center justify-between py-1 text-[13px] text-body">
          <span>Bill discount</span>
          <input type="number" value={billDiscount} onChange={(e) => setBillDiscount(e.target.value)} placeholder="0.00" className={miniInput} />
        </label>
      )}
      <div className="mt-2 flex items-baseline justify-between border-t border-line pt-2.5 font-tight font-semibold text-ink">
        <span className="text-[15px]">Total</span>
        <span className="text-[24px] tracking-[-0.02em] tabular-nums">{inr(total)}</span>
      </div>
      {note && <p className="mt-1.5 text-[12px] text-mute">{note}</p>}
      {showPayment && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2.5 border-t border-sep pt-3 font-tight text-[13.5px] font-semibold text-ink">
            <Switch id="mp" checked={markPaid} onChange={setMarkPaid} label="Mark paid" />
            <label htmlFor="mp" className="cursor-pointer">Mark paid</label>
            <Seg className="ml-auto" value={payMethod} onChange={setPayMethod} ariaLabel="Payment method"
              options={[['CASH', 'Cash'], ['BANK', 'Bank'], ['UPI', 'UPI'], ['CREDIT', 'Credit']]} />
          </div>
          {setReceived && !markPaid && (
            <>
              <label className="mt-2 flex items-center justify-between py-1 text-[13px] text-body">
                <span>Amount received</span>
                <input type="number" value={received} onChange={(e) => setReceived(e.target.value)} placeholder="0.00" className={miniInput} />
              </label>
              <div className="flex items-center justify-between py-1 text-[13px] text-body">
                <span>Balance</span>
                <span className="font-tight font-semibold tabular-nums text-bad-text">{inr(balance)}</span>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};
