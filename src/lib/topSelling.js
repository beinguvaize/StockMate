/**
 * Top-selling items: one ranking, read by the Dashboard ("Top-selling items")
 * and the Sales history ("Best sellers"), so both show the same list for the
 * same period.
 *
 * The figures follow the Business report's "Top products" rule exactly
 * (components/reports/BusinessReport.jsx): countable sales only
 * (isCountableSale: voided, failed, cancelled and refunded bills left out),
 * each line keyed by product id (or name when there is none),
 *   sold  = Σ quantity
 *   value = Σ quantity × rate
 * Ranked by value; Sales history can also rank by quantity. Nothing here is a
 * profit or a cost.
 */
import { isCountableSale } from '../components/reports/reportUtils';

export function rankTopSelling(sales = [], { by = 'value', limit = 5 } = {}) {
  const map = new Map();
  let value = 0;
  (sales || []).forEach(s => {
    if (!isCountableSale(s)) return;
    (Array.isArray(s.items) ? s.items : []).forEach(item => {
      const key = item.id || item.productId || item.name || 'unknown';
      const qty = Number(item.quantity || 0);
      const v = qty * Number(item.rate || 0);
      if (!map.has(key)) map.set(key, { key, name: item.name || 'Unknown', qty: 0, value: 0 });
      const row = map.get(key);
      row.qty += qty;
      row.value += v;
      value += v;
    });
  });
  const all = [...map.values()];
  const primary = by === 'quantity' ? 'qty' : 'value';
  const secondary = by === 'quantity' ? 'value' : 'qty';
  all.sort((a, b) => (b[primary] - a[primary]) || (b[secondary] - a[secondary]) || a.name.localeCompare(b.name));
  const rows = all.slice(0, limit).map((r, i) => ({ ...r, rank: i + 1 }));
  const top = rows[0]?.[primary] || 0;
  return {
    rows: rows.map(r => ({ ...r, share: top > 0 ? (r[primary] / top) * 100 : 0 })),
    itemCount: all.length,
    // Σ value of every line counted, and of the rows shown ("Top 5 made X of Y").
    totalValue: value,
    shownValue: rows.reduce((s, r) => s + r.value, 0),
  };
}
