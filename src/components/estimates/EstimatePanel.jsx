import React from 'react';
import { ChevronDown } from 'lucide-react';
import SidePanel from '../ui/SidePanel';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { RowMenu, MenuRule } from '../ui/RowMenu';
import {
  docTypeLabel, statusOf, STATUSES, SETTABLE, estimateActions, estimateDay, longDay, validity, maskPhone, lineAmount,
} from '../../lib/estimateView';
import { amt2, rupees2, EstimateStatusPill, Tile, Tots, TotRow, SectionHead } from './parts';

/** The "Set status" menu (estimates-08): Draft, Sent, Accepted, Rejected. */
export function StatusMenu({ estimate, onSet, trigger }) {
  const cur = estimate?.status || 'DRAFT';
  return (
    <RowMenu label="Set status" width={250} trigger={trigger}>
      {(close) => (
        <>
          <span className="block px-2.5 pt-1.5 pb-1 text-[12px] text-mute">Set status</span>
          {SETTABLE.map((k) => {
            const s = STATUSES.find((x) => x.key === k);
            const on = k === cur;
            return (
              <button key={k} type="button" role="menuitemradio" aria-checked={on}
                onClick={() => { close(); if (!on) onSet(estimate, k); }}
                className={`flex w-full items-center gap-2.5 rounded-pill px-2.5 py-[7px] text-left hover:bg-tile ${on ? 'bg-tile' : ''}`}>
                <Badge tone={s.tone}>{s.label}</Badge>
                {on && <small className="ml-auto text-[12px] text-mute">now</small>}
              </button>
            );
          })}
          <MenuRule />
          <p className="px-2.5 pt-1 pb-2 text-[12px] leading-[1.45] text-mute">Billed is set when the sale is saved.</p>
        </>
      )}
    </RowMenu>
  );
}

/**
 * One estimate (estimates-04): a side panel with its dates, items, the
 * stored tax split and notes. Footer: Status, Share, Print, Edit, and
 * Convert to sale as the one filled action.
 */
export default function EstimatePanel({ estimate, today, onClose, onSetStatus, onShare, onPrint, onEdit, onConvert }) {
  const e = estimate || {};
  const a = estimateActions(e);
  const v = validity(e, today);
  const items = Array.isArray(e.items) ? e.items : [];
  const igst = Number(e.igst_amount) > 0;
  const round = Number(e.round_off) || 0;
  const sub = [e.client_name || 'Walk-in', e.client_gstin ? `GSTIN ${e.client_gstin}` : null].filter(Boolean).join(' · ');
  return (
    <SidePanel open={!!estimate} onClose={onClose} width={520} eyebrow={docTypeLabel(e)}
      title={(
        <span className="flex items-center gap-2">
          <span className="tabular-nums">{e.estimate_number}</span>
          <EstimateStatusPill estimate={e} />
        </span>
      )}
      subtitle={sub}
      footer={(
        <div className="flex flex-wrap items-center gap-2">
          {a.setStatus && (
            <StatusMenu estimate={e} onSet={onSetStatus}
              trigger={({ ref, onClick, open }) => (
                <Button ref={ref} variant="secondary" size="sm" onClick={onClick} aria-haspopup="menu" aria-expanded={open}>
                  Status <ChevronDown />
                </Button>
              )} />
          )}
          <Button variant="secondary" size="sm" onClick={() => onShare(e)}>Share</Button>
          <Button variant="secondary" size="sm" onClick={() => onPrint(e)}>Print</Button>
          {a.edit && <Button variant="secondary" size="sm" onClick={() => onEdit(e)}>Edit</Button>}
          <span className="flex-1" />
          {a.convert && <Button size="sm" onClick={() => onConvert(e)}>Convert to sale</Button>}
        </div>
      )}>
      {estimate && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2">
            <Tile label="Date" value={longDay(estimateDay(e)) || '—'} />
            <Tile label="Valid until" value={v ? `${v.date}${v.left ? ` · ${v.left}` : ''}` : '—'} />
            <Tile label="Phone" value={maskPhone(e.client_phone) || '—'} />
            <Tile label="Place of supply" value={e.place_of_supply || '—'} />
          </div>

          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="font-tight text-[12px] font-semibold text-mute">
                <th className="border-b border-line py-2 pr-2 text-left font-semibold">Item</th>
                <th className="border-b border-line px-2 py-2 text-right font-semibold">Qty</th>
                <th className="border-b border-line px-2 py-2 text-right font-semibold">Rate</th>
                <th className="border-b border-line py-2 pl-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((l, i) => {
                const hsn = l.hsn_code || (l.hsn && l.hsn !== 'N/A' ? l.hsn : '');
                return (
                  <tr key={i}>
                    <td className="border-b border-sep py-2 pr-2">
                      <b className="block font-semibold text-ink">{l.name}</b>
                      <small className="block text-[12px] text-mute">{[hsn ? `HSN ${hsn}` : null, `GST ${Number(l.taxRate) || 0}%`].filter(Boolean).join(' · ')}</small>
                    </td>
                    <td className="border-b border-sep px-2 py-2 text-right tabular-nums">{Number(l.qty) || 0}</td>
                    <td className="border-b border-sep px-2 py-2 text-right tabular-nums">{amt2(l.rate)}</td>
                    <td className="border-b border-sep py-2 pl-2 text-right font-tight font-medium tabular-nums">{amt2(lineAmount(l))}</td>
                  </tr>
                );
              })}
              {!items.length && <tr><td colSpan={4} className="py-6 text-center text-[13px] text-mute">No items on this estimate.</td></tr>}
            </tbody>
          </table>

          <Tots className="mt-3.5">
            <TotRow label="Taxable value" value={rupees2(e.taxable_amount)} />
            {igst
              ? <TotRow label="IGST" value={rupees2(e.igst_amount)} />
              : (
                <>
                  <TotRow label="CGST" value={rupees2(e.cgst_amount)} />
                  <TotRow label="SGST" value={rupees2(e.sgst_amount)} />
                </>
              )}
            {round !== 0 && <TotRow label="Round off" value={`${round > 0 ? '+' : '−'}${amt2(Math.abs(round))}`} />}
            <TotRow strong label="Total" value={rupees2(e.grand_total)} />
          </Tots>

          {e.notes && (
            <>
              <SectionHead>Notes</SectionHead>
              <p className="whitespace-pre-line text-[13px] text-ink-2">{e.notes}</p>
            </>
          )}
          <p className="mt-3.5 text-[12.5px] text-mute">
            An estimate never changes stock or money. {statusOf(e).key === 'CONVERTED' ? 'This one was turned into a sale.' : 'Converting it opens a sale with these items.'}
          </p>
        </>
      )}
    </SidePanel>
  );
}
