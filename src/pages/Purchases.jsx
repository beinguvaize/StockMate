import React, { useState, useMemo, useEffect} from 'react';
import { useAppContext} from '../context/AppContext';
import { 
 Plus, Search, Calendar, Package, Trash2, Save, X, 
 ArrowUpRight, ShoppingBag, Hash, CreditCard, User, Building2
} from 'lucide-react';

const Purchases = () => {
 const { 
 purchases, addPurchase, products, businessProfile, 
 suppliers, isViewOnly, hasPermission 
} = useAppContext();
 
 const [searchTerm, setSearchTerm] = useState('');
 const [supplierFilter, setSupplierFilter] = useState('');
 const [isAdding, setIsAdding] = useState(false);
 const [formData, setFormData] = useState({
 linked_product_id: '',
 quantity: '',
 unitCost: '',
 supplier_id: '',
 supplier_name: '',
 payment_type: 'cash',
 date: new Date().toISOString().split('T')[0],
 notes: ''
});

 useEffect(() => {
 if (isAdding) {
 document.body.style.overflow = 'hidden';
} else {
 document.body.style.overflow = 'unset';
}
 return () => { document.body.style.overflow = 'unset';};
}, [isAdding]);

 // Fetch unique suppliers (Legacy & Formally Registered)
 const availableSuppliers = useMemo(() => {
 // Formally registered
 const formal = suppliers.map(s => ({ id: s.id, name: s.name}));
 
 // Legacy (only if not already in formal)
 const legacyNames = [...new Set(purchases.map(p => p.supplier_name).filter(n => n && n !== 'Unspecified'))];
 const legacy = legacyNames
 .filter(name => !suppliers.some(s => s.name === name))
 .map(name => ({ id: name, name: name + ' (Legacy)'}));

 return [...formal, ...legacy].sort((a,b) => a.name.localeCompare(b.name));
}, [suppliers, purchases]);

 const filteredPurchases = useMemo(() => {
 if (!Array.isArray(purchases)) return [];
 return purchases
 .filter(p => {
 const product = p.linked_product_id ? products.find(prod => prod.id === p.linked_product_id) : null;
 const matchesSearch = (product?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
 (p.supplier_name || '').toLowerCase().includes(searchTerm.toLowerCase());
 
 const matchesSupplier = supplierFilter === '' || 
 p.supplier_id === supplierFilter || 
 p.supplier_name === supplierFilter;

 return matchesSearch && matchesSupplier;
})
 .sort((a, b) => new Date(b.date) - new Date(a.date));
}, [purchases, searchTerm, supplierFilter, products]);

 const handleSubmit = async (e) => {
 e.preventDefault();
 
 // Find selected supplier name for redundancy
 const selectedSupplier = availableSuppliers.find(s => s.id === formData.supplier_id);

 const purchaseData = {
 ...formData,
 linked_product_id: formData.linked_product_id || null,
 quantity: parseFloat(formData.quantity) || 0,
 unit_cost: parseFloat(formData.unitCost) || 0,
 supplier_id: formData.supplier_id,
 supplier_name: selectedSupplier?.name || formData.supplier_name || 'Unspecified'
};

 const success = await addPurchase(purchaseData);
 if (success) {
 setIsAdding(false);
 setFormData({
 linked_product_id: '',
 quantity: '',
 unitCost: '',
 supplier_id: '',
 supplier_name: '',
 payment_type: 'cash',
 date: new Date().toISOString().split('T')[0],
 notes: ''
});
}
};

 return (
 <>
 <div className="animate-fade-in flex flex-col gap-4 pb-12">
 {/* Header Section */}
 <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 pb-4 border-b border-black/5">
 <div>
 <h1 className="text-4xl md:text-7xl font-black font-sora text-ink-primary leading-[0.85] tracking-tight mb-2 uppercase">PURCHASES<span className="text-accent-signature">.</span></h1>
 <p className="text-[10px] font-semibold text-gray-600 opacity-80 mb-6 uppercase">INVENTORY PROCUREMENT & STOCK IN</p>
 </div>
 <div className="flex items-center gap-4">
 {!isViewOnly() && (
 <button className="btn-signature h-12 !px-5 !rounded-pill flex items-center justify-between gap-4 group transition-all" onClick={() => setIsAdding(true)}>
 <span className="text-xs font-semibold px-2">LOCAL STOCK IN</span>
 <div className="icon-nest !w-8 !h-8 bg-black">
 <Plus size={16} className="text-accent-signature" />
 </div>
 </button>
 )}
 </div>
 </div>

 {/* Search & Stats */}
 <div className="flex flex-col md:flex-row gap-4">
 <div className="flex-1 relative group flex items-center !h-12">
 <Search size={18} className="absolute left-5 text-ink-primary opacity-20 transition-opacity z-10" />
 <input 
 type="text" 
 placeholder="Search by product or supplier..." 
 className="w-full input-field !pl-12 !h-full !py-0 !rounded-pill bg-surface border border-black/5 shadow-premium text-sm font-bold placeholder:text-gray-700/30"
 value={searchTerm}
 onChange={e => setSearchTerm(e.target.value)}
 />
 </div>
 <div className="w-full md:w-64 relative">
 <Building2 size={14} className="absolute left-5 top-1/2 -translate-y-1/2 text-ink-primary opacity-60 z-10" />
 <select
 className="w-full h-12 bg-surface border border-black/5 rounded-pill pl-10 pr-5 font-semibold text-xs text-ink-primary outline-none shadow-premium cursor-pointer appearance-none"
 value={supplierFilter}
 onChange={(e) => setSupplierFilter(e.target.value)}
 >
 <option value="">ALL SUPPLIERS</option>
 {availableSuppliers.map(s => <option key={s.id} value={s.id}>{s.name.toUpperCase()}</option>)}
 </select>
 </div>
 </div>

 {/* Purchases Table */}
 <div className="glass-panel !p-0 !rounded-bento border border-black/5 shadow-premium overflow-hidden">
 <div className="bg-ink-primary p-4 flex items-center gap-4">
 <Package size={16} className="text-accent-signature" />
 <h2 className="text-[10px] font-semibold text-surface">Procurement Log</h2>
 </div>
 
 <div className="overflow-x-auto">
 <table className="w-full text-left border-collapse">
 <thead>
 <tr className="border-b border-black/5 bg-canvas font-inter">
 <th className="p-4 pl-8 text-[10px] font-semibold text-gray-700 opacity-70">Supplier Partner</th>
 <th className="p-4 text-[10px] font-semibold text-gray-700 opacity-70">Linked Product</th>
 <th className="p-4 text-[10px] font-semibold text-gray-700 opacity-70 text-center">Batch Size</th>
 <th className="p-4 text-[10px] font-semibold text-gray-700 opacity-70 text-center">Payment</th>
 <th className="p-4 text-right text-[10px] font-semibold text-gray-700 opacity-70 pr-8">Total Bill</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-black/5 bg-white">
 {filteredPurchases.map(p => {
 const product = p.linked_product_id ? products.find(prod => prod.id === p.linked_product_id) : null;
 const supplier = suppliers.find(s => s.id === p.supplier_id);
 return (
 <tr key={p.id} className="group hover:bg-canvas transition-colors">
 <td className="p-4 pl-8">
 <div className="flex flex-col">
 <div className="text-sm font-semibold text-ink-primary">
 {supplier?.name || p.supplier_name || 'UNSPECIFIED'}
 </div>
 {p.notes && <div className="text-[9px] font-bold text-gray-700 lowercase opacity-[0.85] mt-0.5 truncate max-w-[150px]">{p.notes}</div>}
 </div>
 </td>
 <td className="p-4">
 {product ? (
 <div className="flex items-center gap-2">
 <div className="text-xs font-semibold text-ink-primary">{product.name}</div>
 <span className="px-1.5 py-0.5 rounded bg-black/5 text-[8px] font-semibold text-gray-700">{product.sku}</span>
 </div>
 ) : (
 <span className="px-2 py-1 rounded bg-black/5 text-[9px] font-semibold text-gray-700 opacity-70 border border-black/5">Not Linked</span>
 )}
 </td>
 <td className="p-4 text-center">
 <div className="flex flex-col items-center">
 <span className="px-3 py-1 rounded-pill bg-ink-primary/5 text-ink-primary text-[10px] font-semibold border border-black/5">
 {p.quantity} {product?.unit || 'units'}
 </span>
 <div className="text-[9px] font-bold text-gray-700 opacity-[0.85] mt-1">@ {businessProfile?.currencySymbol || '₹'}{p.unit_cost?.toLocaleString()}</div>
 </div>
 </td>
 <td className="p-4 text-center">
 <div className="flex items-center justify-center gap-1.5">
 <div className={`w-2 h-2 rounded-full ${p.payment_type === 'cash' ? 'bg-green-500 shadow-green-500/40 shadow-sm' : 'bg-orange-500 shadow-orange-500/40 shadow-sm'}`}></div>
 <span className={`text-[9px] font-semibold ${p.payment_type === 'cash' ? 'text-green-600' : 'text-orange-600'}`}>{p.payment_type || 'cash'}</span>
 </div>
 </td>
 <td className="p-4 text-right pr-8">
 <div className="text-base font-semibold text-ink-primary">
 {businessProfile?.currencySymbol || '₹'}{p.total_cost?.toLocaleString()}
 </div>
 <div className="text-[9px] font-semibold text-gray-700 opacity-70">
 {new Date(p.date).toLocaleDateString()}
 </div>
 </td>
 </tr>
 );
})}
 </tbody>
 </table>
 </div>

 {filteredPurchases.length === 0 && (
 <div className="p-32 text-center">
 <div className="flex justify-center mb-6 opacity-10">
 <Package size={64} strokeWidth={1} />
 </div>
 <p className="text-sm font-semibold text-[#747576]">No procurement history</p>
 </div>
 )}
 </div>
 </div>

 {/* Purchase Form Modal */}
 {isAdding && (
 <div className="modal-overlay">
 <div className="glass-modal">
 <div className="flex justify-between items-start mb-5">
 <div>
 <h2 className="text-3xl font-semibold text-ink-primary leading-none mb-2">NEW PURCHASE.</h2>
 <p className="text-[10px] font-semibold text-gray-600 opacity-80 mb-6 uppercase">INCREASE STOCK VIA DIRECT PROCUREMENT</p>
 </div>
 <button onClick={() => setIsAdding(false)} className="w-10 h-10 rounded-pill border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all cursor-pointer">
 <X size={18} />
 </button>
 </div>

 <form onSubmit={handleSubmit} className="space-y-5">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div className="md:col-span-2">
 <label className="block text-[10px] font-semibold text-gray-700 opacity-70 mb-1.5">Link to Product (Optional)</label>
 <select 
 className="w-full bg-canvas border-none rounded-lg p-5 font-semibold text-xs text-ink-primary outline-none appearance-none cursor-pointer" 
 value={formData.linked_product_id} 
 onChange={e => setFormData({...formData, linked_product_id: e.target.value})}
 >
 <option value="">STANDALONE PURCHASE (NO INVENTORY LINK)...</option>
 {products.map(p => <option key={p.id} value={p.id}>{p.name.toUpperCase()} (IN STOCK: {p.stock})</option>)}
 </select>
 </div>
 
 <div>
 <label className="block text-[10px] font-semibold text-gray-700 opacity-70 mb-1.5">Batch Quantity</label>
 <input 
 required 
 type="number" 
 className="w-full bg-canvas border-none rounded-lg p-5 font-semibold text-2xl text-ink-primary outline-none" 
 value={formData.quantity} 
 onChange={e => setFormData({...formData, quantity: e.target.value})} 
 />
 </div>

 <div>
 <label className="block text-[10px] font-semibold text-gray-700 opacity-70 mb-1.5">Unit Cost (CP)</label>
 <div className="relative">
 <div className="absolute left-6 top-1/2 -translate-y-1/2 text-xl font-semibold text-ink-primary opacity-20">
 {businessProfile?.currencySymbol || '₹'}
 </div>
 <input 
 required 
 type="number" 
 step="0.01"
 className="w-full bg-canvas border-none rounded-lg p-5 pl-12 font-semibold text-2xl text-ink-primary outline-none" 
 value={formData.unitCost} 
 onChange={e => setFormData({...formData, unitCost: e.target.value})} 
 />
 </div>
 </div>

 <div className="md:col-span-2">
 <label className="block text-[10px] font-semibold text-gray-700 opacity-70 mb-1.5">Supplier Partner</label>
 <div className="flex gap-2">
 <select 
 className="flex-1 bg-canvas border-none rounded-lg p-5 font-semibold text-xs text-ink-primary outline-none appearance-none cursor-pointer" 
 value={formData.supplier_id} 
 onChange={e => {
 const s = availableSuppliers.find(x => x.id === e.target.value);
 setFormData({...formData, supplier_id: e.target.value, supplier_name: s?.name || ''});
}}
 >
 <option value="">SELECT FORMAL PARTNER...</option>
 {suppliers.map(s => <option key={s.id} value={s.id}>{s.name.toUpperCase()}</option>)}
 </select>
 <input 
 type="text" 
 placeholder="OR ENTER AD-HOC NAME..."
 className="flex-1 bg-canvas border-none rounded-lg p-5 font-semibold text-xs text-ink-primary outline-none" 
 value={formData.supplier_name} 
 onChange={e => setFormData({...formData, supplier_name: e.target.value, supplier_id: ''})} 
 />
 </div>
 </div>

 <div>
 <label className="block text-[10px] font-semibold text-gray-700 opacity-70 mb-1.5">Purchase Date</label>
 <input 
 type="date" 
 className="w-full bg-canvas border-none rounded-lg p-5 font-semibold text-xs text-ink-primary outline-none" 
 value={formData.date} 
 onChange={e => setFormData({...formData, date: e.target.value})} 
 />
 </div>

 <div className="md:col-span-2 grid grid-cols-2 gap-4">
 <div>
 <label className="block text-[10px] font-semibold text-gray-700 opacity-70 mb-1.5">Payment Type</label>
 <div className="flex gap-2 bg-canvas p-1 rounded-lg border border-black/5">
 <button type="button" onClick={() => setFormData({...formData, payment_type: 'cash'})} className={`flex-1 py-3 px-4 rounded-xl text-xs font-semibold transition-all ${formData.payment_type === 'cash' ? 'bg-white shadow-sm text-ink-primary' : 'text-gray-700 opacity-[0.85] hover:bg-black/5'}`}>Cash</button>
 <button type="button" onClick={() => setFormData({...formData, payment_type: 'credit'})} className={`flex-1 py-3 px-4 rounded-xl text-xs font-semibold transition-all ${formData.payment_type === 'credit' ? 'bg-white shadow-sm text-ink-primary' : 'text-gray-700 opacity-[0.85] hover:bg-black/5'}`}>Credit</button>
 </div>
 </div>
 <div>
 <label className="block text-[10px] font-semibold text-gray-700 opacity-70 mb-1.5">Notes (Optional)</label>
 <input 
 type="text" 
 className="w-full h-[46px] bg-canvas border-none rounded-lg px-5 font-semibold text-xs text-ink-primary outline-none placeholder:text-gray-700/30" 
 placeholder="INVOICE NO..."
 value={formData.notes} 
 onChange={e => setFormData({...formData, notes: e.target.value})} 
 />
 </div>
 </div>
 </div>

 <button type="submit" className="btn-signature w-full !h-16 flex items-center justify-center gap-4 !rounded-pill">
 LOG PROCUREMENT & UPDATE STOCK
 <div className="icon-nest !bg-black">
 <Save size={20} className="text-accent-signature" />
 </div>
 </button>
 </form>
 </div>
 </div>
 )}
 </>
 );
};

export default Purchases;
