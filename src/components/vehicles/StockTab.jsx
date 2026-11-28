import React from 'react';
import { PackagePlus, MinusCircle, Truck } from 'lucide-react';
import { Button } from '../ui/button';
import { money } from '../../lib/clientView';
import { fleetStockFigures, typeLabel, LOW_UNITS } from '../../lib/vehiclesView';
import { VehicleIcon, DotPill, Strip, Empty, Foot, Bar } from './parts';

const lowPill = (text) => <span className="ml-1.5 rounded-pill bg-amber-soft px-[7px] py-px font-tight text-[11px] font-semibold text-amber-text">{text}</span>;

/** Stock tab (vehicles-10): what is on each vehicle, at selling price. */
export default function StockTab({ data, sym, onLoad, onUnload }) {
  const f = fleetStockFigures(data);
  if (!data.length) {
    return <div className="m-rise" style={{ '--i': 1 }}><Empty icon={Truck} title="No vehicles yet">Add a vehicle on the Fleet tab, then load stock onto it.</Empty></div>;
  }
  return (
    <div>
      <Strip className="m-rise" style={{ '--i': 1 }} items={[
        { label: 'Stock on vehicles', value: `${f.units.toLocaleString('en-IN')} units`, sub: 'on board right now' },
        { label: 'Value', value: money(Math.round(f.value), sym), sub: 'at selling price' },
        { label: 'Vans with stock', value: `${f.withStock} / ${f.vehicles}`, sub: 'loaded' },
        { label: 'Running low', value: f.low, sub: `under ${LOW_UNITS} units on a van`, tone: f.low > 0 ? 'warn' : undefined },
      ]} />
      <div className="m-rise" style={{ '--i': 2 }}>
        {data.map(({ vehicle: v, rows, totalUnits, totalValue, lowItems, inTrip }) => (
          <div key={v.id} className="mb-3 overflow-hidden rounded-[14px] border border-line bg-surface">
            <div className="flex flex-wrap items-center gap-3 border-b border-sep bg-[#FCFCFB] px-[18px] py-[13px]">
              <VehicleIcon type={v.type} size="sm" />
              <div className="min-w-0">
                <h4 className="flex flex-wrap items-center gap-2 font-tight text-[14.5px] font-semibold">
                  {v.name}{inTrip && <DotPill tone="dark">On trip</DotPill>}{lowItems > 0 && lowPill(`${lowItems} low`)}
                </h4>
                <small className="mt-0.5 block text-[12px] text-body">{[v.plate, typeLabel(v.type)].filter(Boolean).join(' · ')}</small>
              </div>
              <div className="ml-auto mr-2 flex gap-[22px] text-right">
                <div><b className="block font-tight text-[14px] font-semibold tabular-nums">{totalUnits.toLocaleString('en-IN')}</b><span className="text-[11.5px] text-mute">units</span></div>
                <div><b className={`block font-tight text-[14px] font-semibold tabular-nums ${totalValue > 0 ? 'text-good-text' : ''}`}>{money(Math.round(totalValue), sym)}</b><span className="text-[11.5px] text-mute">value</span></div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => onLoad(v)}><PackagePlus />Load</Button>
              {totalUnits > 0 && !inTrip && <Button variant="secondary" size="sm" onClick={() => onUnload(v)}><MinusCircle />Unload</Button>}
            </div>
            {rows.length === 0 ? (
              <div className="p-[18px] text-center text-[13px] text-mute">Nothing on this vehicle. Use Load to move stock from the warehouse.</div>
            ) : (
              <>
                <div className="grid grid-cols-[minmax(0,1fr)_80px_100px] gap-4 bg-tile px-[18px] py-[9px] font-tight text-[11.5px] font-semibold text-mute sm:grid-cols-[minmax(0,1fr)_120px_80px_100px]">
                  <span>Product</span><span className="hidden sm:block" /><span className="text-right">Units</span><span className="text-right">Value</span>
                </div>
                {rows.map((b) => (
                  <div key={b.productId} className="grid grid-cols-[minmax(0,1fr)_80px_100px] items-center gap-4 border-t border-sep px-[18px] py-[9px] text-[13px] sm:grid-cols-[minmax(0,1fr)_120px_80px_100px]">
                    <div className="min-w-0"><b className="font-medium">{b.productName}</b>{b.isLow && lowPill('Low')}{b.category && <small className="block text-[11.5px] text-mute">{b.category}</small>}</div>
                    <Bar pct={b.pct} className="hidden sm:block" />
                    <div className={`text-right font-tight text-[13.5px] font-semibold tabular-nums ${b.isLow ? 'text-amber-text' : ''}`}>{b.qty}</div>
                    <div className="text-right font-tight tabular-nums text-body">{money(Math.round(b.value), sym)}</div>
                  </div>
                ))}
              </>
            )}
          </div>
        ))}
        <Foot>Unload shows only when a van has stock and is not on a trip</Foot>
      </div>
    </div>
  );
}
