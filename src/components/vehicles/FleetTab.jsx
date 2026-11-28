import React from 'react';
import { Plus, Pencil, Trash2, PackagePlus, Wrench, MoreHorizontal, Truck } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { statusSummary, serviceLine, typeLabel, fuelLabel, plural } from '../../lib/vehiclesView';
import { VehicleIcon, Plate, StatusPill, DotPill, Eyebrow, Empty, IconBtn, Bar } from './parts';

const SVL = { bad: 'bg-bad-soft text-bad-text', warn: 'bg-amber-soft text-amber-text', neutral: 'bg-tile text-body' };

/** A service line (.svl). */
export const ServiceLine = ({ line, className }) => (line ? (
  <div className={cn('flex items-center gap-2 rounded-[10px] px-2.5 py-2 text-[12px]', SVL[line.tone], className)}>
    <Wrench size={13} className="shrink-0" aria-hidden="true" />{line.text}
  </div>
) : null);

/** Fleet tab (vehicles-05): one card per vehicle. A card opens its details panel. */
export default function FleetTab({ vehicles, today, stockOf, inTripOf, canManageFleet, onAdd, onOpen, onLoad, onEdit, onDelete, banner }) {
  if (!vehicles.length) {
    return (
      <div className="m-rise" style={{ '--i': 1 }}>
        <Empty icon={Truck} title="No vehicles yet"
          action={canManageFleet ? <Button onClick={onAdd}><Plus />Add vehicle</Button> : null}>
          Add a van, bike or truck to send deliveries out and sell from the van.
        </Empty>
      </div>
    );
  }
  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
  return (
    <div>
      <div className="m-rise mb-4 flex flex-wrap items-center gap-3" style={{ '--i': 1 }}>
        <div>
          <Eyebrow>Your vehicles</Eyebrow>
          <div className="mt-0.5 text-[13px] text-body">{plural(vehicles.length, 'vehicle')} · {statusSummary(vehicles)}</div>
        </div>
        <span className="flex-1" />
        {canManageFleet && <Button onClick={onAdd}><Plus />Add vehicle</Button>}
      </div>
      {banner}
      <div className="m-rise grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" style={{ '--i': 3 }}>
        {vehicles.map((v) => {
          const units = stockOf(v.id);
          const onTrip = inTripOf(v.id);
          return (
            <div key={v.id} role="button" tabIndex={0} onClick={() => onOpen(v)}
              onKeyDown={(e) => { if (e.key === 'Enter') onOpen(v); }}
              className="flex cursor-pointer flex-col gap-3 rounded-[14px] border border-line bg-surface p-4 transition-shadow duration-(--dur-hover) hover:shadow-[inset_0_0_0_1px_var(--color-faint)]">
              <div className="flex items-start gap-3">
                <VehicleIcon type={v.type} />
                <div className="min-w-0 flex-1">
                  <h4 className="truncate font-tight text-[15px] font-semibold">{v.name}</h4>
                  <small className="mt-1 flex flex-wrap items-center gap-1 text-[12.5px] text-body"><Plate>{v.plate}</Plate>{v.type && <span>· {typeLabel(v.type)}</span>}</small>
                </div>
                <IconBtn label={`Open ${v.name}`} onClick={stop(() => onOpen(v))} className="bg-transparent hover:bg-well"><MoreHorizontal /></IconBtn>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <StatusPill status={v.status} />{onTrip && <DotPill tone="dark">On trip</DotPill>}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-body">
                <span>Usual driver: {v.driverName || 'none'}</span>
                {v.fuelType && <span>{fuelLabel(v.fuelType)}</span>}
                {v.capacity && <span>Capacity {v.capacity}</span>}
                {v.year && <span>{v.year}</span>}
              </div>
              <div className="rounded-[10px] bg-tile px-3 py-[9px]">
                <div className="flex justify-between text-[12px] text-body">
                  <span>Stock on board</span><b className="font-tight text-[13px] font-semibold text-ink tabular-nums">{plural(units, 'unit')}</b>
                </div>
                <Bar pct={Math.min(100, units)} className="mt-1.5" />
              </div>
              <ServiceLine line={serviceLine(v, today)} />
              <div className="mt-auto flex gap-1.5">
                {canManageFleet && (
                  <Button variant="secondary" size="sm" className="flex-1" onClick={stop(() => onLoad(v))}><PackagePlus />Load van stock</Button>
                )}
                <IconBtn label={`Edit ${v.name}`} onClick={stop(() => onEdit(v))}><Pencil /></IconBtn>
                <IconBtn label={`Delete ${v.name}`} onClick={stop(() => onDelete(v))}><Trash2 /></IconBtn>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
