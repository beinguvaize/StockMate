// R5 Recipe-deduct — when a dish is sold, deduct its BOM ingredients from stock.
//
// A dish is linked to a recipe via bom.finished_product_id = dish.id.
// bom_components hold the raw ingredients (raw_product_id, quantity) needed per
// `output_qty` dishes. Selling N dishes deducts (quantity/output_qty)*N of each
// ingredient via the same atomic stock RPC normal inventory moves use.
import { supabase } from './supabase';

export async function deductRecipeIngredients(tenantId, saleItems) {
  const dishIds = [...new Set((saleItems || []).map(i => i.productId).filter(Boolean))];
  if (!dishIds.length) return { deducted: 0 };

  // Recipes for the sold dishes.
  const { data: boms, error: be } = await supabase
    .from('bom')
    .select('id, finished_product_id, output_qty')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .in('finished_product_id', dishIds);
  if (be || !boms?.length) return { deducted: 0, error: be };

  const bomIds = boms.map(b => b.id);
  const { data: comps, error: ce } = await supabase
    .from('bom_components')
    .select('bom_id, raw_product_id, quantity')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .in('bom_id', bomIds);
  if (ce) return { deducted: 0, error: ce };

  const bomByDish = {};
  boms.forEach(b => { bomByDish[b.finished_product_id] = b; });
  const compsByBom = {};
  (comps || []).forEach(c => { (compsByBom[c.bom_id] ||= []).push(c); });

  // Accumulate total ingredient consumption across all sold dishes.
  const deltas = {};
  (saleItems || []).forEach(line => {
    const bom = bomByDish[line.productId];
    if (!bom) return;
    const out = Number(bom.output_qty) || 1;
    const soldQty = Number(line.quantity) || 0;
    (compsByBom[bom.id] || []).forEach(c => {
      const need = ((Number(c.quantity) || 0) / out) * soldQty;
      if (need > 0) deltas[c.raw_product_id] = (deltas[c.raw_product_id] || 0) + need;
    });
  });

  // Apply atomic deductions (negative amount).
  let deducted = 0;
  for (const [pid, qty] of Object.entries(deltas)) {
    const { error } = await supabase.rpc('adjust_inventory_atomic', {
      p_product_id: pid,
      p_location_id: null,
      p_amount: -qty,
      p_reason: 'Recipe consumption',
      p_user_id: null,
      p_tenant_id: tenantId,
    });
    if (!error) deducted += 1;
    else console.error('[recipeDeduct] ingredient', pid, error);
  }
  return { deducted };
}
