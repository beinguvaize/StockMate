import React, { useState } from 'react';
import { Plus, Trash2, Users, Receipt, X, ArrowLeftRight } from 'lucide-react';

// R2 Table POS — restaurant floor. Shows every table with live status
// (free / occupied + running tab total). Tap a table to open or resume its
// order in the builder.
const TablesFloor = ({ tables, openTabs, tabTotal, onOpenTable, addTable, deleteTable, transferTab, currencySymbol = '₹' }) => {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ label: '', section: '', seats: 4 });
  const [busy, setBusy] = useState(false);
  const [transferFrom, setTransferFrom] = useState(null); // { table, tab }

  const freeTables = tables.filter(t => !openTabs[t.id]);
  const doTransfer = async (toTable) => {
    if (transferFrom?.tab?.id) await transferTab(transferFrom.tab.id, toTable.id);
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
          <h2 className="text-lg font-extrabold text-ink-primary">Tables<span className="text-amber-500">.</span></h2>
          <p className="text-[12px] text-gray-400">{tables.length} tables · {Object.keys(openTabs).length} running</p>
        </div>
        <button onClick={() => setAdding(true)}
          className="h-10 px-4 rounded-xl bg-amber-600 text-white text-[13px] font-bold flex items-center gap-2 hover:bg-amber-700 transition-all">
          <Plus size={15} strokeWidth={2.6} /> Add table
        </button>
      </div>

      {tables.length === 0 ? (
        <div className="bg-white rounded-2xl border border-black/5 p-12 text-center">
          <Users size={36} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm font-bold text-gray-500">No tables yet</p>
          <p className="text-xs text-gray-400 mt-1">Add your first table to start taking dine-in orders.</p>
        </div>
      ) : (
        Object.entries(sections).map(([section, list]) => (
          <div key={section}>
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">{section}</div>
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
                        ? 'bg-amber-50 border-amber-300 hover:border-amber-400'
                        : 'bg-white border-black/10 hover:border-black/20'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="text-[15px] font-extrabold text-ink-primary">{t.label}</div>
                      <span className={`w-2 h-2 rounded-full ${occupied ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-gray-400 mt-0.5">
                      <Users size={11} /> {t.seats}
                    </div>
                    {occupied ? (
                      <div className="mt-3">
                        <div className="font-mono tabular-nums text-[15px] font-bold text-amber-700">
                          {currencySymbol}{Math.round(total).toLocaleString('en-IN')}
                        </div>
                        <div className="text-[10px] font-bold text-amber-600 flex items-center gap-1">
                          <Receipt size={10} /> {items} item{items === 1 ? '' : 's'}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 text-[11px] font-bold text-emerald-600">Free</div>
                    )}
                    {!occupied && (
                      <span
                        onClick={(e) => { e.stopPropagation(); if (window.confirm(`Remove table "${t.label}"?`)) deleteTable(t.id); }}
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 w-6 h-6 rounded-lg grid place-items-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition"
                        title="Remove table"
                      >
                        <Trash2 size={12} />
                      </span>
                    )}
                    {occupied && freeTables.length > 0 && (
                      <span
                        onClick={(e) => { e.stopPropagation(); setTransferFrom({ table: t, tab }); }}
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 w-6 h-6 rounded-lg grid place-items-center text-amber-500 hover:text-amber-700 hover:bg-amber-100 transition"
                        title="Transfer table"
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-2xl border border-black/5 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-black/5">
              <div>
                <h3 className="text-base font-extrabold text-ink-primary">Transfer Table {transferFrom.table.label}</h3>
                <p className="text-[11px] text-gray-400">Move the running tab to a free table</p>
              </div>
              <button onClick={() => setTransferFrom(null)} className="text-gray-400 hover:text-ink-primary"><X size={18} /></button>
            </div>
            <div className="p-4 grid grid-cols-3 gap-2 max-h-[50vh] overflow-y-auto">
              {freeTables.map(ft => (
                <button key={ft.id} onClick={() => doTransfer(ft)}
                  className="rounded-xl border border-black/10 hover:border-amber-400 hover:bg-amber-50 p-3 text-center transition-all">
                  <div className="font-extrabold text-[14px] text-ink-primary">{ft.label}</div>
                  <div className="text-[10px] text-gray-400">{ft.section || 'Floor'}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add-table modal */}
      {adding && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-2xl border border-black/5 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-black/5">
              <h3 className="text-base font-extrabold text-ink-primary">Add table</h3>
              <button onClick={() => setAdding(false)} className="text-gray-400 hover:text-ink-primary"><X size={18} /></button>
            </div>
            <form onSubmit={submitAdd} className="p-5 space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Label</label>
                <input autoFocus value={form.label} onChange={e => setForm({ ...form, label: e.target.value })}
                  placeholder="T1, Patio 3…"
                  className="w-full bg-white border border-black/10 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Section</label>
                  <input value={form.section} onChange={e => setForm({ ...form, section: e.target.value })}
                    placeholder="AC / Patio…"
                    className="w-full bg-white border border-black/10 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Seats</label>
                  <input type="number" min="1" value={form.seats} onChange={e => setForm({ ...form, seats: e.target.value })}
                    className="w-full bg-white border border-black/10 rounded-xl px-3.5 py-2.5 text-sm font-semibold font-mono outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10" />
                </div>
              </div>
              <button type="submit" disabled={busy || !form.label.trim()}
                className="w-full h-11 rounded-xl bg-amber-600 text-white text-sm font-bold hover:bg-amber-700 disabled:opacity-50 transition-all">
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
