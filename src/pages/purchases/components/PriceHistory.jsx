import React, { useMemo } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { priceHistory } from '../lib/priceHistory';

const inr = (n) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d) => {
  const x = new Date(d);
  return isNaN(x) ? d : x.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
};

/**
 * Cost per unit over time, as steps: a purchase price holds until the next
 * purchase changes it, so a sloped line between two buys would invent prices
 * nobody paid. One scale places the line, the gridlines and their labels.
 */
const StepChart = ({ rows, sellingPrice }) => {
  const pts = [...rows].reverse();                       // oldest first
  if (pts.length < 2) return null;
  const W = 560, H = 150, L = 52, R = 12, T = 12, B = 22;
  const vals = pts.map((p) => p.unitCost).concat(sellingPrice > 0 ? [sellingPrice] : []);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 0.01) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.12;
  lo = Math.max(0, lo - pad); hi += pad;
  const t0 = new Date(pts[0].date).getTime();
  const t1 = new Date(pts[pts.length - 1].date).getTime();
  const span = Math.max(t1 - t0, 1);
  const x = (d) => L + ((new Date(d).getTime() - t0) / span) * (W - L - R);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);

  let path = `M${x(pts[0].date)},${y(pts[0].unitCost)}`;
  for (let i = 1; i < pts.length; i++) {
    path += ` H${x(pts[i].date)} V${y(pts[i].unitCost)}`;
  }
  const ticks = [lo, (lo + hi) / 2, hi];
  const last = pts[pts.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
      aria-label={`Cost per unit from ${inr(pts[0].unitCost)} to ${inr(last.unitCost)}`}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--color-sep)" strokeWidth="1" />
          <text x={L - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="var(--color-mute)">{inr(v)}</text>
        </g>
      ))}
      {sellingPrice > 0 && (
        <g>
          <line x1={L} x2={W - R} y1={y(sellingPrice)} y2={y(sellingPrice)} stroke="var(--color-good-text)" strokeWidth="1" strokeDasharray="4 3" />
          <text x={W - R} y={y(sellingPrice) - 4} textAnchor="end" fontSize="10" fill="var(--color-good-text)">Selling {inr(sellingPrice)}</text>
        </g>
      )}
      <path d={path} fill="none" stroke="var(--color-amber)" strokeWidth="2" strokeLinejoin="round" />
      {pts.map((p) => (
        <circle key={p.id} cx={x(p.date)} cy={y(p.unitCost)} r="2.5" fill="var(--color-amber)" />
      ))}
      <text x={L} y={H - 6} fontSize="10" fill="var(--color-mute)">{day(pts[0].date)}</text>
      <text x={W - R} y={H - 6} textAnchor="end" fontSize="10" fill="var(--color-mute)">{day(last.date)}</text>
    </svg>
  );
};

const Stat = ({ label, value, tone }) => (
  <div className="rounded-[10px] bg-tile px-3 py-[9px]">
    <span className="block text-[11.5px] text-body">{label}</span>
    <b className={`mt-0.5 block font-tight text-[15px] font-semibold tabular-nums ${tone || 'text-ink'}`}>{value}</b>
  </div>
);

/** Every purchase of one item: what it cost, from whom, and how that moved. */
const PriceHistory = ({ product, purchases }) => {
  const h = useMemo(() => priceHistory(purchases, product?.id), [purchases, product?.id]);
  const sell = Number(product?.sellingPrice) || 0;

  if (!h.stats) {
    return <p className="py-6 text-center text-[13px] text-body">This item has not been bought yet.</p>;
  }

  const margin = sell > 0 ? ((sell - h.stats.last) / sell) * 100 : null;

  return (
    <div className="flex flex-col gap-3" data-testid="price-history">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="Last bought at" value={inr(h.stats.last)} />
        <Stat label="Lowest" value={inr(h.stats.lowest)} />
        <Stat label="Highest" value={inr(h.stats.highest)} />
        <Stat label="Average (by qty)" value={inr(h.stats.average)} />
        <Stat label={sell > 0 ? `Margin at ${inr(sell)}` : 'Margin'}
          value={margin === null ? '—' : `${margin.toFixed(1)}%`}
          tone={margin !== null && margin <= 0 ? 'text-bad-text' : undefined} />
      </div>

      <StepChart rows={h.rows} sellingPrice={sell} />

      {h.suppliers.length > 1 && (
        <div>
          <span className="mb-1.5 block font-tight text-[12.5px] font-semibold text-ink-2">By supplier, latest price</span>
          <ul className="flex flex-col rounded-xl shadow-[inset_0_0_0_1px_var(--color-line)]" data-testid="price-history-suppliers">
            {h.suppliers.map((s) => (
              <li key={s.supplierId} className="flex items-center justify-between gap-3 border-t border-sep px-3 py-2 text-[12.5px] first:border-t-0">
                <span className="font-semibold text-ink">
                  {s.supplierName || 'Unknown supplier'}
                  {s.cheapest && (
                    <span className="ml-1.5 rounded-pill bg-good-soft px-[7px] py-px font-tight text-[11px] font-semibold text-good-text">Cheapest</span>
                  )}
                </span>
                <span className="text-[12px] text-mute tabular-nums">
                  <b className="font-tight font-semibold text-ink">{inr(s.lastCost)}</b> · {day(s.lastDate)} · {s.count} purchase{s.count > 1 ? 's' : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="max-h-72 overflow-x-auto overflow-y-auto rounded-xl shadow-[inset_0_0_0_1px_var(--color-line)]">
        <table className="w-full border-collapse text-[12.5px] tabular-nums">
          <thead className="sticky top-0 bg-tile">
            <tr className="text-left font-tight text-[11.5px] text-mute">
              <th className="px-3 py-2 font-semibold">Date</th>
              <th className="px-3 py-2 font-semibold">Supplier</th>
              <th className="px-3 py-2 text-right font-semibold">Qty</th>
              <th className="px-3 py-2 text-right font-semibold">Cost each</th>
              <th className="px-3 py-2 text-right font-semibold">Change</th>
            </tr>
          </thead>
          <tbody>
            {h.rows.map((r) => (
              <tr key={r.id} data-testid="price-history-row" className="border-t border-sep">
                <td className="whitespace-nowrap px-3 py-2">{day(r.date)}</td>
                <td className="px-3 py-2">{r.supplierName || '—'}</td>
                <td className="px-3 py-2 text-right font-tight">{r.quantity.toLocaleString('en-IN')}{product?.unit ? ` ${product.unit}` : ''}</td>
                <td className="px-3 py-2 text-right font-tight font-medium">{inr(r.unitCost)}</td>
                <td className="px-3 py-2 text-right">
                  {r.change === null || Math.abs(r.change) < 0.005
                    ? <span className="text-mute">{r.change === null ? 'First' : 'Same'}</span>
                    : (
                      <span className={`inline-flex items-center gap-1 font-tight font-semibold ${r.change > 0 ? 'text-bad-text' : 'text-good-text'}`}>
                        {r.change > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {r.pct > 0 ? '+' : ''}{r.pct.toFixed(1)}%
                      </span>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PriceHistory;
