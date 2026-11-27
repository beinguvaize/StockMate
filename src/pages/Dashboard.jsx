import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { isStocked } from '../lib/productTypes';
import useRefetchOnFocus from '../hooks/useRefetchOnFocus';
import { useAuth } from '../context/AuthContext';
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
import { TrendingUp, ShoppingCart, Package, RefreshCw } from 'lucide-react';
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
import { FigureStrip, Figure } from '../components/ui/FigureStrip';
import { todayISOInAppTZ, formatShortDateTime, parseLocalDate } from '../lib/utils';
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

const Dashboard = () => {
  // Entrance motion: blocks rise once per page open (CSS, .m-rise); charts
  // draw / grow once while this is true, then redraw in place on refresh.
  const playing = usePlayOnce();
  const { currentTenant, currentTenantId, businessProfile } = useTenant();
  const slug = currentTenant?.slug || '';
  const { products, inventoryBalances, refetch: refetchInventory, loading: invLoading, error: invError } = useInventory(currentTenantId);
  const { sales, refetch: refetchSales, loading: salesLoading } = useSales(currentTenantId, { lean: true });
  const { purchases, refetch: refetchPurchases, loading: purLoading } = usePurchases(currentTenantId, { withReturns: false, withPayments: false });
  const { expenses, dayBook, refetch: refetchFinance, loading: finLoading } = useFinance(currentTenantId);
  const { clients, employees, refetch: refetchPeople } = usePeople(currentTenantId);
  // What staff are still owed this month, from attendance and pay runs.
  const staffDue = useStaffDues(currentTenantId, employees);
  const refetchStaffDue = staffDue.refetch;
  const { routes, movementLog, refetch: refetchOps } = useOperations(currentTenantId);
  const { accounts, balances: accountBalances } = useAccounts(currentTenantId);

  const isLoading = invLoading || salesLoading || purLoading || finLoading;

  // Server-side KPI aggregation via Supabase RPC (replaces 7 client-side filters)
  const [kpiData, setKpiData] = useState(null);
  const [kpiLoading, setKpiLoading] = useState(true);
  const fetchKpis = useCallback(() => {
    if (!currentTenantId) return;
    const todayStr = new Date().toISOString().split('T')[0];
    supabase.rpc('get_dashboard_kpis', {
      p_tenant_id: currentTenantId,
      p_date: todayStr,
    }).then(({ data, error }) => {
      if (!error && data) setKpiData(data);
      setKpiLoading(false);
    });
  }, [currentTenantId]);

  useEffect(() => { fetchKpis(); }, [fetchKpis]);

  const refetchAll = useCallback(() => {
    refetchInventory(); refetchSales(); refetchPurchases();
    refetchFinance(); refetchPeople(); refetchOps(); refetchStaffDue();
    fetchKpis();
  }, [refetchInventory, refetchSales, refetchPurchases, refetchFinance, refetchPeople, refetchOps, refetchStaffDue, fetchKpis]);

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

  // Placeholders for remaining data
  const payrollRecords = [];
  const clientPayments = [];
 const navigate = useNavigate();

 // Core Metrics Calculation
 const [datePreset, setDatePreset] = useState('Today');
 const [customRange, setCustomRange] = useState({ start: '', end: ''});

 // Pull a clean YYYY-MM-DD out of any input ("2026-05-15", "2026-05-15T00:00:00Z", Date, etc)
 // No Date-object parsing — avoids timezone off-by-one (esp. negative UTC offsets).
 const toYMD = (v) => {
   if (!v) return '';
   if (typeof v === 'string') {
     const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
     if (m) return m[1];
   }
   // Fallback for Date objects — use local components, not toISOString (UTC).
   const d = v instanceof Date ? v : new Date(v);
   if (isNaN(d.getTime())) return '';
   const y = d.getFullYear();
   const mo = String(d.getMonth() + 1).padStart(2, '0');
   const day = String(d.getDate()).padStart(2, '0');
   return `${y}-${mo}-${day}`;
 };

 const isWithinRange = (dateStr) => {
   if (!dateStr) return false;
   const dStr = toYMD(dateStr);
   if (!dStr) return false;
   const todayStr = toYMD(new Date());

   if (datePreset === 'Today') {
     return dStr === todayStr;
   } else if (datePreset === 'This Week') {
     const today = new Date();
     today.setHours(0,0,0,0);
     const currentDay = today.getDay() === 0 ? 7 : today.getDay();
     const startOfWeek = new Date(today);
     startOfWeek.setDate(today.getDate() - currentDay + 1);
     const endOfWeek = new Date(startOfWeek);
     endOfWeek.setDate(startOfWeek.getDate() + 6);
     return dStr >= toYMD(startOfWeek) && dStr <= toYMD(endOfWeek);
   } else if (datePreset === 'This Month') {
     return dStr.slice(0, 7) === todayStr.slice(0, 7);
   } else if (datePreset === 'Last Month') {
     const today = new Date();
     const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
     return dStr.slice(0, 7) === toYMD(lastMonth).slice(0, 7);
   } else if (datePreset === 'Custom Range') {
     if (!customRange.start || !customRange.end) return true;
     return dStr >= toYMD(customRange.start) && dStr <= toYMD(customRange.end);
   }
   return true;
 };

 // New KPIs
 const rangeSales = useMemo(
   () => (sales || []).filter(s => isWithinRange(s.date)).reduce((sum, s) => sum + (s.totalAmount || 0), 0),
   [sales, datePreset, customRange]
 );
 const rangeExpenses = useMemo(
   () => (expenses || []).filter(e => isWithinRange(e.date)).reduce((sum, e) => sum + (e.amount || 0), 0),
   [expenses, datePreset, customRange]
 );
 const rangePurchases = useMemo(
   () => (purchases || []).filter(p => isWithinRange(p.date)).reduce((sum, p) => sum + (p.total_cost || p.total_amount || 0), 0),
   [purchases, datePreset, customRange]
 );

 const todayStr = todayISOInAppTZ();
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

 // Chart 3: Cash vs Credit Donut
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
  (expenses || []).filter(e => isWithinRange(e.date)).forEach(e => {
    categories[e.category] = (categories[e.category] || 0) + (e.amount || 0);
  });
  return Object.keys(categories).map(c => ({ name: c, value: categories[c]})).sort((a,b) => b.value - a.value);
}, [expenses, datePreset, customRange]);
 
 // Recent Transactions
 const recentTransactions = useMemo(() => {
 const txs = [];
 (sales || []).forEach(s => txs.push({ id: `sale-${s.id}`, time: s.date, type: 'Sale', desc: `Sale to ${s.customerName || 'Walk-in'}`, amount: s.totalAmount, isPositive: true}));
 (expenses || []).forEach(e => txs.push({ id: `exp-${e.id}`, time: e.date, type: 'Expense', desc: e.description || e.category, amount: e.amount, isPositive: false}));
 return txs.sort((a, b) => (b.time > a.time ? 1 : b.time < a.time ? -1 : 0)).slice(0, 10);
}, [sales, expenses]);

 // Operational Metrics
 const activeRoutes = useMemo(
   () => (routes || []).filter(r => r.status === 'ACTIVE'),
   [routes]
 );

 const topDebtors = useMemo(() => {
 return (clients || [])
 .filter(c => (c.outstanding_balance || 0) > 0)
 .sort((a, b) => (b.outstanding_balance || 0) - (a.outstanding_balance || 0))
 .slice(0, 5);
}, [clients]);

  // (The "Analytics" expense pie that read an identical category split was
  // removed in the web redesign; "Expenses by category" shows these figures.)

 // Activity Feed: Merged Timeline
 const activityFeed = useMemo(() => {
 const events = [];
 (sales || []).forEach(s => events.push({ id: `ord-${s.id}`, type: 'ORDER', title: `Sale ${s?.id?.slice(-4) || '...'}`, desc: `Client: ${s.customerName || 'Walk-in'} · ₹${s.totalAmount}`, date: s.date, icon: <ShoppingCart size={14} />, color: '#000'}));
 (routes || []).forEach(r => events.push({ id: `rt-${r.id}`, type: 'ROUTE', title: r.status === 'ACTIVE' ? 'Route Dispatched' : 'Route Reconciled', desc: `Driver ID: ${r.driverId}`, date: r.status === 'ACTIVE' ? r.date : r.reconciledAt, icon: <Package size={14} />, color: r.status === 'ACTIVE' ? '#404040' : '#000'}));
 (movementLog || []).slice(0, 10).forEach(m => {
 events.push({ 
 id: `mv-${m.id}`, 
 type: 'STOCK', 
 title: `Stock ${m.type === 'IN' ? 'In' : 'Out'}`, 
 desc: `${m.productName} (${m.quantity} ${m.type === 'IN' ? 'added' : 'removed'})`, 
 date: m.date, 
 icon: <TrendingUp size={14} />, 
 color: '#737373' 
 });
});
 
 return events
 .filter(e => e.date && !isNaN(new Date(e.date).getTime()))
 .sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0))
 .slice(0, 10);
}, [sales, routes, movementLog, businessProfile]);

 // Best Selling Products Calculation
 const topProducts = useMemo(() => {
 const productSales = {};
 (sales || []).forEach(order => {
 (order.items || []).forEach(item => {
 if (!productSales[item.productId]) {
 productSales[item.productId] = { name: item.name, quantity: 0, revenue: 0};
}
 productSales[item.productId].quantity += (item.quantity || 0);
 productSales[item.productId].revenue += ((item.quantity || 0) * (item.price || 0));
});
});

 return Object.values(productSales)
 .sort((a, b) => b.quantity - a.quantity)
 .slice(0, 5);
}, [sales]);

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

 // (The "Weekly performance" bars and the "System Status 99.9%" tile were
 // removed in the web redesign; the live sync dot is now "Synced" / "Offline"
 // in the top bar.)

 // Efficiency Metrics Calculation
 const efficiencyStats = useMemo(() => {
 const completedRoutes = (routes || []).filter(r => r.status === 'COMPLETED').length;
 const totalRoutes = (routes || []).length || 1;
 
  const totalStock = (products || []).reduce((sum, p) => {
    const productTotal = (inventoryBalances || []).filter(b => b.product_id === p.id).reduce((s, b) => s + b.quantity, 0);
    return sum + productTotal;
  }, 0) || 1;
 const totalMovedOut = (movementLog || []).filter(m => m.type === 'OUT').reduce((sum, m) => sum + (m.quantity || 0), 0);
 
 // "Vehicle payload" (a fixed 85% whenever a trip was active) was removed in
 // the web redesign. These two are unchanged.
 return [
 { label: 'Route coverage', value: Math.round((completedRoutes / totalRoutes) * 100)},
 { label: 'Stock turnover', value: Math.min(100, Math.round((totalMovedOut / totalStock) * 100))}
 ];
}, [routes, products, movementLog, inventoryBalances]);

 // Real Growth Calculation (This 7 days vs Previous 7 days)
 const growthPercent = useMemo(() => {
 const now = new Date();
 const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
 const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

 const currentWeekSales = (sales || []).filter(o => parseLocalDate(o.date) >= sevenDaysAgo).reduce((sum, o) => sum + (o.totalAmount || 0), 0);
 const previousWeekSales = (sales || []).filter(o => {
 const d = parseLocalDate(o.date);
 return d >= fourteenDaysAgo && d < sevenDaysAgo;
}).reduce((sum, o) => sum + (o.totalAmount || 0), 0);

 if (previousWeekSales === 0) return currentWeekSales > 0 ? 100 : 0;
 return ((currentWeekSales - previousWeekSales) / previousWeekSales) * 100;
}, [sales]);

 // ── Display helpers (wording and formatting only; no figure changes) ─────
 const sym = businessProfile?.currencySymbol || '₹';
 const fmtMoney = (n) => `${sym}${Math.round(n).toLocaleString('en-IN')}`;
 const RANGE_WORD = { 'Today': 'today', 'This Week': 'this week', 'This Month': 'this month', 'Last Month': 'last month', 'All Time': 'all time', 'Custom Range': 'in range' };
 const rangeWord = RANGE_WORD[datePreset] || '';
 const now = new Date();
 const thisMonthName = now.toLocaleString('en-IN', { month: 'long' });
 const lastMonthName = new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleString('en-IN', { month: 'long' });
 // Same colour rule as before: up is green, down is red, flat is grey.
 const deltaPill = (d) => typeof d !== 'number' ? null : (
   <Badge tone={d > 0 ? 'good' : d < 0 ? 'bad' : 'neutral'}>{d > 0 ? '+' : d < 0 ? '−' : ''}{Math.abs(d).toFixed(1)}%</Badge>
 );
 const lowStockCount = kpiData ? (kpiData.low_stock_items ?? lowStockProducts.length) : lowStockProducts.length;
 const debtorCount = (clients || []).filter(c => (c.outstanding_balance || 0) > 0).length;
 const qtyOf = (item) => {
   const bal = (inventoryBalances || []).filter(b => b.product_id === item.id);
   return bal.length > 0 ? bal.reduce((s, b) => s + b.quantity, 0) : (item.stock ?? 0);
 };
 const LIST_ROWS = 5;

 const figures = [
   { label: `Sales ${rangeWord}`,     value: Math.round(datePreset === 'Today' && kpiData ? (kpiData.today_sales ?? rangeSales) : rangeSales),             delta: kpiData?.sales_delta_pct, to: '/sales', count: true },
   { label: `Expenses ${rangeWord}`,  value: Math.round(datePreset === 'Today' && kpiData ? (kpiData.today_expenses ?? rangeExpenses) : rangeExpenses),    delta: kpiData?.expenses_delta_pct, to: '/expenses' },
   { label: 'Cash balance',           value: Math.round(currentCashBalance),                                                                                sub: 'all cash and bank', to: '/daybook' },
   { label: 'Owed to you',            value: Math.round(kpiData ? (kpiData.outstanding_collections ?? totalOutstanding) : totalOutstanding),               sub: clients ? `from ${debtorCount} client${debtorCount === 1 ? '' : 's'}` : null, to: '/clients' },
   { label: `Purchases ${rangeWord}`, value: Math.round(datePreset === 'Today' && kpiData ? (kpiData.today_purchases ?? rangePurchases) : rangePurchases), sub: 'stock bought', to: '/purchases' },
   { label: 'Salary pending',         value: salariesPending === null ? null : Math.round(salariesPending),                                                 sub: `for ${thisMonthName}`, to: '/payroll' },
 ];

 return (
 <div className="flex flex-col">
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

   {/* Six figures; each opens its page */}
   <FigureStrip cols={6} className="m-rise mb-[22px]" style={{ '--i': 2 }}>
     {figures.map((m) => (
       <Figure key={m.to} label={m.label}
         onClick={() => m.to && navigate(m.to)}
         value={m.count
           ? <CountUp value={m.value} format={(n) => fmtMoney(n)} />
           : (m.value === null ? '—' : fmtMoney(m.value))}
         sub={typeof m.delta === 'number' ? deltaPill(m.delta) : m.sub} />
     ))}
   </FigureStrip>

   {/* Charts, row 1 */}
   <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5">
     <Card className="m-rise flex flex-col" style={{ '--i': 3 }}>
       <CardHeader title="Sales this month" aside={<><Key swatch="var(--color-amber)">{thisMonthName}</Key><Key dashed>{lastMonthName}</Key></>} />
       <div className="relative mt-3.5 h-[210px]">
         {chart2Data.reduce((s, d) => s + d.thisMonth + d.lastMonth, 0) === 0 ? (
           <ChartNote>No sales this month or last month yet</ChartNote>
         ) : (
           <MonthlyComparisonAreaChart data={chart2Data} currencySymbol={sym} playing={playing} thisLabel={thisMonthName} lastLabel={lastMonthName} />
         )}
       </div>
     </Card>
     <Card className="m-rise flex flex-col" style={{ '--i': 4 }}>
       <CardHeader title="Sales this week" aside={<><Key swatch="var(--color-amber)">This week</Key><Key swatch="#D9D8D5">Last week</Key></>} />
       <div className="relative mt-3.5 h-[210px]">
         {chart1Data.reduce((s, d) => s + d.value, 0) === 0 ? (
           <ChartNote>No sales this week yet</ChartNote>
         ) : (
           <WeeklySalesBarChart data={chart1Data} currencySymbol={sym} playing={playing} />
         )}
       </div>
     </Card>
   </div>

   {/* Charts, row 2 */}
   <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5 mt-5">
     <DailyRevenueTrendChart playing={playing} className="m-rise" style={{ '--i': 5 }} />
     <Card className="m-rise flex flex-col" style={{ '--i': 6 }}>
       <CardHeader title="How you were paid" aside="This month" />
       {chart3Total === 0 ? (
         <div className="flex-1 grid place-items-center py-10 text-[13px] text-mute">No sales this month yet</div>
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

   {/* Row 3 */}
   <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 mt-5">
     <Card className="m-rise flex flex-col" style={{ '--i': 7 }}>
       <CardHeader title="Money in and out" aside="Last 7 days" />
       <div className="flex gap-3.5 mt-2 text-[12.5px]"><Key swatch="var(--color-good)">Sales</Key><Key swatch="var(--color-bad)">Expenses</Key></div>
       <div className="relative mt-2.5 h-[170px]">
         <MoneyInOutChart data={chartData} currencySymbol={sym} />
       </div>
     </Card>

     <Card className="m-rise flex flex-col" style={{ '--i': 8 }}>
       <CardHeader title="Expenses by category" aside={rangeWord ? rangeWord.charAt(0).toUpperCase() + rangeWord.slice(1) : null} />
       {chart4Data.length === 0 ? (
         <div className="flex-1 grid place-items-center py-10 text-[13px] text-mute">No expenses {rangeWord} yet</div>
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

     <Card className="m-rise flex flex-col md:col-span-2 xl:col-span-1" style={{ '--i': 8 }}>
       <CardHeader title="Operations" />
       <div className="mt-1.5">
         <OpsRow label="Products" onClick={() => navigate('/inventory')}
           value={<b className="font-tight text-[16px] font-semibold tabular-nums">{kpiData ? (kpiData.total_products ?? (products || []).length) : (products || []).length}</b>} />
         <OpsRow label="Low stock items" onClick={() => navigate('/inventory')}
           value={<Badge tone={lowStockCount > 0 ? 'warn' : 'neutral'}>{lowStockCount} need attention</Badge>} />
         <OpsRow label="Active trips" sub={`${routes?.length || 0} routes in all`} onClick={() => navigate('/vehicles')}
           value={<b className="font-tight text-[16px] font-semibold tabular-nums">{kpiData ? (kpiData.active_trips ?? (routes || []).filter(r => r.status === 'ACTIVE').length) : (routes || []).filter(r => r.status === 'ACTIVE').length}</b>} />
         {efficiencyStats.map((stat) => (
           <OpsRow key={stat.label} label={stat.label}
             meter={stat.value}
             value={<b className="font-tight text-[16px] font-semibold tabular-nums">{stat.value}%</b>} />
         ))}
       </div>
     </Card>
   </div>

   {/* Lists that need action: 5 rows each, then "See all" */}
   <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 mt-5">
     <Card className="m-rise flex flex-col" style={{ '--i': 8 }}>
       <CardHeader><CardTitle>Reorder soon<Count tone="warn">{lowStockCount}</Count></CardTitle></CardHeader>
       <div className="mt-1.5 flex-1">
         {lowStockProducts.length === 0 ? (
           <ListNote>All products stocked</ListNote>
         ) : lowStockProducts.slice(0, LIST_ROWS).map(item => {
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
       {lowStockProducts.length > 0 && (
         <CardFooter>
           <span>Showing {Math.min(LIST_ROWS, lowStockProducts.length)} of {lowStockProducts.length}</span>
           <SeeAll onClick={() => navigate('/inventory')}>See all in Inventory</SeeAll>
         </CardFooter>
       )}
     </Card>

     <Card className="m-rise flex flex-col" style={{ '--i': 8 }}>
       <CardHeader aside={staffDue.ready && pendingSalaryAlerts.length > LIST_ROWS ? <SeeAll onClick={() => navigate('/payroll')}>See all</SeeAll> : null}>
         <CardTitle>Staff pay due<Count tone="warn">{pendingSalaryAlerts.length}</Count></CardTitle>
       </CardHeader>
       <div className="mt-1.5 flex-1">
         {!staffDue.ready ? (
           <ListNote>{staffDue.error ? 'Salary dues could not be loaded. Open Payroll to check.' : 'Loading'}</ListNote>
         ) : pendingSalaryAlerts.length === 0 ? (
           <ListNote>All salaries cleared</ListNote>
         ) : pendingSalaryAlerts.slice(0, LIST_ROWS).map(row => {
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
       {staffDue.ready && pendingSalaryAlerts.length > 0 && (
         <CardFooter>
           <span>Still to pay</span>
           <span className="font-tight text-[13.5px] font-semibold text-ink tabular-nums">{salariesPending === null ? '—' : `${sym}${Math.round(salariesPending).toLocaleString('en-IN')}`}</span>
         </CardFooter>
       )}
     </Card>

     <Card className="m-rise flex flex-col md:col-span-2 xl:col-span-1" style={{ '--i': 8 }}>
       <CardHeader title="Owed to you most" />
       <div className="mt-1.5 flex-1">
         {topDebtors.length === 0 ? (
           <ListNote>No outstanding balances</ListNote>
         ) : topDebtors.map((client, idx) => {
           const out = client.outstanding_balance || 0;
           // Same thresholds as before: red over 5,000, amber 1,000 to 5,000, green below.
           const tone = out > 5000 ? 'bad' : out >= 1000 ? 'warn' : 'good';
           return (
             <ListRow key={client.id} onClick={() => navigate(`/clients?client=${client.id}`)}
               left={<span className="flex items-center gap-2 min-w-0">
                 <span className="w-[18px] shrink-0 font-tight text-[12px] font-semibold text-faint">{idx + 1}</span>
                 <span className="truncate text-ink-2">{client.name}</span>
               </span>}
               right={<>
                 <Badge tone={tone}>₹{Math.round(out).toLocaleString()}</Badge>
                 <Button variant="secondary" size="xs" onClick={(e) => { e.stopPropagation(); navigate(`/clients?client=${client.id}`); }}>Collect</Button>
               </>} />
           );
         })}
       </div>
       {topDebtors.length > 0 && (
         <CardFooter>
           <span>Top {topDebtors.length} of {debtorCount} client{debtorCount === 1 ? '' : 's'}</span>
           <SeeAll onClick={() => navigate('/clients')}>See all in Clients</SeeAll>
         </CardFooter>
       )}
     </Card>
   </div>

   {/* Recent transactions */}
   <Card className="m-rise mt-5 pb-2" style={{ '--i': 8 }}>
     <CardHeader title="Recent transactions" aside="Last 10" />
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
         {recentTransactions.length === 0 ? (
           <tr><TableCell colSpan={4} className="py-8 text-center text-[13px] text-mute">No transactions recorded yet.</TableCell></tr>
         ) : recentTransactions.map((tx) => (
           <TableRow key={tx.id}>
             <TableCell className="pl-0 whitespace-nowrap text-ink-2">{formatShortDateTime(tx.time) || '—'}</TableCell>
             <TableCell><Badge tone={tx.isPositive ? 'good' : 'bad'}>{tx.type}</Badge></TableCell>
             <TableCell className="text-ink-2">{tx.desc}</TableCell>
             <TableCell numeric className={`pr-0 font-semibold ${tx.isPositive ? 'text-good-text' : 'text-bad-text'}`}>
               {tx.isPositive ? '+' : '−'}₹{Math.round(tx.amount || 0).toLocaleString()}
             </TableCell>
           </TableRow>
         ))}
       </TableBody>
     </Table>
   </Card>
 </div>
 );
};

export default Dashboard;
