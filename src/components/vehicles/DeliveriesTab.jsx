import React, { useState } from 'react';
import { Package, ChevronDown, Clock, MapPin, RotateCcw, Plus, Truck, Check, Navigation, History } from 'lucide-react';
import { Button } from '../ui/button';
import { FilterPills } from '../ui/Tabs';
import Expand from '../motion/Expand';
import { cn } from '../../lib/utils';
import { money } from '../../lib/clientView';
import { rupees2 } from '../estimates/parts';
import {
  zonePills, filterByZone, invoiceNo, itemLines, sumGrand, stopsOf, tripCounts, vehicleIdOf, driverIdOf,
  dayMon, ymdOf, plural, stockOnBoard,
} from '../../lib/vehiclesView';
import { getAppTimezone } from '../../lib/utils';
import { VehicleIcon, Plate, DotPill, Pill, Zp, Empty, Foot, Bar } from './parts';

/** Deliveries tab (vehicles-01 to 04): Pending, Active trips, History. */
export default function DeliveriesTab({
  sub, onSub, pending, activeRoutes, pastRoutes, routeStops, deliveryInvoices, vehicles, driverName,
  locations, balances, sym, canFail, canManageFleet, canVanSale, busyStop,
  onFail, onDispatch, onAddVehicle, onVanSale, onEndTrip, onMarkStop,
}) {
  const [zone, setZone] = useState('ALL');
  const [openInv, setOpenInv] = useState(null);
  const [openTrip, setOpenTrip] = useState(null);

  const zones = zonePills(pending);
  const zoneOn = zones.some((z) => z.key === zone) ? zone : 'ALL';
  const shown = filterByZone(pending, zoneOn);
  const tz = getAppTimezone();

  const subTabs = [
    { key: 'PENDING', label: 'Pending', count: pending.length },
    { key: 'ACTIVE', label: 'Active trips', count: activeRoutes.length },
    { key: 'HISTORY', label: 'History' },
  ];

  const pendingRow = (inv) => {
    const open = openInv === inv.id;
    const lines = itemLines(inv);
    const failed = inv.failed_delivery_reason;
    const paid = inv.payment_status === 'PAID';
    const grand = Number(inv.grand_total || 0);
    return (
      <div key={inv.id} className={cn('mb-2 overflow-hidden rounded-[14px] border bg-surface', failed ? 'border-[#F3D3A8]' : 'border-line')}>
        {failed && (
          <div className="flex items-center gap-2 bg-amber-soft px-4 py-2 font-tight text-[12px] font-semibold text-amber-text">
            <RotateCcw size={13} strokeWidth={2.2} aria-hidden="true" />Back in the queue · last try failed: {failed}
          </div>
        )}
        <button type="button" aria-expanded={open} onClick={() => setOpenInv(open ? null : inv.id)}
          className="grid w-full grid-cols-[22px_minmax(0,1fr)_auto_18px] items-center gap-3.5 px-4 py-[13px] text-left hover:bg-tile md:grid-cols-[22px_minmax(0,1fr)_auto_auto_18px]">
          <Package size={18} className="text-ink-2" aria-hidden="true" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 font-tight text-[14px] font-semibold tabular-nums">
              {invoiceNo(inv)}
              {inv.delivery_date && <Zp icon={Clock}>{dayMon(ymdOf(inv.delivery_date, tz)) || inv.delivery_date}</Zp>}
              {inv.delivery_zone && <Zp icon={MapPin}>{inv.delivery_zone}</Zp>}
            </div>
            <small className="mt-0.5 block truncate text-[12.5px] text-body">
              {inv.client_name || '—'}{inv.delivery_address ? ` · ${inv.delivery_address}` : ''}
            </small>
          </div>
          <div className="hidden md:block">{paid ? <Pill tone="good">Paid</Pill> : <Pill tone="warn">Collect on delivery</Pill>}</div>
          <div className="text-right font-tight text-[15px] font-semibold tabular-nums">
            {rupees2(grand, sym)}
            <small className="block font-sans text-[12px] font-medium text-mute">{plural(lines.length, 'item')}</small>
          </div>
          <ChevronDown size={15} aria-hidden="true" className={cn('text-mute transition-transform duration-(--dur-press)', open && 'rotate-180')} />
        </button>
        <Expand open={open}>
          <div className="border-t border-sep px-4 pt-3 pb-3.5 md:pl-[52px]">
            {(inv.delivery_address || inv.delivery_notes || inv.delivery_fee > 0) && (
              <div className="mb-2.5 flex items-start gap-2 rounded-[10px] bg-tile px-3 py-[9px] text-[12.5px] text-body">
                <MapPin size={14} className="mt-0.5 shrink-0 text-mute" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  {inv.delivery_address && <b className="block font-semibold text-ink-2">{inv.delivery_address}</b>}
                  {inv.delivery_notes && <span className="block">{inv.delivery_notes}</span>}
                </div>
                {inv.delivery_fee > 0 && <span className="shrink-0 tabular-nums">Delivery fee <b className="font-semibold text-ink-2">{rupees2(inv.delivery_fee, sym)}</b></span>}
              </div>
            )}
            {lines.length ? (
              <table className="w-full text-[13px]">
                <thead><tr className="text-left font-tight text-[11.5px] font-semibold text-mute">
                  <th className="py-1.5 font-semibold">Item</th><th className="py-1.5 pl-3 text-right font-semibold">Rate</th>
                  <th className="py-1.5 pl-3 text-right font-semibold">Qty</th><th className="py-1.5 pl-3 text-right font-semibold">Amount</th>
                </tr></thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.key} className="border-t border-sep">
                      <td className="py-2">{l.name}</td>
                      <td className="py-2 pl-3 text-right font-tight tabular-nums">{l.rate > 0 ? rupees2(l.rate, sym) : '—'}</td>
                      <td className="py-2 pl-3 text-right font-tight tabular-nums">{l.qty}</td>
                      <td className="py-2 pl-3 text-right font-tight tabular-nums">{rupees2(l.total, sym)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="border-t border-line font-tight text-[13.5px] font-semibold">
                  <td className="pt-2.5">Order total</td><td /><td /><td className="pt-2.5 text-right tabular-nums">{rupees2(grand, sym)}</td>
                </tr></tfoot>
              </table>
            ) : <p className="py-2 text-[12.5px] text-mute">No item details available.</p>}
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
              {canFail ? (
                <button type="button" onClick={() => onFail(inv)}
                  className="m-press inline-flex h-7 items-center gap-1.5 rounded-pill bg-surface px-3 font-tight text-[12.5px] font-semibold text-bad-text shadow-[inset_0_0_0_1px_#F5C2C2] hover:bg-bad-soft">
                  <RotateCcw size={13} aria-hidden="true" />Mark failed, put back in queue
                </button>
              ) : <span />}
              <span className="text-[12px] text-mute">{paid ? 'Paid · nothing to collect' : 'Unpaid · the driver collects on delivery'}</span>
            </div>
          </div>
        </Expand>
      </div>
    );
  };

  const tripCard = (route) => {
    const v = vehicles.find((x) => x.id === vehicleIdOf(route));
    const stops = stopsOf(routeStops, route.id);
    const c = tripCounts(stops);
    const open = openTrip === route.id;
    const units = stockOnBoard(vehicleIdOf(route), locations, balances);
    return (
      <div key={route.id} className="mb-3 overflow-hidden rounded-[14px] border border-line bg-surface">
        <div className="flex flex-wrap items-start gap-3.5 px-[18px] py-4">
          <VehicleIcon type={v?.type} />
          <div className="min-w-0 flex-1">
            <h4 className="flex flex-wrap items-center gap-2 font-tight text-[15px] font-semibold">
              {v?.name || 'Vehicle'}<Plate>{v?.plate}</Plate><DotPill tone="info">On the road</DotPill>
            </h4>
            <small className="mt-[3px] block text-[12.5px] text-body">
              {route.location || 'En route'} · Driver <b className="font-semibold text-ink">{driverName(driverIdOf(route))}</b> · {plural(units, 'unit')} on board
            </small>
          </div>
          <div className="flex items-center gap-2">
            {canVanSale && <Button variant="secondary" size="sm" onClick={() => onVanSale(route)}><Truck />Van sale</Button>}
            <Button variant="dark" size="sm" onClick={() => onEndTrip(route)}>End trip</Button>
          </div>
        </div>
        {c.total > 0 && (
          <>
            <div className="px-[18px] pb-3.5">
              <div className="mb-1.5 flex items-center text-[12.5px] text-body">
                <span><b className="font-semibold text-good-text">{c.delivered}</b> of {c.total} stops delivered</span>
                <span className="flex-1" /><b className="font-semibold text-ink tabular-nums">{c.progress}%</b>
              </div>
              <Bar pct={c.progress} tone="good" />
            </div>
            <button type="button" aria-expanded={open} onClick={() => setOpenTrip(open ? null : route.id)}
              className="flex w-full items-center justify-between border-t border-sep px-[18px] py-2.5 font-tight text-[12.5px] font-semibold text-body hover:bg-tile">
              <span>{open ? 'Hide stops' : `View ${c.total} stops`}</span>
              <ChevronDown size={14} aria-hidden="true" className={cn('transition-transform duration-(--dur-press)', open && 'rotate-180')} />
            </button>
            <Expand open={open}>
              <div className="border-t border-sep px-[18px] pt-2 pb-3">
                {stops.map((s, i) => {
                  const done = s.status !== 'PENDING';
                  const del = s.status === 'DELIVERED';
                  const no = s.status === 'NO_SALE';
                  const inv = deliveryInvoices.find((d) => d.id === s.invoice_id);
                  const busy = busyStop === s.id;
                  return (
                    <div key={s.id} className="relative grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-3 py-[9px]">
                      {i < stops.length - 1 && <span aria-hidden="true" className="absolute left-2.5 top-[30px] -bottom-2.5 w-0.5 bg-sep" />}
                      <span className={cn('relative z-[1] grid h-5 w-5 place-items-center rounded-full',
                        del ? 'bg-good' : no ? 'bg-[#EF6B6B]' : 'bg-surface shadow-[inset_0_0_0_2px_var(--color-line)]')} aria-hidden="true">
                        {del && <Check size={11} strokeWidth={3} className="text-white" />}
                        {no && <span className="text-[11px] font-bold leading-none text-white">×</span>}
                      </span>
                      <div className="min-w-0">
                        <b className="block truncate font-tight text-[13.5px] font-semibold">{s.client_name || 'Client'}</b>
                        {s.invoice_id && <small className="text-[12px] text-mute tabular-nums">{inv ? invoiceNo(inv) : s.invoice_id}{no ? ' · goes back to Pending' : ''}</small>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {s.cash_collected > 0 && <span className="mr-1 font-tight text-[12.5px] font-semibold text-good-text tabular-nums">{money(s.cash_collected, sym)} collected</span>}
                        {!done ? (
                          <>
                            <Button variant="secondary" size="xs" disabled={busy} onClick={() => onMarkStop(s, 'DELIVERED')}>{busy ? 'Saving…' : 'Delivered'}</Button>
                            <button type="button" disabled={busy} onClick={() => onMarkStop(s, 'NO_SALE')}
                              className="m-press inline-flex h-7 items-center rounded-pill bg-surface px-3 font-tight text-[12.5px] font-semibold text-bad-text shadow-[inset_0_0_0_1px_#F5C2C2] hover:bg-bad-soft disabled:opacity-50">No sale</button>
                          </>
                        ) : del ? <Pill tone="good">Delivered</Pill> : no ? <Pill tone="bad">No sale</Pill> : <Pill>{String(s.status).toLowerCase()}</Pill>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Expand>
          </>
        )}
      </div>
    );
  };

  const cash = (r) => Number(r.actual_cash) || 0;
  const pendingTotal = sumGrand(pending);

  return (
    <div>
      <div className="m-rise mb-3.5 flex flex-wrap items-center gap-3" style={{ '--i': 3 }}>
        <FilterPills items={subTabs} value={sub} onChange={onSub} ariaLabel="Deliveries" />
        <span className="flex-1" />
        {sub === 'PENDING' && zones.length > 2 && <FilterPills items={zones} value={zoneOn} onChange={setZone} ariaLabel="Zone" />}
        {sub === 'HISTORY' && <span className="text-[12px] text-mute">Finished trips, newest first · up to the last 30</span>}
      </div>

      <div className="m-rise" style={{ '--i': 4 }}>
        {sub === 'PENDING' && (
          <>
            {pending.length === 0
              ? <Empty icon={Package} title="No deliveries waiting">Sales marked for delivery appear here by themselves.</Empty>
              : shown.map(pendingRow)}
            <Foot actions={(
              <>
                {canManageFleet && <Button variant="secondary" size="sm" onClick={onAddVehicle}><Plus />Vehicle</Button>}
                <Button onClick={onDispatch}><Truck />{pending.length ? `Dispatch ${plural(pending.length, 'delivery', 'deliveries')}` : 'Dispatch'}</Button>
              </>
            )}>
              {pending.length
                ? `${plural(pending.length, 'delivery', 'deliveries')} waiting · ${money(pendingTotal, sym)} in all · sales marked for delivery land here by themselves`
                : 'A van can still go out with only van stock on board'}
            </Foot>
          </>
        )}

        {sub === 'ACTIVE' && (
          activeRoutes.length === 0
            ? <Empty icon={Navigation} title="No trips on the road">Dispatch a van to start a trip.</Empty>
            : (
              <>
                {activeRoutes.map(tripCard)}
                <Foot>Van sale is open to the driver and the owner · End trip settles cash and any stock that comes off the van</Foot>
              </>
            )
        )}

        {sub === 'HISTORY' && (
          pastRoutes.length === 0
            ? <Empty icon={History} title="No finished trips yet">Trips show here once they are ended.</Empty>
            : (
              <>
                <div className="overflow-x-auto rounded-[14px] border border-line bg-surface">
                  <table className="w-full min-w-[620px] text-[13px]">
                    <thead><tr className="bg-tile text-left font-tight text-[12px] font-semibold text-mute">
                      <th className="w-[90px] px-4 py-[9px] font-semibold">Date</th><th className="px-3 py-[9px] font-semibold">Vehicle</th>
                      <th className="px-3 py-[9px] font-semibold">Driver</th><th className="px-3 py-[9px] font-semibold">Area</th>
                      <th className="px-4 py-[9px] text-right font-semibold">Cash collected</th>
                    </tr></thead>
                    <tbody>
                      {pastRoutes.map((r) => {
                        const v = vehicles.find((x) => x.id === vehicleIdOf(r));
                        const day = r.reconciled_at ? dayMon(ymdOf(r.reconciled_at, tz)) : (dayMon(r.date) || r.date || '—');
                        return (
                          <tr key={r.id} className="border-t border-sep">
                            <td className="px-4 py-2.5 font-tight tabular-nums">{day}</td>
                            <td className="px-3 py-2.5"><b className="font-semibold">{v?.name || '—'}</b>{v?.plate && <small className="block text-[12px] text-mute">{v.plate}</small>}</td>
                            <td className="px-3 py-2.5">{driverName(driverIdOf(r))}</td>
                            <td className="px-3 py-2.5 text-body">{r.location || '—'}</td>
                            <td className="px-4 py-2.5 text-right font-tight font-semibold tabular-nums text-good-text">{money(cash(r), sym)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Foot>{plural(pastRoutes.length, 'trip')} · {money(pastRoutes.reduce((s, r) => s + cash(r), 0), sym)} cash counted in</Foot>
              </>
            )
        )}
      </div>
    </div>
  );
}
