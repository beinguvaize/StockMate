import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Plus, Upload, Truck, Wallet, BookOpen, FilePlus2, Pencil, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { FilterPills } from '../ui/Tabs';
import { FigureStrip, Figure } from '../ui/FigureStrip';
import { RowMenu, MenuItem, MenuRule } from '../ui/RowMenu';
import { cn } from '../../lib/utils';
import { FILTERS, filterCounts, visibleRows, dueBands, shortDay, billPill } from '../../lib/supplierView';
import { Avatar, BillPill, EmptyCard, money, rupees, num2 } from './parts';
import './suppliers.css';

/**
 * The Suppliers list (approved mockups suppliers-01 and 02).
 *
 * Figures: "You owe" and the tiles are lib/supplierView supplierKpis -- the
 * same numbers the page showed before, from lib/supplierOwed.js. The due-date
 * bar and the "Oldest unpaid" pills are the Purchases register's due rule over
 * the same bills. Nothing here adds money up except the bar's bands and the
 * table foot, which sum rows already on screen.
 *
 * Keys, as drawn: / search · J K move · Enter open · . row actions · P pay ·
 * L ledger · N add supplier.
 */
const typing = (el) => el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
const anyDialogOpen = () => !!document.querySelector('[role="dialog"],[role="alertdialog"],[role="menu"]');
const avatarTone = (r) => (r._due?.overdue ? 'bad' : r._due?.pill?.tone === 'warn' ? 'warn' : 'neutral');

function DueBar({ bands, owedTotal, cur }) {
  const total = bands.total;
  if (!(total > 0.005)) return null;
  const pct = (n) => `${Math.max(0, (n / total) * 100).toFixed(2)}%`;
  const parts = [
    ['over', 'Overdue', 'bg-[#E5484D]'],
    ['week', 'Due in 7 days', 'bg-[#F0A13A]'],
    ['later', 'Due later', 'bg-[#CFCFCD]'],
  ].filter(([k]) => bands[k].amount > 0.005);
  const differs = Math.abs(total - owedTotal) > 0.5;
  return (
    <div className="m-rise -mt-1.5 mb-5" style={{ '--i': 1 }} aria-label="What you owe by due date">
      <div className="sup-agebar flex h-2 gap-0.5 overflow-hidden rounded-pill bg-surface">
        {parts.map(([k, , c]) => <i key={k} className={c} style={{ width: pct(bands[k].amount) }} />)}
      </div>
      <div className="mt-[9px] flex flex-wrap items-center gap-x-[22px] gap-y-1 text-[12.5px] text-body">
        {parts.map(([k, label, c]) => (
          <span key={k} className="inline-flex items-center gap-[7px] whitespace-nowrap">
            <i className={cn('inline-block h-2 w-2 rounded-full', c)} />{label}
            <b className="font-tight text-[13px] font-semibold tabular-nums text-ink">{money(bands[k].amount, cur)}</b>
            {bands[k].count} {bands[k].count === 1 ? 'bill' : 'bills'}
          </span>
        ))}
        <span className="flex-1" />
        <span className="text-[12px] text-mute">
          Unpaid bills by credit days, as on Purchases
          {differs && ` · these add up to ${money(total, cur)}; You owe is the ledger balance, which also takes off advances, money on account and debit notes`}
        </span>
      </div>
    </div>
  );
}

