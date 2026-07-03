import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
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
import { useOperations } from '../hooks/useOperations';
import { useAccounts } from '../hooks/useAccounts';
import { DollarSign, TrendingUp, TrendingDown, AlertCircle, ShoppingBag, BarChart3, Banknote, ShoppingCart, Package, Plus, Truck, ShieldCheck, ArrowRight, ArrowUpRight, ArrowDownRight, LayoutDashboard, Activity, Users, Calendar} from 'lucide-react';
import { useNavigate} from 'react-router-dom';
import DailyRevenueTrendChart from '../components/DailyRevenueTrendChart';
import { todayISOInAppTZ, formatDate, parseLocalDate } from '../lib/utils';
import { 
 ResponsiveContainer, 
 AreaChart, 
 Area, 
 XAxis, 
 YAxis, 
 CartesianGrid, 
 Tooltip as RechartsTooltip, 
 BarChart,
 Bar,
 PieChart,
 Pie,
 Cell,
 Legend
} from 'recharts';

// ── Memoized chart sub-components (outside Dashboard to avoid re-instantiation) ─────
const WeeklySalesBarChart = React.memo(({ data, currencySymbol }) => (
  <ResponsiveContainer width="100%" height="100%">
    <BarChart data={data} margin={{ top: 20, right: 10, left: -20, bottom: 0}}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 11, fontWeight: 700}} />
      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 10, fontWeight: 700}} tickFormatter={(val) => `${currencySymbol}${val > 999 ? (val/1000).toFixed(1) + 'k' : val}`} />
      <RechartsTooltip cursor={{ fill: 'rgba(0,0,0,0.02)'}} contentStyle={{ borderRadius: '15px', border: 'none', boxShadow: '0 10px 20px rgba(0,0,0,0.05)'}} formatter={(val, name) => [`${currencySymbol}${Number(val).toLocaleString('en-IN')}`, name]} />
      <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} iconType="circle" iconSize={8} />
      <Bar dataKey="prev"  name="Last week" fill="#D1D5DB" radius={[4, 4, 0, 0]} barSize={18} />
      <Bar dataKey="value" name="This week" fill="#D97706" radius={[4, 4, 0, 0]} barSize={18} />
    </BarChart>
  </ResponsiveContainer>
));

const MonthlyComparisonAreaChart = React.memo(({ data, currencySymbol }) => (
  <ResponsiveContainer width="100%" height="100%">
    <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0}}>
      <defs>
        <linearGradient id="fillThisMonth" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="#D97706" stopOpacity={0.2}/>
          <stop offset="95%" stopColor="#D97706" stopOpacity={0}/>
        </linearGradient>
      </defs>
      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 10, fontWeight: 700}} />
      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 10, fontWeight: 700}} tickFormatter={(val) => `${currencySymbol}${val > 999 ? (val/1000).toFixed(1) + 'k' : val}`} />
      <RechartsTooltip contentStyle={{ borderRadius: '15px', border: 'none', boxShadow: '0 10px 20px rgba(0,0,0,0.05)'}} />
      <Area type="monotone" dataKey="thisMonth" name="This Month" stroke="#D97706" strokeWidth={2} fillOpacity={1} fill="url(#fillThisMonth)" />
      <Area type="monotone" dataKey="lastMonth" name="Last Month" stroke="#94A3B8" strokeWidth={2} strokeDasharray="5 5" fill="none" />
    </AreaChart>
  </ResponsiveContainer>
));

const PaymentBreakdownPieChart = React.memo(({ data, total, currencySymbol }) => (
  <ResponsiveContainer width="100%" height="100%">
    <PieChart>
      <Pie data={data} cx="50%" cy="50%" innerRadius={70} outerRadius={100} paddingAngle={2} dataKey="value" stroke="none">
        {data.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
      </Pie>
      <text x="50%" y="45%" textAnchor="middle" dominantBaseline="middle" className="text-xs font-semibold text-gray-700 opacity-[0.85]">Total</text>
      <text x="50%" y="55%" textAnchor="middle" dominantBaseline="middle" className="text-xl font-semibold text-ink-primary">{currencySymbol}{total.toLocaleString()}</text>
      <RechartsTooltip contentStyle={{ borderRadius: '15px', border: 'none', boxShadow: '0 10px 20px rgba(0,0,0,0.05)'}} formatter={(value) => `${currencySymbol}${value.toLocaleString()}`} />
      <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 'bold'}} />
    </PieChart>
  </ResponsiveContainer>
));

const ExpenseCategoryBarChart = React.memo(({ data, currencySymbol }) => (
  <ResponsiveContainer width="100%" height="100%">
    <BarChart data={data} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0}}>
      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="rgba(0,0,0,0.05)" />
      <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 10, fontWeight: 700}} tickFormatter={(val) => `${currencySymbol}${val > 999 ? (val/1000).toFixed(0) + 'k' : val}`} />
      <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#1F2937', fontSize: 11, fontWeight: 700}} width={120} />
      <RechartsTooltip cursor={{ fill: 'rgba(0,0,0,0.02)'}} contentStyle={{ borderRadius: '15px', border: 'none', boxShadow: '0 10px 20px rgba(0,0,0,0.05)'}} formatter={(value) => `${currencySymbol}${value.toLocaleString()}`} />
      <Bar dataKey="value" fill="#EF4444" radius={[0, 4, 4, 0]} barSize={24} />
    </BarChart>
  </ResponsiveContainer>
));

