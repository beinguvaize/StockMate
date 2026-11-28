import React from 'react';
import { PanelRightOpen, Pencil, UserX, UserCheck, Trash2, IdCard } from 'lucide-react';
import { RowMenu, MenuItem, MenuRule } from '../ui/RowMenu';
import { Skeleton } from '../ui/States';
import { cn } from '../../lib/utils';
import { daysText } from '../../lib/payrollView';
import { inr, Avatar, statusPill, LinkButton } from './parts';

/**
 * The staff list (approved mockups 01, 02, 19, 20). Earned, Paid and Pending
 * are the server's line for the month on screen; nothing here adds up pay
 * except the foot, which sums the active rows shown.
 */
const unit = (t) => (['DAILY', 'HOURLY'].includes(t) ? 'day' : t === 'WEEKLY' ? 'week' : 'month');
const Dash = () => <span className="text-faint">—</span>;

export default function StaffTable({ rows = [], totals, loading = false, figuresFailed = false, query = '', onClearSearch, onOpen, onEdit, onToggleActive, onDelete, onProfile }) {
  const th = 'px-3.5 py-2.5 text-left font-tight text-[12px] font-semibold text-mute border-b border-line whitespace-nowrap';
  const td = 'px-3.5 py-3 border-b border-sep align-middle';
  return (
    <div className="m-rise overflow-hidden rounded-[14px] border border-line bg-surface" style={{ '--i': 2 }}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13.5px] text-ink">
          <thead>
            <tr>
              <th className={th}>Employee</th><th className={th}>Pay</th><th className={th}>Days worked</th>
              <th className={cn(th, 'text-right')}>Earned</th><th className={cn(th, 'text-right')}>Paid</th>
              <th className={cn(th, 'text-right')}>Pending</th><th className={cn(th, 'w-11')}><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && [0, 1, 2].map((i) => (
              <tr key={i}><td colSpan={7} className={td}><Skeleton className="h-8 w-full" /></td></tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={7} className="px-3.5 py-12 text-center text-body">
                No staff match “{query}”. <LinkButton onClick={onClearSearch}>Clear search</LinkButton>
              </td></tr>
            )}
            {rows.map((r) => {
              const e = r.employee;
              const inactive = r.kind === 'inactive';
              const onLeave = r.kind === 'onleave';
              const show = !!r.line && !figuresFailed;
              const loadingFig = !r.line && !figuresFailed && !inactive && loading;
              return (
                <tr key={r.id} onClick={() => onOpen(r)}
                  className={cn('cursor-pointer [&>td]:transition-colors [&>td]:duration-(--dur-press) hover:[&>td]:bg-tile', onLeave && '[&>td]:bg-[#FBFBFA]')}>
                  <td className={td}>
                    <div className="flex items-center gap-3">
                      <Avatar name={e.name} dim={inactive} />
                      <div className="min-w-0">
                        <b className={cn('block font-tight text-[14px] font-semibold', inactive && 'text-mute')}>{e.name}</b>
                        <small className="mt-0.5 flex items-center gap-1.5 text-[12px] text-mute">
                          {[e.position, e.department].filter(Boolean).join(' · ')}
                          {r.kind !== 'active' && statusPill(e.status, true)}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td className={cn(td, 'whitespace-nowrap', inactive && 'text-mute')}>
                    <span className="font-tight font-semibold tabular-nums">{inr(r.dayRate ? e.daily_rate : e.salary)}</span>{' '}
                    <span className="text-[12px] text-mute">/ {unit(r.payType)}</span>
                  </td>
                  <td className={cn(td, 'whitespace-nowrap')}>
                    {!show ? (loadingFig ? <Skeleton className="h-4 w-10" /> : <Dash />)
                      : r.dayRate ? <span className="font-tight font-semibold tabular-nums">{daysText(r.line.daysWorked)}</span>
                      : Number(r.line.lopDays) > 0
                        ? <span className="font-tight text-[13px] font-semibold text-amber-text">{daysText(r.line.lopDays)} absent</span>
                        : <span className="text-[13px] text-body">Salaried</span>}
                  </td>
                  <td className={cn(td, 'text-right whitespace-nowrap tabular-nums')}>{show ? inr(r.earned) : <Dash />}</td>
                  <td className={cn(td, 'text-right whitespace-nowrap tabular-nums')}>{show ? inr(r.paid) : <Dash />}</td>
                  <td className={cn(td, 'text-right whitespace-nowrap tabular-nums')}>
                    {inactive ? (
                      <><Dash /><small className="block text-[12px] text-mute">Inactive, not paid</small></>
                    ) : !show ? <Dash /> : onLeave ? (
                      <><span className="text-mute">{inr(r.pending)}</span><small className="block text-[12px] text-mute">Not in runs while on leave</small></>
                    ) : (
                      <span className={cn('font-semibold', r.pending > 0 ? 'text-amber-text' : 'text-good-text')}>{inr(r.pending)}</span>
                    )}
                  </td>
                  <td className={cn(td, 'text-right')} onClick={(ev) => ev.stopPropagation()}>
                    <RowMenu label={`Actions for ${e.name}`}>
                      {(close) => (
                        <>
                          <MenuItem icon={PanelRightOpen} hint="Enter" onClick={() => { close(); onOpen(r); }}>Open</MenuItem>
                          <MenuItem icon={IdCard} onClick={() => { close(); onProfile(e); }}>Full profile</MenuItem>
                          <MenuItem icon={Pencil} hint="E" onClick={() => { close(); onEdit(e); }}>Edit details</MenuItem>
                          <MenuItem icon={inactive ? UserCheck : UserX} onClick={() => { close(); onToggleActive(e); }}>
                            {inactive ? 'Mark active' : 'Mark inactive'}
                          </MenuItem>
                          <MenuRule />
                          <MenuItem icon={Trash2} danger onClick={() => { close(); onDelete(e); }}>Delete employee</MenuItem>
                        </>
                      )}
                    </RowMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {totals && rows.length > 0 && (
            <tfoot>
              <tr className="font-tight text-[13.5px] font-semibold tabular-nums">
                <td colSpan={3} className="border-t border-line px-3.5 py-3">
                  {totals.activeCount} active staff
                  <span className="mt-0.5 block font-sans text-[12px] font-medium text-mute">
                    {[`${totals.activeCount + totals.onLeaveCount + totals.inactiveCount} on the list`, totals.onLeaveCount ? `${totals.onLeaveCount} on leave` : null, totals.inactiveCount ? `${totals.inactiveCount} inactive` : null].filter(Boolean).join(' · ')}
                  </span>
                </td>
                <td className="border-t border-line px-3.5 py-3 text-right">{figuresFailed ? '—' : inr(totals.earned)}</td>
                <td className="border-t border-line px-3.5 py-3 text-right">{figuresFailed ? '—' : inr(totals.paid)}</td>
                <td className="border-t border-line px-3.5 py-3 text-right text-amber-text">
                  {figuresFailed ? '—' : inr(totals.stillToPay)}
                  <span className="mt-0.5 block font-sans text-[12px] font-medium text-mute">
                    {figuresFailed ? 'figures need the server' : totals.statutory > 0 ? `after ${inr(totals.statutory)} PF, ESI, tax` : 'on leave and inactive not counted'}
                  </span>
                </td>
                <td className="border-t border-line" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
