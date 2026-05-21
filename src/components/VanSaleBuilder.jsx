/**
 * VanSaleBuilder
 * Same UI as InvoiceBuilder (POS) but logic deducts from van stock.
 *
 * Props:
 *  vanItems    — [{productId, productName, qty, sellingPrice, costPrice, maxQty}]
 *  route       — active route object (id, vehicleId, _vehicleLocId, ...)
 *  vehicle     — {name, plate, plateNumber} for header
 *  clients     — array of client objects
 *  onSubmit    — async fn({cart, clientId, clientName, paymentMethod, total, subtotal}) → {success, error}
 *  onClose     — fn() to close modal
 *  sym         — currency symbol, default '₹'
 */
import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  ShoppingCart as CartIcon,
  Search, Plus, Minus, Check, ArrowRight,
  Package, X, User, ChevronLeft,
  Banknote, Smartphone, CreditCard,
  CheckCircle2, Truck,
} from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { useNotifications } from '../context/NotificationContext';

const VanSaleBuilder = ({
  vanItems = [],
  route,
  vehicle,
  clients = [],
  onSubmit,
  onClose,
  sym = '₹',
  pageMode = false,   // true → render as full page (no fixed overlay backdrop)
}) => {
  const { addNotification } = useNotifications();

  /* ── Cart state ──────────────────────────────────────────────────────── */
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('WALKIN');
  const [clientSearch, setClientSearch] = useState('');
  const [clientDropOpen, setClientDropOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [showCheckout, setShowCheckout] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [receipt, setReceipt] = useState(null);

  const clientDropRef = useRef(null);
  const searchInputRef = useRef(null);

  useEffect(() => { searchInputRef.current?.focus(); }, []);

  useEffect(() => {
    const handler = (e) => {
      if (clientDropRef.current && !clientDropRef.current.contains(e.target)) setClientDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* Block CREDIT if no client */
  useEffect(() => {
    if (paymentMethod === 'CREDIT' && selectedClientId === 'WALKIN') setPaymentMethod('CASH');
  }, [selectedClientId, paymentMethod]);

  /* ── Van stock map ───────────────────────────────────────────────────── */
  const vanStockMap = useMemo(() => {
    const m = {};
    vanItems.forEach(i => { m[i.productId] = i.maxQty; });
    return m;
  }, [vanItems]);

  /* ── Filtered products ───────────────────────────────────────────────── */
  const filteredProducts = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return vanItems;
    return vanItems.filter(p => (p.productName || '').toLowerCase().includes(q));
  }, [vanItems, searchTerm]);

  /* ── Cart ops ────────────────────────────────────────────────────────── */
  const getStock = (productId) => vanStockMap[productId] ?? 0;

  const addToCart = (item) => {
    const avail = getStock(item.productId);
    setCart(prev => {
      const ex = prev.find(c => c.productId === item.productId);
      if (ex) {
        if (ex.quantity >= avail) {
          addNotification(`Only ${avail} units on van`, 'error');
          return prev;
        }
        return prev.map(c => c.productId === item.productId
          ? { ...c, quantity: c.quantity + 1 } : c);
      }
      if (avail <= 0) { addNotification(`${item.productName} is out of stock`, 'error'); return prev; }
      return [...prev, {
        productId: item.productId,
        name:      item.productName,
        price:     item.sellingPrice,
        quantity:  1,
        taxRate:   0,
      }];
    });
  };

  const updateQuantity = (productId, delta) => {
    const avail = getStock(productId);
    setCart(prev => prev.map(c => {
      if (c.productId !== productId) return c;
      const next = Math.max(0, c.quantity + delta);
      if (next > avail) { addNotification(`Only ${avail} units on van`, 'error'); return c; }
      return { ...c, quantity: next };
    }).filter(c => c.quantity > 0));
  };

  const setQuantityDirect = (productId, val) => {
    const qty = parseInt(val, 10);
    if (isNaN(qty) || qty < 0) return;
    const avail = getStock(productId);
    if (qty === 0) { setCart(prev => prev.filter(c => c.productId !== productId)); return; }
    if (qty > avail) {
      addNotification(`Only ${avail} units on van`, 'error');
      setCart(prev => prev.map(c => c.productId === productId ? { ...c, quantity: avail } : c));
      return;
    }
    setCart(prev => prev.map(c => c.productId === productId ? { ...c, quantity: qty } : c));
  };

  const setItemPrice = (productId, val) => {
    const price = parseFloat(val);
    setCart(prev => prev.map(c =>
      c.productId === productId ? { ...c, price: isNaN(price) ? c.price : price } : c
    ));
  };

  /* ── Totals ──────────────────────────────────────────────────────────── */
  const subtotal = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  const total    = subtotal; // van sales: no tax, no delivery fee

  /* ── Submit ──────────────────────────────────────────────────────────── */
  const handleConfirm = async () => {
    if (isSubmitting) return;
    if (!cart.length) { addNotification('Cart is empty', 'error'); return; }
    if (paymentMethod === 'CREDIT' && selectedClientId === 'WALKIN') {
      addNotification('Credit requires a client', 'error'); return;
    }
    setSubmitError('');
    setIsSubmitting(true);
    try {
      const clientName = selectedClientId === 'WALKIN'
        ? 'Walk-in'
        : (clients.find(c => c.id === selectedClientId)?.name || 'Walk-in');

      const result = await onSubmit({
        cart,
        clientId:      selectedClientId === 'WALKIN' ? null : selectedClientId,
        clientName,
        paymentMethod,
        total,
        subtotal,
      });

      if (result?.success === false) {
        setSubmitError(result.error?.message || result.error?.toString() || 'Sale failed');
        return;
      }

      /* Show receipt */
      setReceipt({
        client:  clientName,
        method:  paymentMethod,
        items:   [...cart],
        total,
        time:    new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
      });
      setCart([]);
      setShowCheckout(false);
    } catch (err) {
      setSubmitError(err?.message || 'Unexpected error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const vanName  = vehicle?.name || 'Van';
  const vanPlate = vehicle?.plate || vehicle?.plateNumber || '';

  /* ══════════════════════════════════════════════════════════════════════
     RECEIPT SCREEN
     ══════════════════════════════════════════════════════════════════════ */
  if (receipt) {
    return (
      <div className="fixed inset-0 z-50 bg-canvas flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-3xl border border-black/8 shadow-2xl overflow-hidden">
          {/* Green success header */}
          <div className="bg-emerald-500 px-6 pt-8 pb-10 text-white text-center relative">
            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 size={30} className="text-white" />
            </div>
            <div className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-1">Van Sale Recorded</div>
            <div className="text-3xl font-black tabular-nums">{formatCurrency(receipt.total)}</div>
            <div className="text-[11px] opacity-60 mt-1">{receipt.time} · {vanName}</div>
          </div>

          {/* Receipt body */}
          <div className="px-6 py-5 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400 font-semibold">Customer</span>
              <span className="font-bold text-ink-primary">{receipt.client}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400 font-semibold">Payment</span>
              <span className="font-black uppercase text-ink-primary">{receipt.method}</span>
            </div>
            <div className="border-t border-black/5 pt-3 space-y-1.5">
              {receipt.items.map(item => (
                <div key={item.productId} className="flex justify-between text-xs">
                  <span className="text-ink-secondary">{item.name} ×{item.quantity}</span>
                  <span className="font-bold tabular-nums text-ink-primary">{formatCurrency(item.price * item.quantity)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="px-6 pb-6 space-y-2">
            <button
              onClick={() => { setReceipt(null); }}
              className="w-full py-3 rounded-2xl bg-emerald-500 text-white font-black text-sm hover:bg-emerald-600 transition-all"
            >
              New Sale
            </button>
            <button
              onClick={onClose}
              className="w-full py-3 rounded-2xl border border-black/8 text-ink-secondary font-semibold text-sm hover:bg-canvas transition-all"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════════════
     CHECKOUT OVERLAY (full-screen, same as InvoiceBuilder)
     ══════════════════════════════════════════════════════════════════════ */
  const CheckoutOverlay = () => (
    <div className="fixed inset-0 z-50 bg-canvas flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 bg-white border-b border-black/5 shrink-0">
        <button
          onClick={() => { setShowCheckout(false); setSubmitError(''); }}
          className="flex items-center gap-2 text-xs font-black text-gray-500 hover:text-ink-primary transition-colors"
        >
          <ChevronLeft size={16} /> Back to Cart
        </button>
        <div className="flex-1" />
        <h1 className="text-base font-black uppercase text-ink-primary">
          Van Sale<span className="text-emerald-500">.</span>
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
                  <div className="w-8 h-8 rounded-lg bg-canvas border border-black/8 flex items-center justify-center shrink-0">
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
            <div className="bg-white rounded-2xl border border-black/5 p-5">
              <div className="flex justify-between text-xs font-semibold text-gray-500 mb-2">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatCurrency(subtotal)}</span>
              </div>
              <div className="border-t border-black/8 pt-2 flex justify-between text-base font-black text-ink-primary">
                <span>Total</span>
                <span className="tabular-nums">{formatCurrency(total)}</span>
              </div>
            </div>

            {/* Van info */}
            <div className="bg-white rounded-2xl border border-black/5 p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                <Truck size={16} className="text-emerald-600" />
              </div>
              <div>
                <div className="text-sm font-bold text-ink-primary">{vanName}</div>
                {vanPlate && <div className="text-[10px] text-gray-400 font-mono">{vanPlate}</div>}
              </div>
              <div className="ml-auto">
                <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                  VAN STOCK
                </span>
              </div>
            </div>

            {/* Client info */}
            {selectedClientId !== 'WALKIN' && (() => {
              const cl = clients.find(c => c.id === selectedClientId);
              return cl ? (
                <div className="bg-white rounded-2xl border border-black/5 p-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-accent-signature/10 border border-accent-signature/20 flex items-center justify-center text-sm font-black text-ink-primary shrink-0">
                    {cl.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-ink-primary">{cl.name}</div>
                    {cl.phone && <div className="text-[10px] text-gray-400">{cl.phone}</div>}
                  </div>
                </div>
              ) : null;
            })()}
          </div>

          {/* Right: Payment */}
          <div className="space-y-4">
            {/* Payment Method */}
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Payment Method</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'CASH', label: 'Cash', icon: <Banknote size={22} /> },
                  { key: 'UPI',  label: 'UPI',  icon: <Smartphone size={22} /> },
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

            {/* Error */}
            {submitError && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700">
                <X size={13} className="shrink-0 mt-0.5" />
                <p className="text-xs font-bold leading-snug">{submitError}</p>
              </div>
            )}

            {/* Confirm */}
            <button
              onClick={handleConfirm}
              disabled={isSubmitting || !cart.length}
              className="w-full h-14 rounded-2xl bg-ink-primary text-white font-black text-sm flex items-center justify-center gap-2 hover:bg-ink-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-xl shadow-ink-primary/20"
            >
              {isSubmitting
                ? <><span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> Processing…</>
                : <><Check size={16} /> Confirm &amp; Pay {formatCurrency(total)}</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  /* ══════════════════════════════════════════════════════════════════════
     MAIN POS UI  (same layout as InvoiceBuilder)
     ══════════════════════════════════════════════════════════════════════ */
  return (
    <>
      {showCheckout && <CheckoutOverlay />}

      <div className={pageMode
        ? "w-full flex items-stretch justify-center"
        : "fixed inset-0 z-40 bg-black/40 backdrop-blur-sm flex items-stretch justify-center"
      }>
        <div className={`bg-canvas flex flex-col ${pageMode ? 'w-full min-h-screen' : 'w-full max-w-6xl h-full'}`}>

          {/* Modal header */}
          <div className="flex items-center gap-4 px-6 py-4 bg-white border-b border-black/5 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center">
                <Truck size={15} className="text-emerald-600" />
              </div>
              <div>
                <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Van Sale</div>
                <div className="text-sm font-black text-ink-primary leading-tight">
                  {vanName}
                  {vanPlate && <span className="ml-2 text-[10px] font-mono text-gray-400">{vanPlate}</span>}
                </div>
              </div>
            </div>
            <div className="flex-1" />
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full border border-black/10 flex items-center justify-center text-gray-400 hover:text-ink-primary hover:border-black/20 transition-all"
            >
              <X size={14} />
            </button>
          </div>

          {/* Body: two-column POS layout */}
          <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">

            {/* ── LEFT: Product list ───────────────────────────────────── */}
            <div className="flex-1 flex flex-col gap-4 overflow-hidden p-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search products…"
                  className="w-full bg-white rounded-2xl py-4 pl-12 pr-4 border border-black/5 outline-none focus:ring-2 focus:ring-accent-signature/20 shadow-sm font-medium"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button onClick={() => setSearchTerm('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Product rows */}
              <div className="flex flex-col gap-px overflow-y-auto pr-1 pb-4">
                {filteredProducts.length === 0 && (
                  <div className="py-16 text-center text-sm text-gray-400">
                    No stock on van.<br />
                    <span className="text-[11px]">Load products via Fleet → Load Van Stock</span>
                  </div>
                )}
                {filteredProducts.map(item => {
                  const stock     = item.maxQty ?? 0;
                  const outOfStock = stock <= 0;
                  const inCart    = cart.find(c => c.productId === item.productId);
                  return (
                    <div
                      key={item.productId}
                      onClick={() => !outOfStock && addToCart(item)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all border group ${
                        outOfStock
                          ? 'opacity-40 cursor-not-allowed border-transparent'
                          : inCart
                          ? 'border-accent-signature/30 bg-accent-signature/5 hover:bg-accent-signature/8'
                          : 'border-transparent bg-white/60 hover:bg-white hover:border-accent-signature/20 hover:shadow-sm'
                      }`}
                    >
                      {/* Thumbnail */}
                      <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 bg-canvas border border-black/5">
                        <span className="text-[11px] font-black text-ink-primary/30 uppercase">
                          {(item.productName || '?').slice(0, 2)}
                        </span>
                      </div>

                      {/* Name */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-ink-primary truncate leading-tight">{item.productName}</div>
                        {inCart && (
                          <div className="text-[10px] text-accent-signature font-bold">{inCart.quantity} in cart</div>
                        )}
                      </div>

                      {/* Price + stock */}
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-black text-ink-primary">{formatCurrency(item.sellingPrice)}</div>
                        <div className={`text-xs font-semibold mt-0.5 ${outOfStock ? 'text-red-400' : 'text-gray-400'}`}>
                          {outOfStock ? 'OUT' : `${stock} avail`}
                        </div>
                      </div>

                      {/* In-cart badge */}
                      {inCart && (
                        <div className="w-5 h-5 rounded-full bg-accent-signature text-button-text text-[9px] font-black flex items-center justify-center shrink-0">
                          {inCart.quantity}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── RIGHT: Cart ──────────────────────────────────────────── */}
            <div className="w-full lg:w-[580px] xl:w-[640px] glass-panel !p-0 flex flex-col overflow-hidden border-l border-black/5 shadow-2xl">

              {/* Cart header */}
              <div className="px-4 py-3 border-b border-black/5 flex justify-between items-center bg-canvas/30">
                <div className="flex items-center gap-2">
                  <CartIcon size={18} className="text-accent-signature" />
                  <h2 className="font-semibold text-sm text-ink-primary">Cart</h2>
                </div>
                <div className="bg-accent-signature text-button-text text-[10px] font-black px-2 py-1 rounded-pill ring-4 ring-accent-signature/10">
                  {cart.reduce((s, i) => s + i.quantity, 0)} items
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

              {/* Cart items */}
              <div className="flex-1 overflow-y-auto">
                {cart.map(item => (
                  <div
                    key={item.productId}
                    className="grid grid-cols-[1fr_90px_80px_64px_20px] gap-2 items-center px-4 py-2.5 border-b border-black/5 last:border-0 hover:bg-canvas/40 transition-colors"
                  >
                    {/* Name */}
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-ink-primary truncate uppercase">{item.name}</div>
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
                        onClick={() => addToCart(vanItems.find(v => v.productId === item.productId))}
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
                        className="w-full pl-4 pr-1 py-1 text-sm font-bold bg-canvas rounded-lg outline-none focus:ring-1 border border-black/8 text-ink-primary focus:ring-accent-signature/30 tabular-nums"
                      />
                    </div>

                    {/* Line total */}
                    <div className="text-sm font-black text-ink-primary tabular-nums text-right">
                      {formatCurrency(item.price * item.quantity)}
                    </div>

                    {/* Remove */}
                    <button
                      onClick={() => setCart(prev => prev.filter(c => c.productId !== item.productId))}
                      className="text-gray-300 hover:text-red-400 transition-colors flex items-center justify-center"
                    >
                      <X size={11} strokeWidth={2.5} />
                    </button>
                  </div>
                ))}

                {cart.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center opacity-30 pointer-events-none p-10 text-center">
                    <Package size={48} className="mb-4" />
                    <div className="text-xs font-bold uppercase tracking-widest">Cart is empty</div>
                  </div>
                )}
              </div>

              {/* Bottom: client + totals + checkout */}
              <div className="p-6 border-t border-black/5 bg-canvas/10">

                {/* Client picker */}
                <div className="mb-4">
                  <label className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
                    <User size={12} /> Client
                  </label>
                  <div ref={clientDropRef} className="relative">
                    {selectedClientId !== 'WALKIN' && !clientDropOpen ? (() => {
                      const sel = clients.find(c => c.id === selectedClientId);
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
                          <button type="button" onClick={() => { setClientSearch(''); setClientDropOpen(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            <X size={11} />
                          </button>
                        )}
                      </div>
                    )}

                    {clientDropOpen && (
                      <div className="absolute z-50 bottom-full mb-1 left-0 right-0 bg-white border border-black/10 rounded-xl shadow-xl overflow-hidden">
                        <div className="max-h-52 overflow-y-auto">
                          <button
                            type="button"
                            onClick={() => { setSelectedClientId('WALKIN'); setClientDropOpen(false); setClientSearch(''); }}
                            className={`w-full text-left px-4 py-3 text-xs font-bold uppercase tracking-tight flex items-center justify-between hover:bg-canvas transition-colors border-b border-black/5 ${selectedClientId === 'WALKIN' ? 'text-accent-signature bg-accent-signature/5' : 'text-gray-400'}`}
                          >
                            Walk-in / No client
                            {selectedClientId === 'WALKIN' && <Check size={12} />}
                          </button>
                          {clients
                            .filter(c => !clientSearch || (c.name || '').toLowerCase().includes(clientSearch.toLowerCase()) || (c.phone || '').toLowerCase().includes(clientSearch.toLowerCase()))
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
                                    <span className="text-[9px] text-gray-400 font-medium truncate mt-0.5">{c.phone || c.address}</span>
                                  )}
                                </span>
                                {selectedClientId === c.id && <Check size={12} className="shrink-0 text-accent-signature ml-2" />}
                              </button>
                            ))
                          }
                          {clientSearch && clients.filter(c => (c.name || '').toLowerCase().includes(clientSearch.toLowerCase())).length === 0 && (
                            <div className="px-4 py-5 text-center text-[10px] text-gray-400">No clients match "{clientSearch}"</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Totals */}
                <div className="space-y-2 mb-6">
                  <div className="flex justify-between text-xs font-bold text-gray-400 uppercase tracking-widest">
                    <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-xl font-black text-ink-primary pt-2 border-t border-black/5">
                    <span>Total</span><span>{formatCurrency(total)}</span>
                  </div>
                </div>

                {/* Checkout button */}
                <button
                  disabled={!cart.length}
                  onClick={() => setShowCheckout(true)}
                  className="w-full h-14 rounded-xl bg-ink-primary text-white font-black text-sm flex items-center justify-center gap-2 hover:bg-ink-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-xl shadow-ink-primary/20"
                >
                  <ArrowRight size={16} /> Checkout
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default VanSaleBuilder;
