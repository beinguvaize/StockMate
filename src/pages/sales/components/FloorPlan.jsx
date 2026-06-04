import React, { useRef, useState, useMemo } from 'react';
import { Square, Circle, RectangleHorizontal, Save } from 'lucide-react';

// Default size per shape.
const SHAPE_SIZE = {
  sq:   { width: 84,  height: 84 },
  rd:   { width: 64,  height: 64 },
  rect: { width: 150, height: 84 },
};

// Floor-plan view of the restaurant tables. Two modes:
//   Service  — spatial layout, live status, tap a table to open its tab.
//   Design   — drag tables to position, add shapes, set seats/label.
// Tables without a saved position get auto-placed when first dragged/added.
const SNAP = 14;
const FloorPlan = ({ tables, openTabs, tabTotal, onOpenTable, updateTable, addTable, deleteTable, currencySymbol = '₹' }) => {
  const floorRef = useRef(null);
  const [designing, setDesigning] = useState(false);

  // Areas = sections. Default to the first.
  const areas = useMemo(() => {
    const s = [...new Set(tables.map(t => t.section || 'Floor'))];
    return s.length ? s : ['Floor'];
  }, [tables]);
  const [area, setArea] = useState(areas[0]);
  const curArea = areas.includes(area) ? area : areas[0];

  const inArea = tables.filter(t => (t.section || 'Floor') === curArea);

  // Auto-place tables that have no saved position (simple flow layout).
  const placed = inArea.map((t, i) => {
    const shape = SHAPE_SIZE[t.shape] ? t.shape : 'sq';
    const def = SHAPE_SIZE[shape];
    return {
      ...t,
      _x: t.pos_x ?? (28 + (i % 6) * 118),
      _y: t.pos_y ?? (28 + Math.floor(i / 6) * 118),
      _w: t.width || def.width,
      _h: t.height || def.height,
      _shape: shape,
    };
  });

  const startDrag = (e, t) => {
    if (!designing) return;
    e.preventDefault();
    const rect = floorRef.current.getBoundingClientRect();
    const ox = e.clientX - (rect.left + (t.pos_x ?? t._x));
    const oy = e.clientY - (rect.top + (t.pos_y ?? t._y));
    let nx = t._x, ny = t._y;
    const move = (ev) => {
      nx = Math.max(0, Math.min(rect.width - t._w, ev.clientX - rect.left - ox));
      ny = Math.max(0, Math.min(rect.height - t._h, ev.clientY - rect.top - oy));
      nx = Math.round(nx / SNAP) * SNAP; ny = Math.round(ny / SNAP) * SNAP;
      const el = document.querySelector(`[data-tid="${t.id}"]`);
      if (el) { el.style.left = nx + 'px'; el.style.top = ny + 'px'; }
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      updateTable(t.id, { pos_x: nx, pos_y: ny });
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  };

  const editTable = (t) => {
    const label = window.prompt('Table label', t.label);
    if (label === null) return;
    const seats = window.prompt('Seats', t.seats ?? 4);
    updateTable(t.id, { label: label.trim() || t.label, seats: parseInt(seats, 10) || t.seats });
  };

  const addShape = async (shape) => {
    const def = SHAPE_SIZE[shape] || SHAPE_SIZE.sq;
    await addTable({
      label: 'T' + (tables.length + 1),
      section: curArea,
      seats: shape === 'rd' ? 2 : shape === 'rect' ? 6 : 4,
      shape, pos_x: 28, pos_y: 28,
      width: def.width, height: def.height,
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="inline-flex p-1 bg-black/[0.06] rounded-xl">
          <button onClick={() => setDesigning(false)}
            className={`px-4 py-1.5 rounded-lg text-[12px] font-bold ${!designing ? 'bg-white shadow-sm' : 'text-gray-500'}`}>Service</button>
          <button onClick={() => setDesigning(true)}
            className={`px-4 py-1.5 rounded-lg text-[12px] font-bold ${designing ? 'bg-white shadow-sm' : 'text-gray-500'}`}>Design</button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Area</span>
          <select value={curArea} onChange={e => setArea(e.target.value)}
            className="h-9 px-3 rounded-lg bg-white border border-black/10 text-[13px] font-semibold outline-none">
            {areas.map(a => <option key={a}>{a}</option>)}
          </select>
          {designing && (
            <>
              <button onClick={() => addShape('sq')} className="h-9 px-3 rounded-lg bg-white border border-black/10 text-[12px] font-bold hover:border-amber-400 flex items-center gap-1.5"><Square size={13} /> Square</button>
              <button onClick={() => addShape('rect')} className="h-9 px-3 rounded-lg bg-white border border-black/10 text-[12px] font-bold hover:border-amber-400 flex items-center gap-1.5"><RectangleHorizontal size={13} /> Rectangle</button>
              <button onClick={() => addShape('rd')} className="h-9 px-3 rounded-lg bg-white border border-black/10 text-[12px] font-bold hover:border-amber-400 flex items-center gap-1.5"><Circle size={13} /> Round</button>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600"><Save size={12} /> auto-saved</span>
            </>
          )}
        </div>
      </div>

      <div
        ref={floorRef}
        className="relative overflow-hidden rounded-2xl border border-black/5"
        style={{
          height: 460,
          background:
            'repeating-linear-gradient(0deg,#ece9e2 0 1px,transparent 1px 28px),repeating-linear-gradient(90deg,#ece9e2 0 1px,transparent 1px 28px),#fbfaf7',
        }}
      >
        {placed.map(t => {
          const tab = openTabs[t.id];
          const occupied = !!tab;
          const border = occupied ? '#D97706' : '#10B981';
          const bg = occupied ? '#FFF7ED' : '#ECFDF5';
          return (
            <div
              key={t.id}
              data-tid={t.id}
              onPointerDown={(e) => startDrag(e, t)}
              onDoubleClick={() => designing && editTable(t)}
              onClick={() => !designing && onOpenTable(t, tab)}
              className="absolute flex flex-col items-center justify-center select-none transition-shadow"
              style={{
                left: t._x, top: t._y, width: t._w, height: t._h,
                border: `2px solid ${border}`, background: bg,
                borderRadius: t._shape === 'rd' ? 999 : 14,
                cursor: designing ? 'grab' : 'pointer',
              }}
            >
              <div className="font-extrabold text-[14px] text-ink-primary">{t.label}</div>
              <div className="text-[10px] text-gray-400">{t.seats || 0} seats</div>
              {!designing && occupied && (
                <div className="font-mono text-[11px] font-bold text-amber-700">{currencySymbol}{Math.round(tabTotal(tab)).toLocaleString('en-IN')}</div>
              )}
              {designing && (
                <button onClick={(e) => { e.stopPropagation(); if (window.confirm(`Remove "${t.label}"?`)) deleteTable(t.id); }}
                  className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white border border-black/10 grid place-items-center text-[10px] text-gray-400 hover:text-red-500">×</button>
              )}
            </div>
          );
        })}
        {placed.length === 0 && (
          <div className="absolute inset-0 grid place-items-center text-sm font-semibold text-gray-400">
            {designing ? 'Add a square or round table to start.' : 'No tables in this area.'}
          </div>
        )}
      </div>

      <div className="flex items-center gap-5 text-[12px] text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm border-2 border-emerald-500 bg-emerald-50" /> Free</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm border-2 border-amber-500 bg-amber-50" /> Occupied</span>
        {designing && <span className="text-gray-400">drag to move · double-click to edit · auto-saves</span>}
      </div>
    </div>
  );
};

export default FloorPlan;
