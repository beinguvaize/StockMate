import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { ShoppingCart as CartIcon, Search, Plus, Minus, FileText, User, MapPin, Truck, BadgeDollarSign, Percent, Clock, X, ChevronUp, ChevronDown, CreditCard, Banknote, AlertTriangle, Edit3, Printer, Check, ArrowRight } from 'lucide-react';

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

    const filteredProducts = useMemo(() => {
        if (!searchTerm) return availableProducts;
        const lowerSearch = searchTerm.toLowerCase();
        return availableProducts.filter(p =>
            p.name.toLowerCase().includes(lowerSearch) ||
            p.sku.toLowerCase().includes(lowerSearch) ||
            p.category.toLowerCase().includes(lowerSearch)
        );
    }, [availableProducts, searchTerm]);

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

    const handleConfirmTransaction = () => {
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
            pendingOrderStatus
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
                <div className="card" style={{ maxWidth: '500px', width: '100%', textAlign: 'center', padding: '3rem' }}>
                    <div style={{ color: 'var(--success)', marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}>
                        <Check size={64} />
                    </div>
                    <h2 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>Order Success!</h2>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Order ID: #{lastOrderId}</p>
                    
                    <div style={{ padding: '1.5rem', backgroundColor: 'var(--bg-color)', borderRadius: '8px', marginBottom: '2rem' }}>
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Total Amount Paid</div>
                        <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--text-main)' }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'white' }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <CartIcon size={24} color="var(--primary)" />
                    Current Order
                </h2>
                {isMobile && <button onClick={() => setMobileCartOpen(false)} style={{ background: 'none', border: 'none' }}><X size={24} /></button>}
            </div>

            {/* Customer Section */}
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', backgroundColor: '#f9fafb' }}>
                <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Select Customer</label>
                    <div style={{ position: 'relative' }}>
                        <User size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <select className="input-field" value={selectedShopId} onChange={e => {
                            setSelectedShopId(e.target.value);
                            if (e.target.value === 'WALKIN') setCustomerInfo({ name: 'Walk-in Customer', phone: '' });
                            else { const shop = shops.find(s => s.id === e.target.value); setCustomerInfo({ name: shop?.name || 'Customer', phone: shop?.phone || '' }); }
                        }} style={{ paddingLeft: '2.5rem', marginBottom: 0 }}>
                            <option value="WALKIN">Walking Customer</option>
                            {shops.map(s => <option key={s.id} value={s.id}>{s.name} - {s.phone}</option>)}
                        </select>
                    </div>
                </div>
                
                {selectedShopId === 'WALKIN' && (
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <input type="text" className="input-field" placeholder="Name" value={customerInfo.name} onChange={e => setCustomerInfo({...customerInfo, name: e.target.value})} style={{ marginBottom: 0 }} />
                        <input type="text" className="input-field" placeholder="Phone" value={customerInfo.phone} onChange={e => setCustomerInfo({...customerInfo, phone: e.target.value})} style={{ marginBottom: 0 }} />
                    </div>
                )}
            </div>

            {/* Cart Items List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
                {cart.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem 0' }}>
                        <CartIcon size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                        <p>No items in cart</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {cartCalc.lines.map(item => (
                            <div key={item.productId} style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                                    <div>
                                        <div style={{ fontWeight: 600 }}>{item.name}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.sku}</div>
                                    </div>
                                    <button onClick={() => setCart(cart.filter(i => i.productId !== item.productId))} style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} /></button>
                                </div>
                                
                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
                                        <button style={{ padding: '0.25rem 0.5rem', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => removeFromCart(item.productId)}>-</button>
                                        <span style={{ padding: '0 0.5rem', fontWeight: 500 }}>{item.quantity}</span>
                                        <button style={{ padding: '0.25rem 0.5rem', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => addToCart(products.find(p => p.id === item.productId))}>+</button>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <input type="number" className="input-field" value={item.price} onChange={e => updateCartItem(item.productId, 'price', e.target.value)} style={{ padding: '0.25rem 0.5rem', marginBottom: 0, width: '100%' }} placeholder="Price" />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <input type="number" className="input-field" value={item.discount} onChange={e => updateCartItem(item.productId, 'discount', e.target.value)} style={{ padding: '0.25rem 0.5rem', marginBottom: 0, width: '100%' }} placeholder="Disc %" />
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right', marginTop: '0.5rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                                    {businessProfile?.currencySymbol || '$'}{item.lineTotal.toLocaleString()}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Summary & Checkout Actions */}
            <div style={{ padding: '1.5rem', borderTop: '1px solid var(--border-color)', backgroundColor: '#f9fafb' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                        <span>Subtotal ({cartCalc.totalItems} items)</span>
                        <span>{businessProfile?.currencySymbol || '$'}{cartCalc.subtotal.toLocaleString()}</span>
                    </div>
                    {cartCalc.totalDiscount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--danger)' }}>
                        <span>Discount</span>
                        <span>-{businessProfile?.currencySymbol || '$'}{cartCalc.totalDiscount.toLocaleString()}</span>
                    </div>}
                    {cartCalc.totalTax > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                        <span>Tax</span>
                        <span>+{businessProfile?.currencySymbol || '$'}{cartCalc.totalTax.toLocaleString()}</span>
                    </div>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.25rem', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed var(--border-color)' }}>
                        <span>Total</span>
                        <span>{businessProfile?.currencySymbol || '$'}{cartCalc.finalTotal.toLocaleString()}</span>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem' }}>
                    {selectedShopId !== 'WALKIN' && (
                        <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} disabled={cart.length === 0 || isViewOnly()} onClick={() => { setPendingOrderStatus('PENDING'); setShowPaymentModal(true); }}>
                            <Clock size={16} /> Pending
                        </button>
                    )}
                    <button className="btn btn-primary" style={{ flex: 2, justifyContent: 'center' }} disabled={cart.length === 0 || isViewOnly()} onClick={() => { setPendingOrderStatus('COMPLETED'); setShowPaymentModal(true); }}>
                        <Check size={16} /> Checkout
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <div className="animate-fade-in" style={{ display: 'flex', gap: '1.5rem', height: '100%', flexDirection: isMobile ? 'column' : 'row' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <h1 className="page-title" style={{ marginBottom: 0 }}>Point of Sale</h1>
                </div>

                {/* Filter & Search Bar */}
                <div className="card" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                        <div style={{ position: 'relative' }}>
                            <Truck size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <select className="input-field" value={selectedRoute} onChange={e => setSelectedRoute(e.target.value)} style={{ paddingLeft: '2.5rem', marginBottom: 0 }}>
                                <option value="">Select Route (Optional)</option>
                                {activeRoutes.map(r => <option key={r.id} value={r.id}>Route: {r.driverId}</option>)}
                            </select>
                        </div>
                    </div>
                    <div style={{ flex: 2, minWidth: '200px' }}>
                        <div style={{ position: 'relative' }}>
                            <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input type="text" className="input-field" placeholder="Search product name or SKU..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ paddingLeft: '2.5rem', marginBottom: 0 }} />
                        </div>
                    </div>
                </div>

                {/* Catalog Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                    {filteredProducts.map(product => {
                        const inCart = cart.find(i => i.productId === product.id);
                        
                        return (
                            <div key={product.id} className="card" style={{ 
                                padding: '1.25rem', cursor: 'pointer', position: 'relative',
                                border: inCart ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                                transition: 'all 0.2s',
                                display: 'flex', flexDirection: 'column'
                            }} onClick={() => addToCart(product)}>
                                {inCart && (
                                    <div style={{ position: 'absolute', top: -1, right: -1, backgroundColor: 'var(--primary)', color: 'white', padding: '0.25rem 0.5rem', borderBottomLeftRadius: '8px', borderTopRightRadius: '8px', fontWeight: 'bold', fontSize: '0.875rem' }}>
                                        {inCart.quantity}
                                    </div>
                                )}
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>{product.sku}</div>
                                <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 0.5rem', flex: 1 }}>{product.name}</h3>
                                
                                <div style={{ fontWeight: 'bold', fontSize: '1.25rem', color: 'var(--text-main)', marginBottom: '1rem' }}>
                                    {businessProfile?.currencySymbol || '$'}{product.sellingPrice.toLocaleString()}
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem' }}>
                                    <span style={{ color: product.stock <= 10 ? 'var(--danger)' : 'var(--text-muted)' }}>
                                        {product.stock} in stock
                                    </span>
                                    <Plus size={18} color="var(--primary)" />
                                </div>
                            </div>
                        );
                    })}
                    {filteredProducts.length === 0 && (
                        <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
                            No products found matching your search.
                        </div>
                    )}
                </div>
            </div>

            {/* Desktop Cart Sidebar */}
            {!isMobile && (
                <div style={{ width: '350px', flexShrink: 0 }}>
                    <div className="card" style={{ height: 'calc(100vh - 120px)', position: 'sticky', top: '1.5rem', overflow: 'hidden', padding: 0, display: 'flex', flexDirection: 'column' }}>
                        {renderCartPanel()}
                    </div>
                </div>
            )}

            {/* Mobile Cart Floating Link */}
            {isMobile && !mobileCartOpen && cart.length > 0 && (
                <div onClick={() => setMobileCartOpen(true)} style={{ position: 'fixed', bottom: '1.5rem', left: '1.5rem', right: '1.5rem', backgroundColor: 'var(--primary)', color: 'white', padding: '1rem 1.5rem', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 100, boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}>
                        <CartIcon size={20} />
                        <span>{cartCalc.totalItems} Items</span>
                    </div>
                    <div style={{ fontWeight: 'bold', fontSize: '1.25rem' }}>{businessProfile?.currencySymbol || '$'}{cartCalc.finalTotal.toFixed(2)}</div>
                </div>
            )}

            {/* Mobile Cart Overlay */}
            {isMobile && mobileCartOpen && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'white', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
                    {renderCartPanel()}
                </div>
            )}

            {/* Payment Modal */}
            {showPaymentModal && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
                    <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '2rem' }}>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem', textAlign: 'center' }}>Complete Payment</h3>
                        
                        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Total Amount Due</div>
                            <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--primary)' }}>{businessProfile?.currencySymbol || '$'}{cartCalc.finalTotal.toFixed(2)}</div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
                            <button className="btn" style={{ padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', border: pendingPaymentMethod === 'CASH' ? '2px solid var(--primary)' : '1px solid var(--border-color)', background: pendingPaymentMethod === 'CASH' ? '#e0e7ff' : 'white' }} onClick={() => setPendingPaymentMethod('CASH')}>
                                <Banknote size={24} color={pendingPaymentMethod === 'CASH' ? 'var(--primary)' : 'var(--text-muted)'} />
                                <span style={{ fontWeight: 600, color: pendingPaymentMethod === 'CASH' ? 'var(--primary)' : 'var(--text-main)' }}>Cash</span>
                            </button>
                            <button className="btn" style={{ padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', border: pendingPaymentMethod === 'CREDIT' ? '2px solid var(--primary)' : '1px solid var(--border-color)', background: pendingPaymentMethod === 'CREDIT' ? '#e0e7ff' : 'white' }} onClick={() => setPendingPaymentMethod('CREDIT')}>
                                <CreditCard size={24} color={pendingPaymentMethod === 'CREDIT' ? 'var(--primary)' : 'var(--text-muted)'} />
                                <span style={{ fontWeight: 600, color: pendingPaymentMethod === 'CREDIT' ? 'var(--primary)' : 'var(--text-main)' }}>Credit</span>
                            </button>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowPaymentModal(false)}>Cancel</button>
                            <button className="btn btn-primary" style={{ flex: 2, justifyContent: 'center' }} onClick={handleConfirmTransaction}>Confirm Order</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Sales;
