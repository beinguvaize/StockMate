/**
 * What the Manufacturing page shows, worked out in one place (web redesign,
 * approved mockups manufacturing-01 … 10).
 *
 * Nothing here moves stock or sets a cost. Completing a build is the server's
 * `complete_production_order`: it takes the materials out of stock, adds the
 * finished goods and writes the order's real costs (unit_cost, material_cost,
 * other_cost, total_cost, each material's line_cost). This file only reads
 * those back.
 *
 * The one piece of arithmetic is the ESTIMATE the build dialog showed before
 * the redesign (each material's cost price × quantity, plus the other costs),
 * moved here unchanged so it is tested. It is labelled an estimate wherever it
 * shows; the order's own figures replace it once the build is complete.
 *
 * Pure functions, no React.
 */
import { formatDate } from './utils';

const n = (v) => Number(v) || 0;

/** "Bill of Materials" / "Recipe" (from t()) in the mockups' sentence case. */
export function mfgWords(one = 'Bill of Materials', many) {
  const sentence = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);
  const o = sentence(one || 'Bill of Materials');
  const m = sentence(many || (/^bill of /i.test(o) ? o.replace(/^bill/i, 'Bills') : `${o}s`));
  return { one: o, many: m, lower: o.toLowerCase(), lowerMany: m.toLowerCase() };
}

/** Quantities as the shop typed them: no trailing zeros, at most 3 places. */
export const qtyText = (v) => {
  const x = Math.round(n(v) * 1000) / 1000;
  return x.toLocaleString('en-IN', { maximumFractionDigits: 3 });
};

// Counted units read better without a word after them ("× 20", not "× 20 pcs").
const COUNT_UNITS = new Set(['', 'pc', 'pcs', 'piece', 'pieces', 'unit', 'units', 'nos', 'no', 'each', 'ea']);
/** " kg" after a quantity, or nothing for counted items. */
export const unitSuffix = (unit) => {
  const u = String(unit || '').trim();
  return COUNT_UNITS.has(u.toLowerCase()) ? '' : ` ${u}`;
};

const byId = (products = []) => {
  const m = new Map();
  for (const p of products || []) if (p && p.id) m.set(p.id, p);
  return m;
};

/** A product's name, or its id when the product is gone (as before). */
export const productName = (products, id) => (products || []).find((p) => p.id === id)?.name || id;

/** The status pill: green once completed, amber while a draft. */
export function statusPill(status) {
  const s = String(status || 'DRAFT').toUpperCase();
  const text = s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');
  return { tone: s === 'COMPLETED' ? 'good' : 'warn', text };
}

/**
 * One card per production order, newest first as the hook sorts them.
 * Material lines carry the server's line_cost once completed; cost lines are
 * the other costs saved on the order.
 */
export function orderCards({ orders = [], orderMaterials = [], orderCosts = [], products = [], money = (v) => String(v) }) {
  const pm = byId(products);
  return (orders || []).map((o) => {
    const done = o.status === 'COMPLETED';
    const mats = (orderMaterials || []).filter((m) => m.production_order_id === o.id);
    const costs = (orderCosts || []).filter((c) => c.production_order_id === o.id);
    const lines = [
      ...mats.map((m) => {
        const p = pm.get(m.raw_product_id);
        const q = `× ${qtyText(m.qty_consumed)}${unitSuffix(p?.unit)}`;
        return {
          key: `m-${m.id}`, kind: 'mat', label: p?.name || m.raw_product_id,
          value: done && n(m.line_cost) > 0 ? `${q} · ${money(m.line_cost)}` : q,
        };
      }),
      ...costs.map((c) => ({ key: `c-${c.id}`, kind: 'cost', label: c.label || c.cost_type, value: money(c.amount) })),
    ];
    const qty = qtyText(o.qty_produced);
    return {
      id: o.id,
      order: o,
      done,
      name: pm.get(o.finished_product_id)?.name || o.finished_product_id,
      sub: `${o.production_date ? formatDate(o.production_date) : formatDate(o.created_at)} · ${qty} units${done ? '' : ' planned'}`,
      pill: statusPill(o.status),
      unitCost: done ? o.unit_cost : null,
      lines,
      totals: done ? { material: o.material_cost, other: o.other_cost, total: o.total_cost } : null,
    };
  });
}

