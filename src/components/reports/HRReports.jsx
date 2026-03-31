import React, { useMemo} from 'react';
import { 
 ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
 Tooltip, Legend, Cell, PieChart, Pie, AreaChart, Area
} from 'recharts';
import { Users, Banknote, Briefcase, TrendingDown, Clock, Award, Download} from 'lucide-react';
import { downloadCSV} from '../../utils/csvExport';

const HRReports = ({ employees, payroll, businessProfile}) => {
 
 // 6a. Monthly Payroll Spending
 const payrollTrends = useMemo(() => {
 const last6Months = {};
 for (let i = 5; i >= 0; i--) {
 const d = new Date();
 d.setMonth(d.getMonth() - i);
 const key = d.toLocaleString('default', { month: 'short'});
 last6Months[key] = { month: key, amount: 0};
}

 payroll.forEach(p => {
 const month = new Date(p.date || p.createdAt).toLocaleString('default', { month: 'short'});
 if (last6Months[month]) {
 last6Months[month].amount += p.amount || 0;
}
});

 return Object.values(last6Months);
}, [payroll]);

 // 6b. Department Allocation
 const departmentStats = useMemo(() => {
 const stats = {};
 employees.forEach(e => {
 const dept = e.department || 'Operations';
 if (!stats[dept]) stats[dept] = { name: dept, count: 0, cost: 0};
 stats[dept].count += 1;
 stats[dept].cost += e.salary || 0;
});
 return Object.values(stats).sort((a, b) => b.cost - a.cost);
}, [employees]);

 const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#ec4899'];

 return (
 <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
  {/* HR Premium Ribbon */}
  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
    {/* Headcount Card */}
    <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
      <div className="absolute top-4 right-4 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none text-accent-signature-hover">
        <Users size={40} strokeWidth={2} />
      </div>
      <div className="relative z-10 flex flex-col">
        <span className="text-[10px] uppercase font-bold text-gray-400 mb-1 block tracking-widest">Total Headcount</span>
        <div className="text-3xl font-black text-ink-primary tabular-nums tracking-tight leading-none mt-0.5">
          {employees.length} <span className="text-sm font-bold opacity-30 text-ink-primary tracking-wider ml-1">UNITS</span>
        </div>
        <div className="flex items-center gap-1.5 text-gray-400 mt-3">
          <span className="text-[9px] font-bold uppercase tracking-wider">Active Personnel</span>
        </div>
      </div>
    </div>

    {/* Payroll Load Card */}
    <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
      <div className="absolute top-4 right-4 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none text-red-500">
        <Banknote size={40} strokeWidth={2} />
      </div>
      <div className="relative z-10 flex flex-col">
        <span className="text-[10px] uppercase font-bold text-gray-400 mb-1 block tracking-widest">Monthly Payroll Load</span>
        <div className="text-3xl font-black text-ink-primary tabular-nums tracking-tight leading-none mt-0.5">
          <span className="text-[16px] text-ink-primary/30 mr-1">{businessProfile.currencySymbol}</span>
          {Math.round(employees.reduce((sum, e) => sum + (e.salary || 0), 0)).toLocaleString()}
        </div>
        <div className="flex items-center gap-1.5 text-red-500/70 mt-3">
          <span className="text-[9px] font-bold uppercase tracking-wider">Est. Monthly Liability</span>
        </div>
      </div>
    </div>

    {/* Departments Card */}
    <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
      <div className="absolute top-4 right-4 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none text-ink-primary">
        <Briefcase size={40} strokeWidth={2} />
      </div>
      <div className="relative z-10 flex flex-col">
        <span className="text-[10px] uppercase font-bold text-gray-400 mb-1 block tracking-widest">Departments</span>
        <div className="text-3xl font-black text-ink-primary tabular-nums tracking-tight leading-none mt-0.5">
          {departmentStats.length} <span className="text-sm font-bold opacity-30 text-ink-primary tracking-wider ml-1">BRANCHES</span>
        </div>
        <div className="flex items-center gap-1.5 text-gray-400 mt-3">
          <span className="text-[9px] font-bold uppercase tracking-wider">Functional Units</span>
        </div>
      </div>
    </div>
  </div>

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
 {/* Payroll Flow Area Chart */}
 <div className="glass-panel !p-5 bg-white border border-black/5 shadow-premium !rounded-[2.5rem]">
 <h3 className="text-xl font-semibold text-ink-primary mb-2">Expenditure Flow.</h3>
 <p className="text-[10px] font-semibold text-gray-700 mb-8">6-Month historical payroll trends</p>
 <div className="h-[300px] w-full">
 <ResponsiveContainer width="100%" height="100%">
 <AreaChart data={payrollTrends}>
 <defs>
 <linearGradient id="colorPayroll" x1="0" y1="0" x2="0" y2="1">
 <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
 <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
 </linearGradient>
 </defs>
 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.03)" />
 <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: '#4b5563'}} />
 <YAxis hide />
 <Tooltip 
 contentStyle={{ backgroundColor: '#111', border: 'none', borderRadius: '1rem', color: '#cbd5e1'}}
 formatter={(val) => [`${businessProfile.currencySymbol}${Math.round(val).toLocaleString()}`, 'Processed']}
 />
 <Area 
 type="monotone" 
 dataKey="amount" 
 stroke="#6366f1" 
 strokeWidth={3}
 fillOpacity={1} 
 fill="url(#colorPayroll)" 
 />
 </AreaChart>
 </ResponsiveContainer>
 </div>
 </div>

 {/* Department Distribution Pie */}
 <div className="glass-panel !p-5 bg-white border border-black/5 shadow-premium !rounded-[2.5rem]">
 <h3 className="text-xl font-semibold text-ink-primary mb-2">Structural Density.</h3>
 <p className="text-[10px] font-semibold text-gray-700 mb-8">Salary allocation by functional unit</p>
 <div className="h-[300px] w-full">
 <ResponsiveContainer width="100%" height="100%">
 <PieChart>
 <Pie
 data={departmentStats}
 cx="50%"
 cy="50%"
 innerRadius={60}
 outerRadius={100}
 paddingAngle={5}
 dataKey="cost"
 >
 {departmentStats.map((entry, index) => (
 <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
 ))}
 </Pie>
 <Tooltip formatter={(val) => `${businessProfile.currencySymbol}${Math.round(val).toLocaleString()}`} />
 <Legend />
 </PieChart>
 </ResponsiveContainer>
 </div>
 </div>
 </div>

 {/* Department Performance Board */}
 <div className="glass-panel !p-5 bg-white border border-black/5 shadow-premium !rounded-[2.5rem]">
 <div className="flex justify-between items-center mb-10">
 <div>
 <h3 className="text-2xl font-semibold text-ink-primary mb-2">Workforce Integrity.</h3>
 <p className="text-[10px] font-semibold text-gray-700">Departmental cost and population metrics</p>
 </div>
 <button 
 onClick={() => downloadCSV(employees, 'ledgr_hr_workforce', businessProfile.name)}
 className="flex items-center gap-2 px-6 py-3 bg-ink-primary text-accent-signature rounded-full text-[10px] font-semibold hover:bg-black transition-all shadow-premium"
 >
 <Download size={16} />
 Export Workforce
 </button>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
 {departmentStats.map((dept, index) => (
 <div key={dept.name} className="p-5 bg-canvas/30 rounded-[2rem] border border-black/5 hover:bg-white transition-all group overflow-hidden relative">
 <div className="absolute -right-4 -top-4 text-8xl font-semibold opacity-[0.03] group-hover:opacity-10 group-hover:scale-110 transition-all pointer-events-none">
 {index + 1}
 </div>
 <div className="flex items-center gap-4 mb-8">
 <div className="p-4 bg-white rounded-lg shadow-sm group-hover:bg-ink-primary group-hover:text-slate-200 transition-all">
 <Briefcase size={20} />
 </div>
 <h4 className="text-sm font-semibold text-ink-primary">{dept.name}</h4>
 </div>
 <div className="grid grid-cols-2 gap-4">
 <div>
 <span className="text-[8px] font-semibold text-ink-tertiary block mb-1">Total Cost</span>
 <div className="text-lg font-semibold text-ink-primary">
 {businessProfile.currencySymbol}{Math.round(dept.cost).toLocaleString()}
 </div>
 </div>
 <div>
 <span className="text-[8px] font-semibold text-ink-tertiary block mb-1">Personnel</span>
 <div className="text-lg font-semibold text-accent-signature-hover">
 {dept.count} Units
 </div>
 </div>
 </div>
 </div>
 ))}
 {departmentStats.length === 0 && (
 <div className="col-span-full py-20 text-center text-ink-tertiary italic">
 Awaiting personnel data...
 </div>
 )}
 </div>
 </div>
 </div>
 );
};

export default HRReports;
