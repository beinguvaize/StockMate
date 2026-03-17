import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { 
    ShoppingCart, CheckCircle, Clock, Truck, User, 
    FileText, XCircle, ChevronRight, Printer, X,
    Calendar, MapPin, Phone, Hash, CreditCard
} from 'lucide-react';

const Orders = () => {
    const { 
        orders, updateOrder, settleOrder, users, shops, vehicles, businessProfile,
        getUserName, getVehicleName, getShopName, hasPermission 
    } = useAppContext();
    const [activeTab, setActiveTab] = useState('PENDING');
    const [filterType, setFilterType] = useState('ALL'); 
    const [showReceipt, setShowReceipt] = useState(null); 

    const filteredOrders = orders.filter(o => {
        if (o.status !== activeTab) return false;
        if (filterType === 'WALKIN') return o.shopId === 'POS-WALKIN';
        if (filterType === 'DELIVERY') return o.shopId !== 'POS-WALKIN';
        return true;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));

    const pendingCount = orders.filter(o => o.status === 'PENDING').length;
    const walkinPendingCount = orders.filter(o => o.status === 'PENDING' && o.shopId === 'POS-WALKIN').length;
    const deliveryPendingCount = orders.filter(o => o.status === 'PENDING' && o.shopId !== 'POS-WALKIN').length;

    const handleMarkDelivered = (orderId) => {
        const order = orders.find(o => o.id === orderId);
        if (order) {
            updateOrder({
                ...order,
                status: 'COMPLETED',
                deliveryDate: new Date().toISOString()
            });
        }
    };

    const handleCancelOrder = (orderId) => {
        const order = orders.find(o => o.id === orderId);
        if (order) {
            if (window.confirm("Authorize permanent cancellation of this Pending Request?")) {
                updateOrder({ ...order, status: 'CANCELLED' });
            }
        }
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
                            <div className="text-sm font-black uppercase tracking-widest text-[#747576] opacity-40 mb-1">Booked On</div>
                            <div className="text-xs font-bold text-[#111] uppercase tracking-tight">
                                {new Date(order.date).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                        <div>
                            <div className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-ink-secondary opacity-40 mb-3">
                                <MapPin size={10} /> Consignee
                            </div>
                            <div className="text-base font-black text-ink-primary uppercase tracking-tight">{getShopName(order.shopId)}</div>
                            {order.customerInfo?.phone && (
                                <div className="text-xs font-bold text-ink-secondary mt-1 opacity-60 flex items-center gap-1.5">
                                    <Phone size={10} /> {order.customerInfo.phone}
                                </div>
                            )}
                        </div>
                        <div>
                            <div className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-ink-secondary opacity-40 mb-3">
                                <MapPin size={10} /> Consignee
                            </div>
                            <div className="text-base font-black text-ink-primary uppercase tracking-tight">{order.scheduledDate || 'N/A: IMMEDIATE'}</div>
                        </div>
                        <div>
                            <div className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-ink-secondary opacity-40 mb-3">
                                <Truck size={10} /> Logistics Unit
                            </div>
                            <div className="text-base font-black text-ink-primary uppercase tracking-tight">
                                {order.shopId === 'POS-WALKIN' ? 'INTERNAL COUNTER' : getVehicleName(order.deliveredBy || 'UNASSIGNED')}
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
                        <div className="text-xs font-black uppercase tracking-[0.3em] text-ink-secondary opacity-40 mb-1">Total Financial Commitment</div>
                        <div className="text-4xl font-black text-ink-primary tracking-tighter mb-4">
                            {businessProfile.currencySymbol}{order.totalAmount.toLocaleString()}
                        </div>
                        <div className="flex items-center gap-3 text-sm font-black uppercase tracking-widest mt-2">
                            <CreditCard size={12} className="text-ink-primary opacity-30" />
                            <span className="text-ink-secondary opacity-60">Payment Vector:</span>
                            <span className={order.paymentMethod === 'CASH' ? 'text-green-600' : 'text-blue-600'}>{order.paymentMethod}</span>
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
                            <Printer size={14} /> PRINT ARCHIVE
                        </button>
                        
                    {isPending ? (
                            <div className="flex gap-2">
                                {hasPermission('MANAGE_ORDERS') && (
                                    <button className="flex-1 py-3.5 rounded-pill border border-red-100 bg-red-50 text-red-500 font-bold hover:bg-red-100 transition-all text-[10px] tracking-widest uppercase" onClick={() => handleCancelOrder(order.id)}>
                                        ABORT
                                    </button>
                                )}
                                <button className="flex-[2] btn-signature !py-3.5 !rounded-pill !text-xs shadow-xl shadow-accent-signature/20" onClick={() => handleMarkDelivered(order.id)}>
                                    FINALIZE LOG
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {order.deliveryDate && (
                                    <div className="flex items-center justify-center gap-2 py-4 rounded-full bg-[#C8F135]/10 text-[#111] text-sm font-black uppercase tracking-widest border border-[#C8F135]/20">
                                        <CheckCircle size={16} /> FULFILLED {new Date(order.deliveryDate).toLocaleDateString()}
                                    </div>
                                )}
                                {order.paymentMethod === 'CREDIT' && order.paymentStatus !== 'PAID' && (
                                    <button 
                                        className="w-full py-4 rounded-full bg-ink-primary text-accent-signature font-black text-xs uppercase tracking-widest hover:scale-[1.02] transition-all flex items-center justify-center gap-3 shadow-xl"
                                        onClick={() => settleOrder(order.id, order.totalAmount)}
                                    >
                                        <DollarSign size={16} /> SETTLE PAYMENT
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
                    <h1 className="text-4xl font-black tracking-tighter text-ink-primary leading-none mb-2">Pipeline.</h1>
                    <p className="text-xs font-medium text-ink-secondary tracking-tight uppercase opacity-50">Fulfillment Pipeline & History</p>
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
                        { id: 'ALL', label: `Across Domain (${pendingCount})` },
                        { id: 'WALKIN', label: `Pick-up Units (${walkinPendingCount})` },
                        { id: 'DELIVERY', label: `Fleet Delivery (${deliveryPendingCount})` }
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
                {filteredOrders.length === 0 ? (
                    <div className="glass-panel !py-32 !rounded-[3rem] text-center border-none shadow-premium">
                        <div className="flex justify-center mb-8 opacity-10">
                            <ShoppingCart size={80} strokeWidth={1} />
                        </div>
                        <h3 className="text-xl font-black text-[#111] uppercase tracking-tighter mb-2">Null Sector</h3>
                        <p className="text-sm font-bold text-[#747576] uppercase tracking-[0.3em] opacity-40">No matching logistical records identified</p>
                    </div>
                ) : (
                    filteredOrders.map(order => <OrderCard key={order.id} order={order} isPending={order.status === 'PENDING'} />)
                )}
            </div>

            {/* Receipt Modal */}
            {showReceipt && (
                <div className="modal-overlay">
                <div className="glass-modal !max-w-[450px] !p-8 overflow-hidden flex flex-col">
                        <button 
                            onClick={() => setShowReceipt(null)}
                            className="absolute top-8 right-8 w-12 h-12 rounded-full bg-[#F5F5F0] flex items-center justify-center text-[#111] hover:scale-110 transition-transform z-10 no-print"
                        >
                            <X size={20} />
                        </button>

                        <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar">
                            <div className="text-center mb-10 pb-10 border-b border-dashed border-black/10">
                                <div className="text-2xl font-black text-[#111] tracking-tighter uppercase mb-1">{businessProfile.name}</div>
                                <div className="text-sm font-bold text-[#747576] uppercase tracking-[0.3em] opacity-40">Digital Fiscal Voucher</div>
                                <div className="text-sm font-black text-[#111] mt-4 opacity-100">{new Date(showReceipt.date).toLocaleString()}</div>
                            </div>

                            <div className="space-y-6 mb-10">
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <div className="text-[9px] font-black uppercase tracking-widest text-[#747576] opacity-40 mb-1 text-left">Unit Pointer</div>
                                        <div className="text-xs font-black text-[#111] uppercase text-left">{showReceipt.id.split('-').pop()}</div>
                                    </div>
                                    <div>
                                        <div className="text-[9px] font-black uppercase tracking-widest text-[#747576] opacity-40 mb-1 text-right">Consignee</div>
                                        <div className="text-xs font-black text-[#111] uppercase text-right">{getShopName(showReceipt.shopId)}</div>
                                    </div>
                                    <div>
                                        <div className="text-[9px] font-black uppercase tracking-widest text-[#747576] opacity-40 mb-1 text-left">Internal Rep</div>
                                        <div className="text-xs font-black text-[#111] uppercase text-left">{getUserName(showReceipt.bookedBy)}</div>
                                    </div>
                                    {showReceipt.deliveredBy && (
                                        <div>
                                            <div className="text-[9px] font-black uppercase tracking-widest text-[#747576] opacity-40 mb-1 text-right">Logistics Unit</div>
                                            <div className="text-xs font-black text-[#111] uppercase text-right">{getVehicleName(showReceipt.deliveredBy)}</div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="border-t border-b border-black/5 py-8 space-y-4 mb-10">
                                {showReceipt.items.map((item, i) => (
                                    <div key={i} className="flex justify-between items-center text-xs">
                                        <div className="flex items-center gap-3">
                                            <span className="font-black text-[#C8F135] text-lg leading-none">{item.quantity}</span>
                                            <span className="font-bold text-[#111] uppercase tracking-tighter opacity-70">{item.name}</span>
                                        </div>
                                        <span className="font-black text-[#111]">{businessProfile.currencySymbol}{(item.sellingPrice * item.quantity).toFixed(2)}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="flex justify-between items-end mb-10">
                                <span className="text-xs font-black uppercase tracking-[0.2em] text-[#111]">Aggregate Value</span>
                                <span className="text-4xl font-black text-[#111] tracking-tighter">
                                    {businessProfile.currencySymbol}{showReceipt.totalAmount.toLocaleString()}
                                </span>
                            </div>

                            <div className="text-center">
                                <div className="text-sm font-black text-[#747576] uppercase tracking-[0.4em] opacity-30">Transaction Authorized</div>
                            </div>
                        </div>

                        <div className="flex gap-4 mt-10 pt-10 border-t border-black/5 no-print">
                            <button className="flex-1 py-5 rounded-full border border-black/10 font-bold text-[#111] hover:bg-black/5 transition-all text-sm tracking-widest uppercase" onClick={() => setShowReceipt(null)}>CLOSE</button>
                            <button className="btn-signature flex-[2]" onClick={() => window.print()}>
                                EXECUTE PRINT
                                <div className="icon-nest">
                                    <Printer size={18} />
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
