import React from 'react';
import { useTenant } from '../context/TenantContext';
import { useKDS } from '../hooks/useKOT';
import { groupByStation } from '../hooks/useKOT';
import { ChefHat, Clock } from 'lucide-react';

// Kitchen Display System — live KOT tickets. NEW → PREPARING → READY → SERVED.
const STATUS = {
  NEW:       { label: 'New',       ring: 'border-accent-signature/40',   chip: 'bg-accent-signature/15 text-accent-signature-hover',   next: 'PREPARING', action: 'Start' },
  PREPARING: { label: 'Preparing', ring: 'border-blue-300',    chip: 'bg-blue-100 text-blue-700',     next: 'READY',     action: 'Ready' },
  READY:     { label: 'Ready',     ring: 'border-emerald-300', chip: 'bg-emerald-100 text-emerald-700', next: 'SERVED',  action: 'Served' },
};

const foodMark = (t) => t === 'VEG' ? '🟢' : t === 'NONVEG' ? '🔴' : t === 'EGG' ? '🟡' : '';

const ageMin = (iso) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

const KDS = () => {
  const { currentTenantId } = useTenant();
  const { tickets, loading, updateStatus } = useKDS(currentTenantId);

  return (
    <div className="flex flex-col gap-4 pb-12">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-accent-signature/10 border border-accent-signature/25 grid place-items-center">
          <ChefHat size={18} className="text-accent-signature" />
        </div>
        <div>
          <h1 className="text-xl font-extrabold text-ink-primary leading-none">Kitchen<span className="text-accent-signature">.</span></h1>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{tickets.length} active tickets · auto-refresh</p>
        </div>
      </div>

      {loading && tickets.length === 0 ? (
        <div className="py-20 text-center text-sm text-gray-400">Loading kitchen…</div>
      ) : tickets.length === 0 ? (
        <div className="py-20 text-center bg-white rounded-2xl border border-black/5">
          <ChefHat size={36} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm font-bold text-gray-500">No active tickets</p>
          <p className="text-xs text-gray-400 mt-1">New KOTs from the floor appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {tickets.map(tk => {
            const s = STATUS[tk.status] || STATUS.NEW;
            const groups = groupByStation(tk.items);
            const mins = ageMin(tk.created_at);
            const late = mins >= 15;
            return (
              <div key={tk.id} className={`bg-white rounded-2xl border-2 ${s.ring} shadow-sm overflow-hidden flex flex-col`}>
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-black/5">
                  <div className="font-extrabold text-[15px] text-ink-primary">
                    #{tk.ticket_no}{tk.table_label ? <span className="text-gray-400 font-bold"> · T{tk.table_label}</span> : ''}
                  </div>
                  <span className={`flex items-center gap-1 text-[11px] font-bold mono ${late ? 'text-red-600' : 'text-gray-400'}`}>
                    <Clock size={11} /> {mins}m
                  </span>
                </div>
                <div className="px-4 py-3 flex-1 space-y-2">
                  {Object.entries(groups).map(([station, items]) => (
                    <div key={station}>
                      <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400">{station}</div>
                      {items.map((it, i) => (
                        <div key={i} className="text-[13px] font-semibold text-ink-primary">
                          <span className="font-mono text-accent-signature">{it.quantity}×</span> {foodMark(it.food_type)} {it.name}
                          {it.notes && <span className="block text-[11px] text-gray-400 italic pl-5">↳ {it.notes}</span>}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="px-3 pb-3 flex items-center gap-2">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${s.chip}`}>{s.label}</span>
                  <button onClick={() => updateStatus(tk.id, s.next)}
                    className="ml-auto px-3 h-8 rounded-lg bg-ink-primary text-white text-[12px] font-bold hover:bg-black transition-all">
                    {s.action} →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default KDS;
