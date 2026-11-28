import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { cn } from '../../lib/utils';
import { Seg, DateField, Figures, FigureTile, ReportBox, ErrorBlock, EmptyBlock, LoadingRows } from './frame';
import { Eyebrow } from '../ui/FigureStrip';
import { formatCurrency } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../context/TenantContext';
import { iso, compareRange, shortDate, COMPARE } from '../../lib/reportPeriods';
import { useLinkedRange } from '../../lib/linkedRange';


// Date-range presets. Indian financial year runs Apr 1 → Mar 31.
const buildPresets = () => {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const fy = m >= 3 ? y : y - 1;
  // Open periods end TODAY, not at the period's calendar end. Padding "This
  // Month" out to the 31st made the current side a part-month while
  // priorRange (equal day-count) swelled to a full month — the Prior column
  // compared 17 real days against 31 and every Δ looked like a collapse.
  // Clamped, Jul 1–17 compares against the 17 days ending Jun 30.
  const today = iso(now);
  return [
    { id: 'THIS_MONTH', label: 'This Month', from: iso(new Date(y, m, 1)), to: today },
    { id: 'LAST_MONTH', label: 'Last Month', from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) },
    { id: 'THIS_FY', label: 'This FY', from: `${fy}-04-01`, to: today },
    { id: 'THIS_YEAR', label: 'This Year', from: `${y}-01-01`, to: today },
    { id: 'ALL', label: 'All Time', from: '2000-01-01', to: today },
  ];
};

const Cell = ({ children, align = 'right', cls = '' }) => (
  <td className={cn('border-b border-sep px-4 py-[10px] tabular-nums', align === 'right' ? 'text-right font-tight' : 'text-left', cls)}>{children}</td>
);

