import React, { useState } from 'react';
import { useDialogClose } from '../../../hooks/useDialogClose';
import { Plus, Trash2, Users, Receipt, X, ArrowLeftRight, LayoutGrid, Map } from 'lucide-react';
import FloorPlan from './FloorPlan';

// R2 Table POS — restaurant floor. Shows every table with live status
// (free / occupied + running tab total). Tap a table to open or resume its
// order in the builder.
const TablesFloor = ({ tables, openTabs, tabTotal, onOpenTable, addTable, deleteTable, transferTab, mergeTabs, updateTable, currencySymbol = '₹' }) => {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ label: '', section: '', seats: 4 });
  const [busy, setBusy] = useState(false);
  const [transferFrom, setTransferFrom] = useState(null); // { table, tab }
  useDialogClose(() => setTransferFrom(null), { enabled: !!transferFrom }); // transfer-target picker
  const [view, setView] = useState('grid'); // 'grid' | 'plan'

  const freeTables = tables.filter(t => !openTabs[t.id]);
  // Targets to move/merge into = every other table.
  const moveTargets = transferFrom ? tables.filter(t => t.id !== transferFrom.table.id) : [];
  const doMove = async (toTable) => {
    const targetTab = openTabs[toTable.id];
    if (transferFrom?.tab?.id) {
      if (targetTab) await mergeTabs(transferFrom.tab, targetTab);   // occupied → merge
      else await transferTab(transferFrom.tab.id, toTable.id);       // free → transfer
    }
    setTransferFrom(null);
  };

  const submitAdd = async (e) => {
    e.preventDefault();
    if (!form.label.trim()) return;
    setBusy(true);
    await addTable({ label: form.label.trim(), section: form.section.trim() || null, seats: Number(form.seats) || 4 });
    setBusy(false);
    setForm({ label: '', section: '', seats: 4 });
    setAdding(false);
  };

  // Group by section (null → "Floor").
  const sections = {};
  tables.forEach(t => { (sections[t.section || 'Floor'] ||= []).push(t); });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-foreground">Tables<span className="text-accent-signature">.</span></h2>
          <p className="text-[12px] text-muted-foreground">{tables.length} tables · {Object.keys(openTabs).length} running</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex p-1 bg-black/[0.06] rounded-xl">
            <button onClick={() => setView('grid')} title="Grid"
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-[12px] font-semibold ${view === 'grid' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>
              <LayoutGrid size={13} /> Grid
            </button>
            <button onClick={() => setView('plan')} title="Floor plan"
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-[12px] font-semibold ${view === 'plan' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>
              <Map size={13} /> Floor plan
            </button>
          </div>
          {view === 'grid' && (
            <button onClick={() => setAdding(true)}
              className="h-10 px-4 rounded-xl bg-accent-signature text-white text-[13px] font-semibold flex items-center gap-2 hover:bg-accent-signature-hover transition-all">
              <Plus size={15} strokeWidth={2.6} /> Add table
            </button>
          )}
        </div>
      </div>

      {view === 'plan' ? (
        <FloorPlan
          tables={tables}
          openTabs={openTabs}
          tabTotal={tabTotal}
          onOpenTable={onOpenTable}
          updateTable={updateTable}
          addTable={addTable}
          deleteTable={deleteTable}
          currencySymbol={currencySymbol}
        />
      ) : tables.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border/60 p-12 text-center">
          <Users size={36} className="mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-semibold text-muted-foreground">No tables yet</p>
          <p className="text-xs text-muted-foreground mt-1">Add your first table to start taking dine-in orders.</p>
        </div>
      ) : (
        Object.entries(sections).map(([section, list]) => (
          <div key={section}>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">{section}</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {list.map(t => {
                const tab = openTabs[t.id];
                const occupied = !!tab;
                const total = occupied ? tabTotal(tab) : 0;
                const items = occupied ? (tab.cart || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0) : 0;
                return (
                  <button
                    key={t.id}
                    onClick={() => onOpenTable(t, tab)}
                    className={`group relative text-left rounded-2xl border p-4 transition-all ${
                      occupied
                        ? 'bg-accent-signature/10 border-accent-signature/40 hover:border-accent-signature/70'
                        : 'bg-card border-border hover:border-black/20'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="text-[15px] font-extrabold text-foreground">{t.label}</div>
                      <span className={`w-2 h-2 rounded-full ${occupied ? 'bg-accent-signature' : 'bg-emerald-500'}`} />
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                      <Users size={11} /> {t.seats}
                    </div>
                    {occupied ? (
                      <div className="mt-3">
                        <div className="tabular-nums text-[15px] font-semibold text-accent-signature-hover">
                          {currencySymbol}{Math.round(total).toLocaleString('en-IN')}
                        </div>
                        <div className="text-[10px] font-semibold text-accent-signature flex items-center gap-1">
                          <Receipt size={10} /> {items} item{items === 1 ? '' : 's'}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 text-[11px] font-semibold text-emerald-600">Free</div>
                    )}
                    {!occupied && (
                      <span
                        onClick={(e) => { e.stopPropagation(); if (window.confirm(`Remove table "${t.label}"?`)) deleteTable(t.id); }}
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 w-6 h-6 rounded-lg grid place-items-center text-muted-foreground hover:text-red-500 hover:bg-red-50 transition"
                        title="Remove table"
                      >
                        <Trash2 size={12} />
                      </span>
                    )}
                    {occupied && tables.length > 1 && (
                      <span
                        onClick={(e) => { e.stopPropagation(); setTransferFrom({ table: t, tab }); }}
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 w-6 h-6 rounded-lg grid place-items-center text-accent-signature hover:text-accent-signature-hover hover:bg-accent-signature/15 transition"
                        title="Move / merge table"
                      >
                        <ArrowLeftRight size={12} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* Transfer-target picker */}
      {transferFrom && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/30">
          <div className="w-full max-w-sm bg-card rounded-2xl border border-border/60 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
              <div>
                <h3 className="text-base font-extrabold text-foreground">Move Table {transferFrom.table.label}</h3>
                <p className="text-[11px] text-muted-foreground">Free table = transfer · occupied = merge bills</p>
              </div>
              <button onClick={() => setTransferFrom(null)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="p-4 grid grid-cols-3 gap-2 max-h-[50vh] overflow-y-auto">
              {moveTargets.map(ft => {
                const occ = !!openTabs[ft.id];
                return (
                  <button key={ft.id} onClick={() => doMove(ft)}
                    className={`rounded-xl border p-3 text-center transition-all ${occ ? 'border-accent-signature/40 bg-accent-signature/10 hover:border-accent-signature/70' : 'border-border hover:border-accent-signature/70 hover:bg-accent-signature/10'}`}>
                    <div className="font-extrabold text-[14px] text-foreground">{ft.label}</div>
                    <div className={`text-[10px] font-semibold ${occ ? 'text-accent-signature' : 'text-muted-foreground'}`}>{occ ? 'merge' : (ft.section || 'free')}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Add-table modal */}
      {adding && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/30">
          <div className="w-full max-w-sm bg-card rounded-2xl border border-border/60 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
              <h3 className="text-base font-extrabold text-foreground">Add table</h3>
              <button onClick={() => setAdding(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <form onSubmit={submitAdd} className="p-5 space-y-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Label</label>
                <input autoFocus value={form.label} onChange={e => setForm({ ...form, label: e.target.value })}
                  placeholder="T1, Patio 3…"
                  className="w-full bg-card border border-border rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-accent-signature focus:ring-4 focus:ring-accent-signature/10" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Section</label>
                  <input value={form.section} onChange={e => setForm({ ...form, section: e.target.value })}
                    placeholder="AC / Patio…"
                    className="w-full bg-card border border-border rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-accent-signature focus:ring-4 focus:ring-accent-signature/10" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Seats</label>
                  <input type="number" min="1" value={form.seats} onChange={e => setForm({ ...form, seats: e.target.value })}
                    className="w-full bg-card border border-border rounded-xl px-3.5 py-2.5 text-sm font-semibold tabular-nums outline-none focus:border-accent-signature focus:ring-4 focus:ring-accent-signature/10" />
                </div>
              </div>
              <button type="submit" disabled={busy || !form.label.trim()}
                className="w-full h-11 rounded-xl bg-accent-signature text-white text-sm font-semibold hover:bg-accent-signature-hover disabled:opacity-50 transition-all">
                {busy ? 'Adding…' : 'Add table'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TablesFloor;
