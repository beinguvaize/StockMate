/**
 * VanSaleBuilder (web redesign, vehicles-17 to 19)
 * Sell from the van's own stock: pick list + cart, checkout, receipt.
 * The cart rules, the credit-needs-a-client guard and the onSubmit call are
 * unchanged; only the layout is new.
 *
 * Props:
 *  vanItems    — [{productId, productName, qty, sellingPrice, costPrice, maxQty}]
 *  route       — active route object (id, vehicleId, location, ...)
 *  vehicle     — {name, plate, plateNumber, type} for the header
 *  driverName  — the trip's driver, for the header
 *  clients     — array of client objects
 *  onSubmit    — async fn({cart, clientId, clientName, paymentMethod, total, subtotal}) → {success, error}
 *  onClose     — fn() to leave
 *  sym         — currency symbol, default '₹'
 */
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useDialogClose } from '../hooks/useDialogClose';
import { Search, X, Check } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import { CREDIT_NEEDS_CLIENT } from '../lib/vanSale';
import { cn } from '../lib/utils';
import { rupees2 } from './estimates/parts';
import WriteFailure from './invoices/WriteFailure';
import { Button } from './ui/button';
import { PAY_LABEL, plural } from '../lib/vehiclesView';
import { BackLink, VehicleIcon, Initials, Stepper, IconBtn, Eyebrow } from './vehicles/parts';

