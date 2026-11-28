import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, LineChart, Copy, RotateCcw, Trash2 } from 'lucide-react';
import SidePanel from '../../../components/ui/SidePanel';
import { RowMenu, MenuItem, MenuRule } from '../../../components/ui/RowMenu';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Eyebrow } from '../../../components/ui/FigureStrip';
import CopyButton from '../../../components/motion/CopyButton';
import { formatCurrency } from '../../../lib/utils';
import { fmtDate, termOf, TERMS } from '../lib/register';

const money = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const METHOD = { CASH: 'Cash', BANK: 'Bank', UPI: 'UPI', CHEQUE: 'Cheque', CARD: 'Card' };

/** The pills at the top of the panel: the bill's state, as the register says it. */
function statePills(b) {
  if (b.state === 'cancelled') return [['neutral', 'Cancelled']];
  if (b.state === 'paid') return [['good', 'Paid']];
  if (b.state === 'over') return [['bad', `Overdue ${-b.dleft}d`], ...(b.paid > 0.005 ? [['warn', 'Part paid']] : [])];
  if (b.state === 'part') return [['warn', 'Part paid']];
  return [[b.dleft === 0 ? 'warn' : 'neutral', b.dleft === 0 ? 'Due today' : `Due in ${b.dleft}d`]];
}

/**
 * One bill, opened (mockup purchases-03). Replaces the Purchase Voucher
 * dialog: the same voucher model (lib/voucher), the same warnings, and the
 * same Print voucher. Every action hands back to the page; nothing here
 * writes.
 */
