import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { isStocked } from '../lib/productTypes';
import useRefetchOnFocus from '../hooks/useRefetchOnFocus';
import { useDashboardKpis } from '../hooks/useDashboardKpis';
import BannerCarousel from '../components/BannerCarousel';
import ExpiryAlertCard from '../components/ExpiryAlertCard';
import { useTenant } from '../context/TenantContext';
import { supabase } from '../lib/supabase';
import { isElectron } from '../lib/offline/hookAdapter';
import { useInventory } from '../hooks/useInventory';
import { useSales } from '../hooks/useSales';
import { usePurchases } from '../hooks/usePurchases';
import { useFinance } from '../hooks/useFinance';
import { usePeople } from '../hooks/usePeople';
import { useStaffDues } from '../hooks/useStaffDues';
import { useOperations } from '../hooks/useOperations';
import { useAccounts } from '../hooks/useAccounts';
import { RefreshCw, Check, Circle, X } from 'lucide-react';
import { useNavigate} from 'react-router-dom';
import usePlayOnce from '../components/motion/usePlayOnce';
import CountUp from '../components/motion/CountUp';
import SegmentedTabs from '../components/motion/SegmentedTabs';
import DailyRevenueTrendChart from '../components/DailyRevenueTrendChart';
import { Card, CardHeader, CardTitle, CardFooter } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import { FigureStrip, Figure, Eyebrow } from '../components/ui/FigureStrip';
import usePLRanged from '../components/reports/usePLRanged';
import { useTopSellingItems } from '../hooks/useTopSellingItems';
import { supplierOwedSummary } from '../lib/supplierOwed';
import {
  periodRange, sumInRange, inRange, deltaPct, deltaTone, formatDelta,
  spanLabel, setupSteps, isNewShop,
} from '../lib/dashboardFigures';
import {
  minutesOfDay, periodComparison, sumInPeriodComparison, periodComparisonWords,
} from '../lib/salesComparison';
import { DashboardQuickActions } from '../components/AppLayout';
import { todayISOInAppTZ, formatShortDateTime, parseLocalDate, getAppTimezone } from '../lib/utils';
import { realtimeEnabled } from '../lib/realtime';
import {
 ResponsiveContainer,
 AreaChart,
 Area,
 LineChart,
 Line,
 XAxis,
 YAxis,
 CartesianGrid,
 Tooltip as RechartsTooltip,
 BarChart,
 Bar,
} from 'recharts';

// ── Chart pieces (outside Dashboard to avoid re-instantiation) ─────────────
// Web redesign look: hairline dashed grid, mute axis labels, dark tooltip,
// amber for this period, grey for the last. `playing` lets the entrance
// (line drawing itself, bars growing) run once per page open; after that a
// refresh redraws in place.
const AXIS_TICK = { fill: '#8A9099', fontSize: 11 };
const GRID = '#F0EFED';
const TOOLTIP = {
  contentStyle: { background: '#111418', border: 'none', borderRadius: 10, padding: '7px 11px', boxShadow: '0 8px 24px -8px rgba(17,20,24,0.4)' },
  labelStyle: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 2 },
  itemStyle: { color: '#FFFFFF', fontSize: 12, fontWeight: 600, padding: 0 },
};
const kTick = (currencySymbol) => (val) => `${currencySymbol}${val > 999 ? (val/1000).toFixed(1) + 'k' : val}`;
const money = (currencySymbol) => (val, name) => [`${currencySymbol}${Number(val).toLocaleString('en-IN')}`, name];

const WeeklySalesBarChart = React.memo(({ data, currencySymbol, playing }) => (
  <ResponsiveContainer width="100%" height="100%">
    <BarChart data={data} margin={{ top: 6, right: 0, left: -14, bottom: 0}} barGap={3} barCategoryGap="24%">
      <CartesianGrid strokeDasharray="4 4" vertical={false} stroke={GRID} />
      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={AXIS_TICK} />
      <YAxis axisLine={false} tickLine={false} tick={AXIS_TICK} tickFormatter={kTick(currencySymbol)} width={52} />
      <RechartsTooltip cursor={{ fill: 'rgba(17,20,24,0.03)'}} {...TOOLTIP} formatter={money(currencySymbol)} />
      <Bar dataKey="prev"  name="Last week" fill="#D9D8D5" radius={[4, 4, 1, 1]} maxBarSize={16}
        isAnimationActive={playing} animationBegin={200} animationDuration={280} animationEasing="ease-out" />
      <Bar dataKey="value" name="This week" fill="var(--color-amber)" radius={[4, 4, 1, 1]} maxBarSize={16}
        isAnimationActive={playing} animationBegin={230} animationDuration={280} animationEasing="ease-out" />
    </BarChart>
  </ResponsiveContainer>
));

const MonthlyComparisonAreaChart = React.memo(({ data, currencySymbol, playing, thisLabel, lastLabel }) => (
  <ResponsiveContainer width="100%" height="100%">
    <AreaChart data={data} margin={{ top: 6, right: 4, left: -14, bottom: 0}}>
      <defs>
        <linearGradient id="fillThisMonth" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-amber)" stopOpacity={0.18}/>
          <stop offset="100%" stopColor="var(--color-amber)" stopOpacity={0}/>
        </linearGradient>
      </defs>
      <CartesianGrid strokeDasharray="4 4" vertical={false} stroke={GRID} />
      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={AXIS_TICK} interval="preserveStartEnd" minTickGap={18} />
      <YAxis axisLine={false} tickLine={false} tick={AXIS_TICK} tickFormatter={kTick(currencySymbol)} width={52} />
      <RechartsTooltip {...TOOLTIP} formatter={money(currencySymbol)} labelFormatter={(d) => `Day ${d}`} />
      <Area type="monotone" dataKey="lastMonth" name={lastLabel} stroke="#B7BCC2" strokeWidth={1.5} strokeDasharray="4 4" fill="none"
        dot={false} isAnimationActive={false} />
      {/* Recharts draws a first-time Area by sweeping a clip from the left:
          the line draws itself, once, while `playing`. */}
      <Area type="monotone" dataKey="thisMonth" name={thisLabel} stroke="var(--color-amber)" strokeWidth={2.5} fillOpacity={1} fill="url(#fillThisMonth)"
        dot={false} activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }}
        isAnimationActive={playing} animationBegin={220} animationDuration={560} animationEasing="ease-out" />
    </AreaChart>
  </ResponsiveContainer>
));

const MoneyInOutChart = React.memo(({ data, currencySymbol }) => (
  <ResponsiveContainer width="100%" height="100%">
    <LineChart data={data} margin={{ top: 6, right: 6, left: -14, bottom: 0}}>
      <CartesianGrid strokeDasharray="4 4" vertical={false} stroke={GRID} />
      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={AXIS_TICK} tickFormatter={(v) => String(v).replace(/^\D+\s*/, '')} />
      <YAxis axisLine={false} tickLine={false} tick={AXIS_TICK} tickFormatter={kTick(currencySymbol)} width={52} />
      <RechartsTooltip {...TOOLTIP} formatter={money(currencySymbol)} />
      <Line type="monotone" dataKey="income" name="Sales" stroke="var(--color-good)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} isAnimationActive={false} />
      <Line type="monotone" dataKey="expense" name="Expenses" stroke="var(--color-bad)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} isAnimationActive={false} />
    </LineChart>
  </ResponsiveContainer>
));