const Dashboard = () => {
  const { currentTenant, currentTenantId, businessProfile } = useTenant();
  const slug = currentTenant?.slug || '';
  const { products, inventoryBalances, refetch: refetchInventory, loading: invLoading, error: invError } = useInventory(currentTenantId);
  const { sales, refetch: refetchSales, loading: salesLoading } = useSales(currentTenantId);
  const { purchases, refetch: refetchPurchases, loading: purLoading } = usePurchases(currentTenantId, { withReturns: false, withPayments: false });
  const { expenses, dayBook, refetch: refetchFinance, loading: finLoading } = useFinance(currentTenantId);
  const { clients, employees, refetch: refetchPeople } = usePeople(currentTenantId);
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
    refetchFinance(); refetchPeople(); refetchOps();
    fetchKpis();
  }, [refetchInventory, refetchSales, refetchPurchases, refetchFinance, refetchPeople, refetchOps, fetchKpis]);

  useRefetchOnFocus(refetchAll, 15_000);

  // Realtime: auto-refresh dashboard when sales/expenses/payments change
  const refetchAllRef = useRef(refetchAll);
  useEffect(() => { refetchAllRef.current = refetchAll; }, [refetchAll]);
  useEffect(() => {
    if (!currentTenantId || isElectron()) return;
    let timer;
    const trigger = () => { clearTimeout(timer); timer = setTimeout(() => refetchAllRef.current(), 600); };
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
 const [heroVisible, setHeroVisible] = useState(true);
 useEffect(() => {
   const t = setTimeout(() => setHeroVisible(false), 15000);
   return () => clearTimeout(t);
 }, []);

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

 const salariesPending = useMemo(
   () => (employees || []).reduce((sum, e) => {
     const earned = (e.dailyRate ?? e.daily_rate ?? 500) * (e.daysWorked ?? e.days_worked ?? 0);
     return sum + Math.max(0, earned - (e.amountPaid ?? e.amount_paid ?? 0));
   }, 0),
   [employees]
 );

 const lowStockProducts = useMemo(
   () => (products || []).filter(p => {
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
   () => (employees || []).filter(e => ((e.dailyRate ?? e.daily_rate ?? 500) * (e.daysWorked ?? e.days_worked ?? 0)) > (e.amountPaid ?? e.amount_paid ?? 0)),
   [employees]
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

  // Expense Distribution by Category (Filtered)
  const expenseByCategory = useMemo(() => {
    const catMap = {};
    (expenses || []).filter(e => isWithinRange(e.date)).forEach(exp => {
      catMap[exp.category] = (catMap[exp.category] || 0) + (exp.amount || 0);
    });
    return Object.keys(catMap).map(name => ({ name, value: catMap[name]}));
  }, [expenses, datePreset, customRange]);

 const COLORS = [
 '#3b82f6', // blue-500
 '#ec4899', // pink-500
 '#8b5cf6', // amber-500
 '#10b981', // emerald-500
 '#f59e0b', // amber-500
 '#D97706', // amber-500
 '#ef4444', // red-500
 '#06b6d4', // cyan-500
 '#84cc16', // lime-500
 '#f97316', // orange-500
 '#a855f7', // purple-500
 '#14b8a6', // teal-500
 ];

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

 // Earnings Data for Weekly Performance (Last 7 Days)
 const earningsByDay = useMemo(() => {
 const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
 const dayMap = {};
 days.forEach(d => dayMap[d] = 0);
 
 const now = new Date();
 const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

 (sales || []).forEach(o => {
 const oDate = parseLocalDate(o.date);
 if (oDate >= last7Days && !isNaN(oDate.getTime())) {
 const dayName = days[oDate.getDay()];
 dayMap[dayName] += (o.totalAmount || 0);
}
});

 const orderedWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
 return orderedWeek.map(day => ({
 name: day,
 value: dayMap[day]
 }));
}, [sales]);

 // System Status Check
 const isConnected = useMemo(() => products !== null && products !== undefined, [products]);

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
 { label: 'Vehicle Payload', value: activeRoutes.length > 0 ? 85 : 0, color: 'bg-accent-signature'},
 { label: 'Route Coverage', value: Math.round((completedRoutes / totalRoutes) * 100), color: 'bg-blue-500'},
 { label: 'Stock Turnover', value: Math.min(100, Math.round((totalMovedOut / totalStock) * 100)), color: 'bg-purple-500'}
 ];
}, [routes, products, movementLog, activeRoutes, inventoryBalances]);

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

 return (
 <div className="animate-fade-in flex flex-col gap-5">
 <BannerCarousel />
 <ExpiryAlertCard />
  {/* Reference-Style Hero Section (Compressed Height) — fades out after 15s */}
  <div
    style={{ transition: 'opacity 1s ease, max-height 1s ease, margin-bottom 1s ease' }}
    className={heroVisible ? 'opacity-100 max-h-[500px]' : 'opacity-0 max-h-0 overflow-hidden !mb-0 pointer-events-none'}
  >
  <div className="bg-white px-5 py-8 md:px-10 md:py-10 rounded-[2.5rem] shadow-premium border border-black/5 flex flex-col lg:flex-row items-center justify-between gap-10 relative overflow-hidden group">
    <div className="absolute top-0 right-0 w-64 h-64 bg-accent-signature/10 rounded-full blur-3xl -mr-32 -mt-32 transition-all group-hover:bg-accent-signature/20" />
    <div className="flex-1 space-y-5 relative z-10">
      <div>
        <h1 className="text-3xl md:text-6xl font-black font-sora text-ink-primary leading-[0.9] tracking-tight mb-3 uppercase">
          COMMAND <br className="hidden md:block" /> CENTER<span className="text-accent-signature">.</span>
        </h1>
        <p className="text-gray-700 text-base max-w-lg opacity-60 font-medium leading-relaxed">
          Operational intelligence and real-time asset synchronization across your entire retail ecosystem.
        </p>
      </div>
      <div className="flex flex-wrap items-stretch gap-3">
        <button 
          onClick={() => navigate('/inventory')}
          className="btn-signature pl-6 pr-2 py-2 rounded-full shadow-lg hover:shadow-accent-signature/20 text-[12px]"
        >
          <span>DEPLOY INVENTORY</span>
          <div className="icon-nest !w-10 !h-10 ml-4">
            <ArrowRight className="w-5 h-5" />
          </div>
        </button>
        <button 
          onClick={() => navigate('/reports')}
          className="px-8 flex items-center justify-center rounded-full font-bold text-[11px] tracking-wide text-ink-primary bg-white border border-gray-300 shadow-sm hover:bg-white hover:shadow-premium transition-all uppercase"
        >
          ANALYTICS BROWSER
        </button>
      </div>
    </div>
    <div className="hidden lg:flex w-1/3 aspect-[16/10] max-h-[300px] bg-canvas rounded-[2.5rem] border border-black/5 items-center justify-center relative overflow-hidden shadow-inner group-hover:scale-105 transition-transform duration-700">
      <div className="absolute inset-0 bg-gradient-to-br from-accent-signature/30 to-transparent opacity-[0.85]" />
      <Activity className="w-40 h-40 text-ink-primary/5 relative z-10 animate-pulse" />
      <div className="absolute bottom-6 left-6 right-6 p-5 bg-white/80 backdrop-blur-md rounded-lg border border-black/5 shadow-xl">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          <span className="text-[10px] font-semibold text-ink-primary">Live Telemetry</span>
        </div>
        <div className="h-1 w-full bg-canvas rounded-full overflow-hidden">
          <div className="h-full bg-ink-primary w-[70%] animate-in slide-in-from-left duration-1000" />
        </div>
      </div>
    </div>
  </div>
  </div>{/* end hero fade wrapper */}

 {/* Financial Overview & Date Range Selector */}
 <div>
 <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
 <h2 className="text-xl font-bold text-ink-primary">Financial Overview</h2>
 <div className="flex items-center gap-3">
 <button
   onClick={refetchAll}
   title="Refresh all data"
   className={`w-8 h-8 flex items-center justify-center rounded-full border border-black/10 hover:bg-black/5 transition-all text-gray-500 ${isLoading ? 'animate-spin opacity-50 pointer-events-none' : ''}`}
 >
   <Activity size={14} />
 </button>
 <div className="flex items-center text-sm font-bold text-gray-700 mr-2">
 <Calendar size={16} className="mr-2 opacity-[0.85]" />
 Date Range
 </div>
 <select 
 value={datePreset}
 onChange={e => setDatePreset(e.target.value)}
 className="bg-surface border border-black/10 rounded-pill px-4 py-2 text-sm font-bold text-ink-primary shadow-sm outline-none cursor-pointer hover:border-black/20 transition-all"
 >
 <option value="Today">Today</option>
 <option value="This Week">This Week</option>
 <option value="This Month">This Month</option>
 <option value="Last Month">Last Month</option>
 <option value="All Time">All Time</option>
 <option value="Custom Range">Custom Range</option>
 </select>
 {datePreset === 'Custom Range' && (
 <div className="flex items-center gap-2">
 <input type="date" value={customRange.start} onChange={e => setCustomRange({...customRange, start: e.target.value})} className="bg-surface border border-black/10 rounded-pill px-3 py-1.5 text-xs font-bold font-mono text-ink-primary outline-none" />
 <span className="text-gray-700 opacity-[0.85] text-xs font-semibold">TO</span>
 <input type="date" value={customRange.end} onChange={e => setCustomRange({...customRange, end: e.target.value})} className="bg-surface border border-black/10 rounded-pill px-3 py-1.5 text-xs font-bold font-mono text-ink-primary outline-none" />
 </div>
 )}
 </div>
 </div>

 <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
 {[
   { label: `${datePreset} Sales`,     value: Math.round(datePreset === 'Today' && kpiData ? (kpiData.today_sales ?? rangeSales) : rangeSales),             icon: <Banknote size={16} />,    tone: 'emerald', delta: kpiData?.sales_delta_pct, to: '/sales' },
   { label: `${datePreset} Expenses`,  value: Math.round(datePreset === 'Today' && kpiData ? (kpiData.today_expenses ?? rangeExpenses) : rangeExpenses),    icon: <TrendingDown size={16} />, tone: 'rose',    delta: kpiData?.expenses_delta_pct, to: '/expenses' },
   { label: 'Cash Balance',            value: Math.round(currentCashBalance),                                                                                icon: <DollarSign size={16} />,  tone: 'amber', to: '/daybook' },
   { label: 'Outstanding',             value: Math.round(kpiData ? (kpiData.outstanding_collections ?? totalOutstanding) : totalOutstanding),               icon: <Activity size={16} />,    tone: 'amber', to: '/clients' },
   { label: `${datePreset} Purchases`, value: Math.round(datePreset === 'Today' && kpiData ? (kpiData.today_purchases ?? rangePurchases) : rangePurchases), icon: <ShoppingBag size={16} />, tone: 'slate', to: '/purchases' },
   { label: 'Salary Pending',          value: Math.round(salariesPending),                                                                                   icon: <Users size={16} />,       tone: 'slate', to: '/payroll' },
 ].map((m, i) => {
   const chip = { emerald: 'bg-emerald-50 text-emerald-600', rose: 'bg-rose-50 text-rose-500', amber: 'bg-amber-50 text-amber-600', slate: 'bg-slate-100 text-slate-500' }[m.tone];
   const d = typeof m.delta === 'number' ? m.delta : null;
   return (
   <div key={i} role="button" tabIndex={0}
     onClick={() => m.to && navigate(m.to)}
     onKeyDown={(e) => { if (m.to && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); navigate(m.to); } }}
     className="bg-white rounded-2xl border border-black/[0.07] shadow-sm p-4 flex flex-col gap-2 hover:shadow-md hover:border-black/15 transition-all cursor-pointer">
     <div className="flex items-center justify-between">
       <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${chip}`}>{m.icon}</span>
       {d !== null && (
         <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${d > 0 ? 'text-emerald-600' : d < 0 ? 'text-rose-500' : 'text-gray-400'}`}>
           {d > 0 ? <ArrowUpRight size={12} /> : d < 0 ? <ArrowDownRight size={12} /> : null}{Math.abs(d).toFixed(1)}%
         </span>
       )}
     </div>
     <div className="font-mono text-[22px] font-bold tabular-nums leading-none text-ink-primary mt-1">
       <span className="text-amber-400 text-sm mr-0.5">{businessProfile?.currencySymbol || '₹'}</span>{m.value.toLocaleString('en-IN')}
     </div>
     <div className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">{m.label}</div>
   </div>
   );
 })}
 </div>
 </div>
 
 {/* Application Data Visualizations (Task 7 Specs) */}
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
 {/* Chart 1: Daily Sales This Week */}
 <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-black/5 flex flex-col h-[380px]">
 <h2 className="text-xl font-bold text-ink-primary mb-6">Sales This Week</h2>
 <div className="flex-1 w-full relative">
 {chart1Data.reduce((s, d) => s + d.value, 0) === 0 ? (
 <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-700 opacity-70">
 <BarChart3 size={32} className="mb-2" />
 <span className="text-sm font-bold">No Sales Data for This Week</span>
 </div>
 ) : (
 <WeeklySalesBarChart data={chart1Data} currencySymbol={businessProfile?.currencySymbol || '₹'} />
 )}
 </div>
 </div>

 {/* Chart 2: This Month vs Last Month Area Chart */}
 <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-black/5 flex flex-col h-[380px]">
 <div className="flex justify-between items-center mb-6">
 <h2 className="text-xl font-bold text-ink-primary">Monthly Sales Comparison</h2>
 <div className="flex gap-4 text-xs font-bold text-gray-700">
 <span className="flex items-center gap-1"><div className="w-3 h-3 bg-blue-600 rounded-sm"></div> This Month</span>
 <span className="flex items-center gap-1"><div className="w-3 h-3 border-2 border-dashed border-slate-400 rounded-sm"></div> Last Month</span>
 </div>
 </div>
 <div className="flex-1 w-full relative">
 {chart2Data.reduce((s, d) => s + d.thisMonth + d.lastMonth, 0) === 0 ? (
 <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-700 opacity-70">
 <TrendingUp size={32} className="mb-2" />
 <span className="text-sm font-bold">No Monthly Progression Data</span>
 </div>
 ) : (
 <MonthlyComparisonAreaChart data={chart2Data} currencySymbol={businessProfile?.currencySymbol || '₹'} />
 )}
 </div>
 </div>

 {/* Chart 3: Cash vs Credit Sales Donut */}
 <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-black/5 flex flex-col h-[380px]">
 <h2 className="text-xl font-bold text-ink-primary mb-6">Payment Breakdown</h2>
 <div className="flex-1 w-full relative">
 {chart3Total === 0 ? (
 <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-700 opacity-70">
 <DollarSign size={32} className="mb-2" />
 <span className="text-sm font-bold">Awaiting Transactions</span>
 </div>
 ) : (
 <PaymentBreakdownPieChart data={chart3Data} total={chart3Total} currencySymbol={businessProfile?.currencySymbol || '₹'} />
 )}
 </div>
 </div>

 {/* Chart 4: Expense Category Breakdown */}
 <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-black/5 flex flex-col h-[380px] overflow-hidden">
 <h2 className="text-xl font-bold text-ink-primary mb-6">Expenses by Category</h2>
 <div className="flex-1 w-full relative -ml-16">
 {chart4Data.length === 0 ? (
 <div className="absolute inset-0 pl-16 flex flex-col items-center justify-center text-gray-700 opacity-70">
 <TrendingDown size={32} className="mb-2" />
 <span className="text-sm font-bold">No Expenses Currently</span>
 </div>
 ) : (
 <ExpenseCategoryBarChart data={chart4Data} currencySymbol={businessProfile?.currencySymbol || '₹'} />
 )}
 </div>
 </div>
 </div>

 {/* Operations Section */}
 <div>
 <h2 className="text-xl font-bold text-ink-primary mb-4">Operations</h2>
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
 {/* Infrastructure Health */}
 <div role="button" tabIndex={0} onClick={() => navigate('/inventory')}
   className="bg-white p-6 rounded-[2rem] shadow-sm border border-black/5 cursor-pointer hover:shadow-md hover:border-black/15 transition-all">
 <div className="flex justify-between items-start mb-4">
 <div>
 <p className="text-gray-700 text-sm font-medium">Total Products</p>
 <h3 className="text-3xl font-bold mt-1 text-ink-primary">{kpiData ? (kpiData.total_products ?? (products || []).length) : (products || []).length}</h3>
 </div>
 <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center text-ink-primary">
 <Package className="w-6 h-6" />
 </div>
 </div>
 <div className="flex items-center gap-2 text-sm text-gray-700 font-semibold">
 System Inventory Health
 </div>
 </div>

 {/* Dispatches */}
 <div role="button" tabIndex={0} onClick={() => navigate('/vehicles')}
   className="bg-white p-6 rounded-[2rem] shadow-sm border border-black/5 cursor-pointer hover:shadow-md hover:border-black/15 transition-all">
 <div className="flex justify-between items-start mb-4">
 <div>
 <p className="text-gray-700 text-sm font-medium">Active Trips</p>
 <h3 className="text-3xl font-bold mt-1 text-ink-primary">{kpiData ? (kpiData.active_trips ?? (routes || []).filter(r => r.status === 'ACTIVE').length) : (routes || []).filter(r => r.status === 'ACTIVE').length}</h3>
 </div>
 <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center overflow-hidden border border-blue-100 shadow-sm">
 <img src={`${import.meta.env.BASE_URL}assets/van.png`} className="w-full h-full object-cover scale-150 transform hover:scale-175 transition-transform" alt="Van" />
 </div>
 </div>
 <div className="flex items-center gap-2 text-sm text-gray-700 font-semibold">
 {routes?.length || 0} Total Routes
 </div>
 </div>

 {/* Critical Alerts */}
 <div role="button" tabIndex={0} onClick={() => navigate('/inventory')}
   className="bg-white p-6 rounded-[2rem] shadow-sm border border-black/5 cursor-pointer hover:shadow-md hover:border-black/15 transition-all">
 <div className="flex justify-between items-start mb-4">
 <div>
 <p className="text-gray-700 text-sm font-medium">Low Stock Items</p>
 <h3 className="text-3xl font-bold mt-1 text-red-600">{kpiData ? (kpiData.low_stock_items ?? lowStockProducts.length) : lowStockProducts.length}</h3>
 </div>
 <div className="w-12 h-12 rounded-lg bg-red-100 flex items-center justify-center text-red-600">
 <AlertCircle className="w-6 h-6" />
 </div>
 </div>
 <div className="flex items-center gap-2 text-sm">
 <span className="text-red-700 font-bold flex items-center gap-1 bg-red-100 px-2.5 py-1 rounded-full">
 Needs Attention
 </span>
 </div>
 </div>

 {/* System Pulse */}
 <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-black/5">
 <div className="flex justify-between items-start mb-4">
 <div>
 <p className="text-gray-700 text-sm font-medium">System Status</p>
 <h3 className="text-3xl font-bold mt-1 text-ink-primary">99.9%</h3>
 </div>
 <div className="w-12 h-12 rounded-lg bg-gray-50 flex items-center justify-center text-ink-primary opacity-[0.85]">
 <LayoutDashboard className="w-6 h-6" />
 </div>
 </div>
 <div className="flex items-center gap-2 text-sm text-ink-primary">
 <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
 <span className="font-medium">{isConnected ? 'System Dynamic & Syncing' : 'Local Mode / Disconnected'}</span>
 </div>
 </div>
 </div>
 </div>

 {/* Intelligence Section: Dual Charts */}
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
 {/* Income & Expense Trends */}
 <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-black/5 flex flex-col">
 <div className="flex justify-between items-center mb-6">
 <h2 className="text-xl font-bold text-ink-primary">Sales Trends</h2>
 <div className="flex items-center gap-4 text-sm font-semibold">
 <div className="flex items-center gap-1.5 text-blue-600">
 <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div> Income
 </div>
 <div className="flex items-center gap-1.5 text-pink-600">
 <div className="w-2.5 h-2.5 rounded-full bg-pink-500"></div> Expense
 </div>
 </div>
 </div>
 <div className="relative h-[300px] w-full">
 <ResponsiveContainer width="100%" height="100%">
 <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0}}>
 <defs>
 <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
 <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
 <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
 </linearGradient>
 <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
 <stop offset="5%" stopColor="#ec4899" stopOpacity={0.3}/>
 <stop offset="95%" stopColor="#ec4899" stopOpacity={0}/>
 </linearGradient>
 </defs>
 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
 <XAxis 
 dataKey="date" 
 axisLine={false} 
 tickLine={false} 
 tick={{ fill: '#6B7280', fontSize: 12, fontWeight: 500}}
 dy={10}
 />
 <YAxis 
 axisLine={false} 
 tickLine={false} 
 tick={{ fill: '#6B7280', fontSize: 11, fontWeight: 500}}
 tickFormatter={(value) => `${businessProfile?.currencySymbol || '₹'}${value > 999 ? (value/1000).toFixed(1) + 'k' : value}`}
 dx={-10}
 />
 <RechartsTooltip 
 contentStyle={{ 
 borderRadius: '20px', 
 border: 'none', 
 padding: '16px',
 boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)' 
 }}
 itemStyle={{ fontWeight: 600, fontSize: '13px'}}
 labelStyle={{ color: '#6B7280', marginBottom: '8px', fontWeight: 500}}
 />
 <Area 
 type="monotone" 
 dataKey="income" 
 name="Income"
 stroke="#3b82f6" 
 strokeWidth={1.5}
 fillOpacity={1}
 fill="url(#colorIncome)"
 dot={{ r: 3, strokeWidth: 1.5, fill: '#fff', stroke: '#3b82f6'}}
 activeDot={{ r: 5, strokeWidth: 0}}
 />
 <Area 
 type="monotone" 
 dataKey="expense" 
 name="Expense"
 stroke="#ec4899" 
 strokeWidth={1.5}
 fillOpacity={1}
 fill="url(#colorExpense)"
 dot={{ r: 3, strokeWidth: 1.5, fill: '#fff', stroke: '#ec4899'}}
 activeDot={{ r: 5, strokeWidth: 0}}
 />
 </AreaChart>
 </ResponsiveContainer>
 </div>
 </div>

 {/* Category Sales & Weekly Performance Dual Card */}
  <div className="bg-white p-5 rounded-[2rem] shadow-premium border border-black/5 flex flex-col gap-5">
    <div className="flex justify-between items-center mb-2">
      <h2 className="text-xl font-bold text-ink-primary">Analytics</h2>
      <span className="text-xs font-bold px-3 py-1 bg-gray-100 rounded-full text-gray-700 uppercase tracking-wider">Expense Portfolio</span>
    </div>
  
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-center">
 {/* Compact Category Distribution */}
 <div className="relative h-[300px] w-full">
 <ResponsiveContainer width="100%" height="100%">
 <PieChart>
 <defs>
 {COLORS.map((color, index) => (
 <linearGradient id={`pieGradCompact-${index}`} key={index} x1="0" y1="0" x2="0" y2="1">
 <stop offset="0%" stopColor={color} stopOpacity={0.9}/>
 <stop offset="100%" stopColor={color} stopOpacity={0.6}/>
 </linearGradient>
 ))}
 </defs>
 <Pie
  data={expenseByCategory}
 cx="60%"
 cy="50%"
 innerRadius={45}
 outerRadius={85}
 paddingAngle={4}
 dataKey="value"
 animationBegin={200}
 stroke="none"
 >
 {expenseByCategory.map((entry, index) => (
 <Cell 
 key={`cell-${index}`} 
 fill={`url(#pieGradCompact-${index % COLORS.length})`}
 className="hover:opacity-80 transition-opacity cursor-pointer outline-none" 
 />
 ))}
 </Pie>
 <RechartsTooltip 
 contentStyle={{ 
 borderRadius: '20px', 
 border: 'none', 
 padding: '16px',
 boxShadow: '0 20px 40px -10px rgb(0 0 0 / 0.15)'
 }}
 />
 <Legend 
 layout="vertical"
 verticalAlign="middle"
 align="left"
 iconType="circle"
 iconSize={10}
 wrapperStyle={{ paddingLeft: '0px'}}
 formatter={(value) => <span className="text-[11px] font-bold text-gray-700">{value}</span>}
 />
 </PieChart>
 </ResponsiveContainer>
 </div>

 {/* Weekly Sales Velocity (New) */}
 <div className="relative h-[280px] w-full">
 <div className="absolute -top-6 left-0 flex items-center gap-2">
 <TrendingUp className="w-4 h-4 text-green-600" />
 <span className="text-[10px] font-semibold text-gray-700">Weekly Performance</span>
 </div>
 <ResponsiveContainer width="100%" height="100%">
 <BarChart data={earningsByDay} margin={{ top: 20, right: 10, left: -20, bottom: 0}}>
 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
 <XAxis 
 dataKey="name" 
 axisLine={false} 
 tickLine={false} 
 tick={{ fill: '#6B7280', fontSize: 11, fontWeight: 700}}
 />
 <YAxis 
 axisLine={false} 
 tickLine={false} 
 tick={{ fill: '#6B7280', fontSize: 10, fontWeight: 700}}
 tickFormatter={(val) => `${businessProfile?.currencySymbol || '₹'}${val > 1000 ? (val/1000).toFixed(0) + 'k' : val}`}
 />
 <RechartsTooltip 
 cursor={{ fill: 'rgba(0,0,0,0.02)'}}
 contentStyle={{ borderRadius: '15px', border: 'none', boxShadow: '0 10px 20px rgba(0,0,0,0.05)'}}
 />
 <Bar 
 dataKey="value" 
 name="Revenue" 
 fill="#D97706" 
 radius={[6, 6, 0, 0]}
 barSize={32}
 animationDuration={2000}
 />
 </BarChart>
 </ResponsiveContainer>
 </div>
 </div>
 </div>
 </div>

 {/* Intelligence Row 2: Trend & Utilization */}
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
 <div className="lg:col-span-2">
 <DailyRevenueTrendChart />
 </div>
 
 {/* Secondary Insight: Asset Utilization (New) */}
 <div className="bg-white p-5 rounded-[2rem] shadow-premium border border-black/5 flex flex-col h-[400px]">
 <div className="flex justify-between items-center mb-6">
 <div>
 <h2 className="text-xl font-bold text-ink-primary">Efficiency</h2>
 <p className="text-[10px] font-semibold text-gray-700/40">Performance</p>
 </div>
 <div className="w-10 h-10 rounded-xl bg-accent-signature/10 flex items-center justify-center text-ink-primary">
 <Activity size={18} />
 </div>
 </div>
 
 <div className="flex-1 flex flex-col justify-center gap-4">
 {efficiencyStats.map((stat, i) => (
 <div key={i} className="space-y-2">
 <div className="flex justify-between items-end">
 <span className="text-[10px] font-semibold text-gray-700">{stat.label}</span>
 <span className="text-sm font-semibold text-ink-primary font-mono">{stat.value}%</span>
 </div>
 <div className="h-2 w-full bg-canvas rounded-full overflow-hidden">
 <div 
 className={`h-full ${stat.color} transition-all duration-1000`} 
 style={{ width: `${stat.value}%`}}
 ></div>
 </div>
 </div>
 ))}
 </div>
 </div>
 </div>

 {/* Actionable Alerts Section */}
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
 {/* Low Stock Alerts */}
 <div className="bg-white rounded-[1.5rem] border border-black/5 shadow-sm flex flex-col h-[400px] overflow-hidden">
   <div className="flex items-center justify-between px-5 py-4 border-b border-black/5 shrink-0">
     <div className="flex items-center gap-2">
       <AlertCircle size={13} className="text-red-500" />
       <span className="text-xs font-black text-ink-primary uppercase tracking-wide">Low Stock</span>
     </div>
     <span className="text-[10px] font-black text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded-lg">{kpiData ? (kpiData.low_stock_items ?? lowStockProducts.length) : lowStockProducts.length}</span>
   </div>
   <div className="flex-1 overflow-y-auto divide-y divide-black/5">
     {lowStockProducts.length === 0 ? (
       <div className="h-full flex items-center justify-center text-[11px] text-gray-400 font-semibold">All products stocked</div>
     ) : (
       lowStockProducts.map(item => (
         <div key={item.id} role="button" tabIndex={0} onClick={() => navigate('/inventory')}
           className="flex items-center justify-between px-5 py-3 hover:bg-canvas transition-colors cursor-pointer">
           <div className="flex-1 min-w-0">
             <p className="text-xs font-bold text-ink-primary truncate">{item.name}</p>
             <p className="text-[10px] text-gray-400 mt-0.5">
               {(() => {
                 const bal = (inventoryBalances || []).filter(b => b.product_id === item.id);
                 const qty = bal.length > 0 ? bal.reduce((s, b) => s + b.quantity, 0) : (item.stock ?? 0);
                 const min = item.low_stock_threshold ?? item.lowStockThreshold ?? 10;
                 return <> Stock: <strong className="text-red-500">{qty}</strong> / Min: {min} </>;
               })()}
             </p>
           </div>
           <button onClick={(e) => { e.stopPropagation(); navigate('/purchases'); }} className="ml-3 shrink-0 text-[9px] font-black uppercase tracking-widest text-red-600 bg-red-50 border border-red-100 hover:bg-red-600 hover:text-white transition-colors px-2.5 py-1.5 rounded-lg">
             Restock
           </button>
         </div>
       ))
     )}
   </div>
 </div>

 {/* Salary Pending Alerts */}
 <div className="bg-white rounded-[1.5rem] border border-black/5 shadow-sm flex flex-col h-[400px] overflow-hidden">
   <div className="flex items-center justify-between px-5 py-4 border-b border-black/5 shrink-0">
     <div className="flex items-center gap-2">
       <Users size={13} className="text-amber-500" />
       <span className="text-xs font-black text-ink-primary uppercase tracking-wide">Salary Dues</span>
     </div>
     <span className="text-[10px] font-black text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-lg">{pendingSalaryAlerts.length}</span>
   </div>
   <div className="flex-1 overflow-y-auto divide-y divide-black/5">
     {pendingSalaryAlerts.length === 0 ? (
       <div className="h-full flex items-center justify-center text-[11px] text-gray-400 font-semibold">All salaries cleared</div>
     ) : (
       pendingSalaryAlerts.map(emp => {
         const rate = emp.dailyRate ?? emp.daily_rate ?? 500;
         const days = emp.daysWorked ?? emp.days_worked ?? 0;
         const total = rate * days;
         const paid = emp.amountPaid ?? emp.amount_paid ?? 0;
         const pending = Math.max(0, total - paid);
         return (
           <div key={emp.id} className="flex items-center justify-between px-5 py-3 hover:bg-canvas transition-colors">
             <div className="flex-1 min-w-0">
               <p className="text-xs font-bold text-ink-primary truncate">{emp.name}</p>
               <p className="text-[10px] text-gray-400 mt-0.5">{days}d × ₹{rate} · paid ₹{paid.toLocaleString()}</p>
             </div>
             <div className="flex items-center gap-2 shrink-0 ml-3">
               <span className="text-xs font-black text-amber-600 tabular-nums">₹{pending.toLocaleString()}</span>
               <button onClick={() => navigate('/payroll')} className="text-[9px] font-black uppercase tracking-widest text-amber-700 bg-amber-50 border border-amber-100 hover:bg-amber-600 hover:text-white transition-colors px-2.5 py-1.5 rounded-lg">
                 Pay
               </button>
             </div>
           </div>
         );
       })
     )}
   </div>
 </div>

 {/* Top Outstanding Clients */}
 <div className="bg-white rounded-[1.5rem] border border-black/5 shadow-sm flex flex-col h-[400px] overflow-hidden">
   <div className="flex items-center justify-between px-5 py-4 border-b border-black/5 shrink-0">
     <div className="flex items-center gap-2">
       <Activity size={13} className="text-amber-500" />
       <span className="text-xs font-black text-ink-primary uppercase tracking-wide">Top Debtors</span>
     </div>
   </div>
   <div className="flex-1 overflow-y-auto divide-y divide-black/5">
     {(!clients || clients.filter(c => c.outstanding_balance > 0).length === 0) ? (
       <div className="h-full flex items-center justify-center text-[11px] text-gray-400 font-semibold">No outstanding balances</div>
     ) : (
       [...(clients || [])]
         .filter(c => c.outstanding_balance > 0)
         .sort((a,b) => (b.outstanding_balance || 0) - (a.outstanding_balance || 0))
         .slice(0, 5)
         .map((client, idx) => {
           const out = client.outstanding_balance || 0;
           const amtColor = out > 5000 ? 'text-red-600' : out >= 1000 ? 'text-orange-500' : 'text-green-600';
           return (
             <div key={client.id} role="button" tabIndex={0}
               onClick={() => navigate(`/clients?client=${client.id}`)}
               className="flex items-center justify-between px-5 py-3 hover:bg-canvas transition-colors cursor-pointer">
               <div className="flex items-center gap-3 min-w-0">
                 <span className="text-[9px] font-black text-gray-400 shrink-0 w-4 text-center">{idx + 1}</span>
                 <p className="text-xs font-bold text-ink-primary truncate">{client.name}</p>
               </div>
               <div className="flex items-center gap-2 shrink-0 ml-3">
                 <span className={`text-xs font-black tabular-nums ${amtColor}`}>₹{Math.round(out).toLocaleString()}</span>
                 <button onClick={(e) => { e.stopPropagation(); navigate(`/clients?client=${client.id}`); }} className="text-[9px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 border border-amber-100 hover:bg-amber-600 hover:text-white transition-colors px-2.5 py-1.5 rounded-lg">
                   Collect
                 </button>
               </div>
             </div>
           );
         })
     )}
   </div>
 </div>
 </div>

 {/* Recent Transactions Table */}
 <div className="bg-white p-6 rounded-[2rem] shadow-premium border border-black/5 flex flex-col mt-4">
 <div className="flex justify-between items-center mb-6">
 <h2 className="text-xl font-bold text-ink-primary flex items-center gap-2">
 <Banknote className="w-5 h-5 text-green-500" /> Recent Transactions
 </h2>
 <span className="text-[10px] font-semibold bg-gray-100 px-3 py-1 rounded-full text-gray-700">
 Last 10 Records
 </span>
 </div>
 
 <div className="overflow-x-auto w-full">
 <table className="w-full text-left border-collapse min-w-[700px]">
 <thead>
 <tr className="border-b border-black/5 text-gray-700 text-xs font-bold">
 <th className="pb-4 pl-4 font-semibold">Time</th>
 <th className="pb-4 font-semibold">Type</th>
 <th className="pb-4 font-semibold">Description</th>
 <th className="pb-4 pr-4 font-semibold text-right">Amount</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-black/5">
 {recentTransactions.length === 0 ? (
 <tr>
 <td colSpan="4" className="py-8 text-center text-sm font-medium text-gray-700 italic">
 No transactions recorded yet.
 </td>
 </tr>
 ) : (
 recentTransactions.map((tx) => (
 <tr key={tx.id} className="hover:bg-gray-50/50 transition-colors group">
 <td className="py-2 pl-4">
 <p className="text-sm font-bold text-ink-primary">
 {formatDate(tx.time)}
 </p>
 <p className="text-[10px] font-semibold text-gray-600 opacity-80 mb-6 uppercase">
 {new Date(tx.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'})}
 </p>
 </td>
 <td className="py-2">
 <span className={`inline-flex px-2.5 py-1 rounded-lg text-[10px] font-semibold shadow-sm ${tx.isPositive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
 {tx.type}
 </span>
 </td>
 <td className="py-2">
 <p className="text-sm font-bold text-ink-primary">{tx.desc}</p>
 </td>
 <td className="py-2 pr-4 text-right">
 <div className="flex items-center justify-end gap-1.5">
 <span className={`text-[10px] font-semibold ${tx.isPositive ? 'text-green-500' : 'text-red-500'}`}>
 {tx.isPositive ? '+' : '−'}
 </span>
 <p className={`text-sm font-bold font-mono ${tx.isPositive ? 'text-green-600' : 'text-red-600'}`}>
 ₹{Math.round(tx.amount || 0).toLocaleString()}
 </p>
 </div>
 </td>
 </tr>
 ))
 )}
 </tbody>
 </table>
 </div>
 </div>
 </div>
 );
};

export default Dashboard;
