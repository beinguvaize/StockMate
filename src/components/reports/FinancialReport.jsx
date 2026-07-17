import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell as PieCell,
} from 'recharts';
import { formatCurrency } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../context/TenantContext';

const EXP_COLORS = ['#534AB7', '#1D9E75', '#D85A30', '#EF9F27', '#D4537E', '#888780', '#378ADD', '#A32D2D'];

// Date-range presets. Indian financial year runs Apr 1 → Mar 31.
const iso = (d) => d.toISOString().slice(0, 10);
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

// The equal-length period immediately before [from, to].
const priorRange = (from, to) => {
  const f = new Date(from), t = new Date(to);
  const days = Math.round((t - f) / 86400000) + 1;
  const pTo = new Date(f); pTo.setDate(pTo.getDate() - 1);
  const pFrom = new Date(pTo); pFrom.setDate(pFrom.getDate() - days + 1);
  return { from: iso(pFrom), to: iso(pTo) };
};

const Cell = ({ children, align = 'right', cls = '' }) => (
  <td style={{ padding: '9px 16px', textAlign: align }} className={cls}>{children}</td>
);

const FinancialReport = () => {
  const { currentTenantId, businessProfile } = useTenant();
  const cur = businessProfile?.currencySymbol || '₹';
  const presets = useMemo(buildPresets, []);
  const [preset, setPreset] = useState('THIS_FY');
  const [range, setRange] = useState(() => {
    const p = buildPresets().find(x => x.id === 'THIS_FY');
    return { from: p.from, to: p.to };
  });
  const [pl, setPl] = useState(null);
  const [prior, setPrior] = useState(null);
  const [expCats, setExpCats] = useState([]);
  const [monthly, setMonthly] = useState([]);
  const [loading, setLoading] = useState(true);

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
      const pr = priorRange(range.from, range.to);
      const [curRes, priorRes, expRes] = await Promise.all([
        supabase.rpc('get_pl_ranged', { p_tenant_id: currentTenantId, p_from: range.from, p_to: range.to }),
        supabase.rpc('get_pl_ranged', { p_tenant_id: currentTenantId, p_from: pr.from, p_to: pr.to }),
        supabase.from('expenses').select('amount, category, date')
          .eq('tenant_id', currentTenantId).is('deleted_at', null)
          .gte('date', range.from).lte('date', range.to),
      ]);
      if (cancelled) return;
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
  }, [currentTenantId, range.from, range.to]);

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
    if (d === null) return <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>;
    // For expenses, an increase is unfavourable (amber/red); for income, favourable (green).
    const up = d > 0.05, down = d < -0.05;
    const good = expense ? down : up;
    const color = Math.abs(d) < 0.05 ? '#9a9a9a' : good ? '#0F6E56' : (expense ? '#854F0B' : '#A32D2D');
    return <span style={{ color }}>{d > 0 ? '+' : ''}{d.toFixed(1)}%</span>;
  };

  const ratioCards = [
    { label: 'Gross margin', value: `${grossMargin.toFixed(1)}%`, good: grossMargin >= 0 },
    { label: 'Net margin', value: `${netMargin.toFixed(1)}%`, good: netMargin >= 0 },
    { label: 'COGS ratio', value: pct(m.cogs) },
    { label: 'OpEx ratio', value: pct(m.expenses) },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* Date range bar */}
      <div className="flex flex-wrap items-center gap-2 no-print">
        <div className="flex gap-1 bg-canvas p-1 rounded-pill">
          {presets.map(pr => (
            <button key={pr.id} onClick={() => applyPreset(pr.id)}
              className={`px-3 py-1.5 rounded-pill text-[11px] font-bold transition-colors ${
                preset === pr.id ? 'bg-accent-signature text-button-text shadow-sm' : 'text-gray-500 hover:text-ink-primary'
              }`}>{pr.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <input type="date" value={range.from} onChange={e => { setPreset(''); setRange(r => ({ ...r, from: e.target.value })); }}
            className="bg-white border border-black/10 rounded-lg px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-accent-signature/40" />
          <span className="text-xs text-gray-400">→</span>
          <input type="date" value={range.to} onChange={e => { setPreset(''); setRange(r => ({ ...r, to: e.target.value })); }}
            className="bg-white border border-black/10 rounded-lg px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-accent-signature/40" />
        </div>
      </div>

      {/* Ratio strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {ratioCards.map(c => (
          <div key={c.label} className="bg-white rounded-2xl border border-black/[0.07] p-4">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{c.label}</div>
            <div className={`text-2xl font-black tabular-nums mt-1 ${c.good === false ? 'text-rose-600' : c.good ? 'text-emerald-600' : 'text-ink-primary'}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Statement */}
      <div className="bg-white rounded-2xl border border-black/[0.07] overflow-hidden">
        <div className="px-4 py-3 border-b border-black/[0.05] flex items-center justify-between">
          <span className="text-[11px] font-black text-gray-500 uppercase tracking-wider">Profit &amp; Loss</span>
          {loading && <span className="text-[10px] font-bold text-gray-400">Loading…</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr className="text-[10px] text-gray-400 uppercase tracking-wider">
                <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 700 }}>Line item</th>
                <th style={{ textAlign: 'right', padding: '10px 16px', fontWeight: 700 }}>Amount</th>
                <th style={{ textAlign: 'right', padding: '10px 16px', fontWeight: 700 }}>% of rev</th>
                <th style={{ textAlign: 'right', padding: '10px 16px', fontWeight: 700 }}>Prior</th>
                <th style={{ textAlign: 'right', padding: '10px 16px', fontWeight: 700 }}>Δ</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-black/[0.05]">
                <Cell align="left" cls="font-bold text-ink-primary">{m.gst > 0 ? 'Sales revenue (net of GST)' : 'Sales revenue (gross)'}</Cell>
                <Cell cls="font-bold tabular-nums">{formatCurrency(m.revenue, cur)}</Cell>
                <Cell cls="text-gray-400">100.0%</Cell>
                <Cell cls="text-gray-400">{formatCurrency(p.revenue, cur)}</Cell>
                <Cell><Delta cur={m.revenue} prior={p.revenue} /></Cell>
              </tr>
              <tr className="border-t border-black/[0.05]">
                <Cell align="left" cls="text-gray-600">Cost of goods sold</Cell>
                <Cell cls="text-rose-600 tabular-nums">({formatCurrency(m.cogs, cur).replace(cur, '')})</Cell>
                <Cell cls="text-gray-400">{pct(m.cogs)}</Cell>
                <Cell cls="text-gray-400">({formatCurrency(p.cogs, cur).replace(cur, '')})</Cell>
                <Cell><Delta cur={m.cogs} prior={p.cogs} expense /></Cell>
              </tr>
              <tr className="border-t border-black/10 bg-canvas/50">
                <Cell align="left" cls="font-black text-ink-primary">Gross profit</Cell>
                <Cell cls="font-black text-emerald-600 tabular-nums">{formatCurrency(m.gross, cur)}</Cell>
                <Cell cls="font-bold">{pct(m.gross)}</Cell>
                <Cell cls="text-gray-400">{formatCurrency(p.gross, cur)}</Cell>
                <Cell><Delta cur={m.gross} prior={p.gross} /></Cell>
              </tr>

              <tr className="border-t border-black/[0.05]">
                <td colSpan={5} style={{ padding: '7px 16px 3px' }} className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Operating expenses</td>
              </tr>
              {expCats.length === 0 && !loading && (
                <tr><td colSpan={5} style={{ padding: '6px 28px' }} className="text-xs text-gray-400">No expenses in this period</td></tr>
              )}
              {expCats.map(c => (
                <tr key={c.name}>
                  <td style={{ padding: '6px 16px 6px 28px' }} className="text-gray-600">{c.name}</td>
                  <Cell cls="tabular-nums">{formatCurrency(c.amount, cur).replace(cur, '')}</Cell>
                  <Cell cls="text-gray-400">{pct(c.amount)}</Cell>
                  <Cell cls="text-gray-300">—</Cell>
                  <Cell cls="text-gray-300">—</Cell>
                </tr>
              ))}
              <tr className="border-t border-black/[0.05]">
                <Cell align="left" cls="text-gray-700">Total operating expenses</Cell>
                <Cell cls="text-rose-600 tabular-nums">({formatCurrency(m.expenses, cur).replace(cur, '')})</Cell>
                <Cell cls="text-gray-400">{pct(m.expenses)}</Cell>
                <Cell cls="text-gray-400">({formatCurrency(p.expenses, cur).replace(cur, '')})</Cell>
                <Cell><Delta cur={m.expenses} prior={p.expenses} expense /></Cell>
              </tr>

              <tr className="border-t-2 border-black/20 bg-canvas/50">
                <Cell align="left" cls="font-black text-ink-primary">Net profit</Cell>
                <Cell cls={`font-black text-[15px] tabular-nums ${m.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(m.net, cur)}</Cell>
                <Cell cls="font-bold">{pct(m.net)}</Cell>
                <Cell cls="text-gray-400">{formatCurrency(p.net, cur)}</Cell>
                <Cell><Delta cur={m.net} prior={p.net} /></Cell>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-black/[0.05] flex items-center justify-between text-[11px]">
          <span className="font-bold text-gray-400 uppercase tracking-wider">GST Payable (memo)</span>
          <span className="font-black text-accent-signature tabular-nums">{formatCurrency(m.gst, cur)}</span>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-black/[0.07] p-4">
          <div className="text-[11px] font-black text-gray-500 uppercase tracking-wider mb-1">Margin trend · 6 months</div>
          <div className="flex gap-4 text-[11px] font-bold text-gray-400 mb-2">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#1D9E75' }} />Gross %</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#378ADD' }} />Net %</span>
          </div>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <LineChart data={monthly} margin={{ top: 5, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9a9a9a' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9a9a9a' }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip formatter={(v) => `${v}%`} contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid rgba(0,0,0,0.08)' }} />
                <Line type="monotone" dataKey="gross" stroke="#1D9E75" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="net" stroke="#378ADD" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-black/[0.07] p-4">
          <div className="text-[11px] font-black text-gray-500 uppercase tracking-wider mb-2">Expense composition</div>
          {expCats.length === 0 ? (
            <div className="h-[220px] flex items-center justify-center text-xs font-semibold text-gray-400">No expenses in this period</div>
          ) : (
            <div className="flex items-center gap-3">
              <div style={{ width: 150, height: 200 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={expCats} dataKey="amount" nameKey="name" innerRadius={42} outerRadius={70} paddingAngle={1}>
                      {expCats.map((_, i) => <PieCell key={i} fill={EXP_COLORS[i % EXP_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => formatCurrency(v, cur)} contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid rgba(0,0,0,0.08)' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                {expCats.slice(0, 6).map((c, i) => (
                  <div key={c.name} className="flex items-center gap-2 text-[11px]">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: EXP_COLORS[i % EXP_COLORS.length] }} />
                    <span className="font-semibold text-gray-600 truncate flex-1">{c.name}</span>
                    <span className="font-bold text-ink-primary tabular-nums">{pct(c.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <p className="text-[10px] text-gray-400 px-1">Prior column = the equal-length period immediately before. Δ green = favourable, amber/red = watch. Ties to the ledger.</p>
    </div>
  );
};

export default FinancialReport;
