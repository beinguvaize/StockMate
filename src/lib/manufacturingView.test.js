import { describe, it, expect } from 'vitest';
import {
  mfgWords, qtyText, unitSuffix, statusPill, orderCards, bomCards, buildMaterials, buildRollup,
  shortages, shortNotice, draftEstimate, lossOf, canSaveBom, completedText, ordersFoot, bomsFoot,
} from './manufacturingView';

const money = (v) => `₹${(Number(v) || 0).toFixed(2)}`;
const products = [
  { id: 'fin', name: 'Gift box', unit: 'pcs', product_type: 'FINISHED' },
  { id: 'nut', name: 'Nuts pack', unit: 'pcs', costPrice: 210, stock: 26 },
  { id: 'box', name: 'Empty box', unit: 'pcs', costPrice: 45, stock: 25 },
  { id: 'chilli', name: 'Chilli', unit: 'kg', secondary_unit: 'g', conversion_factor: 0.001, costPrice: 280, stock: 10 },
];

describe('mfgWords', () => {
  it('puts the retail and restaurant words in sentence case', () => {
    expect(mfgWords('Bill of Materials', 'Bills of Materials')).toEqual({
      one: 'Bill of materials', many: 'Bills of materials', lower: 'bill of materials', lowerMany: 'bills of materials',
    });
    expect(mfgWords('Recipe', 'Recipes').many).toBe('Recipes');
    expect(mfgWords('Bill of Materials').many).toBe('Bills of materials');
  });
});

describe('quantities', () => {
  it('drops trailing zeros and counted-unit words', () => {
    expect(qtyText(20)).toBe('20');
    expect(qtyText(0.5)).toBe('0.5');
    expect(qtyText(1.23456)).toBe('1.235');
    expect(unitSuffix('pcs')).toBe('');
    expect(unitSuffix('kg')).toBe(' kg');
  });
});

describe('statusPill', () => {
  it('is green once completed and amber while a draft', () => {
    expect(statusPill('COMPLETED')).toEqual({ tone: 'good', text: 'Completed' });
    expect(statusPill('DRAFT')).toEqual({ tone: 'warn', text: 'Draft' });
  });
});

describe('orderCards', () => {
  const orders = [
    { id: 'o1', finished_product_id: 'fin', status: 'DRAFT', qty_produced: 20, production_date: '2026-11-28' },
    { id: 'o2', finished_product_id: 'fin', status: 'COMPLETED', qty_produced: 40, production_date: '2026-11-21',
      unit_cost: 37, material_cost: 1280, other_cost: 200, total_cost: 1480 },
  ];
  const orderMaterials = [
    { id: 'm1', production_order_id: 'o1', raw_product_id: 'nut', qty_consumed: 20 },
    { id: 'm2', production_order_id: 'o2', raw_product_id: 'chilli', qty_consumed: 2, line_cost: 560 },
  ];
  const orderCosts = [{ id: 'c1', production_order_id: 'o1', cost_type: 'OTHER', label: 'Packing labour', amount: 400 }];

  it('reads the server costs back on a completed order and shows planned on a draft', () => {
    const [draft, done] = orderCards({ orders, orderMaterials, orderCosts, products, money });
    expect(draft.sub).toBe('28 Nov 2026 · 20 units planned');
    expect(draft.done).toBe(false);
    expect(draft.totals).toBeNull();
    expect(draft.lines).toEqual([
      { key: 'm-m1', kind: 'mat', label: 'Nuts pack', value: '× 20' },
      { key: 'c-c1', kind: 'cost', label: 'Packing labour', value: '₹400.00' },
    ]);
    expect(done.sub).toBe('21 Nov 2026 · 40 units');
    expect(done.unitCost).toBe(37);
    expect(done.lines[0].value).toBe('× 2 kg · ₹560.00');
    expect(done.totals).toEqual({ material: 1280, other: 200, total: 1480 });
  });

  it('falls back to the product id when the product is gone', () => {
    const [c] = orderCards({ orders: [{ id: 'x', finished_product_id: 'gone', status: 'DRAFT', qty_produced: 1 }], products });
    expect(c.name).toBe('gone');
  });
});

describe('bomCards', () => {
  it('shows each material in the unit it was given', () => {
    const [b] = bomCards({
      boms: [{ id: 'b1', finished_product_id: 'fin', output_qty: 10 }],
      bomComponents: [
        { id: 'k1', bom_id: 'b1', raw_product_id: 'chilli', quantity: 500, unit: 'SECONDARY' },
        { id: 'k2', bom_id: 'b1', raw_product_id: 'box', quantity: 10, unit: 'BASE' },
      ],
      products,
    });
    expect(b.name).toBe('Gift box');
    expect(b.sub).toBe('Makes 10 per batch · 2 materials');
    expect(b.lines.map((l) => l.value)).toEqual(['× 500 g', '× 10']);
  });
});

