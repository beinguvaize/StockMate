import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ShoppingCart as CartIcon, Search, Plus, Minus, CreditCard, Banknote, Check, ArrowRight, Package, X, User, Smartphone, Landmark, AlertTriangle } from 'lucide-react';
import Button from '../../../shared/Button';
import Modal from '../../../shared/Modal';
import { formatCurrency, generateRef } from '../../../lib/utils';
import { useNotifications } from '../../../context/NotificationContext';
import { supabase } from '../../../lib/supabase';

const InvoiceBuilder = ({ products, clients, onPlaceSale, currentTenantId }) => {
  const { addNotification } = useNotifications();
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('WALKIN');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clientSearch, setClientSearch]     = useState('');
  const [clientDropOpen, setClientDropOpen] = useState(false);
  const clientDropRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (clientDropRef.current && !clientDropRef.current.contains(e.target)) {
        setClientDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  // FIFO next-batch cost + real stock per product
  const [fifoCosts, setFifoCosts] = useState({});
  const [batchStock, setBatchStock] = useState({}); // { [productId]: totalQtyRemaining }

  useEffect(() => {
    if (!currentTenantId || !products.length) return;
    supabase
      .from('product_batches')
      .select('product_id, unit_cost, qty_remaining, received_date, created_at')
      .in('product_id', products.map(p => p.id))
      .gt('qty_remaining', 0)
      .order('received_date', { ascending: true })
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (!data) return;
        const costs = {};
        const stock = {};
        data.forEach(b => {
          // FIFO cost = first (oldest) open batch
          if (!costs[b.product_id]) costs[b.product_id] = Number(b.unit_cost);
          // Real stock = sum of all open batch qty
          stock[b.product_id] = (stock[b.product_id] || 0) + Number(b.qty_remaining);
        });
        setFifoCosts(costs);
        setBatchStock(stock);
      });
  }, [currentTenantId, products]);

  // Compute floor-guard status per product
  const marginStatus = useMemo(() => {
    const out = {};
    products.forEach(p => {
      const cost = fifoCosts[p.id] ?? p.costPrice ?? 0;
      const sell = p.sellingPrice ?? 0;
      const floor = p.min_margin ?? 0;
      const margin = sell > 0 ? ((sell - cost) / sell) * 100 : 100;
      out[p.id] = {
        cost,
        margin,
        belowFloor: floor > 0 && margin < floor,
        isLoss: sell > 0 && cost > sell,
        floor,
      };
    });
    return out;
  }, [products, fifoCosts]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      p.sku.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [products, searchTerm]);

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        return prev.map(item => item.productId === product.id 
          ? { ...item, quantity: item.quantity + 1 } 
          : item
        );
      }
      return [...prev, { 
        productId: product.id, 
        name: product.name, 
        price: product.sellingPrice, 
        quantity: 1,
        taxRate: product.taxRate || 0
      }];
    });
  };

  const updateQuantity = (productId, delta) => {
    setCart(prev => prev.map(item => {
      if (item.productId === productId) {
        return { ...item, quantity: Math.max(0, item.quantity + delta) };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const setQuantityDirect = (productId, val) => {
    const qty = parseInt(val, 10);
    if (isNaN(qty) || qty < 0) return;
    if (qty === 0) {
      setCart(prev => prev.filter(i => i.productId !== productId));
    } else {
      setCart(prev => prev.map(i => i.productId === productId ? { ...i, quantity: qty } : i));
    }
  };

  const setItemPrice = (productId, val) => {
    const price = parseFloat(val);
    setCart(prev => prev.map(i =>
      i.productId === productId ? { ...i, price: isNaN(price) ? i.price : price } : i
    ));
  };

  const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const tax = cart.reduce((acc, item) => acc + (item.price * item.quantity * (item.taxRate / 100)), 0);
  const total = subtotal + tax;

  // Credit sales require a real client (so outstanding_balance has a target).
  // Block the CREDIT button when the cart is attached to WALKIN — auto-revert
  // to CASH if the user swaps back to walk-in after picking credit.
  useEffect(() => {
    if (paymentMethod === 'CREDIT' && selectedClientId === 'WALKIN') {
      setPaymentMethod('CASH');
    }
  }, [selectedClientId, paymentMethod]);

  const handleCompleteSale = async () => {
    if (isSubmitting) return;
    if (cart.length === 0) {
      addNotification('Cart is empty', 'error');
      return;
    }
    if (paymentMethod === 'CREDIT' && selectedClientId === 'WALKIN') {
      addNotification('Credit sale requires a client. Pick one or switch to Cash.', 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      const isCreditSale = paymentMethod === 'CREDIT';
      const saleData = {
        id: generateRef('SAL'),
        clientId: selectedClientId,
        items: cart,
        totalAmount: total,
        paidAmount: isCreditSale ? 0 : total,
        paymentMethod,
        status: isCreditSale ? 'PENDING' : 'COMPLETED',
      };
      const result = await onPlaceSale(saleData);
      if (result && result.error) {
        const msg = result.error.message || 'Sale could not be recorded';
        addNotification(`Checkout failed: ${msg}`, 'error');
        return; // keep cart + modal so user can retry
      }
      addNotification(`Sale recorded: ${formatCurrency(total)}`, 'success');
      setCart([]);
      setShowPaymentModal(false);
    } catch (err) {
      addNotification(`Checkout error: ${err.message || err}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-200px)]">
      {/* Product Selection Area */}
      <div className="flex-1 flex flex-col gap-4 overflow-hidden">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            placeholder="Search products by name or SKU..." 
            className="w-full bg-white rounded-2xl py-4 pl-12 pr-4 border border-black/5 outline-none focus:ring-2 focus:ring-accent-signature/20 shadow-sm font-medium"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="grid grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 overflow-y-auto pr-2 pb-4">
          {filteredProducts.map(product => {
            const ms = marginStatus[product.id] || {};
            const hasWarning = ms.belowFloor || ms.isLoss;
            return (
            <div
              key={product.id}
              onClick={() => addToCart(product)}
              className={`glass-panel !p-3 cursor-pointer transition-all hover:shadow-lg group relative ${
                ms.isLoss ? 'border-red-300 bg-red-50/30' : ms.belowFloor ? 'border-orange-200 bg-orange-50/20' : 'hover:border-accent-signature/30'
              }`}
            >
              {hasWarning && (
                <div className={`absolute top-1.5 right-1.5 flex items-center gap-0.5 px-1 py-0.5 rounded-full text-[8px] font-black uppercase ${
                  ms.isLoss ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'
                }`}>
                  <AlertTriangle size={8} />
                  {ms.isLoss ? 'LOSS' : 'LOW'}
                </div>
              )}
              <div className="aspect-square bg-canvas rounded-xl mb-2 flex items-center justify-center overflow-hidden border border-black/5">
                {product.image ? (
                  <img src={product.image} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                ) : (
                  <Package size={24} className="opacity-10" />
                )}
              </div>
              <div className="font-bold text-[10px] text-ink-primary line-clamp-2 mb-0.5 uppercase tracking-tight leading-tight">{product.name}</div>
              <div className={`text-sm font-black leading-none ${ms.isLoss ? 'text-red-500' : 'text-emerald-600'}`}>
                {formatCurrency(product.sellingPrice)}
              </div>
              <div className="mt-0.5 text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                {batchStock[product.id] !== undefined ? batchStock[product.id] : product.stock} stk
              </div>
            </div>
            );
          })}
        </div>
      </div>

      {/* Cart Area */}
      <div className="w-full lg:w-[540px] glass-panel !p-0 flex flex-col overflow-hidden border-l border-black/5 shadow-2xl">
        {/* Cart header */}
        <div className="px-4 py-3 border-b border-black/5 flex justify-between items-center bg-canvas/30">
          <div className="flex items-center gap-2">
            <CartIcon size={18} className="text-accent-signature" />
            <h2 className="font-semibold text-sm text-ink-primary">Cart</h2>
          </div>
          <div className="bg-accent-signature text-button-text text-[10px] font-black px-2 py-1 rounded-pill ring-4 ring-accent-signature/10">
            {cart.reduce((acc, i) => acc + i.quantity, 0)} items
          </div>
        </div>

        {/* Column headers */}
        {cart.length > 0 && (
          <div className="grid grid-cols-[1fr_90px_80px_64px_20px] gap-2 px-4 py-2 bg-canvas/50 border-b border-black/5">
            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Product</span>
            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest text-center">Qty</span>
            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest text-right">Unit Price</span>
            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest text-right">Total</span>
            <span />
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {cart.map(item => {
            const cost = fifoCosts[item.productId] ?? 0;
            const belowCost = cost > 0 && item.price < cost;
            return (
              <div
                key={item.productId}
                className={`grid grid-cols-[1fr_90px_80px_64px_20px] gap-2 items-center px-4 py-2.5 border-b border-black/5 last:border-0 transition-colors ${
                  belowCost ? 'bg-red-50/60' : 'hover:bg-canvas/40'
                }`}
              >
                {/* Product name + below-cost hint */}
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-ink-primary truncate uppercase">{item.name}</div>
                  {belowCost && (
                    <div className="text-[9px] font-bold text-red-500 mt-0.5">
                      Min cost: {formatCurrency(cost)}
                    </div>
                  )}
                </div>

                {/* Qty stepper */}
                <div className="flex items-center justify-center gap-0.5 bg-white border border-black/8 rounded-lg p-0.5">
                  <button
                    onClick={() => updateQuantity(item.productId, -1)}
                    className="w-5 h-5 rounded flex items-center justify-center hover:bg-canvas transition-all text-ink-primary shrink-0"
                  >
                    <Minus size={9} strokeWidth={3} />
                  </button>
                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={e => setQuantityDirect(item.productId, e.target.value)}
                    className="w-8 text-center text-[11px] font-black text-ink-primary bg-transparent outline-none tabular-nums"
                  />
                  <button
                    onClick={() => addToCart(products.find(p => p.id === item.productId))}
                    className="w-5 h-5 rounded flex items-center justify-center hover:bg-canvas transition-all text-ink-primary shrink-0"
                  >
                    <Plus size={9} strokeWidth={3} />
                  </button>
                </div>

                {/* Unit price input */}
                <div className="relative">
                  <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] text-gray-400 font-bold pointer-events-none">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.price}
                    onChange={e => setItemPrice(item.productId, e.target.value)}
                    className={`w-full pl-4 pr-1 py-1 text-[11px] font-bold bg-canvas rounded-lg outline-none focus:ring-1 tabular-nums border ${
                      belowCost
                        ? 'border-red-300 text-red-600 focus:ring-red-300/40'
                        : 'border-black/8 text-ink-primary focus:ring-accent-signature/30'
                    }`}
                  />
                </div>

                {/* Line total */}
                <div className="text-[11px] font-black text-ink-primary tabular-nums text-right">
                  {formatCurrency(item.price * item.quantity)}
                </div>

                {/* Remove */}
                <button
                  onClick={() => setCart(prev => prev.filter(i => i.productId !== item.productId))}
                  className="text-gray-300 hover:text-red-400 transition-colors flex items-center justify-center"
                >
                  <X size={11} strokeWidth={2.5} />
                </button>
              </div>
            );
          })}
          {cart.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center opacity-30 pointer-events-none p-10 text-center">
              <Package size={48} className="mb-4" />
              <div className="text-xs font-bold uppercase tracking-widest">Cart is empty</div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-black/5 bg-canvas/10">
          {/* Client picker — walk-in by default. Credit requires a real client. */}
          <div className="mb-4">
            <label className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              <User size={12} /> Client
            </label>
            {/* Searchable client picker */}
            <div ref={clientDropRef} className="relative">
              {/* Trigger */}
              <button
                type="button"
                onClick={() => { setClientDropOpen(o => !o); setClientSearch(''); }}
                className="w-full bg-white rounded-xl py-3 px-4 border border-black/5 outline-none focus:ring-2 focus:ring-accent-signature/20 text-left flex items-center justify-between"
              >
                {selectedClientId === 'WALKIN' ? (
                  <span className="text-xs font-bold text-ink-primary uppercase tracking-tight">WALK-IN (CASH ONLY)</span>
                ) : (() => {
                  const sel = (clients || []).find(c => c.id === selectedClientId);
                  return (
                    <span className="flex flex-col min-w-0">
                      <span className="text-xs font-bold text-ink-primary uppercase tracking-tight truncate">{(sel?.name || 'Unknown').toUpperCase()}</span>
                      {(sel?.address || sel?.phone) && (
                        <span className="text-[9px] text-gray-400 font-medium truncate">{sel?.address || sel?.phone}</span>
                      )}
                    </span>
                  );
                })()}
                <Search size={12} className="text-gray-400 shrink-0 ml-2" />
              </button>

              {/* Dropdown */}
              {clientDropOpen && (
                <div className="absolute z-50 bottom-full mb-1 left-0 right-0 bg-white border border-black/10 rounded-xl shadow-xl overflow-hidden">
                  {/* Search input */}
                  <div className="p-2 border-b border-black/5">
                    <div className="flex items-center gap-2 bg-canvas rounded-lg px-3 py-2">
                      <Search size={12} className="text-gray-400 shrink-0" />
                      <input
                        autoFocus
                        type="text"
                        placeholder="Search client..."
                        className="flex-1 bg-transparent text-xs font-semibold outline-none text-ink-primary placeholder:text-gray-400"
                        value={clientSearch}
                        onChange={e => setClientSearch(e.target.value)}
                      />
                      {clientSearch && (
                        <button onClick={() => setClientSearch('')} className="text-gray-400 hover:text-gray-600">
                          <X size={10} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Options list */}
                  <div className="max-h-52 overflow-y-auto">
                    {/* Walk-in option */}
                    {!clientSearch && (
                      <button
                        type="button"
                        onClick={() => { setSelectedClientId('WALKIN'); setClientDropOpen(false); }}
                        className={`w-full text-left px-4 py-3 text-xs font-bold uppercase tracking-tight flex items-center justify-between hover:bg-canvas transition-colors ${selectedClientId === 'WALKIN' ? 'text-accent-signature bg-accent-signature/5' : 'text-ink-primary'}`}
                      >
                        WALK-IN (CASH ONLY)
                        {selectedClientId === 'WALKIN' && <Check size={12} />}
                      </button>
                    )}

                    {/* Filtered clients */}
                    {(clients || [])
                      .filter(c => !clientSearch ||
                        (c.name || '').toLowerCase().includes(clientSearch.toLowerCase()) ||
                        (c.address || '').toLowerCase().includes(clientSearch.toLowerCase()) ||
                        (c.phone || '').toLowerCase().includes(clientSearch.toLowerCase())
                      )
                      .map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => { setSelectedClientId(c.id); setClientDropOpen(false); setClientSearch(''); }}
                          className={`w-full text-left px-4 py-2.5 flex items-center justify-between hover:bg-canvas transition-colors ${selectedClientId === c.id ? 'bg-accent-signature/5' : ''}`}
                        >
                          <span className="flex flex-col min-w-0 flex-1">
                            <span className={`text-xs font-bold uppercase tracking-tight truncate ${selectedClientId === c.id ? 'text-accent-signature' : 'text-ink-primary'}`}>
                              {(c.name || 'Unnamed').toUpperCase()}
                            </span>
                            {(c.address || c.phone) && (
                              <span className="text-[9px] text-gray-400 font-medium truncate mt-0.5">
                                {c.address || c.phone}
                              </span>
                            )}
                          </span>
                          {selectedClientId === c.id && <Check size={12} className="shrink-0 text-accent-signature ml-2" />}
                        </button>
                      ))
                    }

                    {/* Empty state */}
                    {clientSearch && (clients || []).filter(c => (c.name || '').toLowerCase().includes(clientSearch.toLowerCase())).length === 0 && (
                      <div className="px-4 py-6 text-center text-[10px] text-gray-400">No clients match "{clientSearch}"</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="space-y-2 mb-6">
            <div className="flex justify-between text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              <span>Tax</span>
              <span>{formatCurrency(tax)}</span>
            </div>
            <div className="flex justify-between text-xl font-black text-ink-primary pt-2 border-t border-black/5">
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>
          
          {/* Below-cost hard block */}
          {(() => {
            const belowCostItems = cart.filter(item => {
              const cost = fifoCosts[item.productId] ?? 0;
              return cost > 0 && item.price < cost;
            });
            const hasFloorWarn = cart.some(item => {
              const ms = marginStatus[item.productId];
              return ms?.belowFloor && !ms?.isLoss;
            });
            return (
              <>
                {belowCostItems.length > 0 && (
                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-300 text-red-700 mb-2">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <p className="text-[10px] font-bold leading-snug">
                      Cannot sell below purchase cost. Adjust price for: {belowCostItems.map(i => i.name).join(', ')}.
                    </p>
                  </div>
                )}
                {hasFloorWarn && belowCostItems.length === 0 && (
                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-orange-50 border border-orange-200 text-orange-700 mb-2">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <p className="text-[10px] font-bold leading-snug">
                      Some items are below your minimum margin floor.
                    </p>
                  </div>
                )}
                <Button
                  disabled={cart.length === 0 || belowCostItems.length > 0}
                  onClick={() => setShowPaymentModal(true)}
                  className="w-full !rounded-xl !h-14 shadow-xl"
                  icon={ArrowRight}
                >
                  Checkout
                </Button>
              </>
            );
          })()}
        </div>
      </div>

      <Modal isOpen={showPaymentModal} onClose={() => setShowPaymentModal(false)} title="Complete Sale" subtitle="Select payment method">
        <div className="grid grid-cols-2 gap-3 mt-4">
          {[
            { key: 'CASH',   label: 'Cash',   icon: <Banknote size={28} /> },
            { key: 'CARD',   label: 'Card',   icon: <CreditCard size={28} /> },
            { key: 'UPI',    label: 'UPI',    icon: <Smartphone size={28} /> },
            { key: 'BANK',   label: 'Bank Transfer', icon: <Landmark size={28} /> },
          ].map(({ key, label, icon }) => (
            <div
              key={key}
              onClick={() => setPaymentMethod(key)}
              className={`p-6 rounded-2xl border-2 transition-all cursor-pointer flex flex-col items-center gap-3 ${
                paymentMethod === key
                  ? 'border-accent-signature bg-accent-signature/5 shadow-premium'
                  : 'border-black/5 hover:border-black/10'
              }`}
            >
              <div className={`p-3 rounded-xl ${paymentMethod === key ? 'bg-accent-signature text-button-text' : 'bg-canvas text-gray-400'}`}>
                {icon}
              </div>
              <span className="text-xs font-black uppercase tracking-widest">{label}</span>
            </div>
          ))}

          {/* Credit — client required */}
          <div
            onClick={() => {
              if (selectedClientId === 'WALKIN') {
                addNotification('Select a client before choosing Credit.', 'info');
                return;
              }
              setPaymentMethod('CREDIT');
            }}
            className={`p-6 rounded-2xl border-2 transition-all flex flex-col items-center gap-3 col-span-2 ${
              selectedClientId === 'WALKIN'
                ? 'opacity-40 cursor-not-allowed border-black/5'
                : paymentMethod === 'CREDIT'
                ? 'border-accent-signature bg-accent-signature/5 shadow-premium cursor-pointer'
                : 'border-black/5 hover:border-black/10 cursor-pointer'
            }`}
          >
            <div className={`p-3 rounded-xl ${paymentMethod === 'CREDIT' ? 'bg-accent-signature text-button-text' : 'bg-canvas text-gray-400'}`}>
              <CreditCard size={28} />
            </div>
            <span className="text-xs font-black uppercase tracking-widest">Client Credit</span>
            {selectedClientId === 'WALKIN' && (
              <span className="text-[9px] text-gray-400 font-semibold">Select a client first</span>
            )}
          </div>
        </div>
        <div className="mt-8 bg-canvas rounded-2xl p-6 border border-black/5">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Amount Due</span>
            <span className="text-sm font-black text-ink-primary">{formatCurrency(total)}</span>
          </div>
          <p className="text-[9px] text-gray-400 italic">Verify amount before finalizing the sale.</p>
        </div>
        <Button
          onClick={handleCompleteSale}
          disabled={isSubmitting || cart.length === 0}
          className="w-full !mt-8 !h-14 !rounded-xl"
          icon={Check}
        >
          {isSubmitting ? 'Saving...' : `Confirm & Pay ${formatCurrency(total)}`}
        </Button>
      </Modal>
    </div>
  );
};

export default InvoiceBuilder;
