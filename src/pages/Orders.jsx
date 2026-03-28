import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { 
    ShoppingCart, CheckCircle, Clock, Truck, User, 
    FileText, XCircle, ChevronRight, Printer, X,
    Calendar, MapPin, Phone, Hash, CreditCard, DollarSign,
    Edit3, Trash2, Plus, Minus, Search, Package
} from 'lucide-react';

const Orders = () => {
    const { 
        sales, updateSale, deleteSale, settleSale, users, clients, vehicles, businessProfile,
        getUserName, getVehicleName, getShopName, hasPermission 
    } = useAppContext();
    const [activeTab, setActiveTab] = useState('PENDING');
    const [filterType, setFilterType] = useState('ALL'); 
    const [showReceipt, setShowReceipt] = useState(null); 
    const [editingSale, setEditingSale] = useState(null);
    const [editCart, setEditCart] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');

    const filteredSales = (sales || []).filter(o => {
        if (o.status !== activeTab) return false;
        if (filterType === 'WALKIN') return o.clientId === 'POS-WALKIN' || o.shopId === 'POS-WALKIN';
        if (filterType === 'DELIVERY') return o.clientId !== 'POS-WALKIN' && o.shopId !== 'POS-WALKIN';
        return true;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));

    const pendingCount = (sales || []).filter(o => o.status === 'PENDING').length;
    const walkinPendingCount = (sales || []).filter(o => o.status === 'PENDING' && (o.clientId === 'POS-WALKIN' || o.shopId === 'POS-WALKIN')).length;
    const deliveryPendingCount = (sales || []).filter(o => o.status === 'PENDING' && (o.clientId !== 'POS-WALKIN' && o.shopId !== 'POS-WALKIN')).length;

    const handleMarkDelivered = (saleId) => {
        const sale = sales.find(s => s.id === saleId);
        if (sale) {
            updateSale({
                ...sale,
                status: 'COMPLETED',
                deliveryDate: new Date().toISOString()
            });
        }
    };

    const handleCancelOrder = (saleId) => {
        const sale = sales.find(s => s.id === saleId);
        if (sale) {
            if (window.confirm("Cancel this sale?")) {
                updateSale({ ...sale, status: 'CANCELLED' });
            }
        }
    };

    const startEditing = (sale) => {
        setEditingSale(sale);
        setEditCart([...sale.items]);
    };

    const updateEditCartItem = (productId, field, value) => {
        setEditCart(prev => prev.map(item => {
            if (item.productId !== productId) return item;
            const updated = { ...item, [field]: value };
            if (field === 'quantity') updated.quantity = Math.max(1, parseInt(value) || 1);
            if (field === 'sellingPrice') updated.sellingPrice = Math.max(0, parseFloat(value) || 0);
            return updated;
        }));
    };

    const handleSaveEdit = () => {
        if (!editingSale) return;
        
        const subtotal = editCart.reduce((sum, item) => sum + (item.sellingPrice * item.quantity), 0);
        const discountAmount = subtotal * ((editingSale.discountPercent || 0) / 100);
        const totalAmount = subtotal - discountAmount;

        const updatedSale = {
            ...editingSale,
            items: editCart,
            subtotal,
            totalAmount,
            // We keep the old totalCogs for now, AppContext will reconcile it
        };

        updateSale(updatedSale);
        setEditingSale(null);
    };

    const OrderCard = ({ order, isPending }) => (
        <div className="glass-panel !p-0 !rounded-bento overflow-hidden border border-black/5 hover:shadow-premium transition-all mb-4 group">
            <div className="flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-black/5">
                {/* Left Detail Section */}
                <div className="flex-1 p-4">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                             <div className="flex items-center gap-2 mb-4">
                                <span className={`px-4 py-1.5 rounded-pill text-xs font-black uppercase tracking-widest border ${
                                    isPending ? 'bg-canvas text-ink-primary border-black/10' : 'bg-accent-signature/10 text-ink-primary border-accent-signature/20'
                                }`}>
                                    {order.status}
                                </span>
                                <span className={`px-4 py-1.5 rounded-pill text-xs font-black uppercase tracking-widest border ${
                                    order.shopId === 'POS-WALKIN' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-gray-50 text-[#747576] border-gray-100'
                                }`}>
                                    {order.shopId === 'POS-WALKIN' ? 'Pick-up' : 'Delivery'}
                                </span>
                            </div>
                            <h3 className="text-3xl font-black text-ink-primary tracking-tighter uppercase flex items-center gap-3">
                                <Hash size={24} className="text-ink-secondary opacity-30" /> 
                                {order.id.split('-').pop()}
                            </h3>
                        </div>
                        <div className="text-right">
                            <div className="text-sm font-black uppercase tracking-widest text-[#747576] opacity-70 mb-1">Date</div>
                            <div className="text-xs font-bold text-[#111] uppercase tracking-tight">
                                {new Date(order.date).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                        <div>
                            <div className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-ink-secondary opacity-70 mb-3">
                                <MapPin size={10} /> Customer
                            </div>
                            <div className="text-base font-black text-ink-primary uppercase tracking-tight">{getShopName(order.shopId)}</div>
                            {order.customerInfo?.phone && (
                                <div className="text-xs font-bold text-ink-secondary mt-1 opacity-60 flex items-center gap-1.5">
                                    <Phone size={10} /> {order.customerInfo.phone}
                                </div>
                            )}
                        </div>
                        <div>
                            <div className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-ink-secondary opacity-70 mb-3">
                                <Calendar size={10} /> Scheduled Date
                            </div>
                            <div className="text-base font-black text-ink-primary uppercase tracking-tight">{order.scheduledDate || 'N/A: IMMEDIATE'}</div>
                        </div>
                        <div>
                            <div className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-ink-secondary opacity-70 mb-3">
                                <Truck size={10} /> Vehicle
                            </div>
                            <div className="text-base font-black text-ink-primary uppercase tracking-tight">
                                {order.shopId === 'POS-WALKIN' ? 'STORE PICKUP' : getVehicleName(order.deliveredBy || 'UNASSIGNED')}
                            </div>
                        </div>
                    </div>
                    
                    <div className="mt-6 pt-6 border-t border-dashed border-black/10">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-3">
                            {order.items.map((item, i) => (
                                <div key={i} className="flex justify-between items-center text-xs">
                                    <div className="flex items-center gap-2">
                                        <div className="w-5 h-5 rounded bg-black/5 flex items-center justify-center font-black text-xs">{item.quantity}</div>
                                        <span className="font-bold text-[#111] uppercase tracking-tighter opacity-70 truncate max-w-[150px]">{item.name}</span>
                                    </div>
                                    <span className="font-black text-[#747576]">{businessProfile.currencySymbol}{(item.sellingPrice * item.quantity).toFixed(2)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Action Section */}
                <div className="lg:w-[320px] p-5 bg-canvas/30 backdrop-blur-sm flex flex-col justify-between">
                    <div>
                        <div className="text-xs font-black uppercase tracking-[0.3em] text-ink-secondary opacity-70 mb-1">Total Amount</div>
                        <div className="text-4xl font-black text-ink-primary tracking-tighter mb-4">
                            {businessProfile.currencySymbol}{order.totalAmount.toLocaleString()}
                        </div>
                        <div className="flex items-center gap-3 text-sm font-black uppercase tracking-widest mt-2">
                            <CreditCard size={12} className="text-ink-primary opacity-30" />
                            <span className="text-ink-secondary opacity-60">Payment Method:</span>
                            <span className={`px-3 py-1 rounded-full text-[10px] border ${
                                order.paymentMethod?.toLowerCase() === 'credit' ? 'bg-orange-50 text-orange-700 border-orange-100' : 
                                'bg-green-50 text-green-700 border-green-100'
                            }`}>
                                {order.paymentMethod?.toUpperCase() || 'CASH'}
                            </span>
                            <div className="h-4 w-px bg-black/10 mx-1"></div>
                            <span className={`px-3 py-1 rounded-full text-[10px] border ${
                                order.paymentStatus === 'PAID' ? 'bg-green-50 text-green-700 border-green-100' : 
                                order.paymentStatus === 'PARTIAL' ? 'bg-yellow-50 text-yellow-700 border-yellow-100' :
                                'bg-red-50 text-red-600 border-red-100 animate-pulse'
                            }`}>
                                {order.paymentStatus || 'PENDING'}
                            </span>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 mt-8">
                        <button className="w-full py-3.5 rounded-pill border border-black/10 font-bold text-ink-primary hover:bg-black/5 transition-all text-xs tracking-widest uppercase flex items-center justify-center gap-2" onClick={() => setShowReceipt(order)}>
                            <Printer size={14} /> PRINT RECEIPT
                        </button>
                        
                    {isPending ? (
                            <div className="flex gap-2">
                                {hasPermission('MANAGE_ORDERS') && (
                                    <>
                                        <button className="flex-1 py-3.5 rounded-pill border border-red-100 bg-red-50 text-red-500 font-bold hover:bg-red-100 transition-all text-[10px] tracking-widest uppercase" onClick={() => handleCancelOrder(order.id)}>
                                            CANCEL
                                        </button>
                                        <button className="flex-1 py-3.5 rounded-pill border border-black/10 text-ink-primary font-bold hover:bg-black/5 transition-all text-[10px] tracking-widest uppercase flex items-center justify-center gap-2" onClick={() => startEditing(order)}>
                                            <Edit3 size={12} /> EDIT
                                        </button>
                                    </>
                                )}
                                <button className="flex-[2] btn-signature !py-3.5 !rounded-pill !text-xs shadow-xl shadow-accent-signature/20" onClick={() => handleMarkDelivered(order.id)}>
                                    COMPLETE ORDER
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {order.status === 'COMPLETED' && hasPermission('MANAGE_ORDERS') && (
                                    <div className="flex gap-2">
                                         <button className="flex-1 py-3.5 rounded-pill border border-black/10 text-ink-primary font-bold hover:bg-black/5 transition-all text-[10px] tracking-widest uppercase flex items-center justify-center gap-2" onClick={() => startEditing(order)}>
                                            <Edit3 size={12} /> EDIT
                                        </button>
                                        <button className="flex-1 py-3.5 rounded-pill border border-red-100 bg-red-50 text-red-500 font-bold hover:bg-red-100 transition-all text-[10px] tracking-widest uppercase flex items-center justify-center gap-2" onClick={() => deleteSale(order.id)}>
                                            <Trash2 size={12} /> DELETE
                                        </button>
                                    </div>
                                )}
                                {order.deliveryDate && (
                                    <div className="flex items-center justify-center gap-2 py-4 rounded-full bg-[#C8F135]/10 text-[#111] text-sm font-black uppercase tracking-widest border border-[#C8F135]/20">
                                        <CheckCircle size={16} /> {order.status === 'CANCELLED' ? 'CANCELLED' : `COMPLETED ${new Date(order.deliveryDate).toLocaleDateString()}`}
                                    </div>
                                )}
                                {order.paymentMethod === 'CREDIT' && order.paymentStatus !== 'PAID' && order.status !== 'CANCELLED' && (
                                    <button 
                                        className="w-full py-4 rounded-full bg-ink-primary text-accent-signature font-black text-xs uppercase tracking-widest hover:scale-[1.02] transition-all flex items-center justify-center gap-3 shadow-xl"
                                        onClick={() => settleSale(order.id, order.totalAmount)}
                                    >
                                        <DollarSign size={16} /> PAY NOW
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <div className="animate-fade-in flex flex-col gap-8 pb-12">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 pb-8 border-b border-black/5">
                <div>
                    <h1 className="text-3xl md:text-6xl font-black tracking-tighter text-ink-primary uppercase leading-none mb-2">ORDERS.</h1>
                    <p className="text-[10px] font-black text-ink-secondary tracking-widest uppercase opacity-70">ORDER PIPELINE & HISTORY</p>
                </div>
                
                <div className="glass-panel !p-1.5 !rounded-pill flex gap-1 bg-surface border border-black/5 shadow-premium">
                    {['PENDING', 'COMPLETED'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-6 py-2.5 rounded-pill text-[10px] font-black uppercase tracking-widest transition-all ${
                                activeTab === tab 
                                ? 'bg-ink-primary text-surface shadow-lg' 
                                : 'bg-transparent text-ink-secondary hover:bg-canvas'
                            }`}
                        >
                            {tab} {tab === 'PENDING' && `(${pendingCount})`}
                        </button>
                    ))}
                </div>
            </div>

            {/* View Selection (Filters) */}
            {activeTab === 'PENDING' && (
                <div className="flex gap-3 overflow-x-auto pb-4 custom-scrollbar">
                    {[
                        { id: 'ALL', label: `All Orders (${pendingCount})` },
                        { id: 'WALKIN', label: `Pickups (${walkinPendingCount})` },
                        { id: 'DELIVERY', label: `Deliveries (${deliveryPendingCount})` }
                    ].map(type => (
                        <button
                            key={type.id}
                            onClick={() => setFilterType(type.id)}
                            className={`px-6 py-2.5 rounded-pill text-sm font-black uppercase tracking-widest transition-all whitespace-nowrap border ${
                                filterType === type.id 
                                ? 'bg-accent-signature text-ink-primary border-ink-primary' 
                                : 'bg-surface text-ink-secondary border-black/5 hover:border-black/20'
                            }`}
                        >
                            {type.label}
                        </button>
                    ))}
                </div>
            )}

            {/* Order Feed */}
            <div className="min-h-[400px]">
                {filteredSales.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-20 glass-panel rounded-[3rem] border-2 border-dashed border-black/5 opacity-40">
                        <ShoppingCart size={48} className="text-ink-secondary mb-4" />
                        <h3 className="text-xl font-black text-[#111] uppercase tracking-tighter mb-2">No Sales</h3>
                        <p className="text-sm font-bold text-[#747576] uppercase tracking-[0.3em] opacity-70">No sales found in this category</p>
                    </div>
                ) : (
                    filteredSales.map(order => <OrderCard key={order.id} order={order} isPending={order.status === 'PENDING'} />)
                )}
            </div>

            {/* Receipt Modal */}
            {showReceipt && (
                <div className="modal-overlay">
                    <div className="glass-modal">
                        <div className="flex justify-between items-start mb-5">
                            <div>
                                <h1 className="text-3xl font-black text-ink-primary tracking-tighter uppercase leading-none mb-2">RECEIPT.</h1>
                                <p className="text-[10px] font-black text-ink-secondary uppercase tracking-[0.3em] opacity-70">OFFICIAL TRANSACTION RECORD</p>
                            </div>
                            <button className="w-10 h-10 rounded-pill border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all cursor-pointer text-ink-primary no-print" onClick={() => setShowReceipt(null)}>
                                <X size={18} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                            <div className="text-center mb-6 pb-6 border-b border-dashed border-black/10">
                                <div className="text-3xl font-black text-ink-primary tracking-tighter uppercase mb-2">{businessProfile.name}</div>
                                <div className="text-sm font-black text-ink-secondary uppercase tracking-[0.3em] opacity-70">SALES RECORD</div>
                                <div className="text-sm font-black text-ink-primary mt-6">{new Date(showReceipt.date).toLocaleString()}</div>
                            </div>

                            <div className="space-y-6 mb-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <div className="text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70 mb-2 text-left">Order ID</div>
                                        <div className="text-sm font-black text-ink-primary uppercase text-left tracking-tight">#{showReceipt.id.split('-').pop()}</div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70 mb-2 text-right">Customer</div>
                                        <div className="text-sm font-black text-ink-primary uppercase text-right tracking-tight">{getShopName(showReceipt.shopId)}</div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70 mb-2 text-left">Staff</div>
                                        <div className="text-sm font-black text-ink-primary uppercase text-left tracking-tight">{getUserName(showReceipt.bookedBy)}</div>
                                    </div>
                                    {showReceipt.deliveredBy && (
                                        <div>
                                            <div className="text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70 mb-2 text-right">Vehicle</div>
                                            <div className="text-sm font-black text-ink-primary uppercase text-right tracking-tight">{getVehicleName(showReceipt.deliveredBy)}</div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="border-t border-b border-black/5 py-6 space-y-3 mb-6">
                                {showReceipt.items.map((item, i) => (
                                    <div key={i} className="flex justify-between items-center text-sm">
                                        <div className="flex items-center gap-4">
                                            <span className="font-black text-accent-signature text-xl leading-none bg-ink-primary px-3 py-1 rounded-lg">{item.quantity}</span>
                                            <span className="font-black text-ink-primary uppercase tracking-tight">{item.name}</span>
                                        </div>
                                        <span className="font-black text-ink-primary tracking-tighter">{businessProfile.currencySymbol}{(item.sellingPrice * item.quantity).toFixed(2)}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="flex justify-between items-end mb-8">
                                <span className="text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70">TOTAL SETTLEMENT</span>
                                <span className="text-5xl font-black text-ink-primary tracking-tighter leading-none">
                                    {businessProfile.currencySymbol}{showReceipt.totalAmount.toLocaleString()}
                                </span>
                            </div>

                            <div className="text-center">
                                <div className="text-sm font-black text-[#747576] uppercase tracking-[0.4em] opacity-30">Order Completed</div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mt-6 no-print">
                            <button className="px-8 py-4 rounded-pill border border-black/10 font-black text-ink-primary text-xs uppercase tracking-[0.2em] hover:bg-black/5 transition-all cursor-pointer" onClick={() => setShowReceipt(null)}>Close</button>
                            <button className="btn-signature !h-14 !text-sm flex items-center justify-center px-6 !rounded-pill" onClick={() => window.print()}>
                                PRINT RECEIPT
                                <div className="icon-nest !w-10 !h-10 ml-4">
                                    <Printer size={20} />
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Edit Sale Modal */}
            {editingSale && (
                <div className="modal-overlay">
                    <div className="glass-modal !max-w-[700px]">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h1 className="text-3xl font-black text-ink-primary tracking-tighter uppercase leading-none mb-2">EDIT SALE.</h1>
                                <p className="text-[10px] font-black text-ink-secondary uppercase tracking-[0.3em] opacity-70">MODIFY ORDER ITEMS & QUANTITIES</p>
                            </div>
                            <button className="w-10 h-10 rounded-pill border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all text-ink-primary" onClick={() => setEditingSale(null)}>
                                <X size={18} />
                            </button>
                        </div>

                        <div className="space-y-6 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                            <div className="bg-canvas/50 p-4 rounded-2xl border border-black/5">
                                <div className="flex justify-between items-center mb-4">
                                    <span className="text-xs font-black uppercase tracking-widest text-ink-secondary">Items in Order</span>
                                    <span className="text-xs font-black text-ink-primary">#{editingSale.id.split('-').pop()}</span>
                                </div>
                                <div className="space-y-3">
                                    {editCart.map(item => (
                                        <div key={item.productId} className="flex items-center gap-4 bg-surface p-3 rounded-xl border border-black/5">
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-black text-ink-primary uppercase truncate">{item.name}</div>
                                                <div className="text-[10px] font-bold text-ink-secondary opacity-70">{item.sku}</div>
                                            </div>
                                            
                                            <div className="flex items-center gap-3">
                                                <div className="flex flex-col items-center">
                                                    <span className="text-[9px] font-black text-ink-secondary opacity-50 uppercase mb-1">Price</span>
                                                    <div className="flex items-center relative">
                                                        <span className="absolute left-2 text-[10px] font-black text-ink-secondary">₹</span>
                                                        <input 
                                                            type="number" 
                                                            className="w-20 bg-canvas border border-black/5 rounded-lg py-1 pl-5 pr-2 text-center text-xs font-black text-ink-primary"
                                                            value={item.sellingPrice}
                                                            onChange={e => updateEditCartItem(item.productId, 'sellingPrice', e.target.value)}
                                                        />
                                                    </div>
                                                </div>
                                                
                                                <div className="flex flex-col items-center">
                                                    <span className="text-[9px] font-black text-ink-secondary opacity-50 uppercase mb-1">Qty</span>
                                                    <div className="flex items-center bg-canvas rounded-lg border border-black/5 p-1">
                                                        <button onClick={() => updateEditCartItem(item.productId, 'quantity', item.quantity - 1)} className="p-1 text-ink-primary"><Minus size={10} /></button>
                                                        <input 
                                                            type="number" 
                                                            className="w-10 text-center text-xs font-black text-ink-primary bg-transparent outline-none"
                                                            value={item.quantity}
                                                            onChange={e => updateEditCartItem(item.productId, 'quantity', e.target.value)}
                                                        />
                                                        <button onClick={() => updateEditCartItem(item.productId, 'quantity', item.quantity + 1)} className="p-1 text-ink-primary"><Plus size={10} /></button>
                                                    </div>
                                                </div>

                                                <button 
                                                    onClick={() => setEditCart(editCart.filter(i => i.productId !== item.productId))}
                                                    className="w-8 h-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {editCart.length === 0 && (
                                        <div className="text-center py-10 text-ink-secondary opacity-50 italic text-sm">No items in cart</div>
                                    )}
                                </div>
                            </div>

                            <div className="p-6 bg-ink-primary rounded-2xl flex justify-between items-center text-surface shadow-xl">
                                <div>
                                    <div className="text-[10px] font-black uppercase tracking-[0.3em] opacity-60 mb-1">New Total Amount</div>
                                    <div className="text-4xl font-black tracking-tighter">
                                        ₹{editCart.reduce((sum, item) => sum + (item.sellingPrice * item.quantity), 0).toLocaleString()}
                                    </div>
                                </div>
                                <div className="text-right opacity-60">
                                    <div className="text-[10px] font-black uppercase tracking-widest">Original Total</div>
                                    <div className="text-lg font-black tracking-tighter line-through">₹{editingSale.totalAmount.toLocaleString()}</div>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mt-8">
                            <button className="px-8 py-4 rounded-pill border border-black/10 font-black text-ink-primary text-xs uppercase tracking-[0.2em] hover:bg-black/5 transition-all text-ink-primary" onClick={() => setEditingSale(null)}>Discard Changes</button>
                            <button 
                                className="btn-signature !h-14 !text-sm flex items-center justify-center px-6 !rounded-pill disabled:opacity-50" 
                                onClick={handleSaveEdit}
                                disabled={editCart.length === 0}
                            >
                                SAVE CHANGES & SYNC
                                <div className="icon-nest !w-10 !h-10 ml-4">
                                    <CheckCircle size={22} />
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Orders;
