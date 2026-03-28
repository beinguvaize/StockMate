import React, { useMemo } from 'react';
import { 
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
    Tooltip, Legend, Cell, PieChart, Pie, AreaChart, Area
} from 'recharts';
import { Users, Banknote, Briefcase, TrendingDown, Clock, Award } from 'lucide-react';

const HRReports = ({ employees, payroll, businessProfile }) => {
    
    // 6a. Monthly Payroll Spending
    const payrollTrends = useMemo(() => {
        const last6Months = {};
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const key = d.toLocaleString('default', { month: 'short' });
            last6Months[key] = { month: key, amount: 0 };
        }

        payroll.forEach(p => {
            const month = new Date(p.date || p.createdAt).toLocaleString('default', { month: 'short' });
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
            if (!stats[dept]) stats[dept] = { name: dept, count: 0, cost: 0 };
            stats[dept].count += 1;
            stats[dept].cost += e.salary || 0;
        });
        return Object.values(stats).sort((a, b) => b.cost - a.cost);
    }, [employees]);

    const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#ec4899'];

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* HR KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass-panel !p-8 bg-white border border-black/5 shadow-premium !rounded-[2.5rem]">
                    <span className="text-[10px] font-black text-ink-tertiary uppercase tracking-widest mb-2 block">Total Headcount</span>
                    <div className="text-4xl font-black text-ink-primary tracking-tighter mb-2">
                        {employees.length}
                    </div>
                    <div className="text-[10px] font-black text-ink-primary uppercase tracking-widest">Active Personnel</div>
                </div>
                <div className="glass-panel !p-8 bg-white border border-black/5 shadow-premium !rounded-[2.5rem]">
                    <span className="text-[10px] font-black text-ink-tertiary uppercase tracking-widest mb-2 block">Monthly Payroll Load</span>
                    <div className="text-4xl font-black text-accent-signature-hover tracking-tighter mb-2">
                        {businessProfile.currencySymbol}{Math.round(employees.reduce((sum, e) => sum + (e.salary || 0), 0)).toLocaleString()}
                    </div>
                    <div className="text-[10px] font-black text-ink-primary uppercase tracking-widest">Est. Monthly Liability</div>
                </div>
                <div className="glass-panel !p-8 bg-ink-primary text-white border border-black/5 shadow-premium !rounded-[2.5rem]">
                    <span className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-2 block">Departments</span>
                    <div className="text-4xl font-black text-accent-signature tracking-tighter mb-2">
                        {departmentStats.length}
                    </div>
                    <div className="text-[10px] font-black text-white/40 uppercase tracking-widest">Functional Units</div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Payroll Flow Area Chart */}
                <div className="glass-panel !p-10 bg-white border border-black/5 shadow-premium !rounded-[2.5rem]">
                    <h3 className="text-xl font-black text-ink-primary tracking-tighter uppercase mb-2">Expenditure Flow.</h3>
                    <p className="text-[10px] font-black text-ink-secondary uppercase tracking-[0.2em] mb-8">6-Month historical payroll trends</p>
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
                                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: '#4b5563' }} />
                                <YAxis hide />
                                <Tooltip 
                                    contentStyle={{ backgroundColor: '#000', border: 'none', borderRadius: '1rem', color: '#fff' }}
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
                <div className="glass-panel !p-10 bg-white border border-black/5 shadow-premium !rounded-[2.5rem]">
                    <h3 className="text-xl font-black text-ink-primary tracking-tighter uppercase mb-2">Structural Density.</h3>
                    <p className="text-[10px] font-black text-ink-secondary uppercase tracking-[0.2em] mb-8">Salary allocation by functional unit</p>
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
            <div className="glass-panel !p-10 bg-white border border-black/5 shadow-premium !rounded-[2.5rem]">
                <h3 className="text-2xl font-black text-ink-primary tracking-tighter uppercase mb-2">Workforce Integrity.</h3>
                <p className="text-[10px] font-black text-ink-secondary uppercase tracking-[0.3em] mb-10">Departmental cost and population metrics</p>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {departmentStats.map((dept, index) => (
                        <div key={dept.name} className="p-8 bg-canvas/30 rounded-[2rem] border border-black/5 hover:bg-white transition-all group overflow-hidden relative">
                            <div className="absolute -right-4 -top-4 text-8xl font-black opacity-[0.03] group-hover:opacity-10 group-hover:scale-110 transition-all pointer-events-none">
                                {index + 1}
                            </div>
                            <div className="flex items-center gap-4 mb-8">
                                <div className="p-4 bg-white rounded-2xl shadow-sm group-hover:bg-ink-primary group-hover:text-white transition-all">
                                    <Briefcase size={20} />
                                </div>
                                <h4 className="text-sm font-black text-ink-primary uppercase">{dept.name}</h4>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <span className="text-[8px] font-black text-ink-tertiary uppercase tracking-widest block mb-1">Total Cost</span>
                                    <div className="text-lg font-black text-ink-primary tracking-tighter">
                                        {businessProfile.currencySymbol}{Math.round(dept.cost).toLocaleString()}
                                    </div>
                                </div>
                                <div>
                                    <span className="text-[8px] font-black text-ink-tertiary uppercase tracking-widest block mb-1">Personnel</span>
                                    <div className="text-lg font-black text-accent-signature-hover tracking-tighter">
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
