import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { 
    ShoppingCart as CartIcon, Search, Plus, Minus, FileText, User, 
    Truck, BadgeDollarSign, Percent, Clock, X, CreditCard, 
    Banknote, Printer, Check, ArrowRight, Package, Grid3X3,
    Layers, Wine, Utensils, Disc, Monitor, Box, Coffee 
} from 'lucide-react';

const Sales = () => {
    const { 
        products, sales, orders, businessProfile, routes, dispatchRoute, 
        hasPermission, currentUser, clients, getShopName, placeSale, getEmployeeName, isViewOnly 
    } = useAppContext();
    const [selectedShopId, setSelectedShopId] = useState('WALKIN');
    const [customerInfo, setCustomerInfo] = useState({ name: 'Walk-in Customer', phone: '' });
    const [cart, setCart] = useState([]);
    const [selectedRoute, setSelectedRoute] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [orderComplete, setOrderComplete] = useState(false);
    const [lastOrderId, setLastOrderId] = useState(null);
    const [lastOrderTotal, setLastOrderTotal] = useState(0);
    
    // Modal & Status State
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [pendingPaymentMethod, setPendingPaymentMethod] = useState('CASH');
    const [salesmanNote, setSalesmanNote] = useState('');
    
    // UI State
    const [mobileCartOpen, setMobileCartOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [customerSearch, setCustomerSearch] = useState('');
    const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
    const [scheduledDate, setScheduledDate] = useState(new Date(Date.now() + 86400000).toISOString().split('T')[0]); 
    const [showBookingDateModal, setShowBookingDateModal] = useState(false);
    const cartEndRef = useRef(null);

    // Auto-scroll cart to bottom
    useEffect(() => {
        if (cart.length > 0) {
            cartEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [cart]);

    useEffect(() => {
        const handler = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handler);
        return () => window.removeEventListener('resize', handler);
    }, []);

    const activeRoutes = (routes || []).filter(r => r.status === 'ACTIVE');

    // Clear cart if route changes
    useEffect(() => { setCart([]); }, [selectedRoute]);

    const activeSalesByRoute = useMemo(() => {
        if (!selectedRoute) return [];
        const route = routes.find(r => r.id === selectedRoute);
        if (!route) return [];
        const routeSales = (sales || []).filter(o => o.routeId === route.id);
        return routeSales;
    }, [products, routes, sales, selectedRoute]);

    const availableProducts = useMemo(() => {
        if (!selectedRoute) return (products || []).filter(p => p.stock > 0);
        
        const route = (routes || []).find(r => r.id === selectedRoute);
        if (!route) return [];

        const routeSales = (sales || []).filter(o => o.routeId === route.id);
        const soldMap = {};
        routeSales.forEach(sale => {
            (sale.items || []).forEach(item => {
                soldMap[item.productId] = (soldMap[item.productId] || 0) + item.quantity;
            });
        });

        return (route.loadedStock || []).map(item => {
            const sold = soldMap[item.productId] || 0;
            const left = item.quantity - sold;
            if (left > 0) {
                const productRef = products.find(p => p.id === item.productId);
                return { ...productRef, stock: left };
            }
            return null;
        }).filter(p => p !== null);
    }, [products, routes, orders, selectedRoute]);

    const categories = useMemo(() => {
        const cats = [...new Set(availableProducts.map(p => p.category))];
        return ['All', ...cats.sort()];
    }, [availableProducts]);

    const filteredProducts = useMemo(() => {
        let filtered = availableProducts;
        if (selectedCategory !== 'All') {
            filtered = filtered.filter(p => p.category === selectedCategory);
        }
        if (searchTerm) {
            const lowerSearch = searchTerm.toLowerCase();
            filtered = filtered.filter(p =>
                p.name.toLowerCase().includes(lowerSearch) ||
                p.sku.toLowerCase().includes(lowerSearch) ||
                p.category.toLowerCase().includes(lowerSearch)
            );
        }
        return filtered;
    }, [availableProducts, searchTerm, selectedCategory]);

    const filteredCustomers = useMemo(() => {
        if (!customerSearch) return clients;
        const lower = customerSearch.toLowerCase();
        return (clients || []).filter(s => 
            s.name.toLowerCase().includes(lower) || 
            (s.phone && s.phone.includes(lower))
        );
    }, [clients, customerSearch]);

    const getCategoryIcon = (cat) => {
        const lower = cat.toLowerCase();
        if (lower === 'all') return <Grid3X3 size={14} />;
        if (lower.includes('cup') || lower.includes('coffee')) return <Coffee size={14} />;
        if (lower.includes('plate') || lower.includes('dish')) return <Disc size={14} />;
        if (lower.includes('cutlery') || lower.includes('fork') || lower.includes('knife')) return <Utensils size={14} />;
        if (lower.includes('cover') || lower.includes('sheet')) return <Layers size={14} />;
        if (lower.includes('electronics') || lower.includes('tech')) return <Monitor size={14} />;
        return <Package size={14} />;
    };

    const addToCart = (product) => {
        const existing = cart.find(item => item.productId === product.id);
        if (existing) {
            if (existing.quantity < product.stock) {
                setCart(cart.map(item => item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item));
            }
        } else {
            setCart([...cart, {
                productId: product.id,
                quantity: 1,
                price: product.sellingPrice,
                sellingPrice: product.sellingPrice,
                discount: 0,
                taxRate: product.taxRate || 0,
                name: product.name,
                sku: product.sku
            }]);
        }
    };

    const removeFromCart = (productId) => {
        const existing = cart.find(item => item.productId === productId);
        if (existing.quantity > 1) {
            setCart(cart.map(item => item.productId === productId ? { ...item, quantity: item.quantity - 1 } : item));
        } else {
            setCart(cart.filter(item => item.productId !== productId));
        }
    };

    const updateCartItem = (productId, field, value) => {
        setCart(cart.map(item => {
            if (item.productId !== productId) return item;
            const updated = { ...item, [field]: value };
            if (field === 'quantity') {
                const product = products.find(p => p.id === productId);
                const maxStock = product ? product.stock : 9999;
                updated.quantity = Math.max(1, Math.min(parseInt(value) || 1, maxStock));
            }
            if (field === 'price') updated.price = Math.max(0, parseFloat(value) || 0);
            if (field === 'discount') updated.discount = Math.max(0, Math.min(100, parseFloat(value) || 0));
            return updated;
        }));
    };

    const cartCalc = useMemo(() => {
        let subtotal = 0;
        let totalDiscount = 0;
        let totalTax = 0;

        const lines = cart.map(item => {
            const lineGross = (item.price || 0) * (item.quantity || 0);
            const lineDiscount = lineGross * ((item.discount || 0) / 100);
            const afterDiscount = lineGross - lineDiscount;
            const lineTax = afterDiscount * ((item.taxRate || 0) / 100);
            
            subtotal += lineGross;
            totalDiscount += lineDiscount;
            totalTax += lineTax;

            return { ...item, lineGross, lineDiscount, afterDiscount, lineTax, lineTotal: afterDiscount + lineTax };
        });

        const finalTotal = subtotal - totalDiscount + totalTax;
        return { lines, subtotal, totalDiscount, totalTax, finalTotal, totalItems: cart.reduce((sum, item) => sum + item.quantity, 0) };
    }, [cart]);

    const handleConfirmTransaction = (statusOverride) => {
        const status = statusOverride || 'COMPLETED';
        const saleId = placeSale(
            selectedShopId === 'WALKIN' ? 'POS-WALKIN' : selectedShopId,
            cart,
            cartCalc.subtotal,
            cartCalc.totalDiscount,
            cartCalc.totalTax,
            cartCalc.finalTotal,
            customerInfo,
            pendingPaymentMethod.toLowerCase(),
            selectedRoute || null,
            status,
            status === 'PENDING' ? scheduledDate : null,
            salesmanNote
        );
        setLastOrderId(saleId);
        setLastOrderTotal(cartCalc.finalTotal);
        setCart([]);
        setSelectedShopId('WALKIN');
        setCustomerInfo({ name: 'Walk-in Customer', phone: '' });
        setSalesmanNote('');
        setShowPaymentModal(false);
        setShowBookingDateModal(false);
        setOrderComplete(true);
    };

    if (orderComplete) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[70vh]">
                <div className="glass-panel max-w-[500px] w-full text-center p-12 border-none">
                    <div className="flex justify-center mb-8">
                        <div className="bg-[#C8F135]/20 p-6 rounded-full text-[#4b5563]">
                            <Check size={64} strokeWidth={3} />
                        </div>
                    </div>
                    <div className="p-6 bg-canvas rounded-bento border border-black/5 mb-6 text-center">
                        <div className="text-[10px] font-black uppercase tracking-[0.4em] text-[#4b5563] mb-2 opacity-85">Total Amount</div>
                        <div className="text-3xl md:text-6xl font-black text-ink-primary tracking-tighter">
                            ₹{lastOrderTotal.toLocaleString()}
                        </div>
                    </div>

                    <div className="flex gap-6">
                        <button className="btn-signature w-full h-16" onClick={() => setOrderComplete(false)}>
                            NEW ORDER
                            <div className="icon-nest">
                                <ArrowRight size={22} />
                            </div>
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const renderCartPanel = () => (
        <div className="flex flex-col h-full bg-surface lg:bg-transparent">
            <div className="p-4 border-b border-black/5 flex justify-between items-center bg-surface/50 backdrop-blur-3xl sticky top-0 z-10">
                <h2 className="text-xl font-black tracking-tighter text-ink-primary uppercase flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-ink-primary text-accent-signature flex items-center justify-center shadow-lg">
                        <CartIcon size={20} />
                    </div>
                    Cart.
                </h2>
                {isMobile && <button onClick={() => setMobileCartOpen(false)} className="text-ink-primary opacity-70 hover:opacity-100 transition-opacity"><X size={24} /></button>}
            </div>

            {/* Customer Section */}
            <div className="p-4 border-b border-black/5 bg-canvas/30">
                <div className="mb-2">
                    <label className="block text-[10px] font-black uppercase tracking-[0.3em] text-[#4b5563] opacity-95 mb-1.5">Customer</label>
                    <div className="relative">
                        <User size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-primary opacity-70" />
                        <input 
                            type="text" 
                            className="input-field !pl-12 !rounded-xl !py-2.5 !bg-surface !text-xs" 
                            placeholder="Search customers..." 
                            value={customerSearch || (selectedShopId === 'WALKIN' ? 'Default Walking Customer' : customerInfo.name)}
                            onFocus={() => {
                                setShowCustomerDropdown(true);
                                setCustomerSearch('');
                            }}
                            onChange={e => {
                                setCustomerSearch(e.target.value);
                                setShowCustomerDropdown(true);
                            }}
                        />
                        
                        {showCustomerDropdown && (
                            <div className="absolute top-full left-0 right-0 bg-surface rounded-bento border border-black/5 shadow-2xl z-[100] mt-4 max-h-[300px] overflow-hidden flex flex-col duration-500">
                                <div className="overflow-y-auto">
                                    <div 
                                        className={`p-4 cursor-pointer border-b border-black/5 font-black text-[10px] tracking-widest uppercase hover:bg-canvas transition-colors ${selectedShopId === 'WALKIN' ? 'bg-accent-signature/20 text-ink-primary' : 'text-[#4b5563]'}`}
                                        onClick={() => {
                                            setSelectedShopId('WALKIN');
                                            setCustomerInfo({ name: 'Walk-in Customer', phone: '' });
                                            setCustomerSearch('');
                                            setShowCustomerDropdown(false);
                                        }}
                                    >
                                        WALK-IN CUSTOMER
                                    </div>
                                    {filteredCustomers.map(s => (
                                        <div 
                                            key={s.id} 
                                            className={`p-4 cursor-pointer border-b border-black/5 hover:bg-canvas transition-colors ${selectedShopId === s.id ? 'bg-accent-signature/20' : ''}`}
                                            onClick={() => {
                                                setSelectedShopId(s.id);
                                                setCustomerInfo({ name: s.name, phone: s.phone || '' });
                                                setCustomerSearch('');
                                                setShowCustomerDropdown(false);
                                            }}
                                        >
                                            <div className="font-black text-ink-primary text-sm uppercase tracking-tight">{s.name}</div>
                                            <div className="text-xs font-black text-[#4b5563] uppercase opacity-70 mt-1 tracking-widest">{s.phone}</div>
                                        </div>
                                    ))}
                                    {filteredCustomers.length === 0 && (
                                        <div className="p-10 text-center text-xs font-black uppercase tracking-widest text-[#4b5563] opacity-70">No matches found</div>
                                    )}
                                </div>
                            </div>
                        )}
                        {showCustomerDropdown && (
                            <div className="fixed inset-0 z-[90]" onClick={() => setShowCustomerDropdown(false)} />
                        )}
                    </div>
                </div>
                
                {selectedShopId === 'WALKIN' && !showCustomerDropdown && (
                    <div className="flex gap-4">
                        <input type="text" className="input-field !rounded-2xl flex-1 text-xs !bg-surface" placeholder="NAME" value={customerInfo.name} onChange={e => setCustomerInfo({...customerInfo, name: e.target.value})} />
                        <input type="text" className="input-field !rounded-2xl flex-1 text-xs !bg-surface" placeholder="PHONE" value={customerInfo.phone} onChange={e => setCustomerInfo({...customerInfo, phone: e.target.value})} />
                    </div>
                )}
                
                {selectedShopId !== 'WALKIN' && !showCustomerDropdown && (
                    <div className="flex items-center gap-4 bg-ink-primary p-5 rounded-2xl shadow-xl">
                        <div className="w-12 h-12 rounded-pill bg-accent-signature flex items-center justify-center shrink-0">
                            <User size={20} className="text-ink-primary" />
                        </div>
                        <div className="min-w-0">
                            <div className="text-sm font-black text-surface uppercase truncate tracking-tight">{customerInfo.name}</div>
                            <div className="text-xs font-black text-surface/70 uppercase tracking-widest truncate">{customerInfo.phone}</div>
                        </div>
                    </div>
                )}
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto px-4 py-4 custom-scrollbar space-y-3">
                {cart.length === 0 ? (
                    <div className="text-center py-20 opacity-90 text-[#4b5563]">
                        <div className="flex justify-center mb-4">
                            <CartIcon size={60} strokeWidth={1} />
                        </div>
                        <p className="text-xs font-black uppercase tracking-[0.5em]">Your cart is empty</p>
                    </div>
                ) : (
                    cartCalc.lines.map(item => (
                        <div key={item.productId} className="flex items-center py-1.5 border-b border-black/5 last:border-0 bg-transparent group">
                            {/* Product Info (30% Sector) */}
                            <div className="w-[30%] min-w-0 pr-2">
                                <div className="text-[11px] font-black text-ink-primary uppercase tracking-tight truncate leading-none mb-0.5">{item.name}</div>
                                <div className="text-[9px] font-black text-[#4b5563] uppercase tracking-[0.2em] opacity-85">{item.sku}</div>
                            </div>
                            
                            {/* Controls Cluster (70% Sector - Pushed Right) */}
                            <div className="flex-1 flex items-center justify-end gap-2">
                                {/* Rate (Editable Pill) */}
                                <div className="w-20 shrink-0">
                                    <div className="relative">
                                        <span className="text-[10px] font-black text-ink-primary opacity-85 absolute left-2.5 top-1/2 -translate-y-1/2">₹</span>
                                        <input 
                                            type="number" 
                                            className="w-full bg-canvas border border-black/5 rounded-full py-1 pl-5 pr-2 text-center text-[10px] font-black text-ink-primary outline-none focus:border-black/20 transition-all font-mono" 
                                            value={item.price} 
                                            onChange={e => updateCartItem(item.productId, 'price', e.target.value)} 
                                        />
                                    </div>
                                </div>
                                
                                {/* Volume Control (Pill) */}
                                <div className="shrink-0 flex items-center bg-canvas rounded-full border border-black/5 p-0.5">
                                    <button onClick={() => removeFromCart(item.productId)} className="p-1 px-1.5 text-ink-primary hover:text-accent-signature transition-colors shrink-0">
                                        <Minus size={9} />
                                    </button>
                                    <input 
                                        type="number" 
                                        className="w-10 text-center text-[10px] font-black text-ink-primary font-mono bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        value={item.quantity}
                                        onChange={e => updateCartItem(item.productId, 'quantity', e.target.value)}
                                        onFocus={e => e.target.select()}
                                    />
                                    <button onClick={() => addToCart(products.find(p => p.id === item.productId))} className="p-1 px-1.5 text-ink-primary hover:text-accent-signature transition-colors shrink-0">
                                        <Plus size={9} />
                                    </button>
                                </div>
                                
                                <div className="w-20 shrink-0 text-right">
                                    <div className="text-lg font-black text-ink-primary tracking-tighter">
                                        ₹{item.lineTotal.toLocaleString()}
                                    </div>
                                </div>
                                
                                {/* Remove Action (Softened) */}
                                <button 
                                    onClick={() => setCart(cart.filter(i => i.productId !== item.productId))} 
                                    className="w-8 h-8 rounded-full bg-red-50/50 text-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-surface shrink-0"
                                >
                                    <X size={12} />
                                </button>
                            </div>
                        </div>
                    ))
                )}
                <div ref={cartEndRef} />
            </div>

            {/* Summary & Checkout Actions */}
            <div className="p-4 border-t border-black/5 bg-surface/50 backdrop-blur-3xl shadow-2xl">
                <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-[9px] font-black uppercase tracking-[0.3em] text-[#4b5563] opacity-95">
                        <span>Subtotal ({cartCalc.totalItems} items)</span>
                        <span>${cartCalc.subtotal.toLocaleString()}</span>
                    </div>
                    {cartCalc.totalDiscount > 0 && (
                        <div className="flex justify-between text-[9px] font-black uppercase tracking-[0.3em] text-red-500">
                            <span>Discount</span>
                            <span>-${cartCalc.totalDiscount.toLocaleString()}</span>
                        </div>
                    )}
                    <div className="flex justify-between items-end pt-3 border-t border-black/5">
                        <span className="text-[10px] font-black uppercase tracking-dot-wider text-ink-primary">Total</span>
                        <span className="text-3xl font-black text-ink-primary tracking-tighter">
                            ₹{cartCalc.finalTotal.toLocaleString()}
                        </span>
                    </div>
                </div>

                <div className="flex gap-3">
                    <button 
                        className="flex-1 py-3 rounded-pill border border-black/10 font-black text-ink-primary hover:bg-black/5 transition-all text-[9px] tracking-widest uppercase disabled:opacity-30 disabled:cursor-not-allowed" 
                        disabled={cart.length === 0 || isViewOnly()} 
                        onClick={() => setShowBookingDateModal(true)}
                    >
                        PRE-BOOK
                    </button>
                    <button 
                        className="btn-signature flex-[1.5] !h-11 !text-xs flex items-center justify-center px-4 !rounded-pill" 
                        disabled={cart.length === 0 || isViewOnly()} 
                        onClick={() => setShowPaymentModal(true)}
                    >
                        CHECKOUT
                        <div className="icon-nest !w-8 !h-8 ml-3">
                            <Check size={16} />
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <div className="flex flex-col lg:flex-row gap-4 lg:h-[calc(100vh-140px)]">
            <div className="flex-1 flex flex-col gap-4 min-h-0">
                {/* Header Section */}
                <div className="flex justify-between items-end pb-2 border-b border-black/5">
                    <div>
                        <h1 className="text-3xl md:text-6xl font-black text-ink-primary uppercase tracking-tighter leading-none mb-2">SALES.</h1>
                    <p className="text-[10px] font-black text-[#4b5563] uppercase tracking-widest opacity-70">POINT OF SALE & BILLING</p>
                    </div>
                    {!isMobile && (
                        <div className="text-right">
                            <div className="text-4xl font-black text-ink-primary tracking-tighter leading-none mb-1">{filteredProducts.length}</div>
                            <div className="text-[10px] font-black text-[#4b5563] uppercase tracking-[0.4em] opacity-85">Products in Stock</div>
                        </div>
                    )}
                </div>

                {/* Controls Section */}
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative group">
                        <Search size={18} className="absolute left-6 top-1/2 -translate-y-1/2 text-ink-primary opacity-70 group-focus-within:opacity-100 transition-opacity" />
                        <input 
                            type="text" 
                            className="input-field !pl-16 !py-3 !rounded-pill bg-surface border-black/5 shadow-premium !text-sm font-black" 
                            placeholder="Search products..." 
                            value={searchTerm} 
                            onChange={e => setSearchTerm(e.target.value)} 
                        />
                    </div>
                    {activeRoutes.length > 0 && (
                        <div className="relative group min-w-[300px]">
                            <Truck size={18} className="absolute left-6 top-1/2 -translate-y-1/2 text-ink-primary opacity-70" />
                            <select 
                                className="input-field !pl-16 !py-3 !rounded-pill bg-surface border-black/5 shadow-premium appearance-none font-black text-[11px] tracking-widest uppercase cursor-pointer" 
                                value={selectedRoute} 
                                onChange={e => setSelectedRoute(e.target.value)}
                            >
                                <option value="">MAIN STORE</option>
                                {activeRoutes.map(r => <option key={r.id} value={r.id}>VEHICLE: {getEmployeeName(r.driverId)}</option>)}
                            </select>
                        </div>
                    )}
                </div>

                {/* Category Filtering */}
                {categories.length > 1 && (
                    <div className="flex bg-surface rounded-pill p-1.5 border border-black/5 w-fit shadow-sm overflow-x-auto no-scrollbar max-w-full">
                        {categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setSelectedCategory(cat)}
                                className={`px-6 py-2.5 rounded-pill text-[11px] font-black uppercase tracking-widest transition-all whitespace-nowrap flex items-center gap-3 ${
                                    selectedCategory === cat 
                                    ? 'bg-ink-primary text-surface shadow-lg' 
                                    : 'text-[#4b5563]/80 hover:text-ink-primary'
                                }`}
                            >
                                <div className={`${selectedCategory === cat ? 'text-accent-signature' : 'opacity-70'}`}>
                                    {getCategoryIcon(cat)}
                                </div>
                                {cat}
                            </button>
                        ))}
                    </div>
                )}

                {/* Product Catalog Grid */}
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                    <div className="grid grid-cols-1 2xl:grid-cols-2 4xl:grid-cols-3 gap-3">
                        {filteredProducts.map(product => {
                            const inCart = cart.find(i => i.productId === product.id);
                            
                            return (
                                <div 
                                    key={product.id} 
                                    onClick={() => addToCart(product)}
                                    className={`glass-panel !p-2 !rounded-xl relative group cursor-pointer transition-all border border-black/5 flex items-center gap-4 ${
                                        inCart 
                                        ? 'bg-accent-signature/80 ring-4 ring-accent-signature/40 border-accent-signature/50 shadow-2xl' 
                                        : 'bg-surface hover:border-black/20 hover:shadow-premium translate-z-0'
                                    }`}
                                >
                                    
                                    {/* Compact Image Container */}
                                    <div className="w-16 h-16 shrink-0 bg-canvas rounded-full flex items-center justify-center p-2.5 transition-transform duration-500 border border-black/5 overflow-hidden">
                                        {product.image ? (
                                            <img src={product.image} alt={product.name} className="w-full h-full object-contain rounded-full" />
                                        ) : (
                                            <Package size={28} className="text-ink-primary opacity-30 stroke-[1]" />
                                        )}
                                    </div>
                                    
                                    {/* Central Info Sector */}
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[9px] font-black text-[#4b5563] uppercase tracking-[0.3em] mb-0.5 opacity-95">{product.sku}</div>
                                        <h3 className="text-sm font-black text-ink-primary uppercase tracking-tight truncate leading-tight">{product.name}</h3>
                                        <div className={`mt-1.5 inline-flex px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${
                                            product.stock <= 10 ? 'bg-red-50 text-red-500' : 'bg-canvas text-[#4b5563] opacity-80'
                                        }`}>
                                            {product.stock} {product.unit || 'Units'}
                                        </div>
                                    </div>

                                    {/* Precise Badge Positioning (70% towards price) */}
                                    {inCart && (
                                        <div className="flex items-center -ml-1 mr-[-8px] z-10 scale-110">
                                            <div className="w-8 h-8 rounded-full bg-accent-signature text-ink-primary flex items-center justify-center font-black text-xs shadow-2xl ring-4 ring-white">
                                                {inCart.quantity}
                                            </div>
                                        </div>
                                    )}
                                    
                                    {/* Economic Sector */}
                                    <div className="text-right pr-2">
                                        <div className="text-[9px] font-black text-[#4b5563] uppercase tracking-[0.2em] mb-0.5 opacity-85">Unit Price</div>
                                        <div className="text-xl font-black text-ink-primary tracking-tighter leading-none">
                                            ${product.sellingPrice.toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {filteredProducts.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-32 opacity-10">
                            <Grid3X3 size={80} strokeWidth={1} />
                            <p className="text-xs font-black uppercase tracking-[0.4em] mt-8">Empty Sector Search</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Desktop Cart Sidebar */}
            {!isMobile && (
                <div className="w-[480px] shrink-0 sticky top-0 group">
                    <div className="glass-panel !p-0 !rounded-bento h-full overflow-hidden flex flex-col border border-black/5 shadow-2xl group-hover:shadow-premium transition-all bg-surface">
                        {renderCartPanel()}
                    </div>
                </div>
            )}

            {/* Mobile Bottom Bar for Cart */}
            {isMobile && !mobileCartOpen && cart.length > 0 && (
                <div onClick={() => setMobileCartOpen(true)} className="fixed bottom-6 left-6 right-6 bg-[#111] text-white p-6 rounded-[2.5rem] flex justify-between items-center z-[100] shadow-2xl transition-transform">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-[#C8F135] flex items-center justify-center text-black">
                            <CartIcon size={20} />
                        </div>
                        <div>
                            <div className="text-xs font-black uppercase tracking-[0.2em] opacity-70">Cart Items</div>
                            <div className="text-lg font-black tracking-tighter">{cartCalc.totalItems} Items</div>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-xs font-black uppercase tracking-[0.2em] text-[#C8F135]">Total</div>
                        <div className="text-2xl font-black tracking-tighter">{businessProfile?.currencySymbol || '$'}{cartCalc.finalTotal.toLocaleString()}</div>
                    </div>
                </div>
            )}

            {/* Mobile Cart Overlay */}
            {isMobile && mobileCartOpen && (
                <div className="fixed inset-0 bg-canvas/80 backdrop-blur-3xl z-[1000] animate-in fade-in transition-all overflow-hidden flex flex-col">
                    <div className="flex-1 overflow-hidden">
                        {renderCartPanel()}
                    </div>
                </div>
            )}

            {/* Payment Modal */}
            {showPaymentModal && (
                <div className="modal-overlay">
                    <div className="glass-modal">
                        {/* Compact Header */}
                        <div className="flex justify-between items-start mb-5">
                            <div>
                                <h1 className="text-3xl font-black text-ink-primary tracking-tighter uppercase leading-none mb-2">PAYMENT.</h1>
                                <p className="text-[10px] font-black text-ink-secondary uppercase tracking-[0.3em] opacity-70">SELECT TRANSACTION RECEPTION METHOD</p>
                            </div>
                            <button className="w-10 h-10 rounded-pill border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all cursor-pointer text-ink-primary" onClick={() => setShowPaymentModal(false)}>
                                <X size={18} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            {/* Capital Summary */}
                            <div className="p-4 bg-canvas rounded-bento border border-black/5 text-center">
                                <div className="text-[10px] font-black uppercase tracking-[0.4em] text-ink-secondary mb-2 opacity-70">Total Amount Due</div>
                                <div className="text-3xl md:text-6xl font-black text-ink-primary tracking-tighter">₹{cartCalc.finalTotal.toLocaleString()}</div>
                            </div>

                            {/* Itemized List (Compact) */}
                            <div className="space-y-3">
                                <div className="text-[10px] font-black uppercase tracking-[0.3em] text-ink-secondary opacity-60 flex justify-between">
                                    <span>ORDER SUMMARY</span>
                                    <span>SUBTOTAL</span>
                                </div>
                                <div className="space-y-2 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                                    {cartCalc.lines.map(item => (
                                        <div key={item.productId} className="flex justify-between items-center py-2 border-b border-black/5 last:border-0">
                                            <div className="flex-1 min-w-0 pr-4">
                                                <div className="text-[11px] font-black text-ink-primary uppercase tracking-tight truncate">{item.name}</div>
                                                <div className="text-[9px] font-black text-ink-secondary opacity-70 uppercase tracking-widest">{item.quantity} {item.unit} × ₹{item.price}</div>
                                            </div>
                                            <div className="text-sm font-black text-ink-primary tracking-tighter">₹{item.lineTotal.toLocaleString()}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Payment Matrix (Responsive Grid) */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {[
                                    { id: 'CASH', label: 'CASH PAYMENT', icon: Banknote },
                                    { id: 'CREDIT', label: 'CREDIT SALE', icon: CreditCard }
                                ].map(method => (
                                    <button
                                        key={method.id}
                                        onClick={() => setPendingPaymentMethod(method.id)}
                                        className={`p-4 rounded-2xl border-2 transition-all flex items-center gap-4 relative group ${
                                            pendingPaymentMethod === method.id 
                                            ? 'border-accent-signature bg-accent-signature/5 shadow-premium' 
                                            : 'border-black/5 bg-surface text-ink-primary hover:border-black/10'
                                        }`}
                                    >
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${pendingPaymentMethod === method.id ? 'bg-ink-primary text-surface' : 'bg-canvas text-ink-secondary'}`}>
                                            <method.icon size={18} />
                                        </div>
                                        <span className="text-[10px] font-black uppercase tracking-widest leading-none text-left">{method.label}</span>
                                    </button>
                                ))}
                            </div>

                            {/* Field Notes (Salesman) */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-60 flex items-center gap-2">
                                    <FileText size={12} /> ORDER LOGISTICS NOTES
                                </label>
                                <textarea 
                                    className="w-full bg-canvas border-none rounded-2xl p-4 font-medium text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all min-h-[80px] text-sm"
                                    placeholder="ENTER NOTES REGARDING DELIVERY OR DISCOUNTS..."
                                    value={salesmanNote}
                                    onChange={(e) => setSalesmanNote(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Footer Actions */}
                        <div className="mt-6 grid grid-cols-2 gap-4">
                            <button className="px-8 py-4 rounded-pill border border-black/10 font-black text-ink-primary text-xs uppercase tracking-[0.2em] hover:bg-black/5 transition-all cursor-pointer" onClick={() => setShowPaymentModal(false)}>Cancel</button>
                            <button className="btn-signature !h-14 !text-sm flex items-center justify-center px-6 !rounded-pill" onClick={() => handleConfirmTransaction('COMPLETED')}>
                                COMPLETE SALE
                                <div className="icon-nest !w-10 !h-10 ml-4">
                                    <Check size={22} />
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Booking Date Modal */}
            {showBookingDateModal && (
                <div className="modal-overlay">
                    <div className="glass-modal">
                        <div className="flex justify-between items-start mb-5">
                            <div>
                                <h1 className="text-3xl font-black text-ink-primary tracking-tighter uppercase leading-none mb-2">PRE-BOOK.</h1>
                                <p className="text-[10px] font-black text-ink-secondary uppercase tracking-[0.3em] opacity-70">SET FUTURE DELIVERY SCHEDULE</p>
                            </div>
                            <button className="w-10 h-10 rounded-pill border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all cursor-pointer text-ink-primary" onClick={() => setShowBookingDateModal(false)}>
                                <X size={18} />
                            </button>
                        </div>
                        
                        <div className="mb-5">
                            <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary mb-3 opacity-60">Planned Delivery Date</label>
                            <input 
                                type="date" 
                                className="w-full bg-canvas border-none rounded-2xl p-6 font-black text-3xl text-center text-ink-primary outline-none focus:ring-8 focus:ring-accent-signature/20 transition-all uppercase" 
                                value={scheduledDate} 
                                onChange={e => setScheduledDate(e.target.value)}
                                min={new Date().toISOString().split('T')[0]}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <button className="px-8 py-4 rounded-pill border border-black/10 font-black text-ink-primary text-xs uppercase tracking-[0.2em] hover:bg-black/5 transition-all cursor-pointer" onClick={() => setShowBookingDateModal(false)}>Cancel</button>
                            <button className="btn-signature flex-[2] !h-14 !text-sm flex items-center justify-center px-6 !rounded-pill" onClick={() => handleConfirmTransaction('PENDING')}>
                                CONFIRM PRE-BOOK
                                <div className="icon-nest !w-10 !h-10 ml-4">
                                    <Clock size={20} />
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Sales;
