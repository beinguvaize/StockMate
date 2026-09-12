import React, { useState, useMemo } from 'react';
import { useDialogClose } from '../hooks/useDialogClose';
import { useTenant } from '../context/TenantContext';
import { useInventory } from '../hooks/useInventory';
import { useManufacturing } from '../hooks/useManufacturing';
import { useNotifications } from '../context/NotificationContext';
import { formatCurrency } from '../lib/utils';
import { SkeletonRows } from '../components/ui/States';
import {
  Factory, Plus, X, Trash2, Layers, ClipboardList,
  CheckCircle2, Package, AlertTriangle,
} from 'lucide-react';

const Manufacturing = () => {
  const { currentTenantId, t } = useTenant();
  const recipeWord = t('recipe');   // 'Recipe' (restaurant) / 'Bill of Materials' (retail)
  const { products } = useInventory(currentTenantId);
  const { addNotification } = useNotifications();
  const {
    boms, bomComponents, orders, orderMaterials, orderCosts, loading,
    createBom, deleteBom, createProductionOrder, completeOrder, deleteOrder, setProducedQty,
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
          <div className="w-9 h-9 rounded-xl bg-accent-signature/10 border border-accent-signature/25 flex items-center justify-center">
            <Factory size={18} className="text-accent-signature" />
          </div>
          <div>
            <h1 className="text-xl font-black text-ink-primary leading-none">
              Manufacturing<span className="text-accent-signature">.</span>
            </h1>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
              {recipeWord} · production · costing
            </p>
          </div>
        </div>
        <button
          onClick={() => tab === 'RECIPES' ? setShowRecipe(true) : setShowBuild(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-ink-primary text-white text-xs font-black hover:bg-ink-primary/90 transition-all"
        >
          <Plus size={14} /> {tab === 'RECIPES' ? `New ${recipeWord}` : 'New Build'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 p-1.5 bg-white/60 border border-black/5 rounded-2xl w-fit">
        {[
          { id: 'PRODUCTION', label: 'Production Orders', icon: ClipboardList },
          { id: 'RECIPES',    label: recipeWord,          icon: Layers },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
              tab === t.id ? 'bg-ink-primary text-white' : 'text-muted-foreground hover:text-ink-primary'
            }`}>
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {loading && <div className="rounded-2xl border border-black/[0.07] bg-white"><SkeletonRows rows={6} /></div>}

      {/* ── PRODUCTION ORDERS ───────────────────────────────────────── */}
      {!loading && tab === 'PRODUCTION' && (
        <div className="space-y-3">
          {orders.length === 0 && (
            <div className="py-16 text-center text-sm text-muted-foreground bg-white rounded-2xl border border-black/5">
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
                    <Package size={16} className="text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-black text-ink-primary truncate">{productName(o.finished_product_id)}</div>
                    <div className="text-[10px] text-muted-foreground font-medium">
                      {o.production_date} · {o.qty_produced} units
                    </div>
                  </div>
                  <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${
                    done ? 'bg-emerald-50 text-emerald-700' : 'bg-accent-signature/10 text-accent-signature-hover'
                  }`}>{o.status}</span>
                  {done ? (
                    <div className="text-right">
                      <div className="text-sm font-black text-ink-primary tabular-nums">{formatCurrency(o.unit_cost)}</div>
                      <div className="text-[9px] text-muted-foreground font-bold uppercase">unit cost</div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      {/* Edit planned qty (draft) */}
                      <button
                        onClick={async () => {
                          const v = window.prompt('Planned quantity', o.qty_produced);
                          if (v === null) return;
                          const q = Number(v);
                          if (q > 0) await setProducedQty(o.id, q);
                        }}
                        title="Edit quantity"
                        className="text-[10px] font-bold text-muted-foreground hover:text-ink-primary px-2"
                      >
                        Edit qty
                      </button>
                      <button
                        onClick={async () => {
                          // Wastage/yield: confirm actual produced (may be < planned).
                          const v = window.prompt(`Actual quantity produced (planned ${o.qty_produced})`, o.qty_produced);
                          if (v === null) return;
                          const actual = Number(v);
                          if (!(actual > 0)) { addNotification('Quantity must be > 0', 'error'); return; }
                          if (actual !== Number(o.qty_produced)) await setProducedQty(o.id, actual);
                          const r = await completeOrder(o.id);
                          addNotification(
                            r.success
                              ? `Build complete — unit cost ${formatCurrency(r.unit_cost)}${actual < o.qty_produced ? ` (${(((o.qty_produced - actual) / o.qty_produced) * 100).toFixed(0)}% loss)` : ''}`
                              : `Failed: ${r.error?.message || 'error'}`,
                            r.success ? 'success' : 'error');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-ink-primary text-white text-[10px] font-black hover:bg-ink-primary/90 transition-all"
                      >
                        Complete
                      </button>
                      <button onClick={() => deleteOrder(o.id)}
                        className="text-muted-foreground hover:text-red-400 transition-colors">
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
                      <span className="font-bold text-accent-signature tabular-nums">{formatCurrency(c.amount)}</span>
                    </div>
                  ))}
                </div>
                {done && (
                  <div className="px-5 py-2.5 bg-canvas/50 border-t border-black/5 flex justify-end gap-6 text-[11px]">
                    <span className="text-muted-foreground">Material <b className="text-ink-primary">{formatCurrency(o.material_cost)}</b></span>
                    <span className="text-muted-foreground">Other <b className="text-ink-primary">{formatCurrency(o.other_cost)}</b></span>
                    <span className="text-muted-foreground">Total <b className="text-ink-primary">{formatCurrency(o.total_cost)}</b></span>
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
            <div className="py-16 text-center text-sm text-muted-foreground bg-white rounded-2xl border border-black/5">
              No recipes yet. A recipe defines the raw materials for a product.
            </div>
          )}
          {boms.map(b => {
            const comps = bomComponents.filter(c => c.bom_id === b.id);
            return (
              <div key={b.id} className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
                <div className="flex items-center gap-4 px-5 py-3.5 border-b border-black/5">
                  <div className="w-9 h-9 rounded-xl bg-canvas flex items-center justify-center shrink-0">
                    <Layers size={16} className="text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-black text-ink-primary truncate">
                      {b.name || productName(b.finished_product_id)}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-medium">
                      Yields {b.output_qty} · {comps.length} components
                    </div>
                  </div>
                  <button onClick={() => deleteBom(b.id)}
                    className="text-muted-foreground hover:text-red-400 transition-colors">
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
        <RecipeModal products={products} recipeWord={recipeWord} onClose={() => setShowRecipe(false)}
          onSave={async (payload) => {
            const r = await createBom(payload);
            if (r.success) { setShowRecipe(false); addNotification('Recipe saved', 'success'); }
            else addNotification(`Failed: ${r.error?.message || 'error'}`, 'error');
          }} />
      )}
      {showBuild && (
        <BuildModal products={products} boms={boms} bomComponents={bomComponents} recipeWord={recipeWord}
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
const RecipeModal = ({ products, onClose, onSave, recipeWord = 'Recipe' }) => {
  const [finishedId, setFinishedId] = useState('');
  const [outputQty, setOutputQty]   = useState('1');
  const [rows, setRows]             = useState([{ productId: '', quantity: '', unit: 'BASE' }]);
  const [saving, setSaving]         = useState(false);

  const setRow = (i, k, v) => setRows(rs => rs.map((r, idx) => {
    if (idx !== i) return r;
    const next = { ...r, [k]: v };
    if (k === 'productId') next.unit = 'BASE'; // reset unit when product changes
    return next;
  }));
  const addRow = () => setRows(rs => [...rs, { productId: '', quantity: '', unit: 'BASE' }]);
  const delRow = (i) => setRows(rs => rs.filter((_, idx) => idx !== i));

  const canSave = finishedId && Number(outputQty) > 0 &&
    rows.some(r => r.productId && Number(r.quantity) > 0);

  return (
    <Modal title={`New ${recipeWord}`} subtitle="Define the raw materials and output for a finished product" onClose={onClose} size="xl">
      {/* Top: Finished product + output side-by-side */}
      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-5 mb-6">
        <Field label="Finished Product">
          <select className={selCls} value={finishedId} onChange={e => setFinishedId(e.target.value)}>
            <option value="">Select product…</option>
            {products.filter(p => p.product_type !== 'RAW').map(p =>
              <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Output Quantity" hint="units made per build">
          <input type="number" min="1" className={selCls} value={outputQty}
            onChange={e => setOutputQty(e.target.value)} />
        </Field>
      </div>

      {/* Raw materials card */}
      <div className="rounded-2xl border border-border bg-gradient-to-br from-canvas/40 to-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-white">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent-signature/10 flex items-center justify-center">
              <Factory size={13} className="text-accent-signature" />
            </div>
            <div>
              <div className="text-xs font-black text-ink-primary uppercase tracking-wider">Raw Materials</div>
              <div className="text-[10px] text-muted-foreground font-medium">{rows.filter(r => r.productId && Number(r.quantity) > 0).length} component{rows.length === 1 ? '' : 's'}</div>
            </div>
          </div>
          <button onClick={addRow} type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-signature text-button-text text-[11px] font-black uppercase tracking-wider hover:bg-accent-signature/90 transition-all shadow-sm">
            <Plus size={12} strokeWidth={3} /> Add Material
          </button>
        </div>

        {/* Column header */}
        <div className="grid grid-cols-[1fr_110px_110px_40px] gap-3 px-5 py-2 bg-canvas/40 border-b border-border">
          <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Material</span>
          <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest text-center">Quantity</span>
          <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest text-center">Unit</span>
          <span />
        </div>

        <div className="p-3 space-y-2">
          {rows.map((r, i) => {
            const rp = products.find(p => p.id === r.productId);
            return (
              <div key={i} className="grid grid-cols-[1fr_110px_110px_40px] gap-3 items-center">
                <select className={selCls} value={r.productId} onChange={e => setRow(i, 'productId', e.target.value)}>
                  <option value="">Material…</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input type="number" min="0" placeholder="0" className={`${selCls} text-center tabular-nums`}
                  value={r.quantity} onChange={e => setRow(i, 'quantity', e.target.value)} />
                <select className={selCls} value={r.unit} onChange={e => setRow(i, 'unit', e.target.value)}
                  disabled={!rp?.secondary_unit}>
                  <option value="BASE">{rp?.unit || 'unit'}</option>
                  {rp?.secondary_unit && <option value="SECONDARY">{rp.secondary_unit}</option>}
                </select>
                <RowX onClick={() => delRow(i)} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Save */}
      <button disabled={!canSave || saving}
        onClick={async () => { setSaving(true); await onSave({ finishedProductId: finishedId, name: null, outputQty: Number(outputQty), components: rows }); setSaving(false); }}
        className="w-full mt-7 h-14 rounded-2xl bg-ink-primary text-white font-black text-sm tracking-wider uppercase hover:bg-ink-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-xl shadow-ink-primary/25">
        {saving ? 'Saving…' : 'Save Recipe'}
      </button>
    </Modal>
  );
};

/* ── Build modal ──────────────────────────────────────────────────── */
const BuildModal = ({ products, boms, bomComponents, onClose, onSave, recipeWord = 'Recipe' }) => {
  const [bomId, setBomId]       = useState('');
  const [qty, setQty]           = useState('');
  const [costs, setCosts]       = useState([{ label: '', amount: '' }]);
  const [prodDate, setProdDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes]       = useState('');
  const [saving, setSaving]     = useState(false);

  const bom = boms.find(b => b.id === bomId);

  // Materials scaled from the BOM by qty / output_qty.
  // A component qty in the raw's SECONDARY unit is converted to base.
  const materials = useMemo(() => {
    if (!bom) return [];
    const factor = Number(qty) > 0 ? Number(qty) / Number(bom.output_qty || 1) : 0;
    return bomComponents
      .filter(c => c.bom_id === bom.id)
      .map(c => {
        const raw = products.find(p => p.id === c.raw_product_id);
        const cf = (c.unit === 'SECONDARY' && Number(raw?.conversion_factor) > 0)
          ? Number(raw.conversion_factor) : 1;
        const quantity = +(c.quantity * cf * factor).toFixed(3); // base units needed
        const unitCost = Number(raw?.costPrice) || 0;
        const available = Number(raw?.stock) || 0;
        return {
          productId: c.raw_product_id,
          quantity,
          unit: raw?.unit || '',
          cost: +(unitCost * quantity).toFixed(2),
          available,
          short: available < quantity,
        };
      });
  }, [bom, qty, bomComponents, products]);

  // Cost roll-up (estimate, before build).
  const materialCost = materials.reduce((s, m) => s + m.cost, 0);
  const otherCostSum = costs.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
  const estTotal = materialCost + otherCostSum;
  const estUnit = Number(qty) > 0 ? estTotal / Number(qty) : 0;
  const anyShort = materials.some(m => m.short);

  const productName = (id) => products.find(p => p.id === id)?.name || id;
  const setCost = (i, k, v) => setCosts(cs => cs.map((c, idx) => idx === i ? { ...c, [k]: v } : c));
  const canSave = bom && Number(qty) > 0;

  return (
    <Modal title="New Build" subtitle={`Create a production order from a ${recipeWord.toLowerCase()}`} onClose={onClose}>
      <Field label={recipeWord}>
        <select className={selCls} value={bomId} onChange={e => setBomId(e.target.value)}>
          <option value="">Select {recipeWord.toLowerCase()}…</option>
          {boms.map(b => <option key={b.id} value={b.id}>{b.name || productName(b.finished_product_id)}</option>)}
        </select>
      </Field>
      {bom && (
        <div className="flex items-center gap-2 -mt-2 mb-3 text-xs text-muted-foreground">
          <Package size={13} className="text-accent-signature" />
          Produces <span className="font-bold text-ink-primary">{Number(qty) > 0 ? Number(qty) : bom.output_qty} × {productName(bom.finished_product_id)}</span>
          <span className="text-muted-foreground">· yields {bom.output_qty}/batch</span>
        </div>
      )}
      <Field label="Quantity to Produce">
        <input type="number" min="1" placeholder="0" className={selCls} value={qty} onChange={e => setQty(e.target.value)} />
      </Field>

      {bom && (
        <div className="bg-canvas rounded-2xl border border-black/5 p-4 mb-4">
          <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">
            Materials Consumed
          </div>
          {materials.length === 0
            ? <div className="text-[11px] text-muted-foreground">Enter a quantity to see materials.</div>
            : <div className="space-y-1.5">
                {materials.map(m => (
                  <div key={m.productId} className="flex items-center justify-between text-xs gap-2">
                    <span className="text-ink-secondary truncate flex-1">{productName(m.productId)}</span>
                    <span className={` tabular-nums text-[10px] font-bold ${m.short ? 'text-red-500' : 'text-muted-foreground'}`}>
                      {m.short ? `short · have ${m.available}${m.unit}` : `have ${m.available}${m.unit}`}
                    </span>
                    <span className="font-black text-ink-primary tabular-nums w-14 text-right">×{m.quantity}</span>
                    <span className="tabular-nums text-muted-foreground w-16 text-right">{formatCurrency(m.cost)}</span>
                  </div>
                ))}
                {/* Cost roll-up */}
                <div className="pt-2 mt-1 border-t border-black/5 space-y-1">
                  <div className="flex justify-between text-[11px] text-muted-foreground"><span>Material cost</span><span className="tabular-nums">{formatCurrency(materialCost)}</span></div>
                  {otherCostSum > 0 && <div className="flex justify-between text-[11px] text-muted-foreground"><span>Other costs</span><span className="tabular-nums">{formatCurrency(otherCostSum)}</span></div>}
                  <div className="flex justify-between text-xs font-black text-ink-primary"><span>Est. total</span><span className="tabular-nums">{formatCurrency(estTotal)}</span></div>
                  {Number(qty) > 0 && <div className="flex justify-between text-[11px] text-accent-signature-hover font-bold"><span>Unit cost</span><span className="tabular-nums">{formatCurrency(estUnit)}</span></div>}
                </div>
              </div>}
          {anyShort && (
            <div className="mt-3 flex items-center gap-2 text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              ⚠ Not enough stock for some materials — completing the build will fail until you restock.
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mt-1 mb-2">
        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Other Costs</span>
        <button onClick={() => setCosts(cs => [...cs, { label: '', amount: '' }])} type="button"
          className="flex items-center gap-1 text-[11px] font-black text-accent-signature hover:underline">
          <Plus size={12} /> Add
        </button>
      </div>
      <div className="space-y-2">
        {costs.map((c, i) => (
          <div key={i} className="grid grid-cols-[1fr_120px_36px] gap-2 items-center">
            <input placeholder="e.g. Labor, electricity" className={selCls} value={c.label}
              onChange={e => setCost(i, 'label', e.target.value)} />
            <input type="number" min="0" placeholder="Amount" className={`${selCls} text-right`} value={c.amount}
              onChange={e => setCost(i, 'amount', e.target.value)} />
            <RowX onClick={() => setCosts(cs => cs.filter((_, idx) => idx !== i))} />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <Field label="Production Date">
          <input type="date" className={selCls} value={prodDate} onChange={e => setProdDate(e.target.value)} />
        </Field>
        <Field label="Notes (optional)">
          <input type="text" className={selCls} placeholder="Batch ref, shift…" value={notes} onChange={e => setNotes(e.target.value)} />
        </Field>
      </div>

      <button disabled={!canSave || saving}
        onClick={async () => {
          setSaving(true);
          await onSave({
            bomId, finishedProductId: bom.finished_product_id,
            qtyProduced: Number(qty), materials,
            costs: costs.map(c => ({ type: 'OTHER', label: c.label, amount: c.amount })),
            productionDate: prodDate, notes: notes.trim() || null,
          });
          setSaving(false);
        }}
        className="w-full mt-6 py-3.5 rounded-2xl bg-ink-primary text-white font-black text-sm hover:bg-ink-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-ink-primary/20">
        {saving ? 'Saving…' : 'Create Build (Draft)'}
      </button>
      <p className="text-[10px] text-muted-foreground text-center mt-3 flex items-center justify-center gap-1">
        <AlertTriangle size={10} /> Stock is consumed only when you Complete the build.
      </p>
    </Modal>
  );
};

/* ── Shared bits ──────────────────────────────────────────────────── */
const selCls = 'w-full bg-white border border-border shadow-sm rounded-xl px-3.5 py-3 text-sm font-semibold text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/25 focus:border-accent-signature/30 transition-all placeholder:text-muted-foreground placeholder:font-normal';

const Field = ({ label, hint, children }) => (
  <div className="mb-4">
    <label className="flex items-baseline gap-2 mb-1.5">
      <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{label}</span>
      {hint && <span className="text-[10px] text-muted-foreground font-medium">{hint}</span>}
    </label>
    {children}
  </div>
);

// Compact icon button for removing a row.
const RowX = ({ onClick }) => (
  <button onClick={onClick} type="button"
    className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-all shrink-0">
    <X size={14} strokeWidth={2.5} />
  </button>
);

const Modal = ({ title, subtitle, onClose, children, size = 'lg' }) => {
  // Wraps this page's New Recipe / New Build modals.
  useDialogClose(onClose);
  const widthCls = size === 'xl' ? 'max-w-4xl' : size === 'md' ? 'max-w-xl' : 'max-w-2xl';
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div role="dialog" aria-modal="true" aria-label={title} className={`w-full ${widthCls} bg-white rounded-[2rem] shadow-2xl max-h-[92vh] overflow-y-auto animate-in zoom-in-95 duration-200`}>
        <div className="flex items-center gap-4 px-8 py-6 border-b border-black/5 sticky top-0 bg-white/95 backdrop-blur z-10">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent-signature/15 to-accent-signature/5 border border-accent-signature/10 flex items-center justify-center shrink-0 shadow-sm">
            <Factory size={20} className="text-accent-signature" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-black text-ink-primary leading-tight">{title}</h2>
            {subtitle && <p className="text-xs text-muted-foreground font-medium mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose}
            className="w-10 h-10 rounded-full border border-black/10 flex items-center justify-center text-muted-foreground hover:text-ink-primary hover:border-black/25 hover:rotate-90 transition-all shrink-0">
            <X size={16} />
          </button>
        </div>
        <div className="px-8 py-7">{children}</div>
      </div>
    </div>
  );
};

export default Manufacturing;
