import React from 'react';
import { Pencil, MinusCircle, Trash2, PackagePlus } from 'lucide-react';
import SidePanel from '../ui/SidePanel';
import { Button } from '../ui/button';
import { money } from '../../lib/clientView';
import { serviceLine, typeLabel, fuelLabel, dayMon, dayMonYear, ymdOf, driverIdOf, plural } from '../../lib/vehiclesView';
import { getAppTimezone } from '../../lib/utils';
import { VehicleIcon, Plate, StatusPill, DotPill, Sec, IconBtn } from './parts';
import { ServiceLine } from './FleetTab';

const Mini = ({ left, right }) => (
  <div className="mb-1.5 flex justify-between gap-3 rounded-[10px] bg-tile px-3 py-2 text-[13px]">
    <span className="min-w-0 truncate">{left}</span><span className="shrink-0 font-tight font-semibold tabular-nums">{right}</span>
  </div>
);

/**
 * Vehicle details (vehicles-06): read-only view of what the page already
 * loads, with the same actions the card and the Stock tab offer.
 */
export default function VehiclePanel({
  vehicle, stock, onTrip, today, recentTrips, driverName, sym, canManageFleet, onClose, onEdit, onUnload, onDelete, onLoad,
}) {
  if (!vehicle) return null;
  const v = vehicle;
  const tz = getAppTimezone();
  const kv = [
    ['Usual driver', v.driverName || 'none'], ['Fuel', fuelLabel(v.fuelType) || '—'], ['Capacity', v.capacity || '—'],
    ['Colour', v.color || '—'], ['Year', v.year || '—'],
    ['Last service', dayMonYear(v.lastServiceDate) || v.lastServiceDate || '—'], ['Next service', dayMonYear(v.nextServiceDate) || v.nextServiceDate || '—'],
  ];
  const canUnload = stock.totalUnits > 0 && !onTrip;
  return (
    <SidePanel open onClose={onClose} eyebrow="Vehicle" title={v.name}
      subtitle={(
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          <Plate>{v.plate}</Plate>{v.type && <span>· {typeLabel(v.type)} ·</span>}<StatusPill status={v.status} />{onTrip && <DotPill tone="dark">On trip</DotPill>}
        </span>
      )}
      footer={(
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => onEdit(v)}><Pencil />Edit</Button>
          {canUnload && <Button variant="outline" size="sm" onClick={() => onUnload(v)}><MinusCircle />Unload</Button>}
          <IconBtn label={`Delete ${v.name}`} danger onClick={() => onDelete(v)}><Trash2 /></IconBtn>
          <span className="flex-1" />
          {canManageFleet && <Button size="sm" onClick={() => onLoad(v)}><PackagePlus />Load van stock</Button>}
        </div>
      )}>
      <VehicleIcon type={v.type} size="lg" className="mb-3.5" />
      <div className="mb-3.5 grid grid-cols-2 gap-2">
        <div className="rounded-[10px] bg-tile px-3 py-2.5"><span className="text-[12px] text-mute">Stock on board</span><b className="mt-0.5 block font-tight text-[17px] font-semibold tabular-nums">{plural(stock.totalUnits, 'unit')}</b></div>
        <div className="rounded-[10px] bg-tile px-3 py-2.5"><span className="text-[12px] text-mute">Value at selling price</span><b className="mt-0.5 block font-tight text-[17px] font-semibold tabular-nums">{money(stock.totalValue, sym)}</b></div>
      </div>
      <ServiceLine line={serviceLine(v, today)} className="mb-3.5" />
      <Sec>Details</Sec>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-[9px] text-[13px]">
        {kv.map(([k, val]) => (
          <React.Fragment key={k}><dt className="text-mute">{k}</dt><dd className="text-right font-medium tabular-nums">{val}</dd></React.Fragment>
        ))}
      </dl>
      <Sec>On board now</Sec>
      {stock.rows.length
        ? stock.rows.map((r) => <Mini key={r.productId} left={r.productName} right={`${plural(r.qty, 'unit')} · ${money(r.value, sym)}`} />)
        : <p className="text-[13px] text-mute">Nothing on this vehicle.</p>}
      <Sec>Recent trips</Sec>
      {recentTrips.length
        ? recentTrips.map((r) => (
          <Mini key={r.id}
            left={[r.reconciled_at ? dayMon(ymdOf(r.reconciled_at, tz)) : (dayMon(r.date) || r.date), r.location, driverName(driverIdOf(r))].filter(Boolean).join(' · ')}
            right={money(Number(r.actual_cash) || 0, sym)} />
        ))
        : <p className="text-[13px] text-mute">No finished trips yet.</p>}
    </SidePanel>
  );
}
