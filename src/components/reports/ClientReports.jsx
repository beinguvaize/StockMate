import React, { useMemo, useState} from 'react';
import { 
 ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
 Tooltip, Legend, Cell, PieChart, Pie
} from 'recharts';
import { Users, AlertTriangle, Printer, Search, ArrowRight, ShieldAlert, CreditCard} from 'lucide-react';

const ClientReports = ({ clients, sales, businessProfile}) => {
 const [searchTerm, setSearchTerm] = useState('');

 // 4a. Aging Report Data
 const agingData = useMemo(() => {
 const now = new Date();
 const aging = [
 { range: '0-30 Days', value: 0, count: 0},
 { range: '31-60 Days', value: 0, count: 0},
 { range: '61-90 Days', value: 0, count: 0},
 { range: '90+ Days', value: 0, count: 0}
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

 if (diffDays <= 30) { aging[0].value += balance; aging[0].count += 1;}
 else if (diffDays <= 60) { aging[1].value += balance; aging[1].count += 1;}
 else if (diffDays <= 90) { aging[2].value += balance; aging[2].count += 1;}
 else { aging[3].value += balance; aging[3].count += 1;}
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
  {/* Clients Premium Ribbon */}
  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
    {/* Total Receivables Card */}
    <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
      <div className="absolute top-4 right-4 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none text-red-500">
        <CreditCard size={40} strokeWidth={2} />
      </div>
      <div className="relative z-10 flex flex-col">
        <span className="text-[10px] uppercase font-bold text-gray-400 mb-1 block tracking-widest">Total Receivables</span>
        <div className="text-3xl font-black text-ink-primary tabular-nums tracking-tight leading-none mt-0.5">
          <span className="text-[16px] text-ink-primary/30 mr-1">{businessProfile.currencySymbol}</span>
          {Math.round(clients.reduce((sum, c) => sum + (c.balance || 0), 0)).toLocaleString()}
        </div>
        <div className="flex items-center gap-1.5 text-red-500/70 mt-3">
          <span className="text-[9px] font-bold uppercase tracking-wider">Outstanding Client Credit</span>
        </div>
      </div>
    </div>

    {/* Exposure Risk Card */}
    <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
      <div className="absolute top-4 right-4 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none text-orange-500">
        <ShieldAlert size={40} strokeWidth={2} />
      </div>
      <div className="relative z-10 flex flex-col">
        <span className="text-[10px] uppercase font-bold text-gray-400 mb-1 block tracking-widest">Exposure Risk</span>
        <div className="text-3xl font-black text-ink-primary tabular-nums tracking-tight leading-none mt-0.5">
          <span className="text-[16px] text-ink-primary/30 mr-1">{businessProfile.currencySymbol}</span>
          {Math.round(agingData[2].value + agingData[3].value).toLocaleString()}
        </div>
        <div className="flex items-center gap-1.5 text-orange-500/70 mt-3">
          <span className="text-[9px] font-bold uppercase tracking-wider">Arrears (60 Days+)</span>
        </div>
      </div>
    </div>

    {/* Debtor Base Card */}
    <div className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
      <div className="absolute top-4 right-4 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none text-ink-primary">
        <Users size={40} strokeWidth={2} />
      </div>
      <div className="relative z-10 flex flex-col">
        <span className="text-[10px] uppercase font-bold text-gray-400 mb-1 block tracking-widest">Debtor Base</span>
        <div className="text-3xl font-black text-ink-primary tabular-nums tracking-tight leading-none mt-0.5">
          {clients.filter(c => c.balance > 0).length} <span className="text-sm font-bold opacity-30 text-ink-primary tracking-wider ml-1">ACCOUNTS</span>
        </div>
        <div className="flex items-center gap-1.5 text-gray-400 mt-3">
          <span className="text-[9px] font-bold uppercase tracking-wider">Active Credit Relationships</span>
        </div>
      </div>
    </div>
  </div>

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
 {/* Aging Chart */}
 <div className="glass-panel !p-5 bg-white border border-black/5 shadow-premium !rounded-[2.5rem]">
 <h3 className="text-xl font-semibold text-ink-primary mb-2">Debt Aging Analysis.</h3>
 <p className="text-[10px] font-semibold text-gray-700 mb-8">Receivables age distribution</p>
 <div className="h-[300px] w-full">
 <ResponsiveContainer width="100%" height="100%">
 <BarChart data={agingData}>
 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.03)" />
 <XAxis dataKey="range" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: '#4b5563'}} />
 <YAxis hide />
 <Tooltip 
 cursor={{ fill: 'rgba(0,0,0,0.02)'}}
 contentStyle={{ backgroundColor: '#111', border: 'none', borderRadius: '1rem', color: '#cbd5e1'}}
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
 <div className="glass-panel !p-5 bg-white border border-black/5 shadow-premium !rounded-[2.5rem]">
 <h3 className="text-xl font-semibold text-ink-primary mb-2">Exposure Ranking.</h3>
 <p className="text-[10px] font-semibold text-gray-700 mb-8">Clients with highest outstanding balances</p>
 <div className="space-y-4 max-h-[300px] overflow-y-auto scrollbar-hide">
 {topDebtors.map((c, i) => (
 <div key={c.id} className="flex justify-between items-center p-4 bg-canvas/30 rounded-lg border border-black/5">
 <div className="flex items-center gap-4">
 <div className="w-8 h-8 bg-ink-primary text-slate-200 rounded-full flex items-center justify-center text-sm font-semibold">
 {i + 1}
 </div>
 <div>
 <div className="text-[11px] font-semibold text-ink-primary truncate max-w-[150px]">{c.name}</div>
 <div className="text-[8px] font-semibold text-ink-tertiary">{c.phone || 'No Phone'}</div>
 </div>
 </div>
 <div className="text-right">
 <div className="text-sm font-semibold text-red-600">
 {businessProfile.currencySymbol}{Math.round(c.balance).toLocaleString()}
 </div>
 <div className="text-[8px] font-semibold text-ink-tertiary">Unpaid Balance</div>
 </div>
 </div>
 ))}
 </div>
 </div>
 </div>

 {/* Statement Search Section */}
 <div className="glass-panel !p-5 bg-white border border-black/5 shadow-premium !rounded-[2.5rem]">
 <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
 <div>
 <h3 className="text-2xl font-semibold text-ink-primary leading-none mb-2">Statement Terminal.</h3>
 <p className="text-[10px] font-semibold text-gray-700">Direct ledger access & print support</p>
 </div>
 <div className="flex w-full md:w-96 items-center gap-3 bg-canvas px-6 py-3 rounded-full border border-black/5 shadow-inner">
 <Search size={16} className="text-[#4b5563] opacity-70" />
 <input 
 type="text" 
 placeholder="SEARCH BY NAME OR PHONE..."
 className="bg-transparent border-none outline-none w-full text-[10px] font-semibold text-ink-primary placeholder:opacity-60"
 value={searchTerm}
 onChange={e => setSearchTerm(e.target.value)}
 />
 </div>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
 {filteredClients.map(c => (
 <div key={c.id} className="p-5 bg-white border border-black/5 rounded-[2rem] shadow-premium hover:scale-[1.02] transition-all cursor-pointer group">
 <div className="flex justify-between items-start mb-6">
 <div className="p-3 bg-canvas rounded-lg">
 <Users size={24} className="text-ink-primary" />
 </div>
 <button className="p-2 bg-canvas hover:bg-ink-primary hover:text-slate-200 rounded-full transition-all opacity-0 group-hover:opacity-100">
 <Printer size={16} />
 </button>
 </div>
 <h4 className="text-sm font-semibold text-ink-primary mb-1">{c.name}</h4>
 <p className="text-[9px] font-semibold text-ink-tertiary mb-6">
 {c.phone || 'N/A'} • {c.location || 'Unknown'}
 </p>
 <div className="flex justify-between items-end">
 <div>
 <span className="text-[8px] font-semibold text-ink-tertiary block mb-1">Current Balance</span>
 <div className="text-xl font-semibold text-ink-primary">
 {businessProfile.currencySymbol}{Math.round(c.balance || 0).toLocaleString()}
 </div>
 </div>
 <div className="flex items-center gap-2 text-[9px] font-semibold text-accent-signature-hover">
 Ledger <ArrowRight size={14} />
 </div>
 </div>
 </div>
 ))}
 {searchTerm && filteredClients.length === 0 && (
 <div className="col-span-full py-20 text-center text-ink-tertiary italic">
 No clients found matching"{searchTerm}"
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