const VanSaleBuilder = ({
  vanItems = [],
  route,
  vehicle,
  driverName,
  clients = [],
  onSubmit,
  onClose,
  sym = '₹',
  pageMode = false,   // true → rendered as its own page (Escape does not leave)
}) => {
  useDialogClose(onClose, { enabled: !pageMode });
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
  const [submitError, setSubmitError] = useState(null);
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
      // Same words as the hook's own guard (lib/vanSale.js), which refuses it
      // too: a credit sale with nobody to owe it is the bug, not an option.
      setSubmitError(new Error(CREDIT_NEEDS_CLIENT));
      addNotification(CREDIT_NEEDS_CLIENT, 'error'); return;
    }
    setSubmitError(null);
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
        setSubmitError(result.error || new Error('Sale failed'));
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
      setSubmitError(err || new Error('Unexpected error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const vanName  = vehicle?.name || 'Van';
  const vanPlate = vehicle?.plate || vehicle?.plateNumber || '';
  const selClient = selectedClientId !== 'WALKIN' ? clients.find(c => c.id === selectedClientId) : null;
  const who = selClient?.name || 'Walk-in';
  const money2 = (n) => rupees2(n, sym);
  const units = cart.reduce((s, i) => s + i.quantity, 0);

  /* ── Receipt (vehicles-19) ─────────────────────────────────────────── */
  if (receipt) {
    return (
      <div className="pb-16">
        <div className="m-rise mx-auto mt-2.5 max-w-[420px] overflow-hidden rounded-[18px] border border-line bg-surface">
          <div className="bg-good-soft px-5 pt-[26px] pb-[22px] text-center">
            <span className="mx-auto mb-2.5 grid h-12 w-12 place-items-center rounded-full bg-good"><Check size={22} strokeWidth={2.6} className="text-white" /></span>
            <span className="text-[12.5px] text-good-text">Van sale recorded</span>
            <b className="block font-tight text-[32px] font-semibold tracking-[-0.02em] tabular-nums">{money2(receipt.total)}</b>
            <span className="text-[12.5px] text-body">{receipt.time} · {vanName}</span>
          </div>
          <div className="px-5 py-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-[9px] text-[13px]">
              <dt className="text-mute">Customer</dt><dd className="text-right font-medium">{receipt.client}</dd>
              <dt className="text-mute">Payment</dt><dd className="text-right font-medium">{PAY_LABEL[receipt.method] || receipt.method}</dd>
            </dl>
            <div className="mt-3 border-t border-sep pt-2.5">
              {receipt.items.map(item => (
                <div key={item.productId} className="flex justify-between gap-3 py-[3px] text-[13px]">
                  <span className="min-w-0 truncate">{item.name} × {item.quantity}</span>
                  <span className="font-tight font-semibold tabular-nums">{money2(item.price * item.quantity)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-2 px-5 pb-5 [&>*]:flex-1">
            <Button variant="secondary" onClick={onClose}>Done</Button>
            <Button onClick={() => { setReceipt(null); }}>New sale</Button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Checkout (vehicles-18) ────────────────────────────────────────── */
  if (showCheckout) {
    const opts = [
      { key: 'CASH', label: 'Cash', sub: "Into the van's cash" },
      { key: 'UPI', label: 'UPI', sub: 'Paid on phone' },
      { key: 'CREDIT', label: 'Client credit', sub: 'Added to what they owe' },
    ];
    return (
      <div className="pb-16">
        <BackLink onClick={() => { setShowCheckout(false); setSubmitError(null); }}>Back to cart</BackLink>
        <div className="m-rise grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="rounded-2xl border border-line bg-surface p-[18px]">
            <h3 className="font-tight text-[16px] font-semibold">Order summary</h3>
            <p className="mt-0.5 mb-2.5 text-[12px] text-mute">{vanName} · {who}</p>
            {cart.map(item => (
              <div key={item.productId} className="flex items-center justify-between gap-3 border-t border-sep py-2.5 text-[13.5px]">
                <div className="min-w-0"><span className="block truncate">{item.name}</span><small className="text-[12px] text-mute tabular-nums">{item.quantity} × {money2(item.price)}</small></div>
                <span className="font-tight font-semibold tabular-nums">{money2(item.price * item.quantity)}</span>
              </div>
            ))}
            <div className="mt-1 flex justify-between border-t border-line pt-3 font-tight text-[15px] font-semibold">
              <span>Total</span><span className="tabular-nums">{money2(total)}</span>
            </div>
          </div>
          <div>
            <div className="rounded-2xl bg-tile px-[18px] py-4">
              <Eyebrow>To collect</Eyebrow>
              <b className="mt-1 block font-tight text-[30px] font-semibold tracking-[-0.02em] tabular-nums">{money2(total)}</b>
              <small className="text-[12.5px] text-body">{who} · {vanName}</small>
            </div>
            <div className="mt-4 mb-2 font-tight text-[13px] font-semibold">Payment method</div>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Payment method">
              {opts.map(o => {
                const dim = o.key === 'CREDIT' && selectedClientId === 'WALKIN';
                const on = paymentMethod === o.key;
                return (
                  <button key={o.key} type="button" data-card role="radio" aria-checked={on} aria-disabled={dim}
                    onClick={() => {
                      if (dim) { addNotification('Select a client before choosing Credit.', 'info'); return; }
                      setPaymentMethod(o.key);
                    }}
                    className={cn('m-press flex flex-col items-start gap-1.5 rounded-[14px] bg-surface p-3.5 text-left',
                      on ? 'shadow-[inset_0_0_0_2px_var(--color-ink)]' : 'shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile',
                      dim && 'cursor-not-allowed opacity-50')}>
                    <b className="font-tight text-[13.5px] font-semibold">{o.label}</b>
                    <small className="text-[12px] text-mute">{o.sub}</small>
                  </button>
                );
              })}
            </div>
            {selectedClientId === 'WALKIN' && <p className="mt-2 text-[12px] text-mute">Client credit needs a client. Pick one on the cart first.</p>}
            {submitError && <WriteFailure error={submitError} noun="van sale" className="mt-3" />}
            <Button size="lg" className="mt-4 w-full" onClick={handleConfirm} disabled={isSubmitting || !cart.length}>
              {isSubmitting ? 'Saving…' : `Confirm sale · ${money2(total)}`}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Pick list + cart (vehicles-17) ────────────────────────────────── */
  const clientList = clients.filter(c => !clientSearch || (c.name || '').toLowerCase().includes(clientSearch.toLowerCase()) || (c.phone || '').toLowerCase().includes(clientSearch.toLowerCase()));
  return (
    <div className="pb-16">
      <BackLink onClick={onClose} />
      <div className="m-rise mb-4 flex items-center gap-3" style={{ '--i': 0 }}>
        <VehicleIcon type={vehicle?.type} />
        <div className="min-w-0">
          <h3 className="font-tight text-[20px] font-semibold leading-tight tracking-[-0.02em]">Van sale · {vanName}</h3>
          <p className="mt-0.5 text-[13px] text-body">{[vanPlate, route?.location, driverName, 'sells only what is on this van'].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
      <div className="m-rise grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_400px]" style={{ '--i': 1 }}>
        <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
          <div className="relative m-3">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mute" size={16} />
            <input ref={searchInputRef} type="text" aria-label="Search products" placeholder="Search products" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="h-10 w-full rounded-pill bg-well pl-10 pr-9 text-[13px] outline-none placeholder:text-mute focus:shadow-[inset_0_0_0_2px_var(--color-ink)]" />
            {searchTerm && <button type="button" aria-label="Clear search" onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-mute hover:text-ink"><X size={14} /></button>}
          </div>
          {filteredProducts.length === 0 && (
            <p className="border-t border-sep px-4 py-12 text-center text-[13px] text-mute">
              {vanItems.length ? `No products match “${searchTerm}”` : <>No stock on van.<br />Load products from Vehicles, Fleet, Load van stock.</>}
            </p>
          )}
          {filteredProducts.map(item => {
            const stock = item.maxQty ?? 0;
            const outOfStock = stock <= 0;
            const inCart = cart.find(c => c.productId === item.productId);
            return (
              <button key={item.productId} type="button" disabled={outOfStock} onClick={() => addToCart(item)}
                className={cn('grid w-full grid-cols-[34px_minmax(0,1fr)_auto_auto] items-center gap-3 border-t border-sep px-4 py-2.5 text-left text-[13px] hover:bg-tile disabled:opacity-45', inCart && 'bg-[#FFFBF4]')}>
                <Initials name={item.productName} />
                <div className="min-w-0"><b className="block truncate font-tight text-[13.5px] font-semibold">{item.productName}</b><small className="text-[12px] text-mute">{outOfStock ? 'None on van' : `${stock} on van`}</small></div>
                <span className="text-right font-tight text-[13.5px] font-semibold tabular-nums">{money2(item.sellingPrice)}</span>
                {inCart ? <span className="grid h-[22px] min-w-6 place-items-center rounded-pill bg-amber px-[7px] font-tight text-[12px] font-semibold text-white tabular-nums">{inCart.quantity}</span> : <span className="w-6" />}
              </button>
            );
          })}
        </div>

        <div className="rounded-[14px] border border-line bg-surface lg:sticky lg:top-4">
          <div className="flex items-center gap-2 px-[18px] pt-4 pb-2.5">
            <h3 className="font-tight text-[16px] font-semibold">Cart</h3><span className="flex-1" />
            <span className="text-[12px] text-mute">{plural(units, 'item')}</span>
          </div>

          <div ref={clientDropRef} className="relative mx-[18px] mb-2.5">
            {selClient && !clientDropOpen ? (
              <div className="flex items-center gap-2.5 rounded-xl bg-tile px-3 py-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber-soft font-tight text-[12px] font-semibold uppercase text-amber-text">{(selClient.name || '?').slice(0, 2)}</span>
                <div className="min-w-0 flex-1"><b className="block truncate font-tight text-[13.5px] font-semibold">{selClient.name}</b><small className="text-[12px] text-mute">Client · type a name to change, or Walk-in</small></div>
                <button type="button" onClick={() => { setClientDropOpen(true); setClientSearch(''); }} className="font-tight text-[12.5px] font-semibold text-amber-text hover:underline underline-offset-4">Change</button>
              </div>
            ) : (
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mute" />
                <input type="text" aria-label="Client" placeholder={selClient ? 'Type a client name' : 'Walk-in · type a client name to change'}
                  className="h-10 w-full rounded-xl bg-tile pl-9 pr-8 text-[13px] outline-none placeholder:text-mute focus:shadow-[inset_0_0_0_2px_var(--color-ink)]"
                  value={clientSearch} onChange={e => { setClientSearch(e.target.value); setClientDropOpen(true); }} onFocus={() => setClientDropOpen(true)} />
                {clientSearch && <button type="button" aria-label="Clear client search" onClick={() => { setClientSearch(''); setClientDropOpen(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-mute hover:text-ink"><X size={12} /></button>}
              </div>
            )}
            {clientDropOpen && (
              <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-xl bg-surface shadow-[0_18px_40px_-18px_rgba(17,20,24,0.45),inset_0_0_0_1px_var(--color-line)]">
                <button type="button" onClick={() => { setSelectedClientId('WALKIN'); setClientDropOpen(false); setClientSearch(''); }}
                  className="flex w-full items-center justify-between border-b border-sep px-3.5 py-2.5 text-left text-[13px] hover:bg-tile">
                  Walk-in / No client{selectedClientId === 'WALKIN' && <Check size={13} className="text-amber-text" />}
                </button>
                {clientList.map(c => (
                  <button key={c.id} type="button" onClick={() => { setSelectedClientId(c.id); setClientDropOpen(false); setClientSearch(''); }}
                    className="flex w-full items-center justify-between gap-2 px-3.5 py-2 text-left hover:bg-tile">
                    <span className="min-w-0"><b className="block truncate font-tight text-[13px] font-semibold">{c.name || 'Unnamed'}</b>{(c.phone || c.address) && <small className="block truncate text-[12px] text-mute">{c.phone || c.address}</small>}</span>
                    {selectedClientId === c.id && <Check size={13} className="shrink-0 text-amber-text" />}
                  </button>
                ))}
                {clientSearch && clientList.length === 0 && <p className="px-3.5 py-4 text-center text-[12.5px] text-mute">No clients match “{clientSearch}”</p>}
              </div>
            )}
          </div>

          {cart.length === 0 && <p className="border-t border-sep px-[18px] py-8 text-center text-[13px] text-mute">Tap products to add them</p>}
          {cart.map(item => (
            <div key={item.productId} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2.5 border-t border-sep px-[18px] py-2.5">
              <div className="min-w-0">
                <b className="block truncate font-tight text-[13.5px] font-semibold">{item.name}</b>
                <small className="flex items-center gap-1 text-[12px] text-mute">
                  <span className="relative inline-flex">
                    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[12px] text-mute">{sym}</span>
                    <input type="number" min="0" step="0.01" aria-label={`Price of ${item.name}`} value={item.price} onChange={e => setItemPrice(item.productId, e.target.value)}
                      className="h-7 w-[84px] rounded-lg bg-surface pl-5 pr-1.5 font-tight text-[12.5px] font-medium text-ink-2 tabular-nums outline-none shadow-[inset_0_0_0_1px_var(--color-line)] focus:shadow-[inset_0_0_0_2px_var(--color-ink)]" />
                  </span>
                  · {getStock(item.productId)} on van
                </small>
              </div>
              <Stepper value={item.quantity} label={item.name} onMinus={() => updateQuantity(item.productId, -1)}
                onPlus={() => addToCart(vanItems.find(v => v.productId === item.productId))} onType={v => setQuantityDirect(item.productId, v)} />
              <div className="flex items-center gap-1.5">
                <span className="min-w-[70px] text-right font-tight text-[14px] font-semibold tabular-nums">{money2(item.price * item.quantity)}</span>
                <IconBtn label={`Remove ${item.name}`} onClick={() => setCart(prev => prev.filter(c => c.productId !== item.productId))} className="h-7 w-7"><X /></IconBtn>
              </div>
            </div>
          ))}

          <div className="border-t border-line px-[18px] pt-3.5 pb-[18px]">
            <div className="mb-1.5 flex justify-between text-[12.5px] text-mute"><span>Subtotal</span><span className="tabular-nums">{money2(subtotal)}</span></div>
            <div className="flex items-baseline justify-between font-tight text-[15px] font-semibold">
              <span>Total</span><span className="text-[24px] tracking-[-0.02em] tabular-nums">{money2(total)}</span>
            </div>
            <p className="mt-1 text-[12px] text-mute">Van sales carry no tax line and no delivery fee</p>
            <Button size="lg" className="mt-3.5 w-full" disabled={!cart.length} onClick={() => setShowCheckout(true)}>Checkout</Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VanSaleBuilder;