const FinancialReport = () => {
  const { currentTenantId, businessProfile } = useTenant();
  const cur = businessProfile?.currencySymbol || '₹';
  const presets = useMemo(buildPresets, []);
  const linked = useLinkedRange();
  const [preset, setPreset] = useState(linked ? '' : 'THIS_FY');
  const [range, setRange] = useState(() => {
    if (linked) return { from: linked.from, to: linked.to };
    const p = buildPresets().find(x => x.id === 'THIS_FY');
    return { from: p.from, to: p.to };
  });
  const [pl, setPl] = useState(null);
  const [prior, setPrior] = useState(null);
  const [basis, setBasis] = useState('PREV');
  const [expCats, setExpCats] = useState([]);
  const [monthly, setMonthly] = useState([]);
  const [loading, setLoading] = useState(true);
  // A failed read shows the error state, never a ₹0 statement.
  const [failure, setFailure] = useState(null);
  const [trendFailed, setTrendFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const applyPreset = (id) => {
    const p = presets.find(x => x.id === id);
    if (!p) return;
    setPreset(id); setRange({ from: p.from, to: p.to });
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!currentTenantId) return;
      setLoading(true);
      setFailure(null);
      const pr = compareRange(range.from, range.to, basis);
      const [curRes, priorRes, expRes] = await Promise.all([
        supabase.rpc('get_pl_ranged', { p_tenant_id: currentTenantId, p_from: range.from, p_to: range.to }),
        supabase.rpc('get_pl_ranged', { p_tenant_id: currentTenantId, p_from: pr.from, p_to: pr.to }),
        supabase.from('expenses').select('amount, category, date')
          .eq('tenant_id', currentTenantId).is('deleted_at', null)
          .gte('date', range.from).lte('date', range.to),
      ]);
      if (cancelled) return;
      const readErr = curRes.error || priorRes.error || expRes.error;
      if (readErr) console.error('[pl] read failed', readErr);
      setFailure(readErr ? (readErr.message || 'Could not load the profit and loss') : null);
      setPl(Array.isArray(curRes.data) ? curRes.data[0] : curRes.data);
      setPrior(Array.isArray(priorRes.data) ? priorRes.data[0] : priorRes.data);
      const map = {};
      (expRes.data || []).forEach(e => {
        const c = e.category || 'Other';
        map[c] = (map[c] || 0) + Number(e.amount || 0);
      });
      setExpCats(Object.entries(map).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount));
      setLoading(false);

      // Trailing 6 months of margin trend, ending at the selected range's month.
      const anchor = new Date(range.to);
      const months = Array.from({ length: 6 }).map((_, i) => {
        const d = new Date(anchor.getFullYear(), anchor.getMonth() - (5 - i), 1);
        return {
          label: d.toLocaleString('default', { month: 'short' }),
          from: iso(new Date(d.getFullYear(), d.getMonth(), 1)),
          to: iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
        };
      });
      const results = await Promise.all(months.map(mo =>
        supabase.rpc('get_pl_ranged', { p_tenant_id: currentTenantId, p_from: mo.from, p_to: mo.to })));
      if (cancelled) return;
      setTrendFailed(results.some((r) => r.error));
      setMonthly(months.map((mo, i) => {
        const row = Array.isArray(results[i].data) ? results[i].data[0] : results[i].data;
        const r = Number(row?.revenue_net || 0);
        return {
          label: mo.label,
          gross: r > 0 ? +(Number(row?.gross_profit || 0) / r * 100).toFixed(1) : 0,
          net: r > 0 ? +(Number(row?.net_profit || 0) / r * 100).toFixed(1) : 0,
        };
      }));
    };
    run();
    return () => { cancelled = true; };
  }, [currentTenantId, range.from, range.to, basis, attempt]);

  const m = {
    revenue: Number(pl?.revenue_net || 0), cogs: Number(pl?.cogs || 0),
    gross: Number(pl?.gross_profit || 0), expenses: Number(pl?.expenses || 0),
    net: Number(pl?.net_profit || 0), gst: Number(pl?.output_gst || 0),
  };
  const p = {
    revenue: Number(prior?.revenue_net || 0), cogs: Number(prior?.cogs || 0),
    gross: Number(prior?.gross_profit || 0), expenses: Number(prior?.expenses || 0),
    net: Number(prior?.net_profit || 0),
  };
  const rev = m.revenue || 0;
  const pct = (v) => rev > 0 ? `${(v / rev * 100).toFixed(1)}%` : '—';
  const delta = (c, pv) => {
    if (!pv) return null;
    const d = (c - pv) / Math.abs(pv) * 100;
    return d;
  };
  const grossMargin = rev > 0 ? (m.gross / rev * 100) : 0;
  const netMargin = rev > 0 ? (m.net / rev * 100) : 0;

  const Delta = ({ cur: c, prior: pv, expense }) => {
    const d = delta(c, pv);
    if (d === null) return <span className="text-mute">—</span>;
    // For expenses, an increase is unfavourable (amber/red); for income, favourable (green).
    const up = d > 0.05, down = d < -0.05;
    const good = expense ? down : up;
    const tone = Math.abs(d) < 0.05 ? 'text-mute' : good ? 'text-good-text' : (expense ? 'text-amber-text' : 'text-bad-text');
    return <span className={tone}>{d > 0 ? '+' : ''}{d.toFixed(1)}%</span>;
  };

  // Name the window the Prior column is actually showing. Without it "Prior"
  // is three different periods depending on a dropdown elsewhere on the page.
  const cmp = compareRange(range.from, range.to, basis);
  const cmpLabel = `${shortDate(cmp.from)} – ${shortDate(cmp.to)}`;

  const ratioCards = [
    { label: 'Gross margin', value: `${grossMargin.toFixed(1)}%`, good: grossMargin >= 0 },
    { label: 'Net margin', value: `${netMargin.toFixed(1)}%`, good: netMargin >= 0 },
    { label: 'COGS ratio', value: pct(m.cogs) },
    { label: 'OpEx ratio', value: pct(m.expenses) },
  ];

  const maxExp = expCats.length ? Math.max(...expCats.slice(0, 6).map((c) => c.amount)) : 0;
  const th = 'border-b border-line bg-tile px-4 py-2.5 font-tight text-[12px] font-semibold text-mute';

  return (
    <div className="pb-16">
      {/* Period row (reports-06) */}
      <div className="no-print mb-3.5 flex flex-wrap items-center gap-2.5">
        <Seg ariaLabel="Period" value={preset} onChange={applyPreset}
          items={presets.map((pr) => ({ id: pr.id, label: pr.label }))} />
        <div className="flex-1" />
        <Eyebrow>Compare to</Eyebrow>
        <select value={basis} onChange={e => setBasis(e.target.value)} aria-label="Compare to"
          className="h-[34px] cursor-pointer rounded-pill bg-surface pl-3.5 pr-2 font-tight text-[13px] font-semibold text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--color-amber)]">
          {COMPARE.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <DateField label="From" value={range.from} onChange={(v) => { setPreset(''); setRange(r => ({ ...r, from: v })); }} />
        <span className="text-[13px] text-mute">→</span>
        <DateField label="To" value={range.to} onChange={(v) => { setPreset(''); setRange(r => ({ ...r, to: v })); }} />
      </div>

      {failure ? (
        <ErrorBlock title="Profit & Loss could not load" message={failure} onRetry={() => setAttempt((n) => n + 1)} />
      ) : (
      <>
      {/* Ratio tiles */}
      <Figures cols={4}>
        {ratioCards.map(c => (
          <FigureTile key={c.label} label={c.label} value={c.value} loading={loading}
            tone={c.good === false ? 'neg' : c.good ? 'pos' : undefined} />
        ))}
      </Figures>

      {/* Statement */}
      <ReportBox flush title="Profit & Loss" right={loading ? <small className="text-[12.5px] text-mute">Loading…</small> : null}>
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full border-collapse text-[13.5px] text-ink">
            <thead>
              <tr>
                <th className={cn(th, 'text-left')}>Line item</th>
                <th className={cn(th, 'text-right')}>Amount</th>
                <th className={cn(th, 'text-right')}>% of rev</th>
                <th className={cn(th, 'text-right')}>
                  Prior
                  <small className="block font-sans text-[10.5px] font-medium text-mute">{cmpLabel}</small>
                </th>
                <th className={cn(th, 'text-right')}>Δ</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Cell align="left" cls="font-tight font-semibold text-ink">{m.gst > 0 ? 'Sales revenue (net of GST)' : 'Sales revenue (gross)'}</Cell>
                <Cell cls="font-semibold">{formatCurrency(m.revenue, cur)}</Cell>
                <Cell cls="text-body">100.0%</Cell>
                <Cell cls="text-body">{formatCurrency(p.revenue, cur)}</Cell>
                <Cell><Delta cur={m.revenue} prior={p.revenue} /></Cell>
              </tr>
              <tr>
                <Cell align="left" cls="text-ink-2">Cost of goods sold</Cell>
                <Cell cls="text-bad-text">({formatCurrency(m.cogs, cur).replace(cur, '')})</Cell>
                <Cell cls="text-body">{pct(m.cogs)}</Cell>
                <Cell cls="text-body">({formatCurrency(p.cogs, cur).replace(cur, '')})</Cell>
                <Cell><Delta cur={m.cogs} prior={p.cogs} expense /></Cell>
              </tr>
              <tr className="[&>td]:bg-[#FBFBFA] [&>td]:font-semibold">
                <Cell align="left" cls="font-tight text-ink">Gross profit</Cell>
                <Cell cls="text-good-text">{formatCurrency(m.gross, cur)}</Cell>
                <Cell>{pct(m.gross)}</Cell>
                <Cell cls="text-body">{formatCurrency(p.gross, cur)}</Cell>
                <Cell><Delta cur={m.gross} prior={p.gross} /></Cell>
              </tr>

              <tr>
                <td colSpan={5} className="border-b border-sep bg-[#FBFBFA] px-4 py-2 font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute">Operating expenses</td>
              </tr>
              {expCats.length === 0 && !loading && (
                <tr><td colSpan={5} className="border-b border-sep py-1.5 pl-[34px] pr-4 text-[12.5px] text-body">No expenses in this period</td></tr>
              )}
              {expCats.map(c => (
                <tr key={c.name}>
                  <td className="border-b border-sep py-[9px] pl-[34px] pr-4 text-ink-2">{c.name}</td>
                  <Cell>{formatCurrency(c.amount, cur).replace(cur, '')}</Cell>
                  <Cell cls="text-body">{pct(c.amount)}</Cell>
                  <Cell cls="text-body">—</Cell>
                  <Cell cls="text-body">—</Cell>
                </tr>
              ))}
              <tr>
                <Cell align="left" cls="text-ink-2">Total operating expenses</Cell>
                <Cell cls="text-bad-text">({formatCurrency(m.expenses, cur).replace(cur, '')})</Cell>
                <Cell cls="text-body">{pct(m.expenses)}</Cell>
                <Cell cls="text-body">({formatCurrency(p.expenses, cur).replace(cur, '')})</Cell>
                <Cell><Delta cur={m.expenses} prior={p.expenses} expense /></Cell>
              </tr>

              <tr className="[&>td]:bg-[#FBFBFA] [&>td]:border-b-0">
                <Cell align="left" cls="font-tight text-[15px] font-semibold text-ink">Net profit</Cell>
                <Cell cls={`text-[15px] font-semibold ${m.net >= 0 ? 'text-good-text' : 'text-bad-text'}`}>{formatCurrency(m.net, cur)}</Cell>
                <Cell cls="font-semibold">{pct(m.net)}</Cell>
                <Cell cls="text-body">{formatCurrency(p.net, cur)}</Cell>
                <Cell><Delta cur={m.net} prior={p.net} /></Cell>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-line px-3.5 py-3 text-[13px] text-body">
          <span>GST Payable (memo)</span>
          <span className="font-tight font-semibold text-ink tabular-nums">{formatCurrency(m.gst, cur)}</span>
        </div>
      </ReportBox>

      {/* Charts */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ReportBox className="mb-0" title="Margin trend · 6 months" sub="Gross % · Net % per month">
          {trendFailed ? (
            <EmptyBlock compact text="The trend could not load. The statement above is complete." />
          ) : monthly.length === 0 ? <LoadingRows rows={3} /> : (
            <>
              <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer>
                  <LineChart data={monthly} margin={{ top: 5, right: 8, bottom: 0, left: -18 }}>
                    <CartesianGrid stroke="var(--color-sep)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10.5, fill: 'var(--color-mute)', fontWeight: 600 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10.5, fill: 'var(--color-mute)', fontWeight: 600 }} axisLine={false} tickLine={false} unit="%" />
                    <Tooltip formatter={(v) => `${v}%`} contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid var(--color-line)' }} />
                    <Line type="monotone" dataKey="gross" name="Gross %" stroke="var(--color-ink-2)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                    <Line type="monotone" dataKey="net" name="Net %" stroke="var(--color-amber)" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-1.5 flex gap-3.5 text-[12px] text-body">
                <span><i className="mr-[5px] inline-block h-[9px] w-[9px] rounded-[3px] bg-ink-2 align-[-1px]" />Gross %</span>
                <span><i className="mr-[5px] inline-block h-[9px] w-[9px] rounded-[3px] bg-amber align-[-1px]" />Net %</span>
              </div>
            </>
          )}
        </ReportBox>

        <ReportBox className="mb-0" title="Expense composition"
          sub={expCats.length > 6 ? `top 6 of ${expCats.length}, as % of revenue` : 'as % of revenue'}>
          {expCats.length === 0 ? (
            <EmptyBlock compact text="No expenses in this period" />
          ) : (
            <div>
              {expCats.slice(0, 6).map((c) => (
                <div key={c.name} className="grid grid-cols-[130px_1fr_72px] items-center gap-2.5 py-1.5 text-[13px]">
                  <span className="truncate text-ink-2">{c.name}</span>
                  <span className="relative h-2 overflow-hidden rounded-pill bg-well">
                    <i className="absolute inset-y-0 left-0 rounded-pill bg-ink-2" style={{ width: `${maxExp > 0 ? Math.round((c.amount / maxExp) * 100) : 0}%` }} />
                  </span>
                  <span className="text-right font-tight font-semibold text-ink tabular-nums">{pct(c.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </ReportBox>
      </div>
      </>
      )}

      <p className="text-[12.5px] text-body">Prior column = {COMPARE.find(c => c.id === basis)?.shortLabel} ({cmpLabel}), always the same number of days as the selected range. Δ green = favourable, amber/red = watch. Ties to the ledger.</p>
    </div>
  );
};

export default FinancialReport;
