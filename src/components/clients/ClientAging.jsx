import React, { useMemo} from 'react';
import { AlertCircle, Calendar, ArrowRight, ShieldCheck, Download} from 'lucide-react';

const ClientAging = ({ clients, sales, clientPayments, businessProfile}) => {
 const agingData = useMemo(() => {
 const now = new Date();
 const buckets = {
 current: { label: '0-30 Days', amount: 0, count: 0},
 overdue30: { label: '31-60 Days', amount: 0, count: 0},
 overdue60: { label: '61-90 Days', amount: 0, count: 0},
 overdue90: { label: '90+ Days', amount: 0, count: 0}
};

 const clientBreakdown = (clients || []).map(client => {
 const clientSales = (sales || []).filter(s => s.clientId === client.id && (s.paymentMethod === 'credit' || s.paymentMethod === 'CREDIT'));
 const clientPaymentsTotal = (clientPayments || []).filter(p => p.client_id === client.id).reduce((sum, p) => sum + p.amount, 0);
 
 let remainingPayments = clientPaymentsTotal;
 const aging = { current: 0, overdue30: 0, overdue60: 0, overdue90: 0};

 // Apply payments to oldest sales first (FIFO)
 clientSales.sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(sale => {
 const unpaid = Math.max(0, sale.totalAmount - Math.min(sale.totalAmount, remainingPayments));
 remainingPayments = Math.max(0, remainingPayments - sale.totalAmount);

 if (unpaid > 0) {
 const daysOld = Math.floor((now - new Date(sale.date)) / (1000 * 60 * 60 * 24));
 if (daysOld <= 30) aging.current += unpaid;
 else if (daysOld <= 60) aging.overdue30 += unpaid;
 else if (daysOld <= 90) aging.overdue60 += unpaid;
 else aging.overdue90 += unpaid;
}
});

 buckets.current.amount += aging.current;
 buckets.overdue30.amount += aging.overdue30;
 buckets.overdue60.amount += aging.overdue60;
 buckets.overdue90.amount += aging.overdue90;

 if (aging.current > 0) buckets.current.count++;
 if (aging.overdue30 > 0) buckets.overdue30.count++;
 if (aging.overdue60 > 0) buckets.overdue60.count++;
 if (aging.overdue90 > 0) buckets.overdue90.count++;

 return { ...client, aging};
}).filter(c => (c.aging.current + c.aging.overdue30 + c.aging.overdue60 + c.aging.overdue90) > 0);

 return { buckets, clientBreakdown};
}, [clients, sales, clientPayments]);

 return (
 <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
 {/* Aging Summary Grid */}
 <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
 {Object.entries(agingData.buckets).map(([key, bucket]) => (
 <div key={key} className="glass-panel !p-6 rounded-xl border border-black/5 hover:border-accent-signature/20 transition-all group">
 <div className="flex justify-between items-start mb-4">
 <div className={`p-2 rounded-xl ${key === 'current' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
 <Calendar size={18} />
 </div>
 <span className="text-[10px] font-semibold opacity-[0.85]">{bucket.count} Accounts</span>
 </div>
 <div className="text-sm font-semibold text-gray-700 mb-1">{bucket.label}</div>
 <div className="text-3xl font-semibold text-ink-primary tabular-nums">
 {businessProfile?.currencySymbol || '₹'}{Math.round(bucket.amount).toLocaleString()}
 </div>
 </div>
 ))}
 </div>

 {/* Detailed Aging Table */}
 <div className="glass-panel !p-0 rounded-[2rem] border border-black/5 overflow-hidden">
 <div className="p-6 border-b border-black/5 flex justify-between items-center bg-canvas/30">
 <h3 className="text-xl font-semibold">Debt Aging Breakdown</h3>
 <button className="flex items-center gap-2 px-4 py-2 bg-ink-primary text-accent-signature rounded-full text-[10px] font-semibold hover:scale-105 transition-all">
 <Download size={14} /> Export Report
 </button>
 </div>
 <div className="overflow-x-auto">
 <table className="w-full text-left border-collapse">
 <thead>
 <tr className="bg-canvas/50">
 <th className="py-2 px-6 text-[10px] font-semibold text-gray-700">Client Name</th>
 <th className="py-2 px-6 text-[10px] font-semibold text-gray-700 text-right">Current</th>
 <th className="py-2 px-6 text-[10px] font-semibold text-gray-700 text-right">31-60 Days</th>
 <th className="py-2 px-6 text-[10px] font-semibold text-gray-700 text-right">61-90 Days</th>
 <th className="py-2 px-6 text-[10px] font-semibold text-gray-700 text-right">90+ Days</th>
 <th className="py-2 px-6 text-[10px] font-semibold text-gray-700 text-right">Total Owed</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-black/5">
 {agingData.clientBreakdown.map(client => {
 const total = client.aging.current + client.aging.overdue30 + client.aging.overdue60 + client.aging.overdue90;
 return (
 <tr key={client.id} className="hover:bg-canvas/30 transition-all group">
 <td className="py-2 px-6">
 <div className="flex flex-col">
 <span className="text-sm font-semibold text-ink-primary">{client.name}</span>
 <span className="text-[9px] font-bold text-gray-700 opacity-60">{client.contact}</span>
 </div>
 </td>
 <td className="py-2 px-6 text-right font-semibold font-mono text-sm tabular-nums text-ink-primary">{client.aging.current > 0 ? Math.round(client.aging.current).toLocaleString() : '-'}</td>
 <td className="py-2 px-6 text-right font-semibold font-mono text-sm tabular-nums text-red-400">{client.aging.overdue30 > 0 ? Math.round(client.aging.overdue30).toLocaleString() : '-'}</td>
 <td className="py-2 px-6 text-right font-semibold font-mono text-sm tabular-nums text-red-600">{client.aging.overdue60 > 0 ? Math.round(client.aging.overdue60).toLocaleString() : '-'}</td>
 <td className="py-2 px-6 text-right font-semibold font-mono text-sm tabular-nums text-red-800 bg-red-50/30">{client.aging.overdue90 > 0 ? Math.round(client.aging.overdue90).toLocaleString() : '-'}</td>
 <td className="py-2 px-6 text-right">
 <span className="px-3 py-1 rounded-lg bg-ink-primary text-accent-signature font-semibold font-mono text-sm tabular-nums">
 {Math.round(total).toLocaleString()}
 </span>
 </td>
 </tr>
 );
})}
 </tbody>
 </table>
 </div>
 </div>
 </div>
 );
};

export default ClientAging;