/** One card per bill of materials (recipe). */
export function bomCards({ boms = [], bomComponents = [], products = [] }) {
  const pm = byId(products);
  return (boms || []).map((b) => {
    const comps = (bomComponents || []).filter((c) => c.bom_id === b.id);
    return {
      id: b.id,
      bom: b,
      name: b.name || pm.get(b.finished_product_id)?.name || b.finished_product_id,
      sub: `Makes ${qtyText(b.output_qty)} per batch · ${comps.length} material${comps.length === 1 ? '' : 's'}`,
      lines: comps.map((c) => {
        const p = pm.get(c.raw_product_id);
        const unit = c.unit === 'SECONDARY' ? p?.secondary_unit : p?.unit;
        return { key: c.id, label: p?.name || c.raw_product_id, value: `× ${qtyText(c.quantity)}${unitSuffix(unit)}` };
      }),
    };
  });
}

/**
 * The materials a build of `qty` uses, scaled from the bill of materials by
 * qty / output_qty. A component given in the material's second unit is turned
 * into base units with its conversion factor. Unchanged from the build dialog
 * before the redesign: these quantities are what the draft saves as
 * qty_consumed, and the cost is the cost-price estimate.
 */
export function buildMaterials({ bom, qty, bomComponents = [], products = [] }) {
  if (!bom) return [];
  const factor = Number(qty) > 0 ? Number(qty) / Number(bom.output_qty || 1) : 0;
  return (bomComponents || [])
    .filter((c) => c.bom_id === bom.id)
    .map((c) => {
      const raw = (products || []).find((p) => p.id === c.raw_product_id);
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
}

/** The build dialog's estimate (unchanged): material + other costs, ÷ qty. */
export function buildRollup(materials = [], costs = [], qty) {
  const materialCost = (materials || []).reduce((s, m) => s + m.cost, 0);
  const otherCost = (costs || []).reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
  const total = materialCost + otherCost;
  const unit = Number(qty) > 0 ? total / Number(qty) : 0;
  return { materialCost, otherCost, total, unit };
}

/** Materials there is not enough of, with how many more are needed. */
export function shortages(materials = [], products = []) {
  return (materials || []).filter((m) => m.short).map((m) => ({
    productId: m.productId,
    name: productName(products, m.productId),
    need: Math.round((m.quantity - m.available) * 1000) / 1000,
    unit: m.unit,
  }));
}

const joinAnd = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** The red notice under a build that is short (mockup 05), or null. */
export function shortNotice(short = []) {
  if (!short.length) return null;
  return {
    title: `Not enough stock for ${short.length} material${short.length === 1 ? '' : 's'}.`,
    text: `You can still save the draft, but Complete will fail until you restock ${joinAnd(
      short.map((s) => `${s.name} (need ${qtyText(s.need)}${unitSuffix(s.unit)} more)`),
    )}.`,
  };
}

/**
 * The estimate on a draft that is about to be completed (mockup 06): the
 * same cost-price rule as the build dialog, over the materials saved on the
 * draft, ÷ what was actually made. A guide only; the server sets the cost.
 */
export function draftEstimate({ order, orderMaterials = [], orderCosts = [], products = [], actual }) {
  if (!order) return { total: 0, unit: 0 };
  const pm = byId(products);
  const materials = (orderMaterials || [])
    .filter((m) => m.production_order_id === order.id)
    .map((m) => ({ cost: +((Number(pm.get(m.raw_product_id)?.costPrice) || 0) * n(m.qty_consumed)).toFixed(2) }));
  const costs = (orderCosts || []).filter((c) => c.production_order_id === order.id);
  return buildRollup(materials, costs, actual);
}

/** "1 short of plan · 5% loss" when fewer were made than planned, else null. */
export function lossOf(planned, actual) {
  const p = n(planned);
  const a = n(actual);
  if (!(p > 0) || !(a > 0) || a >= p) return null;
  return { short: Math.round((p - a) * 1000) / 1000, pct: (((p - a) / p) * 100).toFixed(0) };
}

/** A quantity a build or a bill of materials will accept. */
export const isQty = (v) => Number(v) > 0;

/** Save is allowed once a product, an output and one material are set. */
export const canSaveBom = ({ finishedId, outputQty, rows = [] }) =>
  !!finishedId && Number(outputQty) > 0 && rows.some((r) => r.productId && Number(r.quantity) > 0);

/** The toast after a build completes (same words as before). */
export function completedText({ unitCost, planned, actual, money = (v) => String(v) }) {
  const loss = lossOf(planned, actual);
  return `Build complete — unit cost ${money(unitCost)}${loss ? ` (${loss.pct}% loss)` : ''}`;
}

/** The list footer line. */
export const ordersFoot = (count) =>
  `${count} production order${count === 1 ? '' : 's'} · newest first · completed ones are the production history`;
export const bomsFoot = (count, words) =>
  `${count} ${count === 1 ? words.lower : words.lowerMany} · to change one, delete it and make it again`;