// Legend chip used in card headers.
const Key = ({ swatch, dashed = false, children }) => (
  <span className="flex items-center gap-1.5 text-body whitespace-nowrap">
    {dashed
      ? <i className="block w-3.5 border-t-2 border-dashed border-faint" />
      : <i className="block size-2.5 rounded-[3px]" style={{ background: swatch }} />}
    {children}
  </span>
);

// Centred empty / waiting message inside a chart box.
const ChartNote = ({ children }) => (
  <div className="absolute inset-0 flex items-center justify-center text-center text-[13px] text-mute px-4">{children}</div>
);

// List row inside a dashboard card: text on the left, figure / actions on the right.
const ListRow = ({ left, right, onClick }) => {
  const cls = 'flex items-center justify-between gap-3 py-[9px] border-t border-sep first:border-t-0 min-w-0';
  const body = (<><div className="min-w-0">{left}</div><div className="flex items-center gap-2 shrink-0">{right}</div></>);
  if (!onClick) return <div className={cls}>{body}</div>;
  return (
    <div role="button" tabIndex={0} onClick={onClick}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }}
      className={`${cls} cursor-pointer rounded-md -mx-1.5 px-1.5 transition-colors duration-(--dur-press) hover:bg-tile`}>
      {body}
    </div>
  );
};
const ListNote = ({ children }) => (
  <div className="h-full min-h-[120px] grid place-items-center px-4 text-center text-[13px] text-mute">{children}</div>
);
const Count = ({ tone = 'neutral', children }) => (
  <span className={`ml-2 align-[1px] rounded-pill px-2 py-0.5 font-tight text-[11.5px] font-semibold tabular-nums ${tone === 'warn' ? 'bg-amber-soft text-amber-text' : 'bg-well text-body'}`}>{children}</span>
);
const SeeAll = ({ onClick, children }) => (
  <button type="button" onClick={onClick} className="font-tight text-[13px] font-semibold text-amber-text hover:underline underline-offset-4">{children}</button>
);
// One line of the Operations card; `meter` draws the thin bar under the label.
const OpsRow = ({ label, sub, value, meter, onClick }) => (
  <ListRow onClick={onClick}
    left={<>
      <span className="block text-ink-2">{label}</span>
      {sub && <small className="block text-[12px] text-mute">{sub}</small>}
      {typeof meter === 'number' && (
        <span className="mt-1.5 block h-1.5 w-[120px] overflow-hidden rounded-pill bg-well" aria-hidden="true">
          <i className="block h-full rounded-pill bg-ink-2" style={{ width: `${Math.max(0, Math.min(100, meter))}%` }} />
        </span>
      )}
    </>}
    right={value} />
);

// Empty card body, as the mockup's new-shop state: a soft tile with a bold
// line, a quieter one, and sometimes a link to the thing that fills it.
const EmptyNote = ({ title, children, action, onAction, className = 'min-h-[150px]' }) => (
  <div className={`mt-2.5 grid place-items-center content-center gap-1.5 rounded-xl bg-tile p-2.5 text-center text-[13px] text-mute ${className}`}>
    <b className="font-tight text-[14px] font-semibold text-ink-2">{title}</b>
    {children && <span>{children}</span>}
    {action && <SeeAll onClick={onAction}>{action}</SeeAll>}
  </div>
);
// A part of the page whose read failed: says so, with a way to try again.
// Never a zero, which would read as "nothing happened".
const LoadFailed = ({ what, onRetry, className = 'min-h-[150px]' }) => (
  <div role="alert" className={`mt-2.5 grid place-items-center content-center gap-1.5 rounded-xl bg-bad-soft/60 p-2.5 text-center text-[13px] text-bad-text ${className}`}>
    <b className="font-tight text-[14px] font-semibold">{what} could not be loaded</b>
    {onRetry && <button type="button" onClick={onRetry} className="font-tight text-[13px] font-semibold underline underline-offset-4">Try again</button>}
  </div>
);
const FailedSub = () => <span className="text-bad-text">Could not load</span>;

// Section heading over a row of figures: "FOR THE PERIOD  Today, compared with yesterday".
const FigHead = ({ title, meta }) => (
  <div className="flex flex-wrap items-center gap-2 mb-0.5">
    <Eyebrow className="text-ink-2">{title}</Eyebrow>
    {meta && <span className="text-[12.5px] text-mute">{meta}</span>}
  </div>
);

// Same thresholds as "Owed to you most": red over 5,000, amber 1,000 to 5,000, green below.
const owedTone = (n) => (n > 5000 ? 'bad' : n >= 1000 ? 'warn' : 'good');

const SETUP_HIDDEN_KEY = (tenantId) => `dashboard.setupHidden.${tenantId}`;
const readSetupHidden = (tenantId) => {
  try { return !!tenantId && window.localStorage.getItem(SETUP_HIDDEN_KEY(tenantId)) === '1'; } catch { return false; }
};

// "Set up your shop": progress, the five steps (ticked from real data), and
// a cross that hides it on this device.
const SetupGuide = ({ setup, onStep, onHide }) => (
  <section aria-label="Set up your shop"
    className="m-rise mb-[18px] grid grid-cols-[1fr_auto] md:grid-cols-[auto_1fr_auto] items-center gap-x-3.5 gap-y-3 rounded-[14px] border border-line px-4 py-3.5">
    <div>
      <b className="block font-tight text-[15px] font-semibold">Set up your shop</b>
      <small className="mt-1 flex items-center gap-2 text-[12.5px] text-body">
        <span role="progressbar" aria-label="Setup progress" aria-valuenow={setup.done} aria-valuemin={0} aria-valuemax={setup.total}
          className="block h-1.5 w-[72px] overflow-hidden rounded-pill bg-well">
          <i className="block h-full rounded-pill bg-amber" style={{ width: `${(setup.done / setup.total) * 100}%` }} />
        </span>
        {setup.done} of {setup.total} done
      </small>
    </div>
    <div className="col-span-2 md:col-span-1 row-start-2 md:row-start-auto flex flex-wrap gap-1.5">
      {setup.steps.map(st => (
        <button key={st.key} type="button" onClick={() => onStep(st)}
          aria-label={`${st.label}${st.done ? ', done' : ''}`}
          className={`m-press inline-flex items-center gap-[5px] whitespace-nowrap rounded-pill px-2.5 py-[5px] font-tight text-[12px] ${
            st.done ? 'bg-tile font-medium text-mute line-through'
              : st.next ? 'bg-amber-soft font-semibold text-amber-text'
              : 'bg-tile font-medium text-ink-2 hover:bg-well'}`}>
          {st.done
            ? <Check size={13} strokeWidth={2.2} className="text-good" aria-hidden="true" />
            : <Circle size={13} strokeWidth={2.2} aria-hidden="true" />}
          {st.label}
        </button>
      ))}
    </div>
    <button type="button" onClick={onHide} aria-label="Hide setup guide"
      className="m-press col-start-2 row-start-1 md:col-start-auto md:row-start-auto grid size-7 place-items-center rounded-full text-mute hover:bg-well">
      <X size={14} strokeWidth={2} />
    </button>
  </section>
);