export default function SupplierWorkspace({
  rows = [], kpis, decorated = [], cur = '₹', loading = false,
  canPay, canEdit, canDelete,
  onOpen, onPay, onLedger, onNewBill, onEdit, onDelete, onAdd, onBulkImport,
}) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('OWING');
  const [cursorId, setCursorId] = useState(null);
  const searchRef = useRef(null);
  const tableRef = useRef(null);

  const counts = useMemo(() => filterCounts(rows), [rows]);
  const shown = useMemo(() => visibleRows(rows, { filter, q }), [rows, filter, q]);
  const bands = useMemo(() => dueBands(decorated), [decorated]);
  const cursor = shown.find((r) => r.id === cursorId) || null;

  const foot = useMemo(() => {
    let owed = 0, unpaid = 0, overdue = 0;
    shown.forEach((r) => {
      owed += r._payable;
      unpaid += r._due?.unpaidCount || 0;
      (r._due?.open || []).forEach((b) => { if (b.state === 'over') overdue += b.due; });
    });
    return { owed, unpaid, overdue, settled: rows.filter((r) => r._payable <= 0.01).length };
  }, [shown, rows]);

  // ── keys ──
  const handlers = useRef({});
  useEffect(() => { handlers.current = { shown, cursor, canPay, onOpen, onPay, onLedger, onAdd }; });
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (typing(e.target) || anyDialogOpen()) return;
      const h = handlers.current;
      const move = (d) => {
        if (!h.shown.length) return;
        const i = h.shown.findIndex((r) => r.id === h.cursor?.id);
        const next = h.shown[Math.max(0, Math.min(h.shown.length - 1, i < 0 ? 0 : i + d))];
        setCursorId(next.id);
        tableRef.current?.querySelector(`[data-row="${CSS.escape(String(next.id))}"]`)?.scrollIntoView({ block: 'nearest' });
      };
      const k = e.key;
      if (k === '/') { e.preventDefault(); searchRef.current?.focus(); return; }
      if (k === 'j' || k === 'ArrowDown') { e.preventDefault(); move(1); return; }
      if (k === 'k' || k === 'ArrowUp') { e.preventDefault(); move(-1); return; }
      if (k === 'n' || k === 'N') { e.preventDefault(); h.onAdd?.(); return; }
      const r = h.cursor;
      if (!r) return;
      if (k === 'Enter') { e.preventDefault(); h.onOpen?.(r); return; }
      if (k === 'p' || k === 'P') { if (r._payable > 0.01 && h.canPay) { e.preventDefault(); h.onPay?.(r); } return; }
      if (k === 'l' || k === 'L') { e.preventDefault(); h.onLedger?.(r); return; }
      if (k === '.') {
        e.preventDefault();
        tableRef.current?.querySelector(`[data-row="${CSS.escape(String(r.id))}"] [aria-haspopup="menu"]`)?.click();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const th = 'px-2.5 py-2.5 text-left font-tight text-[12px] font-semibold text-mute border-b border-line whitespace-nowrap';
  const td = 'px-2.5 py-[11px] border-b border-sep align-middle text-[13px] whitespace-nowrap';
  const k = kpis || {};

  return (
    <div className="flex flex-col pb-16">
      <FigureStrip cols={4} className="m-rise mb-5" style={{ '--i': 0 }}>
        <Figure label="You owe" value={<span className={k.payable > 0.01 ? 'text-bad-text' : ''}>{money(k.payable || 0, cur)}</span>}
          sub={<>{k.owing || 0} of {k.supplierCount || 0} suppliers{k.advance > 0.01 && <> · <span className="font-semibold text-good-text">{rupees(k.advance, cur)} advance</span></>}</>} />
        <Figure label="Oldest unpaid" value={k.oldest != null ? `${k.oldest} days` : '—'}
          sub={k.oldestName ? `${k.oldestName}${k.oldestDate ? ` · ${shortDay(k.oldestDate)}` : ''}` : 'nothing outstanding'} />
        <Figure label="Paid this month" value={<span className="text-good-text">{rupees(k.paidThisMonth || 0, cur)}</span>}
          sub={`${k.paymentsRecorded || 0} ${k.paymentsRecorded === 1 ? 'payment' : 'payments'} recorded, all time`} />
        <Figure label="Purchased this month" value={rupees(k.purchasedThisMonth || 0, cur)}
          sub={`${k.billsThisMonth || 0} ${k.billsThisMonth === 1 ? 'bill' : 'bills'}`} />
      </FigureStrip>

      <DueBar bands={bands} owedTotal={k.payable || 0} cur={cur} />

      <div className="m-rise mb-3 flex flex-wrap items-center gap-2.5" style={{ '--i': 2 }}>
        <FilterPills ariaLabel="Show" value={filter} onChange={setFilter}
          items={FILTERS.map((f) => ({ ...f, count: counts[f.key] }))} />
        <label className="relative w-[280px] max-w-full">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
          <Input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, contact, phone or GSTIN"
            aria-label="Search suppliers" className="pl-9 pr-9"
            onKeyDown={(e) => { if (e.key === 'Escape') { setQ(''); e.currentTarget.blur(); } }} />
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-[5px] bg-well px-1.5 py-px font-tight text-[10.5px] font-semibold text-mute">/</span>
        </label>
        <span className="whitespace-nowrap rounded-pill bg-tile px-3 py-[7px] font-tight text-[13px] font-semibold text-ink-2" title="The list's fixed order">Most owed first</span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" onClick={onBulkImport}><Upload /> Bulk import</Button>
          <Button onClick={onAdd}><Plus /> Add supplier</Button>
        </div>
      </div>

      {shown.length === 0 && !loading ? (
        <div className="m-rise" style={{ '--i': 3 }}>
          <EmptyCard icon={Truck} title="No suppliers here"
            text={rows.length === 0 || filter === 'ALL' ? (q ? `No supplier matches “${q}”.` : 'Add a supplier to get started.') : filter === 'OVERDUE' ? 'Nothing overdue in this filter.' : 'Nothing owed in this filter.'} />
        </div>
      ) : (
        <div ref={tableRef} className="m-rise overflow-hidden rounded-[14px] border border-line bg-surface" style={{ '--i': 3 }}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-ink">
              <thead>
                <tr>
                  <th className={cn(th, 'w-8 pr-0')}><span className="sr-only">Avatar</span></th>
                  <th className={th}>Supplier</th>
                  <th className={th}>Last bill</th>
                  <th className={th}>Oldest unpaid</th>
                  <th className={cn(th, 'text-right')}>Bills</th>
                  <th className={cn(th, 'text-right text-ink-2')}>You owe</th>
                  <th className={th}><span className="sr-only">Payment</span></th>
                  <th className={th}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const on = cursor?.id === r.id;
                  const owing = r._payable > 0.01;
                  const d = r._due || {};
                  const payable = owing && canPay;
                  return (
                    <tr key={r.id} data-row={r.id} onClick={() => { setCursorId(r.id); onOpen?.(r); }}
                      className={cn('cursor-pointer [&>td]:transition-colors [&>td]:duration-(--dur-press)', on ? '[&>td]:bg-amber-soft' : 'hover:[&>td]:bg-tile')}>
                      <td className={cn(td, 'w-8 pr-0')}><Avatar name={r.name} tone={avatarTone(r)} /></td>
                      <td className={td}>
                        <b className="block max-w-[260px] truncate font-tight text-[13.5px] font-semibold">{r.name}</b>
                        <small className="block max-w-[260px] truncate text-[12px] text-mute">{[r.contact_person, r.phone].filter(Boolean).join(' · ') || '—'}</small>
                      </td>
                      <td className={td}>
                        {r._f.lastBill ? <>{shortDay(String(r._f.lastBill).slice(0, 10))}<small className="block text-[12px] text-mute">{r._f.lastBillNo || 'No bill no.'}</small></> : <span className="text-faint">—</span>}
                      </td>
                      <td className={td}>
                        {d.oldest ? (
                          <>
                            <BillPill pill={billPill(d.oldest)} />
                            <small className="mt-0.5 block text-[12px] text-mute">{d.unpaidCount} unpaid · since {shortDay(d.oldest.date)}</small>
                          </>
                        ) : <span className="text-faint">—</span>}
                      </td>
                      <td className={cn(td, 'text-right font-tight tabular-nums')}>{r._f.billCount || 0}</td>
                      <td className={cn(td, 'text-right font-tight text-[14px] font-semibold tabular-nums')}>
                        {owing ? num2(r._payable) : <span className="font-sans text-[13px] font-semibold text-good-text">Settled</span>}
                      </td>
                      <td className={cn(td, 'w-[1%] text-right')} onClick={(e) => e.stopPropagation()}>
                        {payable ? (
                          <Button size="xs" variant={on ? 'default' : 'secondary'} className="min-w-[66px] px-3.5" onClick={() => onPay?.(r)}>Pay</Button>
                        ) : (
                          <Button size="xs" variant="secondary" className="min-w-[66px] px-3.5" onClick={() => onLedger?.(r)}>Ledger</Button>
                        )}
                      </td>
                      <td className={cn(td, 'w-10 text-right')} onClick={(e) => e.stopPropagation()}>
                        <RowMenu label={`Actions for ${r.name}`} width={250}>
                          {(close) => (
                            <>
                              {payable && <MenuItem icon={Wallet} hint="P" onClick={() => { close(); onPay?.(r); }}>Record payment</MenuItem>}
                              <MenuItem icon={BookOpen} hint="L" onClick={() => { close(); onLedger?.(r); }}>Open ledger</MenuItem>
                              <MenuItem icon={FilePlus2} onClick={() => { close(); onNewBill?.(r); }}>New bill</MenuItem>
                              {canEdit && <MenuItem icon={Pencil} onClick={() => { close(); onEdit?.(r); }}>Edit details</MenuItem>}
                              {canDelete && (
                                <>
                                  <MenuRule />
                                  <MenuItem icon={Trash2} danger onClick={() => { close(); onDelete?.(r); }}>Delete supplier</MenuItem>
                                </>
                              )}
                            </>
                          )}
                        </RowMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {shown.length > 0 && (
                <tfoot>
                  <tr className="font-tight text-[13.5px] font-semibold tabular-nums">
                    <td className="border-t border-line" />
                    <td colSpan={4} className="border-t border-line px-2.5 py-3">
                      {shown.length} {shown.length === 1 ? 'supplier' : 'suppliers'}
                      <span className="ml-2 font-sans text-[12.5px] font-medium text-body">
                        {foot.unpaid} unpaid {foot.unpaid === 1 ? 'bill' : 'bills'}
                        {foot.overdue > 0.005 && <> · <b className="font-semibold text-bad-text">{money(foot.overdue, cur)}</b> overdue</>}
                        {filter !== 'ALL' && foot.settled > 0 && ` · ${foot.settled} settled ${foot.settled === 1 ? 'supplier' : 'suppliers'} in All`}
                      </span>
                    </td>
                    <td className="border-t border-line px-2.5 py-3 text-right">{money(foot.owed, cur)}</td>
                    <td colSpan={2} className="border-t border-line" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      <div className="m-rise flex flex-wrap gap-3.5 px-0.5 pt-3.5 text-[12px] text-mute" style={{ '--i': 4 }} aria-hidden="true">
        {[['/', 'search'], ['J K', 'move'], ['Enter', 'open'], ['.', 'row actions'], ['P', 'pay'], ['L', 'ledger'], ['N', 'add supplier']].map(([keys, w]) => (
          <span key={w}>{keys.split(' ').map((x) => <span key={x} className="mr-[3px] rounded-[5px] bg-well px-1.5 py-px font-tight text-[10.5px] font-semibold">{x}</span>)}{w}</span>
        ))}
      </div>
    </div>
  );
}
