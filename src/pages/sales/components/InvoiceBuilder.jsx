import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ShoppingCart as CartIcon, Search, Plus, Minus, CreditCard, Banknote, Check, ArrowRight, Package, X, User, Smartphone, Landmark, AlertTriangle, Truck, Store, ChevronLeft, MapPin, Calendar, MessageSquare, DollarSign, ScanBarcode } from 'lucide-react';
import Button from '../../../shared/Button';
import { formatCurrency, generateRef } from '../../../lib/utils';
import { useNotifications } from '../../../context/NotificationContext';
import { supabase } from '../../../lib/supabase';

const InvoiceBuilder = ({ products, inventoryBalances = [], clients, onPlaceSale, currentTenantId, taxMode = 'EXCLUSIVE' }) => {
  const taxInclusive = taxMode === 'INCLUSIVE';
  const { addNotification } = useNotifications();
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('WALKIN');
  const [showCheckout, setShowCheckout] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [fulfillmentType, setFulfillmentType] = useState('PICKUP'); // PICKUP | DELIVERY
  const [deliveryDetails, setDeliveryDetails] = useState({
    address: '', zone: '', date: '', notes: '', fee: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clientSearch, setClientSearch]     = useState('');
  const [clientDropOpen, setClientDropOpen] = useState(false);
  const clientDropRef = useRef(null);
  const searchInputRef = useRef(null);

  // Track the most-recently punched product so we can scroll its cart row
  // into view. Use a tick + ref pair so re-clicking the same product still
  // re-triggers the scroll effect.
  const lastAddedRef = useRef(null);
  const cartScrollRef = useRef(null);
  const [addTick, setAddTick] = useState(0);

  useEffect(() => {
    if (!lastAddedRef.current || !cartScrollRef.current) return;
    const row = cartScrollRef.current.querySelector(`[data-cart-row="${lastAddedRef.current}"]`);
    if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [addTick]);

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
        data.forEach(b => {
          if (!costs[b.product_id]) costs[b.product_id] = Number(b.unit_cost);
        });
        setFifoCosts(costs);
      });
  }, [currentTenantId, products]);

  // Stock from inventory_balances (same source as Inventory page) — sum across all locations
  const warehouseStock = useMemo(() => {
    const out = {};
    inventoryBalances.forEach(b => {
      out[b.product_id] = (out[b.product_id] || 0) + Number(b.quantity || 0);
    });
    return out;
  }, [inventoryBalances]);

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

  // Auto-focus search on mount so barcode scanner fires straight in
  useEffect(() => { searchInputRef.current?.focus(); }, []);

  const filteredProducts = useMemo(() => {
    // RAW materials are consume-only (manufacturing) — never sold at POS.
    const sellable = products.filter(p => p.product_type !== 'RAW');
    const q = searchTerm.toLowerCase().trim();
    if (!q) return sellable;
    return sellable.filter(p =>
      (p.name    || '').toLowerCase().includes(q) ||
      (p.sku     || '').toLowerCase().includes(q) ||
      (p.barcode || '').toLowerCase().includes(q)
    );
  }, [products, searchTerm]);

  // Called when scanner (or user) presses Enter in search box
  const handleSearchEnter = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = searchTerm.trim();
    if (!q) return;

    // Exact barcode match first (fastest for scanner)
    const exactBarcode = products.find(
      p => p.barcode && p.barcode.toLowerCase() === q.toLowerCase()
    );
    if (exactBarcode) {
      addToCart(exactBarcode);
      setSearchTerm('');
      return;
    }

    // Exact SKU match
    const exactSku = products.find(
      p => p.sku && p.sku.toLowerCase() === q.toLowerCase()
    );
    if (exactSku) {
      addToCart(exactSku);
      setSearchTerm('');
      return;
    }

    // Single fuzzy result — add it
    if (filteredProducts.length === 1) {
      addToCart(filteredProducts[0]);
      setSearchTerm('');
    }
  };

  const getAvailableStock = (productId) =>
    warehouseStock[productId] !== undefined
      ? warehouseStock[productId]
      : (products.find(p => p.id === productId)?.stock ?? 0);

  const addToCart = (product) => {
    const available = getAvailableStock(product.id);
    lastAddedRef.current = product.id;
    setAddTick(t => t + 1);
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        if (existing.quantity >= available) {
          addNotification(`Only ${available} units in stock`, 'error');
          return prev;
        }
        return prev.map(item => item.productId === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
        );
      }
      if (available <= 0) {
        addNotification(`${product.name} is out of stock`, 'error');
        return prev;
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
    const available = getAvailableStock(productId);
    setCart(prev => prev.map(item => {
      if (item.productId === productId) {
        const next = Math.max(0, item.quantity + delta);
        if (next > available) {
          addNotification(`Only ${available} units in stock`, 'error');
          return item;
        }
        return { ...item, quantity: next };
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
      const available = getAvailableStock(productId);
      if (qty > available) {
        addNotification(`Only ${available} units in stock`, 'error');
        setCart(prev => prev.map(i => i.productId === productId ? { ...i, quantity: available } : i));
        return;
      }
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
  // Tax inclusive: price already contains GST → extract tax from subtotal
  // Tax exclusive: price is pre-tax → add tax on top
  const tax = cart.reduce((acc, item) => {
    const lineTotal = item.price * item.quantity;
    const rate = item.taxRate / 100;
    return acc + (taxInclusive
      ? lineTotal - lineTotal / (1 + rate)   // extract GST
      : lineTotal * rate                       // add GST
    );
  }, 0);
  const taxableAmount = taxInclusive ? subtotal - tax : subtotal;
  const deliveryFeeAmt = fulfillmentType === 'DELIVERY' ? (parseFloat(deliveryDetails.fee) || 0) : 0;
  const total = taxInclusive ? subtotal + deliveryFeeAmt : subtotal + tax + deliveryFeeAmt;

  // Credit sales require a real client (so outstanding_balance has a target).
  // Block the CREDIT button when the cart is attached to WALKIN — auto-revert
  // to CASH if the user swaps back to walk-in after picking credit.
  useEffect(() => {
    if (paymentMethod === 'CREDIT' && selectedClientId === 'WALKIN') {
      setPaymentMethod('CASH');
    }
  }, [selectedClientId, paymentMethod]);

  // Auto-fill delivery address from client record when delivery selected
  useEffect(() => {
    if (fulfillmentType !== 'DELIVERY') return;
    if (selectedClientId === 'WALKIN') return;
    const client = clients.find(c => c.id === selectedClientId);
    if (client?.address && !deliveryDetails.address) {
      setDeliveryDetails(p => ({ ...p, address: client.address }));
    }
  }, [fulfillmentType, selectedClientId, clients]); // eslint-disable-line

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
    // Stock pre-flight — catches cases where stock changed since cart was built
    const stockErrors = cart
      .map(item => {
        const available = getAvailableStock(item.productId);
        return item.quantity > available
          ? `${item.name}: need ${item.quantity}, only ${available} in stock`
          : null;
      })
      .filter(Boolean);
    if (stockErrors.length > 0) {
      addNotification(`Stock issue: ${stockErrors.join('; ')}`, 'error');
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
        subtotal: taxableAmount,
        tax: Math.round(tax * 100) / 100,
        tax_mode: taxMode,
        paidAmount: isCreditSale ? 0 : total,
        paymentMethod,
        status: isCreditSale ? 'PENDING' : 'COMPLETED',
        fulfillmentType,
        deliveryAddress: deliveryDetails.address || null,
        deliveryZone:    deliveryDetails.zone    || null,
        deliveryDate:    deliveryDetails.date    || null,
        deliveryNotes:   deliveryDetails.notes   || null,
        deliveryFee:     parseFloat(deliveryDetails.fee) || 0,
      };
      const result = await onPlaceSale(saleData);
      if (result && result.error) {
        const msg = result.error.message || 'Sale could not be recorded';
        addNotification(`Checkout failed: ${msg}`, 'error');
        return; // keep cart + modal so user can retry
      }
      addNotification(
        fulfillmentType === 'DELIVERY'
          ? `Sale recorded — added to delivery queue.`
          : `Sale recorded: ${formatCurrency(total)}`,
        'success'
      );
      setCart([]);
      setFulfillmentType('PICKUP');
      setDeliveryDetails({ address: '', zone: '', date: '', notes: '', fee: '' });
      setShowCheckout(false);
    } catch (err) {
      addNotification(`Checkout error: ${err.message || err}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-130px)]">
      {/* Product Selection Area */}
      <div className="flex-1 flex flex-col gap-4 overflow-hidden">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search by name, SKU or scan barcode…"
            className="w-full bg-white rounded-2xl py-4 pl-12 pr-12 border border-black/5 outline-none focus:ring-2 focus:ring-accent-signature/20 shadow-sm font-medium"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            onKeyDown={handleSearchEnter}
          />
          <ScanBarcode
            size={18}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none"
          />
        </div>
        
        <div className="flex flex-col gap-px overflow-y-auto pr-1 pb-4">
          {filteredProducts.map(product => {
            const ms = marginStatus[product.id] || {};
            const stock = warehouseStock[product.id] !== undefined ? warehouseStock[product.id] : product.stock;
            const outOfStock = stock <= 0;
            const inCart  = cart.find(i => i.productId === product.id);
            const cartQty = inCart ? inCart.quantity : 0;
            return (
            <div
              key={product.id}
              onClick={() => !outOfStock && addToCart(product)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all border group ${
                outOfStock
                  ? 'opacity-40 cursor-not-allowed border-transparent'
                  : ms.isLoss
                  ? 'border-red-200 bg-red-50/40 hover:bg-red-50/70'
                  : ms.belowFloor
                  ? 'border-orange-200 bg-orange-50/30 hover:bg-orange-50/60'
                  : inCart
                  ? 'border-accent-signature/40 bg-accent-signature/5 hover:bg-accent-signature/10'
                  : 'border-transparent bg-white/60 hover:bg-white hover:border-accent-signature/20 hover:shadow-sm'
              } ${inCart && !outOfStock ? 'ring-2 ring-inset ring-accent-signature/30' : ''}`}
            >
              {/* Thumbnail / initial */}
              <div className="relative flex-shrink-0">
                <div className="w-8 h-8 rounded-md flex items-center justify-center overflow-hidden bg-white border border-gray-300 shadow-sm">
                  {product.image
                    ? <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                    : <span className="text-[11px] font-black text-ink-primary/30 uppercase">{(product.name || '?').slice(0, 2)}</span>
                  }
                </div>
                {cartQty > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-accent-signature text-button-text text-[9px] font-black flex items-center justify-center shadow ring-2 ring-white">
                    {cartQty}
                  </span>
                )}
              </div>

              {/* Name + SKU */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-ink-primary truncate leading-tight">{product.name}</div>
                {product.sku && <div className="text-xs font-medium text-gray-400 truncate">{product.sku}</div>}
              </div>

              {/* Price + stock + tax */}
              <div className="text-right flex-shrink-0">
                <div className="flex items-center justify-end gap-1.5">
                  <div className={`text-sm font-black leading-none ${ms.isLoss ? 'text-red-500' : 'text-ink-primary'}`}>
                    {formatCurrency(product.sellingPrice)}
                  </div>
                  {product.taxRate > 0 && (
                    <span className="text-[10px] font-black px-1 py-0.5 rounded bg-blue-50 text-blue-500 border border-blue-100">
                      {product.taxRate}%
                    </span>
                  )}
                </div>
                <div className={`text-xs font-semibold mt-0.5 ${
                  outOfStock ? 'text-red-400' : ms.isLoss || ms.belowFloor ? 'text-orange-500' : 'text-gray-400'
                }`}>
                  {outOfStock ? 'OUT' : `${stock} stk`}
                </div>
              </div>

              {/* Warning badge */}
              {(ms.isLoss || ms.belowFloor) && !outOfStock && (
                <div className={`flex-shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                  ms.isLoss ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'
                }`}>
                  <AlertTriangle size={7} />
                  {ms.isLoss ? 'LOSS' : 'LOW'}
                </div>
              )}
            </div>
            );
          })}
        </div>
      </div>

      {/* Cart Area */}
      <div className="w-full lg:w-[580px] xl:w-[640px] glass-panel !p-0 flex flex-col overflow-hidden border-l border-black/5 shadow-2xl">
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
            <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Product</span>
            <span className="text-xs font-black text-gray-400 uppercase tracking-widest text-center">Qty</span>
            <span className="text-xs font-black text-gray-400 uppercase tracking-widest text-right">Unit Price</span>
            <span className="text-xs font-black text-gray-400 uppercase tracking-widest text-right">Total</span>
            <span />
          </div>
        )}

        <div ref={cartScrollRef} className="flex-1 overflow-y-auto scroll-smooth">
          {cart.map(item => {
            const cost = fifoCosts[item.productId] ?? 0;
            const belowCost = cost > 0 && item.price < cost;
            return (
              <div
                key={item.productId}
                data-cart-row={item.productId}
                className={`grid grid-cols-[1fr_90px_80px_64px_20px] gap-2 items-center px-4 py-2.5 border-b border-black/5 last:border-0 transition-colors ${
                  belowCost ? 'bg-red-50/60' : 'hover:bg-canvas/40'
                }`}
              >
                {/* Product name + below-cost hint */}
                <div className="min-w-0">
                  <div className="text-sm font-bold text-ink-primary truncate uppercase">{item.name}</div>
                  {belowCost && (
                    <div className="text-xs font-bold text-red-500 mt-0.5">
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
                    className="w-8 text-center text-sm font-black text-ink-primary bg-transparent outline-none tabular-nums"
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
                  <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-bold pointer-events-none">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.price}
                    onChange={e => setItemPrice(item.productId, e.target.value)}
                    className={`w-full pl-4 pr-1 py-1 text-sm font-bold bg-canvas rounded-lg outline-none focus:ring-1 tabular-nums border ${
                      belowCost
                        ? 'border-red-300 text-red-600 focus:ring-red-300/40'
                        : 'border-black/8 text-ink-primary focus:ring-accent-signature/30'
                    }`}
                  />
                </div>

                {/* Line total */}
                <div className="text-sm font-black text-ink-primary tabular-nums text-right">
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
          {/* Client picker — combobox, always-visible search */}
          <div className="mb-4">
            <label className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
              <User size={12} /> Client
            </label>
            <div ref={clientDropRef} className="relative">

              {/* Selected client chip — shown when a real client is picked */}
              {selectedClientId !== 'WALKIN' && !clientDropOpen ? (() => {
                const sel = (clients || []).find(c => c.id === selectedClientId);
                return (
                  <div className="w-full bg-accent-signature/5 border border-accent-signature/20 rounded-xl px-4 py-3 flex items-center justify-between gap-2">
                    <span className="flex flex-col min-w-0 flex-1">
                      <span className="text-xs font-black text-ink-primary uppercase tracking-tight truncate">{(sel?.name || 'Unknown').toUpperCase()}</span>
                      {(sel?.phone || sel?.address) && (
                        <span className="text-[9px] text-gray-400 font-medium truncate mt-0.5">{sel?.phone || sel?.address}</span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => { setSelectedClientId('WALKIN'); setClientSearch(''); setClientDropOpen(false); }}
                      className="w-6 h-6 rounded-full bg-black/5 flex items-center justify-center text-gray-400 hover:bg-black/10 shrink-0"
                    >
                      <X size={10} />
                    </button>
                  </div>
                );
              })() : (
                /* Search input — always visible when no client selected or editing */
                <div className="relative">
                  <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Type client name to search…"
                    className="w-full bg-white rounded-xl py-3 pl-9 pr-4 border border-black/8 outline-none focus:ring-2 focus:ring-accent-signature/20 text-xs font-semibold text-ink-primary placeholder:text-gray-400 placeholder:font-normal"
                    value={clientSearch}
                    onChange={e => { setClientSearch(e.target.value); setClientDropOpen(true); }}
                    onFocus={() => setClientDropOpen(true)}
                  />
                  {clientSearch && (
                    <button
                      type="button"
                      onClick={() => { setClientSearch(''); setClientDropOpen(false); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
              )}

              {/* Dropdown results */}
              {clientDropOpen && (
                <div className="absolute z-50 bottom-full mb-1 left-0 right-0 bg-white border border-black/10 rounded-xl shadow-xl overflow-hidden">
                  <div className="max-h-52 overflow-y-auto">
                    {/* Walk-in option */}
                    <button
                      type="button"
                      onClick={() => { setSelectedClientId('WALKIN'); setClientDropOpen(false); setClientSearch(''); }}
                      className={`w-full text-left px-4 py-3 text-xs font-bold uppercase tracking-tight flex items-center justify-between hover:bg-canvas transition-colors border-b border-black/5 ${selectedClientId === 'WALKIN' ? 'text-accent-signature bg-accent-signature/5' : 'text-gray-400'}`}
                    >
                      Walk-in / No client
                      {selectedClientId === 'WALKIN' && <Check size={12} />}
                    </button>

                    {/* Filtered clients */}
                    {(clients || [])
                      .filter(c =>
                        !clientSearch ||
                        (c.name || '').toLowerCase().includes(clientSearch.toLowerCase()) ||
                        (c.phone || '').toLowerCase().includes(clientSearch.toLowerCase()) ||
                        (c.address || '').toLowerCase().includes(clientSearch.toLowerCase())
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
                            {(c.phone || c.address) && (
                              <span className="text-[9px] text-gray-400 font-medium truncate mt-0.5">
                                {c.phone || c.address}
                              </span>
                            )}
                          </span>
                          {selectedClientId === c.id && <Check size={12} className="shrink-0 text-accent-signature ml-2" />}
                        </button>
                      ))
                    }

                    {/* Empty state */}
                    {clientSearch && (clients || []).filter(c =>
                      (c.name || '').toLowerCase().includes(clientSearch.toLowerCase()) ||
                      (c.phone || '').toLowerCase().includes(clientSearch.toLowerCase())
                    ).length === 0 && (
                      <div className="px-4 py-5 text-center text-[10px] text-gray-400">No clients match "{clientSearch}"</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="space-y-2 mb-6">
            <div className="flex justify-between text-xs font-bold text-gray-400 uppercase tracking-widest">
              <span>{taxInclusive ? 'Subtotal (excl. tax)' : 'Subtotal'}</span>
              <span>{formatCurrency(taxableAmount)}</span>
            </div>
            <div className="flex justify-between text-xs font-bold text-gray-400 uppercase tracking-widest">
              <span>Tax{taxInclusive ? ' (included)' : ''}</span>
              <span>{formatCurrency(tax)}</span>
            </div>
            <div className="flex justify-between text-xl font-black text-ink-primary pt-2 border-t border-black/5">
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
            {taxInclusive && (
              <p className="text-[10px] text-gray-400 font-medium text-right">
                Listed prices include GST — subtotal shown net of tax.
              </p>
            )}
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
                    <p className="text-xs font-bold leading-snug">
                      Cannot sell below purchase cost. Adjust price for: {belowCostItems.map(i => i.name).join(', ')}.
                    </p>
                  </div>
                )}
                {hasFloorWarn && belowCostItems.length === 0 && (
                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-orange-50 border border-orange-200 text-orange-700 mb-2">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <p className="text-xs font-bold leading-snug">
                      Some items are below your minimum margin floor.
                    </p>
                  </div>
                )}
                <Button
                  disabled={cart.length === 0 || belowCostItems.length > 0}
                  onClick={() => setShowCheckout(true)}
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

      {/* Full-page Checkout */}
      {showCheckout && (
      <div className="fixed inset-0 z-50 bg-canvas flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-4 bg-white border-b border-black/5 shrink-0">
          <button
            onClick={() => setShowCheckout(false)}
            className="flex items-center gap-2 text-xs font-black text-gray-500 hover:text-ink-primary transition-colors"
          >
            <ChevronLeft size={16} /> Back to Cart
          </button>
          <div className="flex-1" />
          <h1 className="text-base font-black font-sora uppercase text-ink-primary">
            Checkout<span className="text-accent-signature">.</span>
          </h1>
          <div className="flex-1" />
          <span className="text-xs font-semibold text-gray-400">{cart.length} item{cart.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6">

            {/* Left: Order Summary */}
            <div className="space-y-4">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Order Summary</p>
              <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
                {cart.map((item, idx) => (
                  <div key={item.productId} className={`flex items-center gap-4 px-5 py-3.5 ${idx !== cart.length - 1 ? 'border-b border-black/5' : ''}`}>
                    <div className="w-8 h-8 rounded-lg bg-white border border-gray-300 shadow-sm flex items-center justify-center shrink-0">
                      <Package size={14} className="text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-ink-primary truncate">{item.name}</div>
                      <div className="text-[10px] text-gray-400 font-medium">{formatCurrency(item.price)} × {item.quantity}</div>
                    </div>
                    <div className="text-sm font-black text-ink-primary tabular-nums shrink-0">
                      {formatCurrency(item.price * item.quantity)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="bg-white rounded-2xl border border-black/5 p-5 space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${taxInclusive ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                    {taxInclusive ? 'TAX INCLUSIVE' : 'TAX EXCLUSIVE'}
                  </span>
                </div>
                <div className="flex justify-between text-xs font-semibold text-gray-500">
                  <span>{taxInclusive ? 'Taxable (extracted)' : 'Subtotal'}</span>
                  <span className="tabular-nums">{formatCurrency(taxableAmount)}</span>
                </div>
                {tax > 0 && (
                  <div className="flex justify-between text-xs font-semibold text-gray-500">
                    <span>GST {taxInclusive ? '(incl.)' : ''}</span><span className="tabular-nums">{formatCurrency(tax)}</span>
                  </div>
                )}
                {deliveryFeeAmt > 0 && (
                  <div className="flex justify-between text-xs font-semibold text-gray-500 items-center">
                    <span className="flex items-center gap-1"><Truck size={11} /> Delivery Fee</span>
                    <span className="tabular-nums">+ {formatCurrency(deliveryFeeAmt)}</span>
                  </div>
                )}
                <div className="border-t border-black/8 pt-2 flex justify-between text-base font-black text-ink-primary">
                  <span>Total</span><span className="tabular-nums">{formatCurrency(total)}</span>
                </div>
              </div>

              {/* Client info summary */}
              {selectedClientId !== 'WALKIN' && (() => {
                const client = clients.find(c => c.id === selectedClientId);
                return client ? (
                  <div className="bg-white rounded-2xl border border-black/5 p-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-accent-signature/10 border border-accent-signature/20 flex items-center justify-center text-sm font-black text-ink-primary shrink-0">
                      {client.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-ink-primary">{client.name}</div>
                      {client.phone && <div className="text-[10px] text-gray-400 font-medium">{client.phone}</div>}
                    </div>
                  </div>
                ) : null;
              })()}
            </div>

            {/* Right: Fulfillment + Payment */}
            <div className="space-y-4">

              {/* Fulfillment */}
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Fulfillment</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'PICKUP',   label: 'Store Pickup', icon: <Store size={20} />,  desc: 'Collect from store' },
                    { key: 'DELIVERY', label: 'Delivery',     icon: <Truck size={20} />,  desc: 'Van delivery' },
                  ].map(({ key, label, icon, desc }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setFulfillmentType(key)}
                      className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${
                        fulfillmentType === key
                          ? 'border-accent-signature bg-accent-signature/5'
                          : 'border-black/8 bg-white hover:border-black/15'
                      }`}
                    >
                      <div className={`p-2 rounded-xl ${fulfillmentType === key ? 'bg-accent-signature text-button-text' : 'bg-canvas text-gray-400'}`}>
                        {icon}
                      </div>
                      <span className="text-xs font-black uppercase tracking-widest">{label}</span>
                      <span className="text-[9px] text-gray-400">{desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Delivery Details */}
              {fulfillmentType === 'DELIVERY' && (
                <div className="bg-white rounded-2xl border border-black/5 p-4 space-y-3">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Delivery Details</p>

                  {/* Address — pre-filled from client, user can pick or override */}
                  <div>
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1.5 flex items-center gap-1">
                      <MapPin size={9} /> Delivery Address
                    </label>
                    {/* Client address shortcut */}
                    {selectedClientId !== 'WALKIN' && (() => {
                      const client = clients.find(c => c.id === selectedClientId);
                      return client?.address && deliveryDetails.address !== client.address ? (
                        <button
                          type="button"
                          onClick={() => setDeliveryDetails(p => ({ ...p, address: client.address }))}
                          className="w-full mb-2 flex items-center gap-2 p-2.5 rounded-xl bg-accent-signature/5 border border-accent-signature/20 text-left hover:bg-accent-signature/10 transition-all"
                        >
                          <MapPin size={11} className="text-accent-signature shrink-0" />
                          <div className="min-w-0">
                            <div className="text-[8px] font-black text-accent-signature uppercase tracking-wider">Use client address</div>
                            <div className="text-[10px] font-semibold text-ink-primary truncate">{client.address}</div>
                          </div>
                          <Check size={11} className="text-accent-signature shrink-0 ml-auto" />
                        </button>
                      ) : null;
                    })()}
                    <textarea
                      rows={2}
                      placeholder="Full delivery address…"
                      value={deliveryDetails.address}
                      onChange={e => setDeliveryDetails(p => ({ ...p, address: e.target.value }))}
                      className="w-full bg-white border border-gray-300 shadow-sm rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-accent-signature/20 resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">Zone / Area</label>
                      <input type="text" placeholder="e.g. North Zone"
                        value={deliveryDetails.zone}
                        onChange={e => setDeliveryDetails(p => ({ ...p, zone: e.target.value }))}
                        className="w-full bg-white border border-gray-300 shadow-sm rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-accent-signature/20"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1.5 flex items-center gap-1"><Calendar size={9} /> Date</label>
                      <input type="date"
                        value={deliveryDetails.date}
                        min={new Date().toISOString().split('T')[0]}
                        onChange={e => setDeliveryDetails(p => ({ ...p, date: e.target.value }))}
                        className="w-full bg-white border border-gray-300 shadow-sm rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-accent-signature/20"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1.5 flex items-center gap-1"><DollarSign size={9} /> Delivery Fee</label>
                      <input type="number" placeholder="0" min="0"
                        value={deliveryDetails.fee}
                        onChange={e => setDeliveryDetails(p => ({ ...p, fee: e.target.value }))}
                        className="w-full bg-white border border-gray-300 shadow-sm rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-accent-signature/20"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1.5 flex items-center gap-1"><MessageSquare size={9} /> Notes</label>
                      <input type="text" placeholder="e.g. Call before"
                        value={deliveryDetails.notes}
                        onChange={e => setDeliveryDetails(p => ({ ...p, notes: e.target.value }))}
                        className="w-full bg-white border border-gray-300 shadow-sm rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-accent-signature/20"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Payment Method */}
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Payment Method</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'CASH', label: 'Cash',          icon: <Banknote size={22} /> },
                    { key: 'CARD', label: 'Card',          icon: <CreditCard size={22} /> },
                    { key: 'UPI',  label: 'UPI',           icon: <Smartphone size={22} /> },
                    { key: 'BANK', label: 'Bank Transfer', icon: <Landmark size={22} /> },
                  ].map(({ key, label, icon }) => (
                    <button key={key} type="button"
                      onClick={() => setPaymentMethod(key)}
                      className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${
                        paymentMethod === key
                          ? 'border-accent-signature bg-accent-signature/5'
                          : 'border-black/8 bg-white hover:border-black/15'
                      }`}
                    >
                      <div className={`p-2 rounded-xl ${paymentMethod === key ? 'bg-accent-signature text-button-text' : 'bg-canvas text-gray-400'}`}>
                        {icon}
                      </div>
                      <span className="text-xs font-black uppercase tracking-widest">{label}</span>
                    </button>
                  ))}

                  {/* Credit — client required */}
                  <button type="button"
                    onClick={() => {
                      if (selectedClientId === 'WALKIN') { addNotification('Select a client before choosing Credit.', 'info'); return; }
                      setPaymentMethod('CREDIT');
                    }}
                    className={`col-span-2 p-4 rounded-2xl border-2 transition-all flex items-center justify-center gap-3 ${
                      selectedClientId === 'WALKIN'
                        ? 'opacity-40 cursor-not-allowed border-black/8 bg-white'
                        : paymentMethod === 'CREDIT'
                        ? 'border-accent-signature bg-accent-signature/5'
                        : 'border-black/8 bg-white hover:border-black/15'
                    }`}
                  >
                    <div className={`p-2 rounded-xl ${paymentMethod === 'CREDIT' ? 'bg-accent-signature text-button-text' : 'bg-canvas text-gray-400'}`}>
                      <CreditCard size={22} />
                    </div>
                    <div className="text-left">
                      <div className="text-xs font-black uppercase tracking-widest">Client Credit</div>
                      {selectedClientId === 'WALKIN' && <div className="text-[9px] text-gray-400">Select a client first</div>}
                    </div>
                  </button>
                </div>
              </div>

              {/* Confirm */}
              <Button
                onClick={handleCompleteSale}
                disabled={isSubmitting || cart.length === 0}
                className="w-full !h-14 !rounded-2xl !text-sm"
                icon={Check}
              >
                {isSubmitting ? 'Processing…' : `Confirm & Pay ${formatCurrency(total)}`}
              </Button>
            </div>
          </div>
        </div>
      </div>
    )}
  </div>
  );
};

export default InvoiceBuilder;
