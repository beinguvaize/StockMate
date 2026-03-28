import React, { useMemo, useState } from 'react';
import { 
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
    Tooltip, Legend, Cell, PieChart, Pie
} from 'recharts';
import { Users, AlertTriangle, Printer, Search, ArrowRight, ShieldAlert, CreditCard } from 'lucide-react';

const ClientReports = ({ clients, sales, businessProfile }) => {
    const [searchTerm, setSearchTerm] = useState('');

    // 4a. Aging Report Data
    const agingData = useMemo(() => {
        const now = new Date();
        const aging = [
            { range: '0-30 Days', value: 0, count: 0 },
            { range: '31-60 Days', value: 0, count: 0 },
            { range: '61-90 Days', value: 0, count: 0 },
            { range: '90+ Days', value: 0, count: 0 }
        ];

        clients.forEach(c => {
            const balance = c.balance || 0;
            if (balance <= 0) return;

            // Find the oldest unpaid/credit sale for this client
            const clientSales = sales.filter(s => s.clientId === c.id && s.paymentMethod === 'Credit');
            if (clientSales.length === 0) {
                // If no credit sales found but balance exists, put in 0-30 as fallback
                aging[0].value += balance;
                aging[0].count += 1;
                return;
            }

            const oldestSaleDate = new Date(Math.min(...clientSales.map(s => new Date(s.date).getTime())));
            const diffDays = Math.floor((now - oldestSaleDate) / (1000 * 60 * 60 * 24));

            if (diffDays <= 30) { aging[0].value += balance; aging[0].count += 1; }
            else if (diffDays <= 60) { aging[1].value += balance; aging[1].count += 1; }
            else if (diffDays <= 90) { aging[2].value += balance; aging[2].count += 1; }
            else { aging[3].value += balance; aging[3].count += 1; }
        });

        return aging;
    }, [clients, sales]);

    // 4b. Credit Risk Analysis (Top Debtors)
    const topDebtors = useMemo(() => {
        return [...clients]
            .filter(c => c.balance > 0)
            .sort((a, b) => b.balance - a.balance)
            .slice(0, 10);
    }, [clients]);

    // 4c. Filtered Clients for Statement Search
    const filteredClients = useMemo(() => {
        return clients.filter(c => 
            c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (c.phone && c.phone.includes(searchTerm))
        ).slice(0, 5);
    }, [clients, searchTerm]);

    const COLORS = ['#22c55e', '#f59e0b', '#ef4444', '#7f1d1d'];

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* KPI Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass-panel !p-8 bg-white border border-black/5 shadow-premium !rounded-[2.5rem]">
                    <span className="text-[10px] font-black text-ink-tertiary uppercase tracking-widest mb-2 block">Total Receivables</span>
                    <div className="text-4xl font-black text-ink-primary tracking-tighter mb-2">
                        {businessProfile.currencySymbol}{Math.round(clients.reduce((sum, c) => sum + (c.balance || 0), 0)).toLocaleString()}
                    </div>
                    <div className="text-[10px] font-black text-red-500 uppercase tracking-widest">Outstanding Credit</div>
                </div>
                <div className="glass-panel !p-8 bg-white border border-black/5 shadow-premium !rounded-[2.5rem]">
                    <span className="text-[10px] font-black text-ink-tertiary uppercase tracking-widest mb-2 block">At Risk (60 Days+)</span>
                    <div className="text-4xl font-black text-red-600 tracking-tighter mb-2">
                        {businessProfile.currencySymbol}{Math.round(agingData[2].value + agingData[3].value).toLocaleString()}
                    </div>
                    <div className="text-[10px] font-black text-ink-primary uppercase tracking-widest">High Risk Collection</div>
                </div>
                <div className="glass-panel !p-8 bg-ink-primary text-white border border-black/5 shadow-premium !rounded-[2.5rem]">
                    <span className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-2 block">Credit Client Base</span>
                    <div className="text-4xl font-black text-accent-signature tracking-tighter mb-2">
                        {clients.filter(c => c.balance > 0).length}
                    </div>
                    <div className="text-[10px] font-black text-white/40 uppercase tracking-widest">Accounts with Balance</div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Aging Chart */}
                <div className="glass-panel !p-10 bg-white border border-black/5 shadow-premium !rounded-[2.5rem]">
                    <h3 className="text-xl font-black text-ink-primary tracking-tighter uppercase mb-2">Debt Aging Analysis.</h3>
                    <p className="text-[10px] font-black text-ink-secondary uppercase tracking-[0.2em] mb-8">Receivables age distribution</p>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={agingData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.03)" />
                                <XAxis dataKey="range" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: '#4b5563' }} />
                                <YAxis hide />
                                <Tooltip 
                                    cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                                    contentStyle={{ backgroundColor: '#000', border: 'none', borderRadius: '1rem', color: '#fff' }}
                                    formatter={(val) => `${businessProfile.currencySymbol}${Math.round(val).toLocaleString()}`}
                                />
                                <Bar dataKey="value" radius={[10, 10, 0, 0]} barSize={40}>
                                    {agingData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Top Debtors List */}
                <div className="glass-panel !p-10 bg-white border border-black/5 shadow-premium !rounded-[2.5rem]">
                    <h3 className="text-xl font-black text-ink-primary tracking-tighter uppercase mb-2">Exposure Ranking.</h3>
                    <p className="text-[10px] font-black text-ink-secondary uppercase tracking-[0.2em] mb-8">Clients with highest outstanding balances</p>
                    <div className="space-y-4 max-h-[300px] overflow-y-auto scrollbar-hide">
                        {topDebtors.map((c, i) => (
                            <div key={c.id} className="flex justify-between items-center p-4 bg-canvas/30 rounded-2xl border border-black/5">
                                <div className="flex items-center gap-4">
                                    <div className="w-8 h-8 bg-ink-primary text-white rounded-full flex items-center justify-center text-[10px] font-black">
                                        {i + 1}
                                    </div>
                                    <div>
                                        <div className="text-[11px] font-black text-ink-primary uppercase truncate max-w-[150px]">{c.name}</div>
                                        <div className="text-[8px] font-black text-ink-tertiary uppercase tracking-widest">{c.phone || 'No Phone'}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm font-black text-red-600 tracking-tighter">
                                        {businessProfile.currencySymbol}{Math.round(c.balance).toLocaleString()}
                                    </div>
                                    <div className="text-[8px] font-black text-ink-tertiary uppercase tracking-widest">Unpaid Balance</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Statement Search Section */}
            <div className="glass-panel !p-10 bg-white border border-black/5 shadow-premium !rounded-[2.5rem]">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
                    <div>
                        <h3 className="text-2xl font-black text-ink-primary tracking-tighter uppercase leading-none mb-2">Statement Terminal.</h3>
                        <p className="text-[10px] font-black text-ink-secondary uppercase tracking-[0.3em]">Direct ledger access & print support</p>
                    </div>
                    <div className="flex w-full md:w-96 items-center gap-3 bg-canvas px-6 py-3 rounded-full border border-black/5 shadow-inner">
                        <Search size={16} className="text-[#4b5563] opacity-40" />
                        <input 
                            type="text" 
                            placeholder="SEARCH BY NAME OR PHONE..."
                            className="bg-transparent border-none outline-none w-full text-[10px] font-black uppercase tracking-widest text-ink-primary placeholder:opacity-30"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredClients.map(c => (
                        <div key={c.id} className="p-8 bg-white border border-black/5 rounded-[2rem] shadow-premium hover:scale-[1.02] transition-all cursor-pointer group">
                            <div className="flex justify-between items-start mb-6">
                                <div className="p-3 bg-canvas rounded-2xl">
                                    <Users size={24} className="text-ink-primary" />
                                </div>
                                <button className="p-2 bg-canvas hover:bg-ink-primary hover:text-white rounded-full transition-all opacity-0 group-hover:opacity-100">
                                    <Printer size={16} />
                                </button>
                            </div>
                            <h4 className="text-sm font-black text-ink-primary uppercase mb-1">{c.name}</h4>
                            <p className="text-[9px] font-black text-ink-tertiary uppercase tracking-widest mb-6">
                                {c.phone || 'N/A'} • {c.location || 'Unknown'}
                            </p>
                            <div className="flex justify-between items-end">
                                <div>
                                    <span className="text-[8px] font-black text-ink-tertiary uppercase tracking-widest block mb-1">Current Balance</span>
                                    <div className="text-xl font-black text-ink-primary tracking-tighter">
                                        {businessProfile.currencySymbol}{Math.round(c.balance || 0).toLocaleString()}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 text-[9px] font-black text-accent-signature-hover uppercase tracking-widest">
                                    Ledger <ArrowRight size={14} />
                                </div>
                            </div>
                        </div>
                    ))}
                    {searchTerm && filteredClients.length === 0 && (
                        <div className="col-span-full py-20 text-center text-ink-tertiary italic">
                            No clients found matching "{searchTerm}"
                        </div>
                    )}
                    {!searchTerm && filteredClients.length === 0 && (
                        <div className="col-span-full py-20 text-center text-ink-tertiary italic">
                            Search for a client to view their statement details.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ClientReports;