export default function BillDetailPanel({
  bill, model, paymentsCount = 0, onClose, onPay, onPrint, onPayments, onEdit,
  onHistory, onDuplicate, onReturn, onDelete,
}) {
  const navigate = useNavigate();
  const open = !!bill && !!model;
  if (!open) return <SidePanel open={false} onClose={onClose} />;

  const b = bill;
  const m = model;
  const term = termOf(b);
  const termText = term === 'CREDIT'
    ? `Credit ${b.credit}d · due ${fmtDate(b.dueOn, { year: false })}`
    : TERMS[term] || term;
  const canPay = b.due >= 0.5 && b.state !== 'cancelled';
  const tile = 'rounded-[10px] bg-tile px-3 py-[9px]';
  const val = 'mt-px block font-tight text-[13.5px] font-semibold';
  const tr = 'flex justify-between py-[3px] text-[13px] text-body';
  const tv = 'font-tight tabular-nums font-medium text-ink-2';

  return (
    <SidePanel open onClose={onClose} width={452}
      title={(
        <span className="block">
          <span className="mb-2 flex items-center gap-1.5">
            {statePills(b).map(([tone, text]) => <Badge key={text} tone={tone}>{text}</Badge>)}
          </span>
          Bill {b.bill_no || m.voucherNo}
        </span>
      )}
      subtitle={(
        <>
          {m.supplierName}
          {b.supplier_id && (
            <> · <button type="button" className="font-tight text-[13px] font-semibold text-amber-text hover:underline underline-offset-2"
              onClick={() => navigate(`/suppliers/ledger/${b.supplier_id}`)}>Open ledger</button></>
          )}
        </>
      )}
      footer={(
        <div className="flex gap-2">
          {canPay && (
            <Button className="flex-1 justify-between px-[18px] h-11" onClick={() => onPay(b)}>
              <span>Record payment</span><span className="tabular-nums">{whole(b.due)}</span>
            </Button>
          )}
          <Button variant="secondary" className={canPay ? 'h-11 px-[18px]' : 'h-11 flex-1'} onClick={() => onPrint(b)}>Print voucher</Button>
        </div>
      )}>
      <div data-testid="bill-detail">
        <div className="mb-4 grid grid-cols-2 gap-2">
          <div className={tile}><Eyebrow>Bill date</Eyebrow><b className={val}>{fmtDate(b.date)}</b></div>
          <div className={tile}><Eyebrow>Terms</Eyebrow><b className={val}>{termText}</b></div>
          <div className={tile}><Eyebrow>GSTIN</Eyebrow><b className={`${val} tabular-nums`}>{m.gstin || <span className="text-mute font-medium">None on file</span>}</b></div>
          <div className={tile}><Eyebrow>Voucher</Eyebrow>
            <b className={`${val} flex items-center gap-1`}>{m.voucherNo}<CopyButton value={b.bill_no || m.voucherNo} label={`Copy ${b.bill_no || m.voucherNo}`} size={12} /></b>
          </div>
        </div>

        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="font-tight text-[11.5px] font-semibold text-mute">
              <th className="border-b border-line py-2 text-left font-semibold">Item</th>
              <th className="border-b border-line py-2 pl-2.5 text-right font-semibold">Qty</th>
              <th className="border-b border-line py-2 pl-2.5 text-right font-semibold">Amount</th>
              <th className="w-[26px] border-b border-line" />
            </tr>
          </thead>
          <tbody>
            {m.items.map((it) => {
              const line = b.lines.find((l) => l.id === it.id);
              return (
                <tr key={it.id}>
                  <td className="border-b border-sep py-[9px]">
                    <span className="block font-medium">{it.name}</span>
                    <small className="block text-[12px] text-mute">{it.hsn ? `HSN ${it.hsn}` : 'No HSN'}{it.gstRate ? ` · ${it.gstRate}%` : ''}</small>
                  </td>
                  <td className="border-b border-sep py-[9px] pl-2.5 text-right font-tight tabular-nums whitespace-nowrap">{it.qty.toLocaleString('en-IN')} {String(it.unit || '').toLowerCase()}</td>
                  <td className="border-b border-sep py-[9px] pl-2.5 text-right font-tight tabular-nums">{money(it.amount)}</td>
                  <td className="border-b border-sep py-[9px] text-right">
                    {line && (
                      <RowMenu label={`Actions for ${it.name}`}>
                        {(close) => (
                          <>
                            <MenuItem icon={LineChart} onClick={() => { close(); onHistory(line); }}>Price history</MenuItem>
                            <MenuItem icon={Copy} onClick={() => { close(); onDuplicate(line); }}>Duplicate as a new purchase</MenuItem>
                            <MenuItem icon={RotateCcw} onClick={() => { close(); onReturn(line); }}>Return to supplier</MenuItem>
                            <MenuRule />
                            <MenuItem icon={Trash2} danger onClick={() => { close(); onDelete(line); }}>Delete this line</MenuItem>
                          </>
                        )}
                      </RowMenu>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="mt-3.5 rounded-xl bg-tile px-3.5 py-3">
          {m.registered && (
            <>
              <div className={tr}><span>Taxable</span><span className={tv}>{formatCurrency(m.taxable)}</span></div>
              {m.interstate
                ? <div className={tr}><span>IGST</span><span className={tv}>{formatCurrency(m.igst)}</span></div>
                : <div className={tr}><span>CGST + SGST</span><span className={tv}>{formatCurrency(m.cgst + m.sgst)}</span></div>}
            </>
          )}
          <div className={`${tr} ${m.registered ? 'mt-1.5 border-t border-line pt-[9px]' : ''} font-tight text-[14px] font-semibold text-ink`}>
            <span>Total</span><span className="tabular-nums">{formatCurrency(m.total)}</span>
          </div>
          {m.paid > 0.005 && (
            <div className={tr}>
              <span>Paid{b.paidVia ? `, last by ${METHOD[String(b.paidVia).toUpperCase()] || b.paidVia}` : ''}{b.paidOn ? ` on ${fmtDate(b.paidOn, { year: false })}` : ''}</span>
              <span className="font-tight tabular-nums font-medium text-good-text">{formatCurrency(m.paid)}</span>
            </div>
          )}
          {m.due > 0.005 && (
            <div className={`${tr} font-semibold text-bad-text`}><span>Balance due</span><span className="font-tight tabular-nums">{formatCurrency(m.due)}</span></div>
          )}
        </div>
        <p className="mt-2 text-[12px] text-mute">{m.words}</p>

        {/* Both are worth knowing BEFORE the paper is handed over, not after. */}
        {!m.registered && (
          <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-amber-soft px-3 py-2.5 text-[12.5px] leading-snug text-amber-text">
            <AlertTriangle size={16} className="mt-px shrink-0" />
            <span>No GSTIN on file for this supplier, so the voucher shows no tax split and no ITC can be claimed against it.</span>
          </div>
        )}
        {m.missingHsn > 0 && (
          <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-amber-soft px-3 py-2.5 text-[12.5px] leading-snug text-amber-text">
            <AlertTriangle size={16} className="mt-px shrink-0" />
            <span>{m.missingHsn} of {m.items.length} {m.missingHsn === 1 ? 'product has' : 'products have'} no HSN code. It will print blank and is required for GSTR-1.</span>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {b.paid > 0.005 && <Button variant="secondary" size="sm" onClick={() => onPayments(b)}>Payments{paymentsCount > 0 ? ` · ${paymentsCount}` : ''}</Button>}
          <Button variant="secondary" size="sm" onClick={() => onEdit(b)}>Edit bill</Button>
        </div>
      </div>
    </SidePanel>
  );
}
