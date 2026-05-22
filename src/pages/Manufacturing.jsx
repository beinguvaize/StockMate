import React, { useState, useMemo } from 'react';
import { useTenant } from '../context/TenantContext';
import { useInventory } from '../hooks/useInventory';
import { useManufacturing } from '../hooks/useManufacturing';
import { useNotifications } from '../context/NotificationContext';
import { formatCurrency } from '../lib/utils';
import {
  Factory, Plus, X, Trash2, Layers, ClipboardList,
  CheckCircle2, Package, AlertTriangle,
} from 'lucide-react';

const Manufacturing = () => {
  const { currentTenantId } = useTenant();
  const { products } = useInventory(currentTenantId);
  const { addNotification } = useNotifications();
  const {
    boms, bomComponents, orders, orderMaterials, orderCosts, loading,
    createBom, deleteBom, createProductionOrder, completeOrder, deleteOrder,
  } = useManufacturing(currentTenantId);

  const [tab, setTab]             = useState('PRODUCTION');
  const [showRecipe, setShowRecipe] = useState(false);
  const [showBuild, setShowBuild]   = useState(false);

  const productName = (id) => products.find(p => p.id === id)?.name || id;

  return (
    <div className="flex flex-col gap-5 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-accent-signature/10 flex items-center justify-center">
            <Factory size={18} className="text-accent-signature" />
          </div>
          <div>
            <h1 className="text-xl font-black text-ink-primary leading-none">
              Manufacturing<span className="text-accent-signature">.</span>
            </h1>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
              Recipes · production · costing
            </p>
          </div>
        </div>
        <button
          onClick={() => tab === 'RECIPES' ? setShowRecipe(true) : setShowBuild(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-ink-primary text-white text-xs font-black hover:bg-ink-primary/90 transition-all"
        >
          <Plus size={14} /> {tab === 'RECIPES' ? 'New Recipe' : 'New Build'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 p-1.5 bg-white/60 border border-black/5 rounded-2xl w-fit">
        {[
          { id: 'PRODUCTION', label: 'Production Orders', icon: ClipboardList },
          { id: 'RECIPES',    label: 'Recipes (BOM)',     icon: Layers },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
              tab === t.id ? 'bg-ink-primary text-white' : 'text-gray-500 hover:text-ink-primary'
            }`}>
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {loading && <div className="py-16 text-center text-sm text-gray-400">Loading…</div>}

      {/* ── PRODUCTION ORDERS ───────────────────────────────────────── */}
      {!loading && tab === 'PRODUCTION' && (
        <div className="space-y-3">
          {orders.length === 0 && (
            <div className="py-16 text-center text-sm text-gray-400 bg-white rounded-2xl border border-black/5">
              No production orders yet. Create a build to manufacture a product.
            </div>
          )}
          {orders.map(o => {
            const mats  = orderMaterials.filter(m => m.production_order_id === o.id);
            const costs = orderCosts.filter(c => c.production_order_id === o.id);
            const done  = o.status === 'COMPLETED';
            return (
              <div key={o.id} className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
                <div className="flex items-center gap-4 px-5 py-3.5 border-b border-black/5">
                  <div className="w-9 h-9 rounded-xl bg-canvas flex items-center justify-center shrink-0">
                    <Package size={16} className="text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-black text-ink-primary truncate">{productName(o.finished_product_id)}</div>
                    <div className="text-[10px] text-gray-400 font-medium">
                      {o.production_date} · {o.qty_produced} units
                    </div>
                  </div>
                  <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${
                    done ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                  }`}>{o.status}</span>
                  {done ? (
                    <div className="text-right">
                      <div className="text-sm font-black text-ink-primary tabular-nums">{formatCurrency(o.unit_cost)}</div>
                      <div className="text-[9px] text-gray-400 font-bold uppercase">unit cost</div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          const r = await completeOrder(o.id);
                          addNotification(
                            r.success ? `Build complete — unit cost ${formatCurrency(r.unit_cost)}`
                                      : `Failed: ${r.error?.message || 'error'}`,
                            r.success ? 'success' : 'error');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-ink-primary text-white text-[10px] font-black hover:bg-ink-primary/90 transition-all"
                      >
                        Complete
                      </button>
                      <button onClick={() => deleteOrder(o.id)}
                        className="text-gray-300 hover:text-red-400 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
                {/* breakdown */}
                <div className="px-5 py-3 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1">
                  {mats.map(m => (
                    <div key={m.id} className="flex justify-between text-[11px]">
                      <span className="text-ink-secondary truncate">{productName(m.raw_product_id)}</span>
                      <span className="font-bold text-ink-primary tabular-nums">
                        ×{m.qty_consumed}{done && m.line_cost > 0 ? ` · ${formatCurrency(m.line_cost)}` : ''}
                      </span>
                    </div>
                  ))}
                  {costs.map(c => (
                    <div key={c.id} className="flex justify-between text-[11px]">
                      <span className="text-ink-secondary truncate">{c.label || c.cost_type}</span>
                      <span className="font-bold text-amber-600 tabular-nums">{formatCurrency(c.amount)}</span>
                    </div>
                  ))}
                </div>
                {done && (
                  <div className="px-5 py-2.5 bg-canvas/50 border-t border-black/5 flex justify-end gap-6 text-[11px]">
                    <span className="text-gray-400">Material <b className="text-ink-primary">{formatCurrency(o.material_cost)}</b></span>
                    <span className="text-gray-400">Other <b className="text-ink-primary">{formatCurrency(o.other_cost)}</b></span>
                    <span className="text-gray-400">Total <b className="text-ink-primary">{formatCurrency(o.total_cost)}</b></span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── RECIPES (BOM) ───────────────────────────────────────────── */}
      {!loading && tab === 'RECIPES' && (
        <div className="space-y-3">
          {boms.length === 0 && (
            <div className="py-16 text-center text-sm text-gray-400 bg-white rounded-2xl border border-black/5">
              No recipes yet. A recipe defines the raw materials for a product.
            </div>
          )}
          {boms.map(b => {
            const comps = bomComponents.filter(c => c.bom_id === b.id);
            return (
              <div key={b.id} className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
                <div className="flex items-center gap-4 px-5 py-3.5 border-b border-black/5">
                  <div className="w-9 h-9 rounded-xl bg-canvas flex items-center justify-center shrink-0">
                    <Layers size={16} className="text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-black text-ink-primary truncate">
                      {b.name || productName(b.finished_product_id)}
                    </div>
                    <div className="text-[10px] text-gray-400 font-medium">
                      Yields {b.output_qty} · {comps.length} components
                    </div>
                  </div>
                  <button onClick={() => deleteBom(b.id)}
                    className="text-gray-300 hover:text-red-400 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="px-5 py-3 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1">
                  {comps.map(c => (
                    <div key={c.id} className="flex justify-between text-[11px]">
                      <span className="text-ink-secondary truncate">{productName(c.raw_product_id)}</span>
                      <span className="font-bold text-ink-primary tabular-nums">×{c.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showRecipe && (
        <RecipeModal products={products} onClose={() => setShowRecipe(false)}
          onSave={async (payload) => {
            const r = await createBom(payload);
            if (r.success) { setShowRecipe(false); addNotification('Recipe saved', 'success'); }
            else addNotification(`Failed: ${r.error?.message || 'error'}`, 'error');
          }} />
      )}
      {showBuild && (
        <BuildModal products={products} boms={boms} bomComponents={bomComponents}
          onClose={() => setShowBuild(false)}
          onSave={async (payload) => {
            const r = await createProductionOrder(payload);
            if (r.success) { setShowBuild(false); addNotification('Build created (draft)', 'success'); }
            else addNotification(`Failed: ${r.error?.message || 'error'}`, 'error');
          }} />
      )}
    </div>
  );
};

/* ── Recipe modal ─────────────────────────────────────────────────── */
const RecipeModal = ({ products, onClose, onSave }) => {
  const [finishedId, setFinishedId] = useState('');
  const [outputQty, setOutputQty]   = useState('1');
  const [rows, setRows]             = useState([{ productId: '', quantity: '' }]);
  const [saving, setSaving]         = useState(false);

  const setRow = (i, k, v) => setRows(rs => rs.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  const addRow = () => setRows(rs => [...rs, { productId: '', quantity: '' }]);
  const delRow = (i) => setRows(rs => rs.filter((_, idx) => idx !== i));

  const canSave = finishedId && Number(outputQty) > 0 &&
    rows.some(r => r.productId && Number(r.quantity) > 0);

  return (
    <Modal title="New Recipe" onClose={onClose}>
      <Field label="Finished Product">
        <select className={selCls} value={finishedId} onChange={e => setFinishedId(e.target.value)}>
          <option value="">Select product…</option>
          {products.filter(p => p.product_type !== 'RAW').map(p =>
            <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      <Field label="Output Quantity (per build)">
        <input type="number" min="1" className={selCls} value={outputQty}
          onChange={e => setOutputQty(e.target.value)} />
      </Field>
      <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2 mb-1">Raw Materials</div>
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2 mb-2">
          <select className={`${selCls} flex-1`} value={r.productId} onChange={e => setRow(i, 'productId', e.target.value)}>
            <option value="">Material…</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input type="number" min="0" placeholder="Qty" className={`${selCls} w-20`}
            value={r.quantity} onChange={e => setRow(i, 'quantity', e.target.value)} />
          <button onClick={() => delRow(i)} className="text-gray-300 hover:text-red-400"><X size={14} /></button>
        </div>
      ))}
      <button onClick={addRow} className="text-[11px] font-bold text-accent-signature hover:underline">+ Add material</button>
      <button disabled={!canSave || saving}
        onClick={async () => { setSaving(true); await onSave({ finishedProductId: finishedId, name: null, outputQty: Number(outputQty), components: rows }); setSaving(false); }}
        className="w-full mt-5 h-12 rounded-xl bg-ink-primary text-white font-black text-sm disabled:opacity-40 transition-all">
        {saving ? 'Saving…' : 'Save Recipe'}
      </button>
    </Modal>
  );
};

/* ── Build modal ──────────────────────────────────────────────────── */
const BuildModal = ({ products, boms, bomComponents, onClose, onSave }) => {
  const [bomId, setBomId]       = useState('');
  const [qty, setQty]           = useState('');
  const [costs, setCosts]       = useState([{ label: '', amount: '' }]);
  const [saving, setSaving]     = useState(false);

  const bom = boms.find(b => b.id === bomId);

  // Materials scaled from the BOM by qty / output_qty
  const materials = useMemo(() => {
    if (!bom) return [];
    const factor = Number(qty) > 0 ? Number(qty) / Number(bom.output_qty || 1) : 0;
    return bomComponents
      .filter(c => c.bom_id === bom.id)
      .map(c => ({ productId: c.raw_product_id, quantity: +(c.quantity * factor).toFixed(3) }));
  }, [bom, qty, bomComponents]);

  const productName = (id) => products.find(p => p.id === id)?.name || id;
  const setCost = (i, k, v) => setCosts(cs => cs.map((c, idx) => idx === i ? { ...c, [k]: v } : c));
  const canSave = bom && Number(qty) > 0;

  return (
    <Modal title="New Build" onClose={onClose}>
      <Field label="Recipe">
        <select className={selCls} value={bomId} onChange={e => setBomId(e.target.value)}>
          <option value="">Select recipe…</option>
          {boms.map(b => <option key={b.id} value={b.id}>{b.name || productName(b.finished_product_id)}</option>)}
        </select>
      </Field>
      <Field label="Quantity to Produce">
        <input type="number" min="1" className={selCls} value={qty} onChange={e => setQty(e.target.value)} />
      </Field>

      {bom && (
        <div className="bg-canvas rounded-xl p-3 mt-2">
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
            Materials consumed
          </div>
          {materials.length === 0
            ? <div className="text-[11px] text-gray-400">Set a quantity to see materials.</div>
            : materials.map(m => (
              <div key={m.productId} className="flex justify-between text-[11px]">
                <span className="text-ink-secondary truncate">{productName(m.productId)}</span>
                <span className="font-bold text-ink-primary tabular-nums">×{m.quantity}</span>
              </div>
            ))}
        </div>
      )}

      <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-3 mb-1">
        Other Costs (labor, overhead…)
      </div>
      {costs.map((c, i) => (
        <div key={i} className="flex items-center gap-2 mb-2">
          <input placeholder="Label" className={`${selCls} flex-1`} value={c.label}
            onChange={e => setCost(i, 'label', e.target.value)} />
          <input type="number" min="0" placeholder="Amount" className={`${selCls} w-24`} value={c.amount}
            onChange={e => setCost(i, 'amount', e.target.value)} />
          <button onClick={() => setCosts(cs => cs.filter((_, idx) => idx !== i))}
            className="text-gray-300 hover:text-red-400"><X size={14} /></button>
        </div>
      ))}
      <button onClick={() => setCosts(cs => [...cs, { label: '', amount: '' }])}
        className="text-[11px] font-bold text-accent-signature hover:underline">+ Add cost</button>

      <button disabled={!canSave || saving}
        onClick={async () => {
          setSaving(true);
          await onSave({
            bomId, finishedProductId: bom.finished_product_id,
            qtyProduced: Number(qty), materials,
            costs: costs.map(c => ({ type: 'OTHER', label: c.label, amount: c.amount })),
          });
          setSaving(false);
        }}
        className="w-full mt-5 h-12 rounded-xl bg-ink-primary text-white font-black text-sm disabled:opacity-40 transition-all">
        {saving ? 'Saving…' : 'Create Build (Draft)'}
      </button>
      <p className="text-[10px] text-gray-400 text-center mt-2 flex items-center justify-center gap-1">
        <AlertTriangle size={10} /> Stock is consumed only when you Complete the build.
      </p>
    </Modal>
  );
};

/* ── Shared bits ──────────────────────────────────────────────────── */
const selCls = 'w-full bg-canvas border border-black/8 rounded-xl px-3 py-2.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-accent-signature/20';

const Field = ({ label, children }) => (
  <div className="mb-3">
    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">{label}</label>
    {children}
  </div>
);

const Modal = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
    <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl max-h-[88vh] overflow-y-auto">
      <div className="flex items-center justify-between px-6 py-4 border-b border-black/5 sticky top-0 bg-white">
        <h2 className="text-base font-black text-ink-primary flex items-center gap-2">
          <Factory size={16} className="text-accent-signature" /> {title}
        </h2>
        <button onClick={onClose} className="w-8 h-8 rounded-full border border-black/10 flex items-center justify-center text-gray-400 hover:text-ink-primary">
          <X size={14} />
        </button>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  </div>
);

export default Manufacturing;
