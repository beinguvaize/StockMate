import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Who is allowed to write products."costPrice".
 * ==========================================================================
 *
 * That column is what every margin figure in the app is computed from: the
 * Margin column in Inventory and its red/amber tiers, the POS below-floor
 * badge, the Item Details screen. It has exactly one correct definition --
 * the weighted average of the product's open cost batches -- and exactly one
 * place that definition lives: `recompute_product_cost` in the database.
 *
 * It used to have two. `updateWAC` in the purchases screen recomputed it as
 *
 *     (oldStock * oldCost + qty * unitCost) / (oldStock + qty)
 *
 * from the React copy of the product -- already one purchase out of date --
 * and wrote it straight after `addPurchase`. `process_purchase` had just set
 * the same column from the real batches, so the client's answer landed on top
 * of the database's and won.
 *
 * On a real shop that produced an item screen reading Rs 5.50 for stock that
 * cost Rs 7.82, a 35.3 % margin on units selling at a Rs 0.50 loss, and a bill
 * (SAL-28F1D4DC, 17 Oct) of 10 units at Rs 8.50 against Rs 90.00 of COGS.
 *
 * This test exists so the second writer cannot come back quietly.
 */

const SRC = new URL('..', import.meta.url).pathname;

const sourceFiles = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(jsx?|mjs)$/.test(p) && !/\.test\.jsx?$/.test(p) ? [p] : [];
  });

/**
 * Files where a human types a cost and the app stores what they typed. That is
 * a different act from DERIVING a cost, and it is allowed: a new item has no
 * batches yet, and an import or a correction is someone asserting a figure.
 */
const TYPED_BY_A_HUMAN = [
  'pages/inventory/components/AddItemModal.jsx',   // the item form
  'pages/purchases/components/QuickCreateProductModal.jsx',
  'pages/ImportData.jsx',
  'pages/BulkAdd.jsx',
  'lib/importSheet.js',                            // column aliases, not a write
  'pages/Vehicles.jsx',                            // reads a cost onto a van line
];

describe('products.costPrice', () => {
  const offenders = [];
  for (const file of sourceFiles(SRC)) {
    const rel = relative(SRC, file);
    if (TYPED_BY_A_HUMAN.includes(rel)) continue;
    const text = readFileSync(file, 'utf8');
    // A write is `costPrice:` inside an object going to a mutation helper.
    // Reads (`p.costPrice`, `?? costPrice`) are everywhere and are fine.
    for (const m of text.matchAll(/^\s*costPrice:\s*(.+)$/gm)) {
      offenders.push(`${rel}: ${m[1].trim()}`);
    }
  }

  it('is never derived and written by a client', () => {
    // The database owns this number. Three apps write sales and the desktop
    // replays them later; a cost formula living in one screen is a cost the
    // other two disagree with.
    expect(offenders).toEqual([]);
  });

  it('has no WAC helper in the purchases screen', () => {
    const PURCHASES = readFileSync(join(SRC, 'pages', 'purchases', 'index.jsx'), 'utf8');
    expect(PURCHASES).not.toMatch(/updateWAC/);
    // The specific formula, in case it returns under another name.
    expect(PURCHASES).not.toMatch(/oldStock\s*\*\s*oldCost/);
  });

  it('the purchases screen no longer holds a product-updating handle', () => {
    // Nothing on that screen should be able to edit a product at all now.
    const PURCHASES = readFileSync(join(SRC, 'pages', 'purchases', 'index.jsx'), 'utf8');
    expect(PURCHASES).not.toMatch(/\bupdateProduct\b/);
  });

  it('the Inventory margin column reads the cost rather than recomputing one', () => {
    // If this column ever starts deriving its own cost, the screen and the
    // database are two answers again.
    const TABLE = readFileSync(join(SRC, 'pages', 'inventory', 'components', 'StockTable.jsx'), 'utf8');
    expect(TABLE).toMatch(/const cost = toNum\(p\.costPrice\);/);
  });
});
