import React from 'react';
import { Wallet, BookOpen, MessageCircle, ShoppingCart, Pencil, Trash2 } from 'lucide-react';
import { RowMenu, MenuItem, MenuRule } from '../ui/RowMenu';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/States';
import { cn } from '../../lib/utils';
import { money } from '../../lib/clientView';
import { Pill, LinkButton } from '../payroll/parts';
import { ClientAvatar, AgePill, lastActivityWords } from './parts';

/**
 * The client list (approved mockups clients-01 … 04, 16).
 *
 * "Owes you" is the database's outstanding balance. A balance of 0 or less
 * reads "Settled", an advance included: that is today's rule, kept.
 */
export default function ClientList({
  rows = [], loading = false, query = '', filter, selectedId, cur = '₹',
  can = {}, onOpen, onCollect, onAccount, onRemind, onNewSale, onEdit, onDelete, onClearSearch,
}) {
  const th = 'px-3.5 py-2.5 text-left font-tight text-[12px] font-semibold text-mute border-b border-line whitespace-nowrap';
  const td = 'px-3.5 py-3 border-b border-sep align-middle';
  return (
    <div className="m-rise overflow-hidden rounded-[14px] border border-line bg-surface" style={{ '--i': 3 }}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13.5px] text-ink" data-testid="client-table">
          <thead>
            <tr>
              <th className={th}>Client</th>
              <th className={cn(th, 'hidden md:table-cell')}>Last activity</th>
              <th className={cn(th, 'text-right')}>Owes you <span aria-hidden="true">↓</span></th>
              <th className={cn(th, 'text-right')}>Oldest bill</th>
              <th className={cn(th, 'w-[1%]')}><span className="sr-only">Action</span></th>
              <th className={cn(th, 'w-11')}><span className="sr-only">More</span></th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && [0, 1, 2].map((i) => (
              <tr key={i}><td colSpan={6} className={td}><Skeleton className="h-8 w-full" /></td></tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="px-3.5 py-12 text-center text-body">
                {query
                  ? <>No clients match “{query}”. <LinkButton onClick={onClearSearch}>Clear search</LinkButton></>
                  : filter === 'ALL' ? 'No clients yet. Add one to get started.' : 'Nothing outstanding in this filter.'}
              </td></tr>
            )}
            {rows.map((c) => {
              const on = selectedId === c.id;
              const owes = c._out > 0;
              return (
                <tr key={c.id} onClick={() => onOpen(c)} aria-selected={on}
                  className={cn('cursor-pointer [&>td]:transition-colors [&>td]:duration-(--dur-press) hover:[&>td]:bg-tile', on && '[&>td]:bg-amber-soft/40')}>
                  <td className={td}>
                    <div className="flex items-center gap-3 min-w-0">
                      <ClientAvatar name={c.name} />
                      <div className="min-w-0">
                        <b className="block truncate max-w-[260px] font-tight text-[14px] font-semibold">{c.name}</b>
                        <small className="block truncate max-w-[260px] text-[12px] text-mute">{[c.contact, c.phone].filter(Boolean).join(' · ') || '—'}</small>
                      </div>
                    </div>
                  </td>
                  <td className={cn(td, 'hidden md:table-cell whitespace-nowrap text-[12.5px] text-body')}>{lastActivityWords(c) || <span className="text-faint">—</span>}</td>
                  <td className={cn(td, 'text-right whitespace-nowrap')}>
                    {owes
                      ? <span className="font-tight font-semibold tabular-nums">{money(c._out, cur)}</span>
                      : <Pill tone="good">Settled</Pill>}
                  </td>
                  <td className={cn(td, 'text-right whitespace-nowrap')}><AgePill days={c._age} /></td>
                  <td className={cn(td, 'text-right')} onClick={(e) => e.stopPropagation()}>
                    {owes && can.collect
                      ? <Button variant="secondary" size="xs" onClick={() => onCollect(c)}>Collect</Button>
                      : !owes ? <Button variant="secondary" size="xs" onClick={() => onNewSale(c)}>New sale</Button> : null}
                  </td>
                  <td className={cn(td, 'text-right')} onClick={(e) => e.stopPropagation()}>
                    <RowMenu label={`Actions for ${c.name}`}>
                      {(close) => (
                        <>
                          {owes && can.collect && (
                            <MenuItem primary icon={Wallet} hint={`${money(c._out, cur)} owed`} onClick={() => { close(); onCollect(c); }}>Collect payment</MenuItem>
                          )}
                          <MenuItem icon={BookOpen} onClick={() => { close(); onAccount(c); }}>Account and statement</MenuItem>
                          {owes && <MenuItem icon={MessageCircle} onClick={() => { close(); onRemind(c); }}>Send a payment reminder</MenuItem>}
                          <MenuItem icon={ShoppingCart} onClick={() => { close(); onNewSale(c); }}>New sale</MenuItem>
                          {(can.edit || can.delete) && <MenuRule />}
                          {can.edit && <MenuItem icon={Pencil} onClick={() => { close(); onEdit(c); }}>Edit client</MenuItem>}
                          {can.delete && <MenuItem icon={Trash2} danger hint="hold" onClick={() => { close(); onDelete(c); }}>Delete client</MenuItem>}
                        </>
                      )}
                    </RowMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
