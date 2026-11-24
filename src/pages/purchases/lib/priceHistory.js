/**
 * What an item has cost, purchase by purchase.
 * ==========================================================================
 *
 * Read straight from the purchase rows: unit cost = line total / quantity,
 * per base unit (purchases are stored in base units). Deleted and cancelled
 * purchases are left out -- they never brought stock in.
 */

const round2 = (n) => Math.round(n * 100) / 100;

const dayOf = (d) => String(d || '').slice(0, 10);

/**
 * @returns {{
 *   rows: Array<{id, date, supplierId, supplierName, quantity, unitCost, total, change, pct}>,  newest first
 *   stats: {last, lowest, highest, average, count, firstDate, lastDate} | null,
 *   suppliers: Array<{supplierId, supplierName, lastCost, lastDate, count, cheapest}>,  cheapest first
 * }}
 */
export function priceHistory(purchases, productId) {
  const lines = (purchases || [])
    .filter((p) => p.linked_product_id === productId && !p.deleted_at
      && String(p.status || '').toUpperCase() !== 'CANCELLED'
      && Number(p.quantity) > 0 && Number(p.total_amount) > 0)
    // Oldest first, so each row can be compared with the one before it. Same
    // day: the order they were entered in.
    .sort((a, b) => dayOf(a.date).localeCompare(dayOf(b.date))
      || String(a.created_at || '').localeCompare(String(b.created_at || '')));

  let prev = null;
  let qtySum = 0;
  let totalSum = 0;
  const chrono = lines.map((p) => {
    const quantity = Number(p.quantity);
    const total = Number(p.total_amount);
    const unitCost = round2(total / quantity);
    qtySum += quantity;
    totalSum += total;
    const change = prev === null ? null : round2(unitCost - prev);
    const pct = prev ? round2(((unitCost - prev) / prev) * 100) : null;
    prev = unitCost;
    return {
      id: p.id, date: dayOf(p.date), supplierId: p.supplier_id || p.supplier_name || '',
      supplierName: p.supplier_name || '', quantity, unitCost, total, change, pct,
    };
  });

  if (!chrono.length) return { rows: [], stats: null, suppliers: [] };

  const costs = chrono.map((r) => r.unitCost);
  const stats = {
    last: chrono[chrono.length - 1].unitCost,
    lowest: Math.min(...costs),
    highest: Math.max(...costs),
    // Weighted by quantity: what a unit actually cost on average.
    average: round2(totalSum / qtySum),
    count: chrono.length,
    firstDate: chrono[0].date,
    lastDate: chrono[chrono.length - 1].date,
  };

  const bySupplier = new Map();
  for (const r of chrono) {
    const s = bySupplier.get(r.supplierId) || { supplierId: r.supplierId, supplierName: r.supplierName, count: 0 };
    s.count += 1;
    s.lastCost = r.unitCost;
    s.lastDate = r.date;
    if (r.supplierName) s.supplierName = r.supplierName;
    bySupplier.set(r.supplierId, s);
  }
  const suppliers = [...bySupplier.values()].sort((a, b) => a.lastCost - b.lastCost);
  // Cheapest only means something when there is someone to be cheaper than.
  if (suppliers.length > 1) suppliers[0].cheapest = true;

  return { rows: chrono.reverse(), stats, suppliers };
}
