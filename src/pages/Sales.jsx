import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { ShoppingCart as CartIcon, Search, Plus, Minus, FileText, User, MapPin, Truck, BadgeDollarSign, Percent, Clock, X, ChevronUp, ChevronDown, CreditCard, Banknote, AlertTriangle, Edit3, Printer, Check, ArrowRight, Package, Grid3X3 } from 'lucide-react';

const Sales = () => {
    const { products, businessProfile, placeOrder, routes, orders, shops, isViewOnly } = useAppContext();
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
    const [pendingOrderStatus, setPendingOrderStatus] = useState('COMPLETED');
    
    // UI State
    const [mobileCartOpen, setMobileCartOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [customerSearch, setCustomerSearch] = useState('');
    const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

    useEffect(() => {
        const handler = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handler);
        return () => window.removeEventListener('resize', handler);
    }, []);

    const activeRoutes = (routes || []).filter(r => r.status === 'ACTIVE');

    // Clear cart if route changes
    useEffect(() => { setCart([]); }, [selectedRoute]);

    const availableProducts = useMemo(() => {
        if (!selectedRoute) return (products || []).filter(p => p.stock > 0);
        
        const route = (routes || []).find(r => r.id === selectedRoute);
        if (!route) return [];

        const routeSales = (orders || []).filter(o => o.routeId === route.id);
        const soldMap = {};
        routeSales.forEach(order => {
            (order.items || []).forEach(item => {
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
        if (!customerSearch) return shops;
        const lower = customerSearch.toLowerCase();
        return (shops || []).filter(s => 
            s.name.toLowerCase().includes(lower) || 
            (s.phone && s.phone.includes(lower))
        );
    }, [shops, customerSearch]);

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
        const orderId = placeOrder(
            selectedShopId === 'WALKIN' ? 'POS-WALKIN' : selectedShopId,
            cart,
            cartCalc.subtotal,
            cartCalc.totalDiscount,
            cartCalc.totalTax,
            cartCalc.finalTotal,
            customerInfo,
            pendingPaymentMethod,
            selectedRoute || null,
            status
        );
        setLastOrderId(orderId);
        setLastOrderTotal(cartCalc.finalTotal);
        setCart([]);
        setSelectedShopId('WALKIN');
        setCustomerInfo({ name: 'Walk-in Customer', phone: '' });
        setShowPaymentModal(false);
        setOrderComplete(true);
    };

    if (orderComplete) {
        return (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh' }}>
                <div className="glass-panel" style={{ maxWidth: '500px', width: '100%', textAlign: 'center', padding: '3rem', border: 'none' }}>
                    <div style={{ color: 'var(--success)', marginBottom: '1.5rem', display: 'flex', justifyContent: 'center' }}>
                        <div style={{ background: 'var(--success-light)', padding: '1rem', borderRadius: '50%' }}>
                            <Check size={48} />
                        </div>
                    </div>
                    <h2 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem', letterSpacing: '-0.02em' }}>Order Success!</h2>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', fontWeight: 500 }}>Order ID: #{lastOrderId}</p>
                    
                    <div style={{ padding: '2rem', backgroundColor: 'var(--surface)', border: '1px solid var(--border-color)', borderRadius: '16px', marginBottom: '2.5rem' }}>
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Total Amount Paid</div>
                        <div style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.03em' }}>
                            {businessProfile?.currencySymbol || '$'}{lastOrderTotal.toLocaleString()}
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => window.print()}>
                            <Printer size={20} /> Print Receipt
                        </button>
                        <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setOrderComplete(false)}>
                            New Order <ArrowRight size={20} />
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const renderCartPanel = () => (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'transparent' }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-hover)', backdropFilter: 'blur(10px)' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem', letterSpacing: '-0.01em' }}>
                    <div style={{ padding: '0.5rem', backgroundColor: 'var(--primary-transparent)', borderRadius: '8px' }}>
                        <CartIcon size={20} color="var(--primary)" />
                    </div>
                    Current Order
                </h2>
                {isMobile && <button onClick={() => setMobileCartOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }}><X size={24} /></button>}
            </div>

            {/* Customer Section */}
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', backgroundColor: 'rgba(0,0,0,0.01)' }}>
                <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Select Customer</label>
                    <div style={{ position: 'relative' }}>
                        <User size={18} style={{ position: 'absolute', left: '1rem', top: '12px', zIndex: 1, color: 'var(--text-muted)' }} />
                        <input 
                            type="text" 
                            className="input-field" 
                            placeholder="Search or select customer..." 
                            value={customerSearch || (selectedShopId === 'WALKIN' ? 'Walking Customer' : customerInfo.name)}
                            onFocus={() => {
                                setShowCustomerDropdown(true);
                                setCustomerSearch('');
                            }}
                            onChange={e => {
                                setCustomerSearch(e.target.value);
                                setShowCustomerDropdown(true);
                            }}
                            style={{ paddingLeft: '2.5rem', marginBottom: 0 }}
                        />
                        
                        {showCustomerDropdown && (
                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', zIndex: 100, marginTop: '5px', maxHeight: '200px', overflowY: 'auto' }}>
                                <div 
                                    style={{ padding: '0.75rem 1rem', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', fontWeight: 600, color: 'var(--primary)', backgroundColor: selectedShopId === 'WALKIN' ? 'var(--primary-transparent)' : 'transparent' }}
                                    onClick={() => {
                                        setSelectedShopId('WALKIN');
                                        setCustomerInfo({ name: 'Walk-in Customer', phone: '' });
                                        setCustomerSearch('');
                                        setShowCustomerDropdown(false);
                                    }}
                                >
                                    Walking Customer
                                </div>
                                {filteredCustomers.map(s => (
                                    <div 
                                        key={s.id} 
                                        style={{ padding: '0.75rem 1rem', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', backgroundColor: selectedShopId === s.id ? 'var(--primary-transparent)' : 'transparent' }}
                                        onClick={() => {
                                            setSelectedShopId(s.id);
                                            setCustomerInfo({ name: s.name, phone: s.phone || '' });
                                            setCustomerSearch('');
                                            setShowCustomerDropdown(false);
                                        }}
                                    >
                                        <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.9rem' }}>{s.name}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.phone}</div>
                                    </div>
                                ))}
                                {filteredCustomers.length === 0 && (
                                    <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No customers found</div>
                                )}
                            </div>
                        )}
                        {showCustomerDropdown && (
                            <div 
                                style={{ position: 'fixed', inset: 0, zIndex: 90 }} 
                                onClick={() => setShowCustomerDropdown(false)} 
                            />
                        )}
                    </div>
                </div>
                
                {selectedShopId === 'WALKIN' && !showCustomerDropdown && (
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                        <input type="text" className="input-field" placeholder="Name" value={customerInfo.name} onChange={e => setCustomerInfo({...customerInfo, name: e.target.value})} style={{ marginBottom: 0, fontSize: '0.85rem' }} />
                        <input type="text" className="input-field" placeholder="Phone" value={customerInfo.phone} onChange={e => setCustomerInfo({...customerInfo, phone: e.target.value})} style={{ marginBottom: 0, fontSize: '0.85rem' }} />
                    </div>
                )}
                
                {selectedShopId !== 'WALKIN' && !showCustomerDropdown && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--primary-transparent)', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--primary-light)' }}>
                        <div style={{ background: 'var(--primary)', color: 'white', padding: '4px', borderRadius: '50%', display: 'flex' }}>
                            <User size={12} />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)' }}>{customerInfo.name}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--primary)', opacity: 0.8 }}>{customerInfo.phone}</div>
                        </div>
                    </div>
                )}
            </div>

            {/* Cart Items List */}
            <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
                {cart.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '4rem 0' }}>
                        <div style={{ display: 'inline-flex', padding: '1.5rem', background: 'var(--surface-hover)', borderRadius: '50%', marginBottom: '1rem' }}>
                            <CartIcon size={40} style={{ opacity: 0.5 }} />
                        </div>
                        <p style={{ fontWeight: 500 }}>No items in cart</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {cartCalc.lines.map(item => (
                            <div key={item.productId} style={{ padding: '1.25rem', border: '1px solid var(--border-color)', borderRadius: '12px', background: 'var(--surface)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                    <div>
                                        <div style={{ fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text-main)' }}>{item.name}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500, marginTop: '2px' }}>{item.sku}</div>
                                    </div>
                                    <button onClick={() => setCart(cart.filter(i => i.productId !== item.productId))} style={{ color: 'var(--danger)', background: 'var(--danger-transparent)', border: 'none', padding: '6px', borderRadius: '8px', cursor: 'pointer', transition: 'var(--transition)' }}><X size={14} /></button>
                                </div>
                                
                                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: '0.5rem', alignItems: 'end' }}>
                                    <div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.25rem', textTransform: 'uppercase' }}>Qty</div>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                                            <button onClick={() => removeFromCart(item.productId)} style={{ padding: '0.35rem 0.5rem', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Minus size={14} />
                                            </button>
                                            <input type="number" value={item.quantity} onChange={e => updateCartItem(item.productId, 'quantity', e.target.value)} style={{ width: '36px', padding: '0.35rem 0', textAlign: 'center', border: 'none', borderLeft: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', background: 'transparent', outline: 'none', MozAppearance: 'textfield', WebkitAppearance: 'none' }} />
                                            <button onClick={() => addToCart(products.find(p => p.id === item.productId))} style={{ padding: '0.35rem 0.5rem', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Plus size={14} />
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.25rem', textTransform: 'uppercase' }}>Unit Price</div>
                                        <div style={{ position: 'relative' }}>
                                            <span style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{businessProfile?.currencySymbol || '$'}</span>
                                            <input type="number" className="input-field" value={item.price} onChange={e => updateCartItem(item.productId, 'price', e.target.value)} style={{ padding: '0.35rem 0.5rem 0.35rem 1.25rem', marginBottom: 0, width: '100%', fontSize: '0.85rem', borderRadius: '8px' }} />
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.25rem', textTransform: 'uppercase' }}>Discount</div>
                                        <div style={{ position: 'relative' }}>
                                            <Percent size={12} style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                            <input type="number" className="input-field" value={item.discount} onChange={e => updateCartItem(item.productId, 'discount', e.target.value)} style={{ padding: '0.35rem 0.5rem 0.35rem 0.5rem', marginBottom: 0, width: '100%', fontSize: '0.85rem', borderRadius: '8px' }} placeholder="0" />
                                        </div>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px dashed var(--border-color)', fontWeight: 700, color: 'var(--primary)', letterSpacing: '-0.02em', fontSize: '1.1rem' }}>
                                    {businessProfile?.currencySymbol || '$'}{item.lineTotal.toLocaleString()}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Summary & Checkout Actions */}
            <div style={{ padding: '1.5rem', borderTop: '1px solid var(--border-color)', background: 'var(--surface-hover)', backdropFilter: 'blur(10px)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontWeight: 500 }}>
                        <span>Subtotal ({cartCalc.totalItems} items)</span>
                        <span>{businessProfile?.currencySymbol || '$'}{cartCalc.subtotal.toLocaleString()}</span>
                    </div>
                    {cartCalc.totalDiscount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--danger)', fontWeight: 500 }}>
                        <span>Discount</span>
                        <span>-{businessProfile?.currencySymbol || '$'}{cartCalc.totalDiscount.toLocaleString()}</span>
                    </div>}
                    {cartCalc.totalTax > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontWeight: 500 }}>
                        <span>Tax</span>
                        <span>+{businessProfile?.currencySymbol || '$'}{cartCalc.totalTax.toLocaleString()}</span>
                    </div>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '1.5rem', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px dashed var(--border-color)', color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
                        <span>Total</span>
                        <span>{businessProfile?.currencySymbol || '$'}{cartCalc.finalTotal.toLocaleString()}</span>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center', padding: '1rem', letterSpacing: '0.02em', background: 'rgba(0,0,0,0.02)' }} disabled={cart.length === 0 || isViewOnly()} onClick={() => { 
                        handleConfirmTransaction('PENDING'); 
                    }}>
                        <Clock size={18} /> Book Order
                    </button>
                    <button className="btn btn-primary" style={{ flex: 2, justifyContent: 'center', padding: '1rem', letterSpacing: '0.02em' }} disabled={cart.length === 0 || isViewOnly()} onClick={() => { setShowPaymentModal(true); }}>
                        <Check size={18} /> Checkout
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <div className="animate-fade-in" style={{ display: 'flex', gap: isMobile ? '1rem' : '1.5rem', height: '100%', flexDirection: isMobile ? 'column' : 'row' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: isMobile ? '0.75rem' : '1.5rem', paddingBottom: isMobile && cart.length > 0 ? '5rem' : 0 }}>
                {/* Header - compact on mobile */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                        <h1 className="page-title" style={{ marginBottom: isMobile ? 0 : '0.25rem', fontSize: isMobile ? '1.25rem' : undefined }}>Point of Sale</h1>
                        {!isMobile && <p style={{ color: 'var(--text-muted)' }}>Process orders and manage transactions seamlessly.</p>}
                    </div>
                    {isMobile && (
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                            {filteredProducts.length} products
                        </div>
                    )}
                </div>

                {/* Search Bar */}
                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? '0.5rem' : '1rem' }}>
                    <div style={{ flex: 2, position: 'relative' }}>
                        <Search size={18} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input type="text" className="input-field" placeholder="Search products..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ paddingLeft: '2.5rem', marginBottom: 0 }} />
                    </div>
                    {activeRoutes.length > 0 && (
                        <div style={{ flex: 1, position: 'relative' }}>
                            <Truck size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <select className="input-field" value={selectedRoute} onChange={e => setSelectedRoute(e.target.value)} style={{ paddingLeft: '2.25rem', marginBottom: 0 }}>
                                <option value="">All Products</option>
                                {activeRoutes.map(r => <option key={r.id} value={r.id}>Route: {r.driverId}</option>)}
                            </select>
                        </div>
                    )}
                </div>

                {/* Category Filter Tabs */}
                {categories.length > 2 && (
                    <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.25rem', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
                        {categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setSelectedCategory(cat)}
                                style={{
                                    padding: isMobile ? '0.4rem 0.75rem' : '0.5rem 1rem',
                                    borderRadius: '20px',
                                    border: selectedCategory === cat ? '1.5px solid var(--primary)' : '1px solid var(--border-color)',
                                    background: selectedCategory === cat ? 'var(--primary-transparent)' : 'var(--surface)',
                                    color: selectedCategory === cat ? 'var(--primary)' : 'var(--text-muted)',
                                    fontWeight: 600,
                                    fontSize: isMobile ? '0.8rem' : '0.85rem',
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                    transition: 'var(--transition)',
                                    flexShrink: 0
                                }}
                            >
                                {cat === 'All' && <Grid3X3 size={14} style={{ marginRight: '0.3rem', verticalAlign: 'middle' }} />}
                                {cat}
                            </button>
                        ))}
                    </div>
                )}

                {/* Catalog Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(210px, 1fr))', gap: isMobile ? '0.75rem' : '1.25rem' }}>
                    {filteredProducts.map(product => {
                        const inCart = cart.find(i => i.productId === product.id);
                        
                        return (
                            <div key={product.id} style={{ 
                                padding: 0, cursor: 'pointer', position: 'relative',
                                border: inCart ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                                borderRadius: isMobile ? '12px' : '16px',
                                transition: 'var(--transition)',
                                display: 'flex', flexDirection: 'column',
                                boxShadow: inCart ? '0 4px 12px rgba(79, 70, 229, 0.15)' : '0 1px 3px rgba(0,0,0,0.06)',
                                overflow: 'hidden',
                                background: 'white'
                            }} onClick={() => addToCart(product)}>
                                {inCart && (
                                    <div style={{ position: 'absolute', top: 0, right: 0, backgroundColor: 'var(--primary)', color: 'white', padding: isMobile ? '0.2rem 0.5rem' : '0.35rem 0.75rem', borderBottomLeftRadius: isMobile ? '8px' : '12px', fontWeight: 700, fontSize: isMobile ? '0.75rem' : '0.85rem', zIndex: 2 }}>
                                        {inCart.quantity}
                                    </div>
                                )}
                                
                                {/* Product Image */}
                                <div style={{ 
                                    width: '100%', height: isMobile ? '100px' : '140px', backgroundColor: '#f8fafc', 
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    borderBottom: '1px solid var(--border-color)', overflow: 'hidden'
                                }}>
                                    {product.image ? (
                                        <img src={product.image} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: isMobile ? '0.5rem' : '0.75rem' }} />
                                    ) : (
                                        <div style={{ color: 'var(--text-muted)', opacity: 0.3 }}>
                                            <Package size={isMobile ? 32 : 40} />
                                        </div>
                                    )}
                                </div>

                                <div style={{ padding: isMobile ? '0.6rem 0.75rem' : '1rem 1.25rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
                                    {!isMobile && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem', fontWeight: 600, letterSpacing: '0.05em' }}>{product.sku}</div>}
                                    <h3 style={{ fontSize: isMobile ? '0.85rem' : '1rem', fontWeight: 600, margin: 0, flex: 1, letterSpacing: '-0.01em', color: 'var(--text-main)', lineHeight: 1.3 }}>{product.name}</h3>
                                    
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: isMobile ? '0.4rem' : '0.75rem' }}>
                                        <div style={{ fontWeight: 800, fontSize: isMobile ? '1rem' : '1.25rem', color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
                                            {businessProfile?.currencySymbol || '$'}{product.sellingPrice.toLocaleString()}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: isMobile ? '0.7rem' : '0.8rem', color: product.stock <= 10 ? 'var(--danger)' : 'var(--text-muted)', fontWeight: 500 }}>
                                            <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: product.stock <= 10 ? 'var(--danger)' : 'var(--success)' }}></div>
                                            {product.stock}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {filteredProducts.length === 0 && (
                        <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: isMobile ? '2rem' : '4rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                            <Package size={40} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                            <p>No products found{searchTerm ? ` for "${searchTerm}"` : ''}.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Desktop Cart Sidebar */}
            {!isMobile && (
                <div style={{ width: '380px', flexShrink: 0 }}>
                    <div className="glass-panel" style={{ height: 'calc(100vh - 120px)', position: 'sticky', top: '1.5rem', overflow: 'hidden', padding: 0, display: 'flex', flexDirection: 'column', border: 'none' }}>
                        {renderCartPanel()}
                    </div>
                </div>
            )}

            {/* Mobile Cart Floating Link */}
            {isMobile && !mobileCartOpen && cart.length > 0 && (
                <div onClick={() => setMobileCartOpen(true)} style={{ position: 'fixed', bottom: '0.75rem', left: '0.75rem', right: '0.75rem', background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)', color: 'white', padding: '0.875rem 1.25rem', borderRadius: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 100, boxShadow: '0 8px 24px rgba(79, 70, 229, 0.4)', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.95rem' }}>
                        <CartIcon size={18} />
                        <span>{cartCalc.totalItems} items</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontWeight: 800, fontSize: '1.15rem' }}>{businessProfile?.currencySymbol || '$'}{cartCalc.finalTotal.toFixed(2)}</span>
                        <ArrowRight size={18} />
                    </div>
                </div>
            )}

            {/* Mobile Cart Overlay */}
            {isMobile && mobileCartOpen && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(20px)', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
                    {renderCartPanel()}
                </div>
            )}

            {/* Payment Modal */}
            {showPaymentModal && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.7)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', backdropFilter: 'blur(12px)' }}>
                    <div className="glass-panel animate-scale-up" style={{ width: '100%', maxWidth: '450px', maxHeight: '90vh', overflowY: 'auto', background: '#ffffff', borderRadius: '24px', position: 'relative', padding: '2.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                            <div>
                                <h3 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-main)' }}>Complete Payment</h3>
                                <p style={{ color: 'var(--text-muted)', marginTop: '0.25rem' }}>Choose a payment method to finish.</p>
                            </div>
                            <button className="btn btn-secondary" style={{ padding: '0.5rem', borderRadius: '12px', minWidth: '40px' }} onClick={() => setShowPaymentModal(false)}><X size={20} /></button>
                        </div>
                        
                        <div style={{ textAlign: 'center', marginBottom: '2rem', background: 'var(--surface)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>Total Amount Due</div>
                            <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--primary)', letterSpacing: '-0.03em' }}>{businessProfile?.currencySymbol || '$'}{cartCalc.finalTotal.toFixed(2)}</div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
                            <button className="btn" style={{ padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', border: pendingPaymentMethod === 'CASH' ? '2px solid var(--primary)' : '1px solid var(--border-color)', background: pendingPaymentMethod === 'CASH' ? 'var(--primary-transparent)' : '#ffffff', borderRadius: '16px', transition: 'var(--transition)' }} onClick={() => setPendingPaymentMethod('CASH')}>
                                <Banknote size={32} color={pendingPaymentMethod === 'CASH' ? 'var(--primary)' : 'var(--text-muted)'} />
                                <span style={{ fontWeight: 700, color: pendingPaymentMethod === 'CASH' ? 'var(--primary)' : 'var(--text-main)', fontSize: '1rem' }}>Cash</span>
                            </button>
                            <button className="btn" style={{ padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', border: pendingPaymentMethod === 'CREDIT' ? '2px solid var(--primary)' : '1px solid var(--border-color)', background: pendingPaymentMethod === 'CREDIT' ? 'var(--primary-transparent)' : '#ffffff', borderRadius: '16px', transition: 'var(--transition)' }} onClick={() => setPendingPaymentMethod('CREDIT')}>
                                <CreditCard size={32} color={pendingPaymentMethod === 'CREDIT' ? 'var(--primary)' : 'var(--text-muted)'} />
                                <span style={{ fontWeight: 700, color: pendingPaymentMethod === 'CREDIT' ? 'var(--primary)' : 'var(--text-main)', fontSize: '1rem' }}>Credit Card</span>
                            </button>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button className="btn btn-secondary" style={{ flex: 1, padding: '1rem', justifyContent: 'center' }} onClick={() => setShowPaymentModal(false)}>Cancel</button>
                            <button className="btn btn-primary" style={{ flex: 1, padding: '1rem', justifyContent: 'center' }} onClick={() => handleConfirmTransaction('COMPLETED')}>Complete Order <Check size={18} /></button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Sales;