const Dashboard = () => {
  // Entrance motion: blocks rise once per page open (CSS, .m-rise); charts
  // draw / grow once while this is true, then redraw in place on refresh.
  const playing = usePlayOnce();
  const { currentTenantId, businessProfile } = useTenant();
  const { products, inventoryBalances, refetch: refetchInventory, loading: invLoading, error: invError } = useInventory(currentTenantId);
  const { sales, refetch: refetchSales, loading: salesLoading, error: salesError } = useSales(currentTenantId, { lean: true });
  // Returns and supplier payments are read for "You owe": it is the supplier
  // ledger's closing balance (lib/supplierOwed), which needs both.
  const { purchases, purchaseReturns, supplierPayments, suppliers, refetch: refetchPurchases, loading: purLoading, error: purError } = usePurchases(currentTenantId);
  const { expenses, dayBook, refetch: refetchFinance, loading: finLoading, error: finError } = useFinance(currentTenantId);
  const { clients, employees, users, refetch: refetchPeople, loading: peopleLoading, error: peopleError } = usePeople(currentTenantId);
  // What staff are still owed this month, from attendance and pay runs.
  const staffDue = useStaffDues(currentTenantId, employees);
  const refetchStaffDue = staffDue.refetch;
  const { routes, movementLog, refetch: refetchOps } = useOperations(currentTenantId);
  const { accounts, balances: accountBalances, error: accountsError } = useAccounts(currentTenantId);

  const isLoading = invLoading || salesLoading || purLoading || finLoading;

  // Server-side KPI aggregation via Supabase RPC (replaces 7 client-side filters).
  // Shared with the side menu's low-stock count and the notifications
  // (useDashboardKpis), so all three read one answer and cannot disagree.
  const { data: kpiData, error: kpiError, refetch: fetchKpis } = useDashboardKpis(currentTenantId);

  useEffect(() => { fetchKpis(); }, [fetchKpis]);

 const navigate = useNavigate();

 // ── The period ───────────────────────────────────────────────────────────
 const [datePreset, setDatePreset] = useState('Today');
 const [customRange, setCustomRange] = useState({ start: '', end: ''});

 // Business dates in the shop's timezone (lib/dashboardFigures). `range` is
 // null for all time. `cmp` is what it is compared with (owner decision: the
 // same time of day, as the phone): the period of equal length just before
 // it, its last day cut at the current time when `range` is still running,
 // so today compares with yesterday up to this time.
 const todayStr = todayISOInAppTZ();
 const range = useMemo(() => periodRange(datePreset, todayStr, customRange), [datePreset, todayStr, customRange]);
 const tz = getAppTimezone();
 const nowMinutes = minutesOfDay(new Date(), tz) ?? 24 * 60;
 const cmp = useMemo(() => periodComparison(range, todayStr, nowMinutes), [range, todayStr, nowMinutes]);
 // get_pl_ranged works in whole days, so profit can only be compared when
 // the comparison is whole days. While the period is still running, its
 // pill waits for the end of the day rather than compare part with whole.
 const profitCmpWhole = !!cmp && !cmp.cutDate;

 // Profit: get_pl_ranged's gross_profit, the figure the Business report and
 // the P&L show (sales.totalCogs based, returns netted). Never worked out here.
 // All time has no window, so it reads from far enough back to cover the books.
 const plWindow = range || { start: '2000-01-01', end: todayStr };
 const { pl, error: plError, refetch: refetchPl } = usePLRanged(plWindow.start, plWindow.end);
 const { pl: priorPl, error: priorPlError, refetch: refetchPriorPl } = usePLRanged(
   profitCmpWhole ? cmp.range.start : null, profitCmpWhole ? cmp.range.end : null);

 // Top-selling items for the same window (lib/topSelling, shared with Sales).
 const top = useTopSellingItems(currentTenantId, range, { limit: 5 });
 const refetchTop = top.refetch;

  const refetchAll = useCallback(() => {
    refetchInventory(); refetchSales(); refetchPurchases();
    refetchFinance(); refetchPeople(); refetchOps(); refetchStaffDue();
    fetchKpis(); refetchPl(); refetchPriorPl(); refetchTop();
  }, [refetchInventory, refetchSales, refetchPurchases, refetchFinance, refetchPeople, refetchOps, refetchStaffDue, fetchKpis, refetchPl, refetchPriorPl, refetchTop]);

  useRefetchOnFocus(refetchAll, 15_000);

  // Realtime: auto-refresh dashboard when sales/expenses/payments change
  const refetchAllRef = useRef(refetchAll);
  useEffect(() => { refetchAllRef.current = refetchAll; }, [refetchAll]);
  useEffect(() => {
    if (!currentTenantId || isElectron()) return;
    let timer;
    const trigger = () => { clearTimeout(timer); timer = setTimeout(() => refetchAllRef.current(), 600); };
    // Realtime policy: see src/lib/realtime.js
    if (!realtimeEnabled('dashboard')) return;
    const ch = supabase.channel(`dashboard:${currentTenantId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sales',           filter: `tenant_id=eq.${currentTenantId}` }, trigger)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'expenses',        filter: `tenant_id=eq.${currentTenantId}` }, trigger)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'client_payments', filter: `tenant_id=eq.${currentTenantId}` }, trigger)
      .subscribe();
    return () => { clearTimeout(timer); supabase.removeChannel(ch); };
  }, [currentTenantId]);

 // Period sums: the rule the Dashboard has always used (Σ amount of the rows
 // dated in the window); the window itself is now in the shop's timezone.
 const saleAmt = (s) => s.totalAmount || 0;
 const expAmt = (e) => e.amount || 0;
 const purAmt = (p) => p.total_cost || p.total_amount || 0;
 const rangeSales = useMemo(() => sumInRange(sales, range, saleAmt), [sales, range]);
 const rangeExpenses = useMemo(() => sumInRange(expenses, range, expAmt), [expenses, range]);
 const rangePurchases = useMemo(() => sumInRange(purchases, range, purAmt), [purchases, range]);
 // The same sums over the previous period, for the comparison pills. Both
 // sides of a comparison use the same rows and the same rule.
 const priorSales = useMemo(() => (cmp ? sumInPeriodComparison(sales, cmp, tz, saleAmt) : null), [sales, cmp, tz]);
 const priorExpenses = useMemo(() => (cmp ? sumInPeriodComparison(expenses, cmp, tz, expAmt) : null), [expenses, cmp, tz]);
 const priorPurchases = useMemo(() => (cmp ? sumInPeriodComparison(purchases, cmp, tz, purAmt) : null), [purchases, cmp, tz]);

 const currentCashBalance = useMemo(() => {
   if (accounts && accounts.length > 0) {
     return accounts
       .filter(a => a.type !== 'LOAN')
       .reduce((sum, a) => sum + (accountBalances[a.id] || 0), 0);
   }
   // fallback to day book closing balance if accounts not loaded
   const todaysDayBook = (dayBook || []).find(db => db.date === todayStr);
   return todaysDayBook ? (todaysDayBook.closing_balance || 0) : 0;
 }, [accounts, accountBalances, dayBook, todayStr]);

 const totalOutstanding = useMemo(
   () => (clients || []).reduce((sum, c) => sum + (c.outstanding_balance || 0), 0),
   [clients]
 );

 // "You owe": the supplier ledger's closing balance (lib/supplierOwed), the
 // same figure the Suppliers list and each supplier's ledger show.
 const owed = useMemo(
   () => supplierOwedSummary(suppliers, { purchases, purchaseReturns, supplierPayments }),
   [suppliers, purchases, purchaseReturns, supplierPayments]);

 // null until attendance and pay runs have been read: the tile shows a dash
 // rather than a 0 nobody checked.
 const salariesPending = staffDue.ready ? staffDue.total : null;

 const lowStockProducts = useMemo(
   () => (products || []).filter(p => {
     // A service has no stock to run low on. It sits at 0 forever, so it
     // matched every threshold and arrived here with a Restock button
     // pointing at /purchases — for a tuition hour.
     if (!isStocked(p)) return false;
     const threshold = p.low_stock_threshold ?? p.lowStockThreshold ?? 10;
     const balances = (inventoryBalances || []).filter(b => b.product_id === p.id);
     const totalQty = balances.length > 0
       ? balances.reduce((s, b) => s + b.quantity, 0)
       : (p.stock ?? 0);
     return totalQty < threshold;
   }),
   [products, inventoryBalances]
 );
 const pendingSalaryAlerts = useMemo(
   () => staffDue.rows.filter(r => r.pending > 0),
   [staffDue.rows]
 );

 // Chart 1: Daily Sales This Week
 const chart1Data = useMemo(() => {
 const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
 const orderedDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
 const dayMap = {};       // this week
 const prevMap = {};      // previous week (same weekday)
 orderedDays.forEach(d => { dayMap[d] = 0; prevMap[d] = 0; });
 const now = new Date();
 const currentDay = now.getDay() === 0 ? 7 : now.getDay();
 const startOfWeek = new Date(now);
 startOfWeek.setDate(now.getDate() - currentDay + 1);
 startOfWeek.setHours(0,0,0,0);
 const endOfWeek = new Date(startOfWeek);
 endOfWeek.setDate(startOfWeek.getDate() + 6);
 endOfWeek.setHours(23,59,59,999);
 // Previous week window = this week shifted back 7 days.
 const startOfPrev = new Date(startOfWeek); startOfPrev.setDate(startOfWeek.getDate() - 7);
 const endOfPrev   = new Date(endOfWeek);   endOfPrev.setDate(endOfWeek.getDate() - 7);

 (sales || []).forEach(s => {
 if (!s.date) return;
 const d = new Date(s.date);
 const amt = (s.totalAmount || 0);
 if (d >= startOfWeek && d <= endOfWeek)      dayMap[days[d.getDay()]]  += amt;
 else if (d >= startOfPrev && d <= endOfPrev) prevMap[days[d.getDay()]] += amt;
});
 return orderedDays.map(day => ({ name: day, value: dayMap[day], prev: prevMap[day] }));
}, [sales]);

 // Chart 2: This Month vs Last Month
 const chart2Data = useMemo(() => {
 const data = [];
 const today = new Date();
 const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
 const thisMonthSales = {};
 const lastMonthSales = {};
 for(let i=1; i<=31; i++) { thisMonthSales[i] = 0; lastMonthSales[i] = 0;}
 (sales || []).forEach(s => {
 if(!s.date) return;
 const d = new Date(s.date);
 if (d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear()) {
 thisMonthSales[d.getDate()] += (s.totalAmount || 0);
} else {
 const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
 if (d.getMonth() === lastMonth.getMonth() && d.getFullYear() === lastMonth.getFullYear()) {
 lastMonthSales[d.getDate()] += (s.totalAmount || 0);
}
}
});
 for(let i=1; i<=31; i++) {
 if (i <= daysInMonth || lastMonthSales[i] > 0) {
 data.push({ date: i.toString(), thisMonth: thisMonthSales[i], lastMonth: lastMonthSales[i]});
}
}
 return data;
}, [sales]);

 // Chart 3: Cash vs Credit
 const chart3Data = useMemo(() => {
 let cash = 0;
 let credit = 0;
 (sales || []).filter(s => {
 const d = new Date(s.date);
 const today = new Date();
 return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
}).forEach(s => {
 // Sales objects use `paymentMethod: 'Cash'/'Credit'`. Normalize to lowercase and
 // accept either convention to handle legacy rows.
 const method = (s.paymentMethod || s.payment_type || '').toString().toLowerCase();
 if (method === 'cash') cash += (s.totalAmount || 0);
 else credit += (s.totalAmount || 0);
});
 return [
 { name: 'Cash Sales', value: cash, color: '#10B981'},
 { name: 'Credit Sales', value: credit, color: '#F59E0B'}
 ];
}, [sales]);

 const chart3Total = chart3Data.reduce((acc, curr) => acc + curr.value, 0);

 // Chart 4: Expenses by Category
 const chart4Data = useMemo(() => {
  const categories = {};
  (expenses || []).filter(e => inRange(e.date, range)).forEach(e => {
    categories[e.category] = (categories[e.category] || 0) + (e.amount || 0);
  });
  return Object.keys(categories).map(c => ({ name: c, value: categories[c]})).sort((a,b) => b.value - a.value);
}, [expenses, range]);

 // Recent Transactions
 const recentTransactions = useMemo(() => {
 const txs = [];
 (sales || []).forEach(s => txs.push({ id: `sale-${s.id}`, time: s.date, type: 'Sale', desc: `Sale to ${s.customerName || 'Walk-in'}`, amount: s.totalAmount, isPositive: true}));
 (expenses || []).forEach(e => txs.push({ id: `exp-${e.id}`, time: e.date, type: 'Expense', desc: e.description || e.category, amount: e.amount, isPositive: false}));
 return txs.sort((a, b) => (b.time > a.time ? 1 : b.time < a.time ? -1 : 0)).slice(0, 10);
}, [sales, expenses]);

 const topDebtors = useMemo(() => {
 return (clients || [])
 .filter(c => (c.outstanding_balance || 0) > 0)
 .sort((a, b) => (b.outstanding_balance || 0) - (a.outstanding_balance || 0))
 .slice(0, 5);
}, [clients]);

 // Chart Data Preparation (Group by Date)
 const chartData = useMemo(() => {
 const dataMap = {};

 // Initialize last 7 days
 for(let i=6; i>=0; i--) {
 const d = new Date();
 d.setDate(d.getDate() - i);
 const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric'});
 dataMap[dateStr] = { date: dateStr, income: 0, expense: 0};
}

 // Process Sales (Income)
 (sales || []).forEach(s => {
 if (!s.date) return;
 const dateStr = parseLocalDate(s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric'});
 if (dataMap[dateStr]) {
 dataMap[dateStr].income += (s.totalAmount || 0);
}
});

 // Process Expenses (Expense)
 (expenses || []).forEach(exp => {
 if (!exp.date) return;
 const dateStr = parseLocalDate(exp.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric'});
 if (dataMap[dateStr]) {
 dataMap[dateStr].expense += (exp.amount || 0);
}
});

 return Object.values(dataMap);
}, [sales, expenses]);
 const moneyInOutEmpty = chartData.every(d => !d.income && !d.expense);

 // Efficiency Metrics Calculation
 const efficiencyStats = useMemo(() => {
 const completedRoutes = (routes || []).filter(r => r.status === 'COMPLETED').length;
 const totalRoutes = (routes || []).length || 1;

  const totalStock = (products || []).reduce((sum, p) => {
    const productTotal = (inventoryBalances || []).filter(b => b.product_id === p.id).reduce((s, b) => s + b.quantity, 0);
    return sum + productTotal;
  }, 0) || 1;
 const totalMovedOut = (movementLog || []).filter(m => m.type === 'OUT').reduce((sum, m) => sum + (m.quantity || 0), 0);

 return [
 { label: 'Route coverage', value: Math.round((completedRoutes / totalRoutes) * 100)},
 { label: 'Stock turnover', value: Math.min(100, Math.round((totalMovedOut / totalStock) * 100))}
 ];
}, [routes, products, movementLog, inventoryBalances]);

 // ── Setup guide (new shop) ───────────────────────────────────────────────
 const [setupHidden, setSetupHidden] = useState(() => readSetupHidden(currentTenantId));
 useEffect(() => { setSetupHidden(readSetupHidden(currentTenantId)); }, [currentTenantId]);
 const hideSetup = () => {
   setSetupHidden(true);
   try { window.localStorage.setItem(SETUP_HIDDEN_KEY(currentTenantId), '1'); } catch { /* private window: hidden for this visit only */ }
 };
 const setup = useMemo(() => setupSteps({
   products, inventoryBalances, businessProfile,
   salesCount: (sales || []).length, usersCount: (users || []).length,
 }), [products, inventoryBalances, businessProfile, sales, users]);
 const newShop = !salesLoading && !salesError && isNewShop(sales, todayStr);
 // Only once what the steps read has loaded, so it never flashes "0 of 5".
 const setupReady = !invLoading && !salesLoading && !peopleLoading && !invError && !salesError && !peopleError;
 const showSetup = setupReady && newShop && !setup.complete && !setupHidden;
 const hasAnySale = (sales || []).length > 0;

 // ── Display helpers (wording and formatting only; no figure changes) ─────
 const sym = businessProfile?.currencySymbol || '₹';
 const fmtMoney = (n) => `${n < 0 ? '−' : ''}${sym}${Math.abs(Math.round(n)).toLocaleString('en-IN')}`;
 const RANGE_WORD = { 'Today': 'today', 'This Week': 'this week', 'This Month': 'this month', 'Last Month': 'last month', 'All Time': 'all time', 'Custom Range': 'in range' };
 const PRESET_LABEL = { 'Today': 'Today', 'This Week': 'This week', 'This Month': 'This month', 'Last Month': 'Last month', 'All Time': 'All time', 'Custom Range': range ? spanLabel(range) : 'All dates' };
 const rangeWord = (datePreset === 'Custom Range' && !range) ? 'all time' : (RANGE_WORD[datePreset] || '');
 const rangeTitle = rangeWord ? rangeWord.charAt(0).toUpperCase() + rangeWord.slice(1) : null;
 const words = periodComparisonWords(datePreset, range, cmp, PRESET_LABEL[datePreset]);
 const now = new Date();
 const thisMonthName = now.toLocaleString('en-IN', { month: 'long' });
 const lastMonthName = new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleString('en-IN', { month: 'long' });
 const lowStockCount = kpiData ? (kpiData.low_stock_items ?? lowStockProducts.length) : lowStockProducts.length;
 const debtorCount = (clients || []).filter(c => (c.outstanding_balance || 0) > 0).length;
 const qtyOf = (item) => {
   const bal = (inventoryBalances || []).filter(b => b.product_id === item.id);
   return bal.length > 0 ? bal.reduce((s, b) => s + b.quantity, 0) : (item.stock ?? 0);
 };
 const LIST_ROWS = 5;
 const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

 // A comparison under a period figure: the pill, then "vs yesterday".
 // `failed` is the previous period's read failing: say so, never a made-up 0%.
 const compareSub = ({ kind, pct, failed }) => {
   if (!cmp) return null;
   if (failed) return <><Badge tone="neutral">—</Badge><span className="text-mute">could not compare</span></>;
   if (typeof pct !== 'number') return <><Badge tone="neutral">—</Badge>nothing to compare yet</>;
   return <><Badge tone={deltaTone(kind, pct)}>{formatDelta(pct)}</Badge><span className="text-mute">{words.short}</span></>;
 };

 // Today's three sums come from get_dashboard_kpis, as before. The pill
 // compares the same client-side sums on both sides, so a figure is never
 // compared with one worked out a different way.
 const useKpi = datePreset === 'Today' && kpiData;
 const salesValue = useKpi ? (kpiData.today_sales ?? rangeSales) : rangeSales;
 const expensesValue = useKpi ? (kpiData.today_expenses ?? rangeExpenses) : rangeExpenses;
 const purchasesValue = useKpi ? (kpiData.today_purchases ?? rangePurchases) : rangePurchases;
 const profitValue = pl ? Number(pl.gross_profit || 0) : null;
 const priorProfit = priorPl ? Number(priorPl.gross_profit || 0) : null;

 const periodFigures = [
   { key: 'sales', label: `Sales ${rangeWord}`, to: '/sales', count: true,
     value: salesError && !useKpi ? null : salesValue, failed: salesError && !useKpi,
     sub: compareSub({ kind: 'income', pct: salesError ? null : deltaPct(rangeSales, priorSales), failed: !!salesError }),
     cap: hasAnySale ? 'all bills, cash and credit' : 'your first sale shows here' },
   { key: 'profit', label: `Profit ${rangeWord}`, to: '/reports',
     value: plError ? null : profitValue, failed: !!plError, loading: !pl && !plError,
     sub: plError ? null
       : cmp && !profitCmpWhole ? <><Badge tone="neutral">—</Badge><span className="text-mute">compares at end of day</span></>
       : compareSub({ kind: 'income', pct: priorProfit === null ? null : deltaPct(profitValue, priorProfit), failed: !!priorPlError }),
     cap: 'Sales minus cost of goods' },
   { key: 'expenses', label: `Expenses ${rangeWord}`, to: '/expenses',
     value: finError && !useKpi ? null : expensesValue, failed: finError && !useKpi,
     sub: compareSub({ kind: 'cost', pct: finError ? null : deltaPct(rangeExpenses, priorExpenses), failed: !!finError }),
     cap: 'shop running costs' },
   { key: 'purchases', label: `Purchases ${rangeWord}`, to: '/purchases',
     value: purError && !useKpi ? null : purchasesValue, failed: purError && !useKpi,
     sub: compareSub({ kind: 'neutral', pct: purError ? null : deltaPct(rangePurchases, priorPurchases), failed: !!purError }),
     cap: 'stock bought' },
 ];

 const owedToYou = kpiData ? (kpiData.outstanding_collections ?? totalOutstanding) : totalOutstanding;
 const owedToYouFailed = !kpiData && (!!kpiError || !!peopleError);
 const balanceFigures = [
   { key: 'cash', label: 'Cash balance', to: '/daybook',
     value: accountsError && !(accounts || []).length ? null : currentCashBalance,
     failed: !!accountsError && !(accounts || []).length,
     sub: newShop && !currentCashBalance ? 'add your opening cash' : 'all cash and bank' },
   { key: 'owed-to-you', label: 'Owed to you', to: '/clients',
     value: owedToYouFailed ? null : owedToYou, failed: owedToYouFailed,
     sub: debtorCount ? `from ${plural(debtorCount, 'client')}` : (newShop ? 'no credit sales yet' : 'nobody owes you') },
   { key: 'you-owe', label: 'You owe', to: '/suppliers',
     value: purError ? null : owed.total, failed: !!purError,
     sub: owed.count ? `to ${plural(owed.count, 'supplier')}` : (newShop ? 'no supplier bills yet' : 'nothing owed') },
   { key: 'salary', label: 'Salary pending', to: '/payroll',
     value: staffDue.error ? null : salariesPending, failed: !!staffDue.error,
     sub: (employees || []).length ? `for ${thisMonthName}` : 'no staff added' },
 ];

 const renderFigure = (m) => (
   <Figure key={m.key} label={m.label}
     onClick={() => m.to && navigate(m.to)}
     value={m.value === null || m.value === undefined
       ? '—'
       : m.count ? <CountUp value={Math.round(m.value)} format={(n) => fmtMoney(n)} /> : fmtMoney(m.value)}
     sub={m.failed ? <FailedSub /> : m.sub}
     cap={m.cap} />
 );

 return (
 <div className="flex flex-col">
   {/* Quick actions sit in the top bar from lg; below that, here. */}
   <DashboardQuickActions className="lg:hidden mb-4" />

   {showSetup && (
     <SetupGuide setup={setup} onHide={hideSetup} onStep={(st) => navigate(st.to)} />
   )}

   {/* Announcement (left) and expiry alert (right). Each hides itself when
       there is nothing to say, and the row goes with them. */}
   <div className="m-rise grid grid-cols-1 lg:grid-cols-2 gap-3 mb-[18px] empty:hidden">
     <BannerCarousel />
     <ExpiryAlertCard />
   </div>

   {/* Date range and refresh */}
   <div className="m-rise flex flex-wrap items-center gap-2.5 mb-4" style={{ '--i': 1 }}>
     <div className="max-w-full overflow-x-auto no-scrollbar">
       <SegmentedTabs
         items={[
           { key: 'Today', label: 'Today' },
           { key: 'This Week', label: 'This week' },
           { key: 'This Month', label: 'This month' },
           { key: 'Last Month', label: 'Last month' },
           { key: 'All Time', label: 'All time' },
           { key: 'Custom Range', label: 'Custom' },
         ]}
         value={datePreset}
         onChange={setDatePreset}
         trackClass="bg-well"
         indicatorClass="bg-ink"
         activeClass="text-white"
         className="[&_button]:font-tight [&_button]:text-[13px] [&_button]:font-semibold [&_button]:px-[15px] [&_button:not([aria-selected=true])]:text-body"
       />
     </div>
     {datePreset === 'Custom Range' && (
       <div className="flex items-center gap-2">
         <Input type="date" aria-label="From" value={customRange.start} onChange={e => setCustomRange({...customRange, start: e.target.value})} className="h-8 w-auto text-[12.5px]" />
         <span className="text-[12.5px] text-mute">to</span>
         <Input type="date" aria-label="To" value={customRange.end} onChange={e => setCustomRange({...customRange, end: e.target.value})} className="h-8 w-auto text-[12.5px]" />
       </div>
     )}
     <div className="flex-1" />
     <Button variant="secondary" size="icon-sm" onClick={refetchAll} title="Refresh all figures" aria-label="Refresh all figures"
       className={isLoading ? 'opacity-50 pointer-events-none' : ''}>
       <RefreshCw className={isLoading ? 'animate-spin' : ''} />
     </Button>
   </div>

   {/* For the period: four figures, each compared with the period before. */}
   <div className="m-rise" style={{ '--i': 2 }}>
     <FigHead title="For the period" meta={newShop && !hasAnySale ? PRESET_LABEL[datePreset] : words.heading} />
     <FigureStrip cols={4} className="mb-3.5">
       {periodFigures.map(renderFigure)}
     </FigureStrip>
   </div>
   {/* Right now: balances, the same whatever the date range. */}
   <div className="m-rise" style={{ '--i': 2 }}>
     <FigHead title="Right now" meta={newShop && !hasAnySale ? 'Balances' : 'Balances. These stay the same whatever date range you pick'} />
     <FigureStrip cols={4} className="mb-[22px]">
       {balanceFigures.map(renderFigure)}
     </FigureStrip>
   </div>

   {/* Charts, row 1 */}
   <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5">
     <Card className="m-rise flex flex-col" style={{ '--i': 3 }}>
       <CardHeader title="Sales this month" aside={hasAnySale ? <><Key swatch="var(--color-amber)">{thisMonthName}</Key><Key dashed>{lastMonthName}</Key></> : null} />
       {salesError ? <LoadFailed what="Sales" onRetry={refetchSales} className="min-h-[200px]" />
       : chart2Data.reduce((s, d) => s + d.thisMonth + d.lastMonth, 0) === 0 ? (
         <EmptyNote title="No sales yet this month" className="min-h-[200px]"
           action={hasAnySale ? null : 'Make your first sale'} onAction={() => navigate('/sales')}>
           Your daily sales line starts after your first sale
         </EmptyNote>
       ) : (
         <div className="relative mt-3.5 h-[210px]">
           <MonthlyComparisonAreaChart data={chart2Data} currencySymbol={sym} playing={playing} thisLabel={thisMonthName} lastLabel={lastMonthName} />
         </div>
       )}
     </Card>
     <Card className="m-rise flex flex-col" style={{ '--i': 4 }}>
       <CardHeader title="Sales this week" aside={hasAnySale ? <><Key swatch="var(--color-amber)">This week</Key><Key swatch="#D9D8D5">Last week</Key></> : null} />
       {salesError ? <LoadFailed what="Sales" onRetry={refetchSales} className="min-h-[200px]" />
       : chart1Data.reduce((s, d) => s + d.value, 0) === 0 ? (
         <EmptyNote title="No sales this week yet" className="min-h-[200px]">This week and last week show side by side</EmptyNote>
       ) : (
         <div className="relative mt-3.5 h-[210px]">
           <WeeklySalesBarChart data={chart1Data} currencySymbol={sym} playing={playing} />
         </div>
       )}
     </Card>
   </div>

   {/* Charts, row 2 */}
   <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5 mt-5">
     <DailyRevenueTrendChart playing={playing} className="m-rise" style={{ '--i': 5 }} />
     <Card className="m-rise flex flex-col" style={{ '--i': 6 }}>
       <CardHeader title="How you were paid" aside="This month" />
       {salesError ? <LoadFailed what="Sales" onRetry={refetchSales} /> : chart3Total === 0 ? (
         <>
           <div className="mt-2.5 font-tight text-[28px] font-semibold leading-tight tracking-[-0.02em] tabular-nums">{sym}0</div>
           <div className="flex h-2.5 overflow-hidden rounded-pill mt-4 mb-2 bg-well" aria-hidden="true" />
           <p className="text-[12.5px] text-mute">Cash and credit split shows after your first sale.</p>
         </>
       ) : (
         <>
           <div className="mt-2.5 font-tight text-[28px] font-semibold leading-tight tracking-[-0.02em] tabular-nums">{sym}{chart3Total.toLocaleString()}</div>
           <div className="flex h-2.5 gap-[3px] overflow-hidden rounded-pill mt-4 mb-2" aria-hidden="true">
             <i className="block h-full rounded-pill bg-ink-2" style={{ width: `${(chart3Data[0].value / chart3Total) * 100}%` }} />
             <i className="block h-full rounded-pill bg-amber" style={{ width: `${(chart3Data[1].value / chart3Total) * 100}%` }} />
           </div>
           {chart3Data.map((d, i) => (
             <div key={d.name} className={`flex items-center justify-between gap-3 py-2.5 ${i ? 'border-t border-sep' : ''}`}>
               <span className="flex items-center gap-2 text-ink-2"><i className={`size-2 rounded-[2px] ${i ? 'bg-amber' : 'bg-ink-2'}`} />{i ? 'Credit sales' : 'Cash sales'}</span>
               <span className="font-tight tabular-nums">{sym}{d.value.toLocaleString()} <span className="text-[12.5px] text-mute">{Math.round((d.value / chart3Total) * 100)}%</span></span>
             </div>
           ))}
           <p className="mt-2 text-[12.5px] text-mute">UPI, card and bank count with credit here, as they do today.</p>
         </>
       )}
     </Card>
   </div>

   {/* Row 3, two across: money in and out, expenses, top sellers, operations */}
   <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
     <Card className="m-rise flex flex-col" style={{ '--i': 7 }}>
       <CardHeader title="Money in and out" aside="Last 7 days" />
       {salesError || finError ? <LoadFailed what={salesError ? 'Sales' : 'Expenses'} onRetry={salesError ? refetchSales : refetchFinance} />
       : moneyInOutEmpty ? (
         <EmptyNote title="No money in or out yet">Sales and expenses for the last 7 days</EmptyNote>
       ) : (
         <>
           <div className="flex gap-3.5 mt-2 text-[12.5px]"><Key swatch="var(--color-good)">Sales</Key><Key swatch="var(--color-bad)">Expenses</Key></div>
           <div className="relative mt-2.5 h-[170px]">
             <MoneyInOutChart data={chartData} currencySymbol={sym} />
           </div>
         </>
       )}
     </Card>

     <Card className="m-rise flex flex-col" style={{ '--i': 8 }}>
       <CardHeader title="Expenses by category" aside={rangeTitle} />
       {finError ? <LoadFailed what="Expenses" onRetry={refetchFinance} /> : chart4Data.length === 0 ? (
         <EmptyNote title={`No expenses ${rangeWord}`} action="Record expense" onAction={() => navigate('/expenses?new=1')} />
       ) : (
         <>
           <div className="mt-2 max-h-[176px] overflow-y-auto">
             {chart4Data.map((c) => (
               <div key={c.name} className="grid grid-cols-[minmax(0,118px)_1fr_auto] items-center gap-2.5 py-[7px]">
                 <span className="truncate text-[13px] text-ink-2" title={c.name}>{c.name}</span>
                 <span className="h-2 overflow-hidden rounded-pill bg-well">
                   <i className="block h-full rounded-pill bg-bad/80" style={{ width: `${(c.value / chart4Data[0].value) * 100}%` }} />
                 </span>
                 <span className="text-right font-tight text-[13px] font-medium tabular-nums">{sym}{c.value.toLocaleString()}</span>
               </div>
             ))}
           </div>
           <div className="flex justify-between pt-3 mt-1 border-t border-line font-tight text-[14px] font-semibold">
             <span>Total</span>
             <span className="tabular-nums">{sym}{chart4Data.reduce((t, c) => t + c.value, 0).toLocaleString()}</span>
           </div>
         </>
       )}
     </Card>

     {/* Top-selling items: the same ranking as the Sales history's best
         sellers (lib/topSelling), for the period picked above. */}
     <Card className="m-rise flex flex-col" style={{ '--i': 8 }}>
       <CardHeader title="Top-selling items" aside={rangeTitle} />
       {top.error ? <LoadFailed what="Top-selling items" onRetry={refetchTop} />
       : top.loading && top.rows.length === 0 ? <ListNote>Loading</ListNote>
       : top.rows.length === 0 ? (
         <EmptyNote title="No items sold yet">Your best sellers show here after a few sales</EmptyNote>
       ) : (
         <>
           <Table wrapperClassName="mt-1.5 flex-1" className="[&_th]:px-0 [&_td]:px-0 [&_th]:py-2 [&_td]:py-2">
             <TableHeader>
               <tr>
                 <TableHead>Item</TableHead>
                 <TableHead numeric className="!pl-3.5">Sold</TableHead>
                 <TableHead numeric className="!pl-3.5">Sales ↓</TableHead>
               </tr>
             </TableHeader>
             <TableBody>
               {top.rows.map(r => (
                 <TableRow key={r.key}>
                   <TableCell className="w-[62%]">
                     <div className="flex gap-2 text-ink-2 min-w-0">
                       <span className="w-[18px] shrink-0 font-tight text-[12px] font-semibold text-faint">{r.rank}</span>
                       <span className="truncate" title={r.name}>{r.name}</span>
                     </div>
                     <div className="ml-[26px] mt-1.5 h-1 overflow-hidden rounded-pill bg-well" aria-hidden="true">
                       <i className="block h-full rounded-pill bg-amber/75" style={{ width: `${r.share}%` }} />
                     </div>
                   </TableCell>
                   <TableCell numeric className="!pl-3.5">{r.qty.toLocaleString('en-IN')}</TableCell>
                   <TableCell numeric className="!pl-3.5">{fmtMoney(r.value)}</TableCell>
                 </TableRow>
               ))}
             </TableBody>
           </Table>
           <CardFooter>
             <span>Top {top.rows.length} of {plural(top.itemCount, 'item')} sold</span>
             <SeeAll onClick={() => navigate('/reports')}>See all in Reports</SeeAll>
           </CardFooter>
         </>
       )}
     </Card>

     <Card className="m-rise flex flex-col" style={{ '--i': 8 }}>
       <CardHeader title="Operations" />
       <div className="mt-1.5">
         <OpsRow label="Products" onClick={() => navigate('/inventory')}
           value={<b className="font-tight text-[16px] font-semibold tabular-nums">{kpiData ? (kpiData.total_products ?? (products || []).length) : (products || []).length}</b>} />
         <OpsRow label="Low stock items" onClick={() => navigate('/inventory')}
           value={lowStockCount > 0 ? <Badge tone="warn">{lowStockCount} need attention</Badge> : <Badge tone="good">All stocked</Badge>} />
         <OpsRow label="Active trips" sub={routes?.length ? `${routes.length} routes in all` : 'no routes yet'} onClick={() => navigate('/vehicles')}
           value={<b className="font-tight text-[16px] font-semibold tabular-nums">{kpiData ? (kpiData.active_trips ?? (routes || []).filter(r => r.status === 'ACTIVE').length) : (routes || []).filter(r => r.status === 'ACTIVE').length}</b>} />
         {efficiencyStats.map((stat) => (
           <OpsRow key={stat.label} label={stat.label}
             meter={stat.value}
             value={<b className="font-tight text-[16px] font-semibold tabular-nums">{stat.value}%</b>} />
         ))}
       </div>
     </Card>
   </div>

   {/* Lists that need action, two across: 5 rows each, then "See all" */}
   <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
     <Card className="m-rise flex flex-col" style={{ '--i': 8 }}>
       <CardHeader><CardTitle>Reorder soon{lowStockCount > 0 && <Count tone="warn">{lowStockCount}</Count>}</CardTitle></CardHeader>
       {invError ? <LoadFailed what="Stock" onRetry={refetchInventory} /> : lowStockProducts.length === 0 ? (
         <EmptyNote title="Nothing to reorder">Every product is above its reorder level</EmptyNote>
       ) : (
         <div className="mt-1.5 flex-1">
           {lowStockProducts.slice(0, LIST_ROWS).map(item => {
             const qty = qtyOf(item);
             const min = item.low_stock_threshold ?? item.lowStockThreshold ?? 10;
             return (
               <ListRow key={item.id} onClick={() => navigate('/inventory')}
                 left={<><span className="block truncate text-ink-2">{item.name}</span><small className="block text-[12px] text-mute tabular-nums">{qty} in stock · reorder at {min}</small></>}
                 right={<>
                   {qty <= 0 && <Badge tone="bad">Out</Badge>}
                   <Button variant="secondary" size="xs" onClick={(e) => { e.stopPropagation(); navigate('/purchases'); }}>Restock</Button>
                 </>} />
             );
           })}
         </div>
       )}
       {!invError && lowStockProducts.length > 0 && (
         <CardFooter>
           <span>Showing {Math.min(LIST_ROWS, lowStockProducts.length)} of {lowStockProducts.length}</span>
           <SeeAll onClick={() => navigate('/inventory')}>See all in Inventory</SeeAll>
         </CardFooter>
       )}
     </Card>

     <Card className="m-rise flex flex-col" style={{ '--i': 8 }}>
       <CardHeader aside={staffDue.ready && pendingSalaryAlerts.length > LIST_ROWS ? <SeeAll onClick={() => navigate('/payroll')}>See all</SeeAll> : null}>
         <CardTitle>Staff pay due{pendingSalaryAlerts.length > 0 && <Count tone="warn">{pendingSalaryAlerts.length}</Count>}</CardTitle>
       </CardHeader>
       {staffDue.error ? (
         <LoadFailed what="Salary dues" onRetry={refetchStaffDue} />
       ) : !(employees || []).length && !peopleLoading ? (
         <EmptyNote title="No staff yet" action="Invite staff" onAction={() => navigate('/users')} />
       ) : !staffDue.ready ? (
         <ListNote>Loading</ListNote>
       ) : pendingSalaryAlerts.length === 0 ? (
         <EmptyNote title="All salaries cleared" />
       ) : (
         <div className="mt-1.5 flex-1">
           {pendingSalaryAlerts.slice(0, LIST_ROWS).map(row => {
             const emp = row.employee;
             return (
               <ListRow key={emp.id}
                 left={<><span className="block truncate text-ink-2">{emp.name}</span><small className="block text-[12px] text-mute tabular-nums">
                   {row.dayRate ? `${row.daysWorked} day${row.daysWorked === 1 ? '' : 's'} × ${sym}${row.rate.toLocaleString('en-IN')}` : `Earned ${sym}${row.earned.toLocaleString('en-IN')}`} · paid {sym}{row.paid.toLocaleString('en-IN')}
                 </small></>}
                 right={<>
                   <span className="font-tight text-[13.5px] font-semibold tabular-nums">{sym}{row.pending.toLocaleString('en-IN')}</span>
                   <Button variant="secondary" size="xs" onClick={() => navigate('/payroll')}>Pay</Button>
                 </>} />
             );
           })}
         </div>
       )}
       {staffDue.ready && !staffDue.error && pendingSalaryAlerts.length > 0 && (
         <CardFooter>
           <span>Still to pay</span>
           <span className="font-tight text-[13.5px] font-semibold text-ink tabular-nums">{salariesPending === null ? '—' : `${sym}${Math.round(salariesPending).toLocaleString('en-IN')}`}</span>
         </CardFooter>
       )}
     </Card>

     <Card className="m-rise flex flex-col" style={{ '--i': 8 }}>
       <CardHeader title="Owed to you most" />
       {peopleError ? <LoadFailed what="Clients" onRetry={refetchPeople} /> : topDebtors.length === 0 ? (
         <EmptyNote title="Nobody owes you money">Clients who buy on credit show here</EmptyNote>
       ) : (
         <div className="mt-1.5 flex-1">
           {topDebtors.map((client, idx) => {
             const out = client.outstanding_balance || 0;
             return (
               <ListRow key={client.id} onClick={() => navigate(`/clients?client=${client.id}`)}
                 left={<span className="flex items-center gap-2 min-w-0">
                   <span className="w-[18px] shrink-0 font-tight text-[12px] font-semibold text-faint">{idx + 1}</span>
                   <span className="truncate text-ink-2">{client.name}</span>
                 </span>}
                 right={<>
                   <Badge tone={owedTone(out)}>{fmtMoney(out)}</Badge>
                   <Button variant="secondary" size="xs" onClick={(e) => { e.stopPropagation(); navigate(`/clients?client=${client.id}`); }}>Collect</Button>
                 </>} />
             );
           })}
         </div>
       )}
       {!peopleError && topDebtors.length > 0 && (
         <CardFooter>
           <span>Top {topDebtors.length} of {plural(debtorCount, 'client')}</span>
           <SeeAll onClick={() => navigate('/clients')}>See all in Clients</SeeAll>
         </CardFooter>
       )}
     </Card>

     {/* You owe most: the Suppliers list's owed figure (lib/supplierOwed). */}
     <Card className="m-rise flex flex-col" style={{ '--i': 8 }}>
       <CardHeader title="You owe most" />
       {purError ? <LoadFailed what="Supplier bills" onRetry={refetchPurchases} /> : owed.owing.length === 0 ? (
         <EmptyNote title="You don't owe any supplier">Purchases bought on credit show here</EmptyNote>
       ) : (
         <div className="mt-1.5 flex-1">
           {owed.owing.slice(0, LIST_ROWS).map((s, idx) => (
             <ListRow key={s.id} onClick={() => navigate('/suppliers')}
               left={<span className="flex items-center gap-2 min-w-0">
                 <span className="w-[18px] shrink-0 font-tight text-[12px] font-semibold text-faint">{idx + 1}</span>
                 <span className="truncate text-ink-2">{s.name}</span>
               </span>}
               right={<>
                 <Badge tone={owedTone(s.owed)}>{fmtMoney(s.owed)}</Badge>
                 <Button variant="secondary" size="xs" onClick={(e) => { e.stopPropagation(); navigate('/suppliers'); }}>Pay</Button>
               </>} />
           ))}
         </div>
       )}
       {!purError && owed.owing.length > 0 && (
         <CardFooter>
           <span>Top {Math.min(LIST_ROWS, owed.owing.length)} of {plural(owed.count, 'supplier')}</span>
           <SeeAll onClick={() => navigate('/suppliers')}>See all in Suppliers</SeeAll>
         </CardFooter>
       )}
     </Card>
   </div>

   {/* Recent transactions */}
   <Card className="m-rise mt-5 pb-2" style={{ '--i': 8 }}>
     <CardHeader title="Recent transactions" aside="Last 10" />
     {salesError || finError ? <LoadFailed what={salesError ? 'Sales' : 'Expenses'} onRetry={salesError ? refetchSales : refetchFinance} className="min-h-[110px]" />
     : recentTransactions.length === 0 ? (
       <EmptyNote title="No sales or expenses yet" className="min-h-[110px]">Your first sale will show here</EmptyNote>
     ) : (
       <Table wrapperClassName="mt-2" className="min-w-[560px]">
         <TableHeader>
           <tr>
             <TableHead className="pl-0">Time</TableHead>
             <TableHead>Type</TableHead>
             <TableHead>Description</TableHead>
             <TableHead numeric className="pr-0">Amount</TableHead>
           </tr>
         </TableHeader>
         <TableBody>
           {recentTransactions.map((tx) => (
             <TableRow key={tx.id}>
               <TableCell className="pl-0 whitespace-nowrap text-ink-2">{formatShortDateTime(tx.time) || '—'}</TableCell>
               <TableCell><Badge tone={tx.isPositive ? 'good' : 'bad'}>{tx.type}</Badge></TableCell>
               <TableCell className="text-ink-2">{tx.desc}</TableCell>
               <TableCell numeric className={`pr-0 font-semibold ${tx.isPositive ? 'text-good-text' : 'text-bad-text'}`}>
                 {tx.isPositive ? '+' : '−'}{sym}{Math.round(tx.amount || 0).toLocaleString('en-IN')}
               </TableCell>
             </TableRow>
           ))}
         </TableBody>
       </Table>
     )}
   </Card>
 </div>
 );
};

export default Dashboard;
