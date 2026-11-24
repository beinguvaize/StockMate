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
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--color-border)" strokeWidth="1" />
          <text x={L - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="var(--color-muted-foreground)">{inr(v)}</text>
        </g>
      ))}
      {sellingPrice > 0 && (
        <g>
          <line x1={L} x2={W - R} y1={y(sellingPrice)} y2={y(sellingPrice)} stroke="var(--color-pos)" strokeWidth="1" strokeDasharray="4 3" />
          <text x={W - R} y={y(sellingPrice) - 4} textAnchor="end" fontSize="10" fill="var(--color-pos)">Selling {inr(sellingPrice)}</text>
        </g>
      )}
      <path d={path} fill="none" stroke="var(--color-accent-signature)" strokeWidth="2" strokeLinejoin="round" />
      {pts.map((p) => (
        <circle key={p.id} cx={x(p.date)} cy={y(p.unitCost)} r="2.5" fill="var(--color-accent-signature)" />
      ))}
      <text x={L} y={H - 6} fontSize="10" fill="var(--color-muted-foreground)">{day(pts[0].date)}</text>
      <text x={W - R} y={H - 6} textAnchor="end" fontSize="10" fill="var(--color-muted-foreground)">{day(last.date)}</text>
    </svg>
  );
};

const Stat = ({ label, value, tone }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[11px] text-muted-foreground">{label}</span>
    <span className={`text-[15px] font-semibold tabular-nums ${tone || 'text-foreground'}`}>{value}</span>
  </div>
);

/** Every purchase of one item: what it cost, from whom, and how that moved. */
const PriceHistory = ({ product, purchases }) => {
  const h = useMemo(() => priceHistory(purchases, product?.id), [purchases, product?.id]);
  const sell = Number(product?.sellingPrice) || 0;

  if (!h.stats) {
    return <p className="text-[13px] text-muted-foreground py-6 text-center">This item has not been bought yet.</p>;
  }

  const margin = sell > 0 ? ((sell - h.stats.last) / sell) * 100 : null;

  return (
    <div className="flex flex-col gap-5" data-testid="price-history">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Stat label="Last bought at" value={inr(h.stats.last)} />
        <Stat label="Lowest" value={inr(h.stats.lowest)} />
        <Stat label="Highest" value={inr(h.stats.highest)} />
        <Stat label="Average (by qty)" value={inr(h.stats.average)} />
        <Stat label={sell > 0 ? `Margin at ${inr(sell)}` : 'Margin'}
          value={margin === null ? '—' : `${margin.toFixed(1)}%`}
          tone={margin !== null && margin <= 0 ? 'text-[color:var(--color-neg)]' : undefined} />
      </div>

      <StepChart rows={h.rows} sellingPrice={sell} />

      {h.suppliers.length > 1 && (
        <div>
          <h4 className="text-[12px] font-semibold text-ink-secondary mb-2">By supplier, latest price</h4>
          <ul className="flex flex-col divide-y divide-black/[0.04] rounded-xl border border-border/60" data-testid="price-history-suppliers">
            {h.suppliers.map((s) => (
              <li key={s.supplierId} className="flex items-center justify-between px-3 py-2 text-[12px]">
                <span className="font-semibold text-foreground">
                  {s.supplierName || 'Unknown supplier'}
                  {s.cheapest && (
                    <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded text-[color:var(--color-pos)]"
                      style={{ background: 'color-mix(in oklab, var(--color-pos) 12%, transparent)' }}>Cheapest</span>
                  )}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  <span className="font-semibold text-foreground">{inr(s.lastCost)}</span> · {day(s.lastDate)} · {s.count} purchase{s.count > 1 ? 's' : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-border/60 overflow-x-auto max-h-72 overflow-y-auto">
        <table className="w-full text-[12px] tabular-nums">
          <thead className="bg-canvas text-ink-secondary sticky top-0">
            <tr className="text-left">
              <th className="px-3 py-2 font-semibold">Date</th>
              <th className="px-3 py-2 font-semibold">Supplier</th>
              <th className="px-3 py-2 font-semibold text-right">Qty</th>
              <th className="px-3 py-2 font-semibold text-right">Cost each</th>
              <th className="px-3 py-2 font-semibold text-right">Change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.04]">
            {h.rows.map((r) => (
              <tr key={r.id} data-testid="price-history-row">
                <td className="px-3 py-2 whitespace-nowrap">{day(r.date)}</td>
                <td className="px-3 py-2">{r.supplierName || '—'}</td>
                <td className="px-3 py-2 text-right">{r.quantity.toLocaleString('en-IN')}{product?.unit ? ` ${product.unit}` : ''}</td>
                <td className="px-3 py-2 text-right font-semibold">{inr(r.unitCost)}</td>
                <td className="px-3 py-2 text-right">
                  {r.change === null || Math.abs(r.change) < 0.005
                    ? <span className="text-muted-foreground">{r.change === null ? 'First' : 'Same'}</span>
                    : (
                      <span className={`inline-flex items-center gap-1 font-semibold ${r.change > 0 ? 'text-[color:var(--color-neg)]' : 'text-[color:var(--color-pos)]'}`}>
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
