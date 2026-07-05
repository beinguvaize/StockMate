import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ShoppingCart as CartIcon, Search, Plus, Minus, CreditCard, Banknote, Check, ArrowRight, Package, X, User, Smartphone, Landmark, AlertTriangle, Truck, Store, ChevronLeft, MapPin, Calendar, MessageSquare, DollarSign, ScanBarcode, List, LayoutGrid } from 'lucide-react';
import Button from '../../../shared/Button';
import { formatCurrency, generateRef } from '../../../lib/utils';
import { tierPrice } from '../../../lib/priceResolver';
import { useAccounts, accountForMethod, buildPaymentMethods } from '../../../hooks/useAccounts';
import { useNotifications } from '../../../context/NotificationContext';
import { supabase, restInsert } from '../../../lib/supabase';
import { QRCodeSVG } from 'qrcode.react';
import CashBillPrint from './CashBillPrint';

// Restaurant modifier picker — choose options for a dish before it hits the cart.
const ModifierSheet = ({ product, onCancel, onConfirm, currencySymbol = '₹' }) => {
  const groups = Array.isArray(product.modifier_groups) ? product.modifier_groups : [];
  const [sel, setSel] = useState({}); // groupId -> { optName: true }

  const toggle = (g, optName) => {
    setSel(prev => {
      const cur = prev[g.id] || {};
      if (g.multi) return { ...prev, [g.id]: { ...cur, [optName]: !cur[optName] } };
      return { ...prev, [g.id]: { [optName]: true } }; // single-choice
    });
  };

  const chosen = [];
  groups.forEach(g => {
    (g.options || []).forEach(o => { if (sel[g.id]?.[o.name]) chosen.push({ name: o.name, price: Number(o.price) || 0, group: g.name }); });
  });
  const addPrice = chosen.reduce((s, o) => s + o.price, 0);
  const total = (Number(product.sellingPrice) || 0) + addPrice;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-black/5 shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/5">
          <div>
            <h3 className="text-base font-extrabold text-ink-primary">{product.name}</h3>
            <p className="text-[11px] text-gray-400">Choose options</p>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-ink-primary"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          {groups.map(g => (
            <div key={g.id}>
              <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-2">
                {g.name} {g.multi && <span className="text-gray-400 font-normal normal-case">· choose any</span>}
              </div>
              <div className="space-y-1.5">
                {(g.options || []).map(o => {
                  const on = !!sel[g.id]?.[o.name];
                  return (
                    <button key={o.name} type="button" onClick={() => toggle(g, o.name)}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-sm transition-all ${
                        on ? 'border-amber-500 bg-amber-50' : 'border-black/10 hover:border-black/20'
                      }`}>
                      <span className="font-semibold text-ink-primary">{o.name}</span>
                      <span className="font-mono text-xs text-gray-500">{o.price > 0 ? `+${currencySymbol}${o.price}` : '—'}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-black/5">
          <button onClick={() => onConfirm(chosen)}
            className="w-full h-11 rounded-xl bg-amber-600 text-white text-sm font-bold hover:bg-amber-700 transition-all flex items-center justify-center gap-2">
            Add · <span className="font-mono">{currencySymbol}{total}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

const InvoiceBuilder = ({ products, inventoryBalances = [], clients, onPlaceSale, currentTenantId, taxMode = 'EXCLUSIVE', businessProfile = null, topSellingIds = [], stores = [],
  // Table POS (restaurant) — bind this builder to a table's running tab.
  initialCart = null, onCartChange = null, tableLabel = null, onSendKOT = null, businessType = null,
  editId = null, editMeta = null, onEditDone = null, onRecordPayment = null }) => {
  const taxInclusive = taxMode === 'INCLUSIVE';
  // Restaurant dishes aren't unit-stocked at the POS (recipe deduction is R5),
  // so don't gate adding a dish on warehouse stock.
  const isRestoPOS = businessType === 'RESTAURANT';
  // Services + restaurant sell from a catalog without unit stock.
  const noStockGate = isRestoPOS || businessType === 'SERVICES';
  const { addNotification } = useNotifications();
  const [cart, setCart] = useState(() => (Array.isArray(initialCart) ? initialCart : []));
  // Bound to a table tab → persist cart changes back to the open tab.
  useEffect(() => {
    if (onCartChange) onCartChange(cart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('WALKIN');
  const [outstandingPrompt, setOutstandingPrompt] = useState(null); // { clientId, clientName, outstanding, excess, paymentMethod }
  const [printSale, setPrintSale] = useState(null); // completed-sale snapshot for the receipt
  const [showCheckout, setShowCheckout] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paymentAccountId, setPaymentAccountId] = useState(null); // specific account from dynamic button

  // Cash & Bank accounts — money received at checkout posts to one of these.
  const { accounts = [], addTxn: addAccountTxn } = useAccounts(currentTenantId);
  const payMethods = useMemo(() => buildPaymentMethods(accounts), [accounts]);
  // Type-based payment groups — one pill per type, sub-selector for multiple accounts.
  const typeGroups = useMemo(() => {
    const live = accounts.filter(a => !a.deleted_at && a.type !== 'LOAN');
    return ['CASH', 'UPI', 'BANK', 'CARD']
      .map(t => {
        const accs = live.filter(a => a.type === t);
        if (!accs.length) return null;
        const defaultAcc = accs.find(a => a.is_default) || accs[0];
        return { type: t, accs, defaultAcc };
      })
      .filter(Boolean);
  }, [accounts]);
  // Use specific account chosen by cashier; fall back to method-based auto-pick.
  const depAcc = paymentAccountId
    ? accountForMethod(accounts, paymentAccountId)
    : accountForMethod(accounts, paymentMethod);

  // Edit mode — prefill client + payment + paid amount from the sale being
  // edited so the saved status reflects reality. Without this, a blank
  // "amount received" + CASH defaults to fully-paid, so a Paid sale could
  // never be edited down to Pending. Prefilling lets the cashier lower it.
  useEffect(() => {
    if (!editId || !editMeta) return;
    setSelectedClientId(editMeta.clientId || 'WALKIN');
    setPaymentMethod(editMeta.paymentMethod || 'CASH');
    const paid = Number(editMeta.paidAmount ?? 0);
    const tot  = Number(editMeta.totalAmount ?? 0);
    // Blank == full for non-credit sales; show the real paid figure otherwise
    // (0 when fully on credit) so the status round-trips correctly.
    if ((editMeta.paymentMethod || 'CASH') !== 'CREDIT' && paid >= tot && tot > 0) {
      setAmountReceived('');
    } else {
      setAmountReceived(String(paid));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  // POS product view ('list' | 'grid') — persisted per device so the
  // cashier's choice survives a refresh.
  const [viewMode, setViewMode] = useState(() => {
    try { return localStorage.getItem('pos_view_mode') === 'grid' ? 'grid' : 'list'; }
    catch { return 'list'; }
  });
  useEffect(() => {
    try { localStorage.setItem('pos_view_mode', viewMode); } catch { /* ignore */ }
  }, [viewMode]);
  // Store the sale is rung at (multi-store). Persisted per device.
  const [storeId, setStoreId] = useState(() => {
    try { return localStorage.getItem('pos_store_id') || ''; } catch { return ''; }
  });
  useEffect(() => {
    if (stores.length && !stores.some(s => s.id === storeId)) setStoreId(stores[0].id);
  }, [stores]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    try { if (storeId) localStorage.setItem('pos_store_id', storeId); } catch { /* ignore */ }
  }, [storeId]);
  // Cashier-entered "Amount Received". Empty = method default (full pay
  // for CASH/UPI/BANK, 0 for CREDIT). > total → Change due. < total
  // with registered client → Balance to outstanding ledger.
  const [amountReceived, setAmountReceived] = useState('');
  // Order-level discount (flat amount). Subtracted from the gross total.
  const [discount, setDiscount] = useState('');
  const [serviceChargePct, setServiceChargePct] = useState(0); // restaurant service charge %
  const [splitN, setSplitN] = useState(1); // split bill N ways (display aid)
  // Parked/held sales — persisted per device so a half-rung sale survives.
  const [parked, setParked] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pos_parked') || '[]'); } catch { return []; }
  });
  const persistParked = (list) => {
    setParked(list);
    try { localStorage.setItem('pos_parked', JSON.stringify(list)); } catch { /* ignore */ }
  };
  const [fulfillmentType, setFulfillmentType] = useState('PICKUP'); // PICKUP | DELIVERY
  const [deliveryDetails, setDeliveryDetails] = useState({
    address: '', zone: '', date: '', notes: '', fee: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clientSearch, setClientSearch]     = useState('');
  const [clientDropOpen, setClientDropOpen] = useState(false);
  const clientDropRef = useRef(null);

  // Quick add-customer at POS. Retail shops sell to walk-in individuals who
  // aren't in the client list yet — capture name + phone (+ optional Aadhaar
  // for individuals, or GSTIN for a business) without leaving the sale.
  // New clients are appended locally so they're immediately selectable; the
  // parent's next fetch reconciles them.
  const [addedClients, setAddedClients] = useState([]);
  const allClients = useMemo(() => ([...(clients || []), ...addedClients]), [clients, addedClients]);
  const [showAddCust, setShowAddCust] = useState(false);
  const [savingCust, setSavingCust] = useState(false);
  const [newCust, setNewCust] = useState({ type: 'B2C', name: '', phone: '', aadhaar: '', gstin: '' });

  const saveNewCustomer = async () => {
    const name = newCust.name.trim();
    const phone = newCust.phone.trim();
    if (!name) { addNotification('Customer name required', 'error'); return; }
    if (!phone) { addNotification('Phone number required', 'error'); return; }
    if (newCust.type === 'B2B' && newCust.gstin.trim() && newCust.gstin.trim().length !== 15) {
      addNotification('GSTIN must be 15 characters', 'error'); return;
    }
    if (newCust.type === 'B2C' && newCust.aadhaar.trim() && newCust.aadhaar.replace(/\s/g, '').length !== 12) {
      addNotification('Aadhaar must be 12 digits', 'error'); return;
    }
    setSavingCust(true);
    const id = 'CLI-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
    const row = {
      id, tenant_id: currentTenantId,
      name, phone,
      client_type: newCust.type,
      gstin: newCust.type === 'B2B' ? (newCust.gstin.trim() || null) : null,
      gst_no: newCust.type === 'B2B' ? (newCust.gstin.trim() || null) : null,
      aadhaar: newCust.type === 'B2C' ? (newCust.aadhaar.replace(/\s/g, '').trim() || null) : null,
      outstanding_balance: 0,
    };
    const { error } = await restInsert('clients', row);
    setSavingCust(false);
    if (error) { addNotification('Could not add customer: ' + error.message, 'error'); return; }
    setAddedClients(prev => [...prev, row]);
    setSelectedClientId(id);
    setShowAddCust(false);
    setClientDropOpen(false);
    setClientSearch('');
    setNewCust({ type: 'B2C', name: '', phone: '', aadhaar: '', gstin: '' });
    addNotification('Customer added', 'success');
  };

  // IMEI / serial capture. Products flagged track_serial (phones, electronics)
  // require the unit serial(s) at point of sale. Captured per cart line, one
  // per unit, stored on the sale item + written to serial_numbers as SOLD.
  const productById = useMemo(
    () => Object.fromEntries((products || []).map(p => [p.id, p])),
    [products]
  );
  const serialLines = useMemo(
    () => cart.filter(l => productById[l.productId]?.track_serial),
    [cart, productById]
  );
  const [lineImeis, setLineImeis] = useState({}); // uid -> string[]
  const setImei = (uid, idx, val) =>
    setLineImeis(m => {
      const arr = [...(m[uid] || [])];
      arr[idx] = val;
      return { ...m, [uid]: arr };
    });
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
  // FEFO next-batch cost + nearest expiry per product (pharmacy).
  const [fifoCosts, setFifoCosts] = useState({});
  const [batchExpiry, setBatchExpiry] = useState({}); // product_id -> 'YYYY-MM-DD' (earliest)

  useEffect(() => {
    if (!currentTenantId || !products.length) return;
    supabase
      .from('product_batches')
      .select('product_id, unit_cost, qty_remaining, received_date, created_at, expiry_date')
      .in('product_id', products.map(p => p.id))
      .gt('qty_remaining', 0)
      .order('expiry_date', { ascending: true, nullsFirst: false })
      .order('received_date', { ascending: true })
      .then(({ data }) => {
        if (!data) return;
        const costs = {}, exp = {};
        data.forEach(b => {
          // First row per product = FEFO (earliest expiry) batch → its cost + expiry.
          if (!costs[b.product_id]) costs[b.product_id] = Number(b.unit_cost);
          if (!exp[b.product_id] && b.expiry_date) exp[b.product_id] = b.expiry_date;
        });
        setFifoCosts(costs);
        setBatchExpiry(exp);
      });
  }, [currentTenantId, products]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const isExpired = (pid) => batchExpiry[pid] && batchExpiry[pid] < todayStr;
  const isNearExpiry = (pid) => {
    const d = batchExpiry[pid];
    if (!d) return false;
    const days = (new Date(d) - new Date(todayStr)) / 86400000;
    return days >= 0 && days <= 30;
  };

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

  // Category quick-filter for the product list.
  const productCategories = useMemo(() => {
    const set = new Set();
    products.forEach(p => { if (p.product_type !== 'RAW' && p.category) set.add(p.category); });
    return Array.from(set).sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    // RAW materials are consume-only (manufacturing) — never sold at POS.
    let sellable = products.filter(p => p.product_type !== 'RAW');
    if (categoryFilter !== 'ALL') sellable = sellable.filter(p => p.category === categoryFilter);
    const q = searchTerm.toLowerCase().trim();
    if (!q) return sellable;
    return sellable.filter(p =>
      (p.name    || '').toLowerCase().includes(q) ||
      (p.sku     || '').toLowerCase().includes(q) ||
      (p.barcode || '').toLowerCase().includes(q)
    );
  }, [products, searchTerm, categoryFilter]);

  // Quick-add tiles = fast-moving products. Rank by recent sales volume
  // (topSellingIds from the parent); fall back to catalogue order for any
  // remaining slots so there are always tiles even before sales history.
  const quickAddProducts = useMemo(() => {
    const inStock = (p) => p.product_type !== 'RAW' && (p.product_type === 'SERVICE' || (warehouseStock[p.id] ?? p.stock ?? 0) > 0);
    const byId = new Map(products.map(p => [p.id, p]));
    const ranked = topSellingIds
      .map(id => byId.get(id))
      .filter(p => p && inStock(p));
    const seen = new Set(ranked.map(p => p.id));
    const filler = products.filter(p => inStock(p) && !seen.has(p.id));
    return [...ranked, ...filler].slice(0, 6);
  }, [products, warehouseStock, topSellingIds]);

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

  // Editing a sale: its original quantities are still deducted from current
  // stock. edit_sale reverses them before re-applying, so the effective
  // availability is current stock + what this sale already took. Credit it
  // back here, else editing fails even with no quantity change.
  const editStockCredit = useMemo(() => {
    if (!editId || !Array.isArray(initialCart)) return {};
    const m = {};
    initialCart.forEach(it => {
      const pid = it.productId || it.id;
      if (pid) m[pid] = (m[pid] || 0) + (Number(it.quantity) || 0);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  const getAvailableStock = (productId) => {
    if (noStockGate) return Infinity;
    // Services (labor/repair) carry no inventory — always sellable.
    if (productById[productId]?.product_type === 'SERVICE') return Infinity;
    const base = warehouseStock[productId] !== undefined
      ? warehouseStock[productId]
      : (products.find(p => p.id === productId)?.stock ?? 0);
    return base + (editStockCredit[productId] || 0);
  };

  // Modifier picker (restaurant) — set when a dish with modifier groups is tapped.
  const [modPicker, setModPicker] = useState(null); // { product }

  // Cart lines are keyed by uid so the same dish with different modifier
  // combos lives on separate lines (and identical combos stack).
  const lineUid = (productId, modLabel) => modLabel ? `${productId}#${modLabel}` : productId;

  const addToCart = (product, mods) => {
    const groups = Array.isArray(product.modifier_groups) ? product.modifier_groups : [];
    // Open the picker for dishes with modifiers (unless options already chosen).
    if (mods === undefined && groups.length > 0) { setModPicker({ product }); return; }
    // Pharmacy: refuse to sell stock whose earliest (FEFO) batch is expired.
    if (isExpired(product.id)) {
      addNotification(`${product.name}: stock expired (${batchExpiry[product.id]}) — cannot sell`, 'error');
      return;
    }
    const chosen = mods || [];
    const addPrice = chosen.reduce((s, o) => s + (Number(o.price) || 0), 0);
    const modLabel = chosen.map(o => o.name).join(', ') || null;
    // Price by the selected client's tier (walk-in → retail).
    const tier = allClients.find(c => c.id === selectedClientId)?.price_tier;
    const base = tierPrice(product, tier);
    const uid = lineUid(product.id, modLabel);
    const available = getAvailableStock(product.id);
    lastAddedRef.current = product.id;
    setAddTick(t => t + 1);
    setCart(prev => {
      const existing = prev.find(item => item.uid === uid);
      if (existing) {
        if (existing.quantity >= available) {
          addNotification(`Only ${available} units in stock`, 'error');
          return prev;
        }
        return prev.map(item => item.uid === uid
          ? { ...item, quantity: item.quantity + 1 }
          : item
        );
      }
      if (available <= 0) {
        addNotification(`${product.name} is out of stock`, 'error');
        return prev;
      }
      return [...prev, {
        uid,
        productId: product.id,
        name: product.name,
        basePrice: base,
        price: (Number(base) || 0) + addPrice,
        quantity: 1,
        taxRate: product.taxRate || 0,
        cess: Number(product.cess_rate ?? product.cess ?? 0),
        hsn_code: product.hsn_code || product.hsn || '',
        modifiers: chosen,
        modLabel,
      }];
    });
  };

  // Cart-mutation handlers key by uid (falling back to productId for any
  // legacy/parked line that predates uids).
  const keyOf = (i) => i.uid || i.productId;
  const updateQuantity = (uid, delta) => {
    setCart(prev => prev.map(item => {
      if (keyOf(item) === uid) {
        const available = getAvailableStock(item.productId);
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

  const setQuantityDirect = (uid, val) => {
    const qty = parseInt(val, 10);
    if (isNaN(qty) || qty < 0) return;
    if (qty === 0) {
      setCart(prev => prev.filter(i => keyOf(i) !== uid));
    } else {
      setCart(prev => prev.map(i => {
        if (keyOf(i) !== uid) return i;
        const available = getAvailableStock(i.productId);
        if (qty > available) {
          addNotification(`Only ${available} units in stock`, 'error');
          return { ...i, quantity: available };
        }
        return { ...i, quantity: qty };
      }));
    }
  };

  const setItemPrice = (uid, val) => {
    const price = parseFloat(val);
    setCart(prev => prev.map(i =>
      keyOf(i) === uid ? { ...i, price: isNaN(price) ? i.price : price } : i
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
  // Restaurant service charge — % of subtotal (before discount).
  const serviceChargeAmt = isRestoPOS ? subtotal * ((Number(serviceChargePct) || 0) / 100) : 0;
  const grossTotal = (taxInclusive ? subtotal + deliveryFeeAmt : subtotal + tax + deliveryFeeAmt) + serviceChargeAmt;
  // Flat order discount, clamped to [0, grossTotal].
  const discountAmt = Math.min(Math.max(parseFloat(discount) || 0, 0), grossTotal);
  const total = grossTotal - discountAmt;

  // Park the current cart (hold sale) and start fresh.
  const holdSale = () => {
    if (!cart.length) { addNotification('Cart is empty', 'error'); return; }
    const entry = {
      id: generateRef('HOLD'),
      label: (cart[0]?.name || 'Sale') + (cart.length > 1 ? ` +${cart.length - 1}` : ''),
      cart, selectedClientId, discount, ts: Date.now(),
    };
    persistParked([entry, ...parked].slice(0, 20));
    setCart([]); setDiscount(''); setSelectedClientId('WALKIN'); setAmountReceived('');
    addNotification('Sale held', 'success');
  };
  const resumeSale = (entry) => {
    if (cart.length) { holdSale(); } // park current before swapping
    setCart(entry.cart || []);
    setSelectedClientId(entry.selectedClientId || 'WALKIN');
    setDiscount(entry.discount || '');
    persistParked(parked.filter(p => p.id !== entry.id));
  };

  // KOT (restaurant table mode): items not yet fired to the kitchen.
  const unsentKOT = useMemo(() => cart.map(line => {
    const pending = (Number(line.quantity) || 0) - (Number(line.kotSent) || 0);
    if (pending <= 0) return null;
    const prod = products.find(p => p.id === line.productId) || {};
    return { name: line.name, quantity: pending, station: prod.station || null, food_type: prod.food_type || null, notes: line.modLabel || line.notes || null };
  }).filter(Boolean), [cart, products]);
  const unsentKOTCount = unsentKOT.reduce((s, i) => s + i.quantity, 0);

  const handleSendKOT = async () => {
    if (!onSendKOT || unsentKOT.length === 0) return;
    const ok = await onSendKOT(unsentKOT);
    if (ok !== false) {
      // Mark each line fully fired so the next KOT only carries new additions.
      setCart(prev => prev.map(l => ({ ...l, kotSent: Number(l.quantity) || 0 })));
    }
  };

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
    const client = allClients.find(c => c.id === selectedClientId);
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
    // Serial pre-flight — every serialized unit needs an IMEI/serial.
    const missingSerial = serialLines.filter(l => {
      const filled = (lineImeis[l.uid] || []).filter(s => s && s.trim()).length;
      return filled < l.quantity;
    });
    if (missingSerial.length > 0) {
      addNotification(`Enter IMEI/serial for: ${missingSerial.map(l => l.name).join(', ')}`, 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      const isCreditSale = paymentMethod === 'CREDIT';
      // Resolve effective paid amount + payment status from cashier input.
      const explicitPaid = amountReceived.trim() === ''
        ? null
        : Math.max(0, parseFloat(amountReceived) || 0);
      let resolvedPaid;
      let resolvedStatus;
      if (explicitPaid !== null) {
        resolvedPaid   = Math.min(explicitPaid, total); // cap, change is cash
        resolvedStatus = resolvedPaid >= total ? 'COMPLETED'
                       : resolvedPaid > 0       ? 'PARTIAL'
                                                : 'PENDING';
      } else {
        resolvedPaid   = isCreditSale ? 0 : total;
        resolvedStatus = isCreditSale ? 'PENDING' : 'COMPLETED';
      }
      const saleId = editId || generateRef('SAL');
      // Attach captured serials to their line so they print on the bill and
      // persist in sale.items (no app release needed for the receipt to show them).
      const itemsWithSerials = cart.map(l =>
        productById[l.productId]?.track_serial
          ? { ...l, imeis: (lineImeis[l.uid] || []).map(s => s.trim()).filter(Boolean) }
          : l
      );
      const saleData = {
        id: saleId,
        clientId: selectedClientId,
        items: itemsWithSerials,
        totalAmount: total,
        subtotal: taxableAmount,
        tax: Math.round(tax * 100) / 100,
        tax_mode: taxMode,
        paidAmount: resolvedPaid,
        paymentMethod,
        status: resolvedStatus,
        fulfillmentType,
        deliveryAddress: deliveryDetails.address || null,
        deliveryZone:    deliveryDetails.zone    || null,
        deliveryDate:    deliveryDetails.date    || null,
        deliveryNotes:   deliveryDetails.notes   || null,
        deliveryFee:     parseFloat(deliveryDetails.fee) || 0,
        locationId:      storeId || null,
        discount:        discountAmt,
        serviceCharge:   serviceChargeAmt,
        // Preserve original sale date on edit; omit for new sales (RPC defaults to today).
        date: editId ? (editMeta?.date || null) : null,
      };
      const result = await onPlaceSale(saleData);
      if (result && result.error) {
        const msg = result.error.message || 'Sale could not be recorded';
        addNotification(`Checkout failed: ${msg}`, 'error');
        return; // keep cart + modal so user can retry
      }
      // Money received → the DB trigger trg_sales_post_ledger posts the
      // account_transactions IN entry server-side now (idempotent on sale id),
      // so web, desktop AND mobile sales all hit Cash & Bank identically.
      // No client-side posting — doing both double-counted the sale.
      // Persist sold serials (non-fatal — the sale itself already succeeded).
      if (serialLines.length > 0) {
        try {
          const serialRows = [];
          serialLines.forEach(l =>
            (lineImeis[l.uid] || []).map(s => s.trim()).filter(Boolean).forEach(serial =>
              serialRows.push({
                id: 'SN-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
                tenant_id: currentTenantId,
                product_id: l.productId,
                serial,
                status: 'SOLD',
                sale_id: result.id || saleId,
              })
            )
          );
          if (serialRows.length) {
            const { error: snErr } = await restInsert('serial_numbers', serialRows);
            if (snErr) addNotification('Sale saved, but serials not logged: ' + snErr.message, 'error');
          }
        } catch (snEx) {
          addNotification('Sale saved, but serials not logged: ' + (snEx.message || snEx), 'error');
        }
      }
      addNotification(
        editId
          ? `Sale updated: ${formatCurrency(total)}`
          : fulfillmentType === 'DELIVERY'
            ? `Sale recorded — added to delivery queue.`
            : `Sale recorded: ${formatCurrency(total)}`,
        'success'
      );

      // Receipt snapshot — captured before the cart resets so the cashier
      // can print an 80mm bill for the sale that just completed.
      if (!editId) {
        setPrintSale({
          id: saleId,
          items: cart.map(i => ({ name: i.name, quantity: i.quantity, price: i.price })),
          totalAmount: total,
          date: new Date().toISOString(),
          paymentMethod,
        });
      }

      // Capture before state reset — needed for outstanding prompt.
      const postClientId      = selectedClientId;
      const postPaymentMethod = paymentMethod;
      const postClient        = allClients.find(c => c.id === postClientId);
      const postOutstanding   = Number(postClient?.outstanding_balance || 0);
      const amtNum            = parseFloat(amountReceived) || 0;
      // Excess = amount tendered beyond this bill, capped at what client owes.
      const excessApplicable  = postClientId !== 'WALKIN' && amtNum > total && postOutstanding > 0
        ? Math.min(amtNum - total, postOutstanding) : 0;

      setLineImeis({});
      setCart([]);
      setDiscount('');
      setServiceChargePct(0);
      setSplitN(1);
      setAmountReceived('');
      setFulfillmentType('PICKUP');
      setDeliveryDetails({ address: '', zone: '', date: '', notes: '', fee: '' });
      setSelectedClientId('WALKIN');
      setPaymentMethod('CASH');
      setPaymentAccountId(null);
      setShowCheckout(false);
      if (editId) onEditDone?.();

      // Show outstanding collection prompt for named clients with a balance.
      if (!editId && onRecordPayment && postClientId !== 'WALKIN' && postOutstanding > 0 && postClient) {
        setOutstandingPrompt({
          clientId:      postClientId,
          clientName:    postClient.name || 'Client',
          outstanding:   postOutstanding,
          excess:        excessApplicable,
          paymentMethod: postPaymentMethod,
        });
      }
    } catch (err) {
      addNotification(`Checkout error: ${err.message || err}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
    {outstandingPrompt && (
      <OutstandingPromptModal
        {...outstandingPrompt}
        currency={businessProfile?.currencySymbol || '₹'}
        onRecordPayment={onRecordPayment}
        onClose={() => setOutstandingPrompt(null)}
      />
    )}
    {/* Post-sale receipt — waits until the outstanding prompt (if any) is done */}
    {printSale && !outstandingPrompt && (
      <CashBillPrint
        sale={printSale}
        business={businessProfile || {}}
        currencySymbol={businessProfile?.currencySymbol || '₹'}
        onClose={() => setPrintSale(null)}
      />
    )}
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-130px)]">
      {/* Modifier picker (restaurant) */}
      {modPicker && (
        <ModifierSheet
          product={modPicker.product}
          currencySymbol={businessProfile?.currencySymbol || '₹'}
          onCancel={() => setModPicker(null)}
          onConfirm={(chosen) => { addToCart(modPicker.product, chosen); setModPicker(null); }}
        />
      )}
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

        {/* Category chips + list/grid toggle */}
        <div className="flex items-center gap-2 shrink-0">
          {productCategories.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mb-1 flex-1">
              <button
                onClick={() => setCategoryFilter('ALL')}
                className={`px-3 py-1.5 rounded-pill text-[11px] font-bold whitespace-nowrap transition-colors ${categoryFilter === 'ALL' ? 'bg-amber-600 text-white' : 'bg-white border border-black/8 text-gray-600 hover:text-ink-primary'}`}
              >All</button>
              {productCategories.map(c => (
                <button
                  key={c}
                  onClick={() => setCategoryFilter(c === categoryFilter ? 'ALL' : c)}
                  className={`px-3 py-1.5 rounded-pill text-[11px] font-bold whitespace-nowrap transition-colors ${categoryFilter === c ? 'bg-amber-600 text-white' : 'bg-white border border-black/8 text-gray-600 hover:text-ink-primary'}`}
                >{c}</button>
              ))}
            </div>
          )}
          <div className="flex items-center bg-white border border-black/8 rounded-lg p-0.5 shrink-0 ml-auto">
            <button onClick={() => setViewMode('list')} aria-label="List view"
              className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${viewMode === 'list' ? 'bg-ink-primary text-white' : 'text-gray-400 hover:text-ink-primary'}`}>
              <List size={15} />
            </button>
            <button onClick={() => setViewMode('grid')} aria-label="Grid view"
              className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${viewMode === 'grid' ? 'bg-ink-primary text-white' : 'text-gray-400 hover:text-ink-primary'}`}>
              <LayoutGrid size={15} />
            </button>
          </div>
        </div>

        {/* GRID view — product cards with quick-add ×1/×5/×10. */}
        {viewMode === 'grid' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 overflow-y-auto pr-1 pb-4 content-start">
          {filteredProducts.map(product => {
            const ms = marginStatus[product.id] || {};
            const stock = warehouseStock[product.id] !== undefined ? warehouseStock[product.id] : product.stock;
            const isSvc = product.product_type === 'SERVICE';
            const outOfStock = !isSvc && stock <= 0;
            const lowStock = !outOfStock && stock <= (product.lowStockThreshold || 10);
            const inCart = cart.find(i => i.productId === product.id);
            const cartQty = inCart ? inCart.quantity : 0;
            return (
            <div key={product.id}
              className={`relative rounded-2xl border p-3 flex flex-col transition-all ${
                outOfStock ? 'opacity-40 border-transparent bg-white/60' :
                inCart ? 'border-accent-signature/40 bg-accent-signature/5' :
                'border-black/8 bg-white hover:border-accent-signature/30 hover:shadow-sm'
              }`}>
              {cartQty > 0 && (
                <span className="absolute top-2 right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-accent-signature text-button-text text-[9px] font-black flex items-center justify-center shadow ring-2 ring-white">{cartQty}</span>
              )}
              <div className="w-10 h-10 rounded-lg overflow-hidden bg-white border border-gray-200 flex items-center justify-center mb-2">
                {product.image
                  ? <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                  : <span className="text-xs font-black text-ink-primary/30 uppercase">{(product.name||'?').slice(0,2)}</span>}
              </div>
              <div className="text-sm font-bold text-ink-primary leading-tight line-clamp-2 mb-1">{product.name}</div>
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`font-mono text-sm font-bold tabular-nums ${ms.isLoss ? 'text-red-500' : 'text-ink-primary'}`}>{formatCurrency(product.sellingPrice)}</span>
                {product.taxRate > 0 && <span className="text-[9px] font-black px-1 rounded bg-blue-50 text-blue-500">{product.taxRate}%</span>}
              </div>
              <div className={`text-[11px] font-semibold mb-2 ${isSvc ? 'text-violet-500' : outOfStock ? 'text-red-400' : lowStock ? 'text-amber-500' : 'text-gray-400'}`}>
                {isSvc ? 'SERVICE' : outOfStock ? 'OUT OF STOCK' : lowStock ? `${stock} stk · low` : `${stock} stk`}
              </div>
              {isExpired(product.id) ? (
                <div className="text-[9px] font-black px-1.5 py-0.5 rounded bg-red-50 text-red-600 mb-1 inline-block">EXPIRED {batchExpiry[product.id]}</div>
              ) : isNearExpiry(product.id) ? (
                <div className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 mb-1 inline-block">EXP {batchExpiry[product.id]}</div>
              ) : null}
              {!outOfStock && (
                cartQty > 0 ? (
                  <div className="mt-auto flex items-center justify-between gap-1">
                    <button type="button" onClick={() => updateQuantity(product.id, -1)}
                      className="w-8 h-8 rounded-lg bg-white border border-black/10 text-ink-primary flex items-center justify-center hover:bg-black/5">
                      <Minus size={14} />
                    </button>
                    <span className="text-sm font-black text-ink-primary tabular-nums">{cartQty}</span>
                    <button type="button" onClick={() => addToCart(product)}
                      className="w-8 h-8 rounded-lg bg-accent-signature text-button-text flex items-center justify-center hover:opacity-90">
                      <Plus size={14} />
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => addToCart(product)}
                    className="mt-auto w-full py-2 rounded-lg bg-canvas hover:bg-accent-signature hover:text-button-text text-xs font-black text-ink-primary transition-colors flex items-center justify-center gap-1.5">
                    <Plus size={14} /> Add
                  </button>
                )
              )}
            </div>
            );
          })}
        </div>
        )}

        {viewMode === 'list' && (
        <div className="flex flex-col gap-px overflow-y-auto pr-1 pb-4">
          {filteredProducts.map(product => {
            const ms = marginStatus[product.id] || {};
            const stock = warehouseStock[product.id] !== undefined ? warehouseStock[product.id] : product.stock;
            const isSvc = product.product_type === 'SERVICE';
            const outOfStock = !isSvc && stock <= 0;
            const lowStock = !outOfStock && stock <= (product.lowStockThreshold || 10);
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
                  isSvc ? 'text-violet-500' : outOfStock ? 'text-red-400' : lowStock ? 'text-amber-500' : ms.isLoss || ms.belowFloor ? 'text-orange-500' : 'text-gray-400'
                }`}>
                  {isSvc ? 'SERVICE' : outOfStock ? 'OUT' : lowStock ? `${stock} stk · low` : `${stock} stk`}
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

              {/* Add / quantity stepper. When the item is in the cart show
                  −/qty/+; otherwise a single + that's always a clear tap
                  target (the whole row is still clickable too). */}
              {!outOfStock && (
                cartQty > 0 ? (
                  <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => updateQuantity(product.id, -1)}
                      className="w-7 h-7 rounded-lg bg-white border border-black/10 text-ink-primary flex items-center justify-center hover:bg-black/5"
                    ><Minus size={13} /></button>
                    <span className="w-6 text-center text-sm font-black text-ink-primary tabular-nums">{cartQty}</span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(product.id, 1)}
                      className="w-7 h-7 rounded-lg bg-accent-signature text-button-text flex items-center justify-center hover:opacity-90"
                    ><Plus size={13} /></button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); addToCart(product); }}
                    aria-label={`Add ${product.name}`}
                    className="w-7 h-7 rounded-lg bg-canvas text-gray-500 flex items-center justify-center opacity-60 group-hover:opacity-100 hover:bg-accent-signature hover:text-button-text transition-all flex-shrink-0"
                  ><Plus size={14} /></button>
                )
              )}
            </div>
            );
          })}
        </div>
        )}
      </div>

      {/* Cart Area */}
      <div className="w-full lg:w-[580px] xl:w-[640px] glass-panel !p-0 flex flex-col overflow-hidden border-l border-black/5 shadow-2xl">
        {/* Cart header */}
        <div className="px-4 py-3 border-b border-black/5 flex justify-between items-center bg-canvas/30">
          <div className="flex items-center gap-2">
            <CartIcon size={18} className="text-accent-signature" />
            <h2 className="font-semibold text-sm text-ink-primary">Cart</h2>
          </div>
          <div className="flex items-center gap-2">
            {/* Store selector — only when the tenant has more than one POS
                store. Tags the sale with where it was rung. */}
            {stores.length > 1 && (
              <div className="flex items-center gap-1.5 bg-white border border-black/8 rounded-pill pl-2.5 pr-1 py-1">
                <Store size={12} className="text-gray-400" />
                <select
                  value={storeId}
                  onChange={e => setStoreId(e.target.value)}
                  className="text-[11px] font-bold text-ink-primary bg-transparent outline-none cursor-pointer pr-1"
                >
                  {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            {tableLabel && cart.length > 0 && (
              <button onClick={handleSendKOT} disabled={unsentKOTCount === 0} title="Send to kitchen"
                className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-pill bg-ink-primary text-amber-400 hover:bg-black disabled:opacity-40 transition-colors">
                🍳 Send KOT{unsentKOTCount > 0 ? ` (${unsentKOTCount})` : ''}
              </button>
            )}
            {cart.length > 0 && (
              <button onClick={holdSale} title="Hold sale"
                className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-pill border border-black/10 text-gray-500 hover:border-amber-400 hover:text-amber-700 transition-colors">
                ⏸ Hold
              </button>
            )}
            <div className="bg-accent-signature text-button-text text-[10px] font-black px-2 py-1 rounded-pill ring-4 ring-accent-signature/10">
              {cart.reduce((acc, i) => acc + i.quantity, 0)} items
            </div>
          </div>
        </div>

        {/* Parked / held sales — tap to resume. */}
        {parked.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-50/60 border-b border-amber-200/50 overflow-x-auto">
            <span className="text-[9px] font-black uppercase tracking-widest text-amber-700 shrink-0">Held · {parked.length}</span>
            {parked.map(p => (
              <button key={p.id} onClick={() => resumeSale(p)}
                className="flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-pill bg-white border border-amber-200 text-[11px] font-bold text-ink-primary hover:border-amber-400 transition-colors">
                {p.label}
                <span onClick={(e) => { e.stopPropagation(); persistParked(parked.filter(x => x.id !== p.id)); }} className="text-gray-300 hover:text-red-500">✕</span>
              </button>
            ))}
          </div>
        )}

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
            const k = item.uid || item.productId;
            return (
              <div
                key={k}
                data-cart-row={k}
                className={`grid grid-cols-[1fr_90px_80px_64px_20px] gap-2 items-center px-4 py-2.5 border-b border-black/5 last:border-0 transition-colors ${
                  belowCost ? 'bg-red-50/60' : 'hover:bg-canvas/40'
                }`}
              >
                {/* Product name + modifiers + below-cost hint */}
                <div className="min-w-0">
                  <div className="text-sm font-bold text-ink-primary truncate uppercase">{item.name}</div>
                  {item.modLabel && (
                    <div className="text-[11px] font-semibold text-amber-700 truncate">+ {item.modLabel}</div>
                  )}
                  {belowCost && (
                    <div className="text-xs font-bold text-red-500 mt-0.5">
                      Min cost: {formatCurrency(cost)}
                    </div>
                  )}
                </div>

                {/* Qty stepper */}
                <div className="flex items-center justify-center gap-0.5 bg-white border border-black/8 rounded-lg p-0.5">
                  <button
                    onClick={() => updateQuantity(k, -1)}
                    className="w-5 h-5 rounded flex items-center justify-center hover:bg-canvas transition-all text-ink-primary shrink-0"
                  >
                    <Minus size={9} strokeWidth={3} />
                  </button>
                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={e => setQuantityDirect(k, e.target.value)}
                    className="w-8 text-center text-sm font-black text-ink-primary bg-transparent outline-none tabular-nums"
                  />
                  <button
                    onClick={() => updateQuantity(k, 1)}
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
                    onChange={e => setItemPrice(k, e.target.value)}
                    className={`w-full pl-4 pr-1 py-1 text-sm font-bold bg-canvas rounded-lg outline-none focus:ring-1 tabular-nums border ${
                      belowCost
                        ? 'border-red-300 text-red-600 focus:ring-red-300/40'
                        : 'border-black/8 text-ink-primary focus:ring-accent-signature/30'
                    }`}
                  />
                </div>

                {/* Line total */}
                <div className="font-mono text-sm font-bold text-ink-primary tabular-nums text-right">
                  {formatCurrency(item.price * item.quantity)}
                </div>

                {/* Remove */}
                <button
                  onClick={() => setCart(prev => prev.filter(i => (i.uid || i.productId) !== k))}
                  className="text-gray-300 hover:text-red-400 transition-colors flex items-center justify-center"
                >
                  <X size={11} strokeWidth={2.5} />
                </button>
              </div>
            );
          })}
          {cart.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center">
              <Package size={40} className="mb-3 opacity-20" />
              <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-5">Cart is empty</div>
              {quickAddProducts.length > 0 && (
                <div className="w-full">
                  <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2.5">Quick add</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {quickAddProducts.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => addToCart(p)}
                        className="px-3 py-2.5 rounded-xl border border-black/8 bg-white hover:border-accent-signature/40 hover:bg-accent-signature/5 transition-colors text-left"
                      >
                        <div className="text-xs font-bold text-ink-primary truncate">{p.name}</div>
                        <div className="text-[11px] font-semibold text-gray-400 tabular-nums mt-0.5">{formatCurrency(p.sellingPrice)}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
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
                const sel = allClients.find(c => c.id === selectedClientId);
                return (
                  <div className="w-full bg-accent-signature/5 border border-accent-signature/20 rounded-xl px-4 py-3 flex items-center justify-between gap-2">
                    <span className="flex flex-col min-w-0 flex-1">
                      <span className="text-xs font-black text-ink-primary uppercase tracking-tight truncate">{(sel?.name || 'Unknown').toUpperCase()}</span>
                      {(sel?.phone || sel?.address) && (
                        <span className="text-[9px] text-gray-400 font-medium truncate mt-0.5">{sel?.phone || sel?.address}</span>
                      )}
                    </span>
                    {Number(sel?.outstanding_balance) > 0 && (
                      <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 text-red-500 whitespace-nowrap">
                        Due {formatCurrency(sel.outstanding_balance)}
                      </span>
                    )}
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
                    {allClients
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
                          {Number(c.outstanding_balance) > 0 && (
                            <span className="shrink-0 ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 text-red-500">
                              Due {formatCurrency(c.outstanding_balance)}
                            </span>
                          )}
                          {selectedClientId === c.id && <Check size={12} className="shrink-0 text-accent-signature ml-2" />}
                        </button>
                      ))
                    }

                    {/* Empty state */}
                    {clientSearch && allClients.filter(c =>
                      (c.name || '').toLowerCase().includes(clientSearch.toLowerCase()) ||
                      (c.phone || '').toLowerCase().includes(clientSearch.toLowerCase())
                    ).length === 0 && (
                      <div className="px-4 py-5 text-center text-[10px] text-gray-400">No clients match "{clientSearch}"</div>
                    )}
                  </div>

                  {/* Add new customer */}
                  {!showAddCust ? (
                    <button
                      type="button"
                      onClick={() => { setShowAddCust(true); setNewCust(n => ({ ...n, name: clientSearch.trim() })); }}
                      className="w-full text-left px-4 py-3 text-[11px] font-bold uppercase tracking-tight flex items-center gap-2 text-accent-signature hover:bg-accent-signature/5 border-t border-black/5"
                    >
                      <Plus size={13} /> Add new customer
                    </button>
                  ) : (
                    <div className="p-3 border-t border-black/5 bg-canvas/40 space-y-2">
                      <div className="flex gap-1 bg-white rounded-lg p-0.5 border border-black/5">
                        {[['B2C', 'Individual'], ['B2B', 'Business']].map(([v, label]) => (
                          <button key={v} type="button" onClick={() => setNewCust(n => ({ ...n, type: v }))}
                            className={`flex-1 h-7 rounded-md text-[11px] font-bold transition-all ${newCust.type === v ? 'bg-accent-signature text-button-text' : 'text-gray-400'}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                      <input value={newCust.name} onChange={e => setNewCust(n => ({ ...n, name: e.target.value }))}
                        placeholder="Customer name*"
                        className="w-full bg-white border border-black/10 rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:border-accent-signature/40" />
                      <input value={newCust.phone} onChange={e => setNewCust(n => ({ ...n, phone: e.target.value }))}
                        inputMode="numeric" placeholder="Phone number*"
                        className="w-full bg-white border border-black/10 rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:border-accent-signature/40" />
                      {newCust.type === 'B2C' ? (
                        <input value={newCust.aadhaar} onChange={e => setNewCust(n => ({ ...n, aadhaar: e.target.value }))}
                          inputMode="numeric" placeholder="Aadhaar (optional, 12 digits)"
                          className="w-full bg-white border border-black/10 rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:border-accent-signature/40" />
                      ) : (
                        <input value={newCust.gstin} onChange={e => setNewCust(n => ({ ...n, gstin: e.target.value.toUpperCase() }))}
                          placeholder="GSTIN (optional, 15 chars)"
                          className="w-full bg-white border border-black/10 rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:border-accent-signature/40" />
                      )}
                      <div className="flex gap-2 pt-0.5">
                        <button type="button" onClick={() => setShowAddCust(false)}
                          className="flex-1 h-8 rounded-lg text-[11px] font-bold text-gray-500 border border-black/10 hover:bg-white">Cancel</button>
                        <button type="button" onClick={saveNewCustomer} disabled={savingCust}
                          className="flex-1 h-8 rounded-lg text-[11px] font-bold bg-accent-signature text-button-text disabled:opacity-50">
                          {savingCust ? 'Saving…' : 'Save & select'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          {/* Service charge (restaurant) */}
          {isRestoPOS && (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Service</span>
              <div className="flex gap-1 flex-1">
                {[0, 5, 10].map(pct => (
                  <button key={pct} type="button" onClick={() => setServiceChargePct(pct)}
                    className={`flex-1 h-8 rounded-lg text-[12px] font-bold transition-all ${
                      Number(serviceChargePct) === pct ? 'bg-amber-600 text-white' : 'bg-black/[0.04] text-gray-500 hover:text-ink-primary'
                    }`}>
                    {pct === 0 ? 'None' : `${pct}%`}
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Split bill (restaurant) — equal split display aid */}
          {isRestoPOS && total > 0 && (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Split</span>
              <div className="flex items-center gap-1 bg-black/[0.04] rounded-lg p-0.5">
                <button type="button" onClick={() => setSplitN(n => Math.max(1, n - 1))} className="w-7 h-7 rounded grid place-items-center hover:bg-white"><Minus size={12} /></button>
                <span className="w-7 text-center text-[13px] font-bold font-mono">{splitN}</span>
                <button type="button" onClick={() => setSplitN(n => n + 1)} className="w-7 h-7 rounded grid place-items-center hover:bg-white"><Plus size={12} /></button>
              </div>
              {splitN > 1 && (
                <span className="text-[12px] font-bold text-amber-700 ml-auto">
                  {formatCurrency(total / splitN)} <span className="text-gray-400 font-normal">/ guest</span>
                </span>
              )}
            </div>
          )}
          {/* Order discount (flat amount) */}
          <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-black/[0.03] border border-black/8 focus-within:border-amber-400">
            <span className="text-amber-500 text-sm font-bold">%</span>
            <input
              type="number" min="0" inputMode="decimal" placeholder="Discount (flat ₹)"
              className="flex-1 bg-transparent outline-none text-[13px] font-semibold font-mono text-ink-primary placeholder:text-gray-400 placeholder:font-sans"
              value={discount}
              onChange={e => setDiscount(e.target.value)}
            />
            {discountAmt > 0 && (
              <button onClick={() => setDiscount('')} className="text-gray-400 hover:text-red-500"><X size={13} /></button>
            )}
          </div>
          <div className="space-y-2 mb-6">
            <div className="flex justify-between text-xs font-bold text-gray-400 uppercase tracking-widest">
              <span>{taxInclusive ? 'Subtotal (excl. tax)' : 'Subtotal'}</span>
              <span className="font-mono tabular-nums">{formatCurrency(taxableAmount)}</span>
            </div>
            <div className="flex justify-between text-xs font-bold text-gray-400 uppercase tracking-widest">
              <span>Tax{taxInclusive ? ' (included)' : ''}</span>
              <span className="font-mono tabular-nums">{formatCurrency(tax)}</span>
            </div>
            {serviceChargeAmt > 0 && (
              <div className="flex justify-between text-xs font-bold text-gray-400 uppercase tracking-widest">
                <span>Service charge ({serviceChargePct}%)</span>
                <span className="font-mono tabular-nums">{formatCurrency(serviceChargeAmt)}</span>
              </div>
            )}
            {discountAmt > 0 && (
              <div className="flex justify-between text-xs font-bold text-red-500 uppercase tracking-widest">
                <span>Discount</span>
                <span className="font-mono tabular-nums">−{formatCurrency(discountAmt)}</span>
              </div>
            )}
            <div className="flex justify-between text-xl font-black text-ink-primary pt-2 border-t border-black/5">
              <span>Total</span>
              <span className="font-mono tabular-nums">{formatCurrency(total)}</span>
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
                  <div key={item.uid || item.productId} className={`flex items-center gap-4 px-5 py-3.5 ${idx !== cart.length - 1 ? 'border-b border-black/5' : ''}`}>
                    <div className="w-8 h-8 rounded-lg bg-white border border-gray-300 shadow-sm flex items-center justify-center shrink-0">
                      <Package size={14} className="text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-ink-primary truncate">{item.name}</div>
                      {item.modLabel && <div className="text-[10px] text-amber-700 font-semibold truncate">+ {item.modLabel}</div>}
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
                {discountAmt > 0 && (
                  <div className="flex justify-between text-xs font-bold text-red-500 items-center">
                    <span>Discount</span>
                    <span className="tabular-nums">− {formatCurrency(discountAmt)}</span>
                  </div>
                )}
                <div className="border-t border-black/8 pt-2 flex justify-between text-base font-black text-ink-primary">
                  <span>Total</span><span className="font-mono tabular-nums">{formatCurrency(total)}</span>
                </div>
              </div>

              {/* Client info summary */}
              {selectedClientId !== 'WALKIN' && (() => {
                const client = allClients.find(c => c.id === selectedClientId);
                return client ? (
                  <div className="bg-white rounded-2xl border border-black/5 p-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-accent-signature/10 border border-accent-signature/20 flex items-center justify-center text-sm font-black text-ink-primary shrink-0">
                      {client.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-ink-primary truncate">{client.name}</div>
                      {client.phone && <div className="text-[10px] text-gray-400 font-medium">{client.phone}</div>}
                    </div>
                    {Number(client.outstanding_balance) > 0 && (
                      <span className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-full bg-red-50 text-red-500 whitespace-nowrap">
                        Due {formatCurrency(client.outstanding_balance)}
                      </span>
                    )}
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
                      const client = allClients.find(c => c.id === selectedClientId);
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

              {/* IMEI / serial capture for serialized products */}
              {serialLines.length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3">
                  <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-2">IMEI / Serial Number</p>
                  <div className="space-y-3">
                    {serialLines.map(l => (
                      <div key={l.uid}>
                        <div className="text-[11px] font-bold text-ink-primary mb-1">{l.name} · {l.quantity} unit{l.quantity > 1 ? 's' : ''}</div>
                        <div className="space-y-1.5">
                          {Array.from({ length: l.quantity }).map((_, idx) => (
                            <input
                              key={idx}
                              value={(lineImeis[l.uid] || [])[idx] || ''}
                              onChange={e => setImei(l.uid, idx, e.target.value)}
                              inputMode="numeric"
                              placeholder={`Unit ${idx + 1} — scan or type IMEI/serial`}
                              className="w-full bg-white border border-amber-200 rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:border-amber-400"
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Payment Method */}
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Payment Method</p>

                {/* Type pills — one per type (CASH / UPI / BANK / CARD) */}
                <div className="flex flex-wrap gap-2">
                  {(typeGroups.length > 0
                    ? typeGroups
                    : [
                        { type: 'CASH', accs: [], defaultAcc: null },
                        { type: 'UPI',  accs: [], defaultAcc: null },
                        { type: 'BANK', accs: [], defaultAcc: null },
                      ]
                  ).map(({ type, accs, defaultAcc }) => {
                    const icon = type === 'CASH' ? <Banknote size={15} /> : type === 'UPI' ? <Smartphone size={15} /> : type === 'CARD' ? <CreditCard size={15} /> : <Landmark size={15} />;
                    const label = type === 'CASH' ? 'Cash' : type === 'UPI' ? 'UPI' : type === 'CARD' ? 'Card' : 'Bank';
                    const isActive = paymentMethod === type;
                    return (
                      <button key={type} type="button"
                        onClick={() => {
                          setPaymentMethod(type);
                          setPaymentAccountId(defaultAcc ? defaultAcc.id : null);
                        }}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all ${
                          isActive
                            ? 'border-accent-signature bg-accent-signature/5'
                            : 'border-black/8 bg-white hover:border-black/15'
                        }`}
                      >
                        <span className={`shrink-0 ${isActive ? 'text-accent-signature' : 'text-gray-400'}`}>{icon}</span>
                        <span className="text-xs font-black uppercase tracking-widest leading-none">{label}</span>
                        {isActive && <Check size={12} className="text-accent-signature shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                {/* Account sub-selector — only when active type has >1 account */}
                {(() => {
                  const activeGroup = typeGroups.find(g => g.type === paymentMethod);
                  if (!activeGroup || activeGroup.accs.length <= 1) return null;
                  return (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest self-center mr-1">Account:</span>
                      {activeGroup.accs.map(a => {
                        const isSelected = paymentAccountId === a.id || (!paymentAccountId && a.id === activeGroup.defaultAcc.id);
                        return (
                          <button key={a.id} type="button"
                            onClick={() => setPaymentAccountId(a.id)}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                              isSelected
                                ? 'border-accent-signature text-accent-signature bg-accent-signature/5'
                                : 'border-black/10 text-gray-500 hover:border-black/20 bg-white'
                            }`}
                          >
                            {a.name}
                            {a.is_default && (
                              <span className={`text-[7px] font-black uppercase tracking-wider px-1 py-0.5 rounded ${
                                isSelected ? 'bg-accent-signature/20 text-accent-signature' : 'bg-black/5 text-gray-400'
                              }`}>DEFAULT</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Client Credit — full-width compact row */}
                <button type="button"
                  onClick={() => {
                    if (selectedClientId === 'WALKIN') { addNotification('Select a client before choosing Credit.', 'info'); return; }
                    setPaymentMethod('CREDIT');
                  }}
                  className={`mt-2 w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 transition-all ${
                    selectedClientId === 'WALKIN'
                      ? 'opacity-40 cursor-not-allowed border-black/8 bg-white'
                      : paymentMethod === 'CREDIT'
                      ? 'border-accent-signature bg-accent-signature/5'
                      : 'border-black/8 bg-white hover:border-black/15'
                  }`}
                >
                  <CreditCard size={15} className={paymentMethod === 'CREDIT' ? 'text-accent-signature' : 'text-gray-400'} />
                  <div className="flex-1 text-left">
                    <div className="text-xs font-black uppercase tracking-widest leading-none">Client Credit</div>
                    {selectedClientId === 'WALKIN' && <div className="text-[9px] text-gray-400 mt-0.5">Select a client first</div>}
                  </div>
                  {paymentMethod === 'CREDIT' && <Check size={13} className="text-accent-signature shrink-0" />}
                </button>
              </div>

              {/* UPI QR — shown when UPI selected. Cashier sees it inline;
                  "Show on customer screen" pops out a full-screen QR to
                  drag onto a second (customer-facing) monitor. Display
                  only — the cashier still confirms receipt below. */}
              {paymentMethod === 'UPI' && (() => {
                // Resolve UPI ID: selected account's upi_id → global businessProfile.upi_id
                const selectedUpiAcc = paymentAccountId
                  ? accounts.find(a => a.id === paymentAccountId)
                  : accounts.find(a => a.type === 'UPI' && !a.deleted_at);
                const upiId = selectedUpiAcc?.upi_id || businessProfile?.upi_id;
                if (!upiId) {
                  return (
                    <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-700">
                      Add a UPI ID to this account (Settings → Cash & Bank) to show a payment QR.
                    </div>
                  );
                }
                const merchant = businessProfile?.businessName || businessProfile?.name || 'Merchant';
                const note = `Sale ${formatCurrency(total)}`;
                const upiUri =
                  `upi://pay?pa=${upiId}` +
                  `&pn=${encodeURIComponent(merchant)}` +
                  `&am=${Number(total).toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`;
                const popoutUrl =
                  `/embed/payqr?pa=${encodeURIComponent(upiId)}` +
                  `&pn=${encodeURIComponent(merchant)}` +
                  `&am=${Number(total).toFixed(2)}` +
                  `&tn=${encodeURIComponent(note)}` +
                  `&cur=${encodeURIComponent(businessProfile?.currencySymbol || '₹')}`;
                return (
                  <div className="rounded-2xl border-2 border-accent-signature/20 bg-accent-signature/5 p-4 flex flex-col items-center gap-3">
                    <div className="bg-white p-3 rounded-xl border border-black/5">
                      <QRCodeSVG value={upiUri} size={150} level="M" includeMargin={false} />
                    </div>
                    <div className="text-sm font-black text-ink-primary tabular-nums">
                      {formatCurrency(total)}
                    </div>
                    <div className="text-[10px] text-gray-500">
                      UPI: <b>{upiId}</b>
                      {selectedUpiAcc && <span className="text-gray-400"> · {selectedUpiAcc.name}</span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => window.open(
                        popoutUrl, 'payqr',
                        'width=520,height=720,menubar=no,toolbar=no,location=no,status=no'
                      )}
                      className="text-xs font-bold text-accent-signature underline"
                    >
                      Show on customer screen ↗
                    </button>
                  </div>
                );
              })()}

              {/* Amount Received — partial pay + change calc */}
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                  {paymentMethod === 'CREDIT' ? 'Part Payment Now (optional)' : 'Amount Received (optional)'}
                </p>
                <input
                  type="number" step="0.01" min="0"
                  placeholder={paymentMethod === 'CREDIT' ? 'e.g. 100 — rest to credit' : 'Leave blank if paid in full'}
                  value={amountReceived}
                  onChange={(e) => setAmountReceived(e.target.value)}
                  className="w-full bg-white border border-gray-300 shadow-sm rounded-xl px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-accent-signature/20 tabular-nums"
                />
                {amountReceived.trim() !== '' && (() => {
                  const paid = Math.max(0, parseFloat(amountReceived) || 0);
                  const diff = paid - total;
                  if (diff === 0) return null;
                  const isChange = diff > 0;
                  const color = isChange ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : 'text-red-600 bg-red-50 border-red-200';
                  return (
                    <div className={`mt-2 px-3 py-2 rounded-xl border text-xs font-bold tabular-nums flex items-center justify-between ${color}`}>
                      <span>{isChange ? 'Change due' : 'Balance to credit'}</span>
                      <span>{formatCurrency(Math.abs(diff))}</span>
                    </div>
                  );
                })()}
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
    </>
  );
};

// ─── Outstanding Collection Prompt ───────────────────────────────────────────
// Shown after a sale completes when the client has an unpaid balance.
// Two modes:
//   excess > 0  → customer already overpaid the bill; offer to apply excess
//                 to their outstanding or give it back as change.
//   excess = 0  → normal payment; ask if cashier wants to collect outstanding now.
function OutstandingPromptModal({ clientId, clientName, outstanding, excess, paymentMethod, currency, onRecordPayment, onClose }) {
  const [collectAmt, setCollectAmt]   = useState(outstanding.toFixed(2));
  const [method, setMethod]           = useState(paymentMethod === 'CREDIT' ? 'CASH' : paymentMethod);
  const [busy, setBusy]               = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const fmt   = (v) => `${currency}${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const collect = async (amount) => {
    if (!amount || amount <= 0) { onClose(); return; }
    setBusy(true);
    await onRecordPayment(clientId, amount, today, 'Collected at POS', [], method);
    setBusy(false);
    onClose();
  };

  const methods = ['CASH', 'UPI', 'BANK'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-black/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center text-lg font-black text-amber-600">
              {clientName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-bold text-sm text-ink-primary leading-tight">{clientName}</p>
              <p className="text-xs text-red-500 font-semibold">{fmt(outstanding)} outstanding</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {excess > 0 ? (
            /* ── Excess mode ── */
            <>
              <p className="text-sm text-ink-secondary">
                Customer paid <span className="font-bold text-ink-primary">{fmt(excess)}</span> extra.
                Apply to their balance?
              </p>

              {/* Apply to outstanding */}
              <button
                onClick={() => collect(excess)}
                disabled={busy}
                className="w-full text-left rounded-2xl border-2 border-signature p-4 hover:bg-signature/5 transition-colors disabled:opacity-50"
              >
                <p className="font-bold text-sm text-ink-primary">Apply {fmt(excess)} to outstanding</p>
                <p className="text-xs text-ink-secondary mt-0.5">
                  Balance: {fmt(outstanding)} → {fmt(outstanding - excess)} · Change: {currency}0
                </p>
              </button>

              {/* Give change */}
              <button
                onClick={onClose}
                disabled={busy}
                className="w-full text-left rounded-2xl border border-black/10 p-4 hover:bg-canvas transition-colors disabled:opacity-50"
              >
                <p className="font-bold text-sm text-ink-primary">Give {fmt(excess)} as change</p>
                <p className="text-xs text-ink-secondary mt-0.5">Outstanding stays {fmt(outstanding)}</p>
              </button>
            </>
          ) : (
            /* ── Collect mode ── */
            <>
              <p className="text-sm text-ink-secondary">Collect outstanding payment now?</p>

              {/* Amount */}
              <div>
                <p className="text-xs font-bold text-ink-tertiary uppercase tracking-wider mb-1.5">Amount</p>
                <div className="flex items-center border border-black/10 rounded-xl px-3 py-2.5 bg-canvas">
                  <span className="text-sm font-bold text-signature mr-1">{currency}</span>
                  <input
                    type="number"
                    value={collectAmt}
                    onChange={e => setCollectAmt(e.target.value)}
                    className="flex-1 bg-transparent text-sm font-semibold text-ink-primary outline-none"
                    min="0"
                    max={outstanding}
                  />
                </div>
              </div>

              {/* Method */}
              <div>
                <p className="text-xs font-bold text-ink-tertiary uppercase tracking-wider mb-1.5">Method</p>
                <div className="flex gap-2">
                  {methods.map(m => (
                    <button
                      key={m}
                      onClick={() => setMethod(m)}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${
                        method === m
                          ? 'bg-signature text-white'
                          : 'bg-canvas border border-black/10 text-ink-secondary'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={onClose}
                  disabled={busy}
                  className="flex-1 py-3 rounded-2xl border border-black/10 text-sm font-bold text-ink-secondary hover:bg-canvas transition-colors"
                >
                  Skip
                </button>
                <button
                  onClick={() => collect(Math.min(parseFloat(collectAmt) || 0, outstanding))}
                  disabled={busy || !parseFloat(collectAmt)}
                  className="flex-2 flex-grow py-3 rounded-2xl bg-signature text-white text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  {busy ? 'Recording…' : `Collect ${fmt(Math.min(parseFloat(collectAmt)||0, outstanding))}`}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Cancel for excess mode */}
        {excess > 0 && (
          <div className="px-6 pb-5">
            <button onClick={onClose} className="w-full text-xs text-ink-tertiary hover:text-ink-secondary transition-colors py-2">
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default InvoiceBuilder;