describe('the build estimate (unchanged rule)', () => {
  const bom = { id: 'b1', finished_product_id: 'fin', output_qty: 1 };
  const bomComponents = [
    { id: 'k1', bom_id: 'b1', raw_product_id: 'nut', quantity: 1, unit: 'BASE' },
    { id: 'k2', bom_id: 'b1', raw_product_id: 'box', quantity: 1, unit: 'BASE' },
    { id: 'k3', bom_id: 'b1', raw_product_id: 'chilli', quantity: 100, unit: 'SECONDARY' },
  ];

  it('scales by qty / output and converts a second unit to base', () => {
    const m = buildMaterials({ bom, qty: 30, bomComponents, products });
    expect(m.map((x) => [x.productId, x.quantity, x.cost, x.short])).toEqual([
      ['nut', 30, 6300, true], ['box', 30, 1350, true], ['chilli', 3, 840, false],
    ]);
  });

  it('adds other costs and divides by the quantity', () => {
    const m = buildMaterials({ bom, qty: 30, bomComponents, products });
    expect(buildRollup(m, [{ amount: '400' }, { amount: '' }], 30)).toEqual({
      materialCost: 8490, otherCost: 400, total: 8890, unit: 8890 / 30,
    });
    expect(buildRollup(m, [], 0).unit).toBe(0);
  });

  it('names the materials that are short and by how much', () => {
    const m = buildMaterials({ bom, qty: 30, bomComponents, products });
    const s = shortages(m, products);
    expect(s.map((x) => [x.name, x.need])).toEqual([['Nuts pack', 4], ['Empty box', 5]]);
    expect(shortNotice(s)).toEqual({
      title: 'Not enough stock for 2 materials.',
      text: 'You can still save the draft, but Complete will fail until you restock Nuts pack (need 4 more) and Empty box (need 5 more).',
    });
    expect(shortNotice([])).toBeNull();
  });

  it('is empty without a bill of materials', () => {
    expect(buildMaterials({ bom: null, qty: 5, bomComponents, products })).toEqual([]);
  });
});

describe('draftEstimate', () => {
  it('uses the saved materials at cost price, over what was made', () => {
    const order = { id: 'o1', qty_produced: 20 };
    const e = draftEstimate({
      order, actual: 19, products,
      orderMaterials: [{ production_order_id: 'o1', raw_product_id: 'nut', qty_consumed: 20 }],
      orderCosts: [{ production_order_id: 'o1', amount: 400 }],
    });
    expect(e.total).toBe(4600);
    expect(e.unit).toBeCloseTo(242.105, 3);
  });
});

describe('lossOf and completedText', () => {
  it('reports a loss only when fewer were made', () => {
    expect(lossOf(20, 19)).toEqual({ short: 1, pct: '5' });
    expect(lossOf(20, 20)).toBeNull();
    expect(lossOf(20, 25)).toBeNull();
    expect(completedText({ unitCost: 615.79, planned: 20, actual: 19, money })).toBe('Build complete — unit cost ₹615.79 (5% loss)');
    expect(completedText({ unitCost: 44.5, planned: 100, actual: 100, money })).toBe('Build complete — unit cost ₹44.50');
  });
});

describe('canSaveBom and footers', () => {
  it('needs a product, an output and one material', () => {
    expect(canSaveBom({ finishedId: 'fin', outputQty: '1', rows: [{ productId: 'nut', quantity: '1' }] })).toBe(true);
    expect(canSaveBom({ finishedId: '', outputQty: '1', rows: [{ productId: 'nut', quantity: '1' }] })).toBe(false);
    expect(canSaveBom({ finishedId: 'fin', outputQty: '0', rows: [{ productId: 'nut', quantity: '1' }] })).toBe(false);
    expect(canSaveBom({ finishedId: 'fin', outputQty: '1', rows: [{ productId: '', quantity: '' }] })).toBe(false);
  });
  it('counts the list', () => {
    expect(ordersFoot(3)).toBe('3 production orders · newest first · completed ones are the production history');
    expect(bomsFoot(1, mfgWords('Recipe', 'Recipes'))).toBe('1 recipe · to change one, delete it and make it again');
  });
});
