import React, { useState, useMemo, useEffect, useRef } from 'react';
import { parseScaleBarcode, quantityFrom } from '../../../lib/scaleBarcode';
import { buildCatalogIndex, resolveScan, resolvePlu } from '../../../lib/pos/catalog';
import { cameraScanSupported } from '../../../lib/pos/cameraScan';
import ScanSheet from '../../../components/pos/ScanSheet';
import { useDialogClose } from '../../../hooks/useDialogClose';
import { Search, Plus, Minus, CreditCard, Banknote, Check, Package, X, User, Smartphone, Landmark, AlertTriangle, Truck, Store, ChevronLeft, ChevronDown, MapPin, Calendar, MessageSquare, ScanBarcode, List, LayoutGrid, ChefHat, FileText, ArrowUpRight } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Card, CardHeader } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { FilterPills } from '../../../components/ui/Tabs';
import OptionCard, { OptionGroup } from '../../../components/ui/OptionCard';
import Dialog from '../../../components/ui/Dialog';
import { CloseButton } from '../../../components/ui/SidePanel';
import QtyField from './QtyField';
import { allowsFraction, qtyStep, qtyMin, qtyStepButton, clampQty, formatQty, formatQtyWithUnit, subQtyLabel, exceedsStock } from '../../../lib/units';
import { checkoutMoney } from '../lib/checkoutMoney';
import { formatCurrency, formatShortDateTime, generateRef, cn } from '../../../lib/utils';
import { tierPrice } from '../../../lib/priceResolver';
import { useAccounts, accountForMethod, buildPaymentMethods } from '../../../hooks/useAccounts';
import { useNotifications } from '../../../context/NotificationContext';
import { useAuth } from '../../../context/AuthContext';
import { supabase, restInsert } from '../../../lib/supabase';
import { QRCodeSVG } from 'qrcode.react';
import CashBillPrint from './CashBillPrint';
import CopyButton from '../../../components/motion/CopyButton';
import SaveButton, { useSaveStatus } from '../../../components/motion/SaveButton';
import RollingNumber from '../../../components/motion/RollingNumber';
import FieldError, { useShake } from '../../../components/motion/FieldError';

// Restaurant modifier picker — choose options for a dish before it hits the cart.
const ModifierSheet = ({ product, onCancel, onConfirm, currencySymbol = '₹' }) => {
  useDialogClose(onCancel);
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
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="m-scrim absolute inset-0 bg-[rgba(17,20,24,0.28)]" onClick={onCancel} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label={product.name}
        className="m-dialog relative w-full max-w-sm bg-surface rounded-[18px] shadow-[0_24px_60px_-20px_rgba(17,20,24,0.45)] overflow-hidden max-h-[85vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 px-[22px] pt-5 pb-3">
          <div>
            <h3 className="font-tight text-[18px] font-semibold tracking-[-0.01em] text-ink">{product.name}</h3>
            <p className="mt-0.5 text-[13px] text-body">Choose options</p>
          </div>
          <CloseButton onClick={onCancel} />
        </div>
        <div className="px-[22px] pb-4 space-y-4 overflow-y-auto">
          {groups.map(g => (
            <div key={g.id}>
              <div className="font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute mb-2">
                {g.name} {g.multi && <span className="font-ui font-normal normal-case tracking-normal">· choose any</span>}
              </div>
              <div className="space-y-1.5">
                {(g.options || []).map(o => {
                  const on = !!sel[g.id]?.[o.name];
                  return (
                    <button key={o.name} type="button" onClick={() => toggle(g, o.name)} aria-pressed={on}
                      className={`m-press w-full flex items-center justify-between px-3.5 py-2.5 rounded-pill text-[13.5px] ${
                        on ? 'bg-surface shadow-[inset_0_0_0_2px_var(--color-ink)]' : 'shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile'
                      }`}>
                      <span className="font-tight font-semibold text-ink">{o.name}</span>
                      <span className="tabular-nums text-[12.5px] text-mute">{o.price > 0 ? `+${currencySymbol}${o.price}` : ''}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="px-[22px] pt-1 pb-5">
          <Button size="lg" className="w-full" onClick={() => onConfirm(chosen)}>
            Add · <span className="tabular-nums">{currencySymbol}{total}</span>
          </Button>
        </div>
      </div>
    </div>
  );
};

const InvoiceBuilder = ({ products, inventoryBalances = [], clients, onPlaceSale, currentTenantId, taxMode = 'EXCLUSIVE', businessProfile = null, topSellingIds = [], stores = [],
  // Table POS (restaurant) — bind this builder to a table's running tab.
  initialCart = null, onCartChange = null, tableLabel = null, onSendKOT = null, businessType = null,
  // Weighing-scale labels. A capability pack, passed in like businessType so
  // this component keeps taking its vertical context from its caller rather
  // than reaching for the tenant itself.
  scaleOn = false,
  editId = null, editMeta = null, onEditDone = null, onRecordPayment = null,
  // Layout only: tells the page when the full-page checkout opens and closes.
  onCheckoutChange = null }) => {
  const taxInclusive = taxMode === 'INCLUSIVE';
  const noGst        = taxMode === 'NONE'; // not filing GST — no tax split, price is final
  // Restaurant dishes aren't unit-stocked at the POS (recipe deduction is R5),
  // so don't gate adding a dish on warehouse stock.
  const isRestoPOS = businessType === 'RESTAURANT';
  // Services + restaurant sell from a catalog without unit stock.
  const noStockGate = isRestoPOS || businessType === 'SERVICES';
  const { addNotification } = useNotifications();
  const { isOwner } = useAuth();
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
  // Layout only: let the page hide its tabs while the checkout is open.
  useEffect(() => {
    onCheckoutChange?.(showCheckout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCheckout]);
  useEffect(() => () => onCheckoutChange?.(false), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paymentAccountId, setPaymentAccountId] = useState(null); // specific account from dynamic button

  // Cash & Bank accounts — money received at checkout posts to one of these.
  const { accounts = [] } = useAccounts(currentTenantId);
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
  const saveState = useSaveStatus();
  const [clientSearch, setClientSearch]     = useState('');
  const [clientDropOpen, setClientDropOpen] = useState(false);
  const clientDropRef = useRef(null);
  const clientInputRef = useRef(null);

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

  const [custErr, setCustErr] = useState('');
  const custShake = useShake(custErr);
  useEffect(() => { setCustErr(''); }, [newCust]);
  const saveNewCustomer = async () => {
    const name = newCust.name.trim();
    const phone = newCust.phone.trim();
    if (!name) { setCustErr('Customer name is required.'); return; }
    if (!phone) { setCustErr('Phone number is required.'); return; }
    if (newCust.type === 'B2B' && newCust.gstin.trim() && newCust.gstin.trim().length !== 15) {
      setCustErr(`GSTIN must be 15 characters (you entered ${newCust.gstin.trim().length}).`); return;
    }
    if (newCust.type === 'B2C' && newCust.aadhaar.trim() && newCust.aadhaar.replace(/\s/g, '').length !== 12) {
      setCustErr('Aadhaar must be 12 digits.'); return;
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

  /**
   * The scan lookup, built once per catalogue change.
   *
   * It replaces two linear passes over every product per scan, each of which
   * lowercased both sides on every candidate. It also resolves a 12-digit UPC
   * label against a product entered in 13-digit EAN form, which the exact
   * string compare could not -- that was reported at the counter as "not in
   * the catalog" for something on the shelf.
   */
  const catalogIndex = useMemo(() => buildCatalogIndex(products), [products]);

  // The camera scanner. Offered only where it can actually work: on a desktop
  // till with a scanner gun the button would be a dead end, and the gun
  // already types into the box beside it.
  const [scanOpen, setScanOpen] = useState(false);
  const canCameraScan = useMemo(() => cameraScanSupported(), []);

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

  /**
   * One code in, one cart line out.
   *
   * Extracted from the Enter handler so the CAMERA scanner commits through
   * exactly this path. Two code paths for "a barcode arrived" is how a scan
   * and a keystroke come to resolve to different products -- the scale-label
   * branch in particular is easy to leave out of a second copy.
   */
  const commitCode = (raw) => {
    const q = String(raw ?? '').trim();
    if (!q) return;

    // A weighing-scale label, before anything else: it looks like a barcode
    // but the last digits are a weight or a price, so matching it against
    // products.barcode would never hit and the cashier would be left keying
    // the quantity in by hand -- the step the scale exists to remove.
    if (scaleOn) {
      const weighed = parseScaleBarcode(q);
      if (weighed) {
        // The PLU is matched against barcode OR sku, because shops put it in
        // whichever field they already use.
        const item = resolvePlu(catalogIndex, weighed.itemCode);
        if (!item) {
          addNotification(`Scale item ${weighed.itemCode} is not in the catalog`, 'error');
          setSearchTerm('');
          return;
        }
        const qty = quantityFrom(weighed, tierPrice(item, allClients.find(c => c.id === selectedClientId)?.price_tier));
        if (qty == null || !(qty > 0)) {
          // A price-embedded label with no unit price cannot yield a
          // quantity. Say so rather than adding zero of something.
          addNotification(`${item.name}: set a selling price before scanning a priced label`, 'error');
          setSearchTerm('');
          return;
        }
        addToCart(item, undefined, qty);
        setSearchTerm('');
        return;
      }
    }

    // Barcode, then SKU — one Map hit each, not a pass over the catalogue.
    const scanned = resolveScan(catalogIndex, q);
    if (scanned) {
      addToCart(scanned);
      setSearchTerm('');
      return;
    }

    // Single fuzzy result — add it
    if (filteredProducts.length === 1) {
      addToCart(filteredProducts[0]);
      setSearchTerm('');
      return;
    }

    // Nothing matched. A typed search can simply stand (the list is already
    // filtered), but a SCAN that resolves to nothing has to say so -- the
    // camera gives no other feedback, and silence reads as "it did not see it"
    // when the truth is "this code is not in the catalogue".
    if (scanOpen) addNotification(`No product with code ${q}`, 'error');
  };

  // Called when a scanner gun (or the cashier) presses Enter in the search box.
  const handleSearchEnter = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    commitCode(searchTerm);
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

  // `exactQty` is for a weighed line: a scale label carries the weight of
  // that particular piece, so the quantity is not 1 and is not a step from 1.
  const addToCart = (product, mods, exactQty) => {
    const groups = Array.isArray(product.modifier_groups) ? product.modifier_groups : [];
    // Open the picker for dishes with modifiers (unless options already chosen).
    if (mods === undefined && groups.length > 0) { setModPicker({ product }); return; }
    // Expired stock: warn, don't block. A hard refusal was wrong for soft-dated
    // goods (packaging, covers) where a day past the printed date is still
    // saleable — it stranded perfectly good stock. The cashier confirms an
    // expired sale deliberately; the EXPIRED badge already flags it on the tile.
    if (isExpired(product.id)) {
      if (!window.confirm(`${product.name}: stock expired on ${batchExpiry[product.id]}.\nSell anyway?`)) return;
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
        const bump = (existing.sellUnit === 'ALT' && Number(product.conversion_factor) > 0)
          ? Number(product.conversion_factor)   // one more packet, not one more kilo
          : 1;
        return prev.map(item => item.uid === uid
          ? { ...item, quantity: item.quantity + bump }
          : item
        );
      }
      if (available <= 0) {
        addNotification(`${product.name} is out of stock`, 'error');
        return prev;
      }
      // A product that is bought by weight and SOLD in packets should open the
      // line in packets — otherwise every packet sale started as "1 KG" and
      // needed a manual toggle, and one tap on + added a whole kilo (four
      // packets) instead of one. The line is still stored in the base unit;
      // only the entry unit and the opening quantity change.
      const conv = Number(product.conversion_factor);
      const packs = !!(product.secondary_unit && conv > 0);
      return [...prev, {
        uid,
        productId: product.id,
        name: product.name,
        basePrice: base,
        price: (Number(base) || 0) + addPrice,
        // A weighed line is always in the BASE unit -- the scale weighed
        // kilograms, not packets.
        sellUnit: exactQty != null ? 'BASE' : (packs ? 'ALT' : 'BASE'),
        quantity: exactQty != null ? exactQty : (packs ? conv : 1),
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
  /** Unit of the product on a cart line — decides whether fractions are allowed. */
  const unitOf = (productId) => productById[productId]?.unit;

  // ── Sell-by-alternate-unit (e.g. sell a KG product by 250 g packet) ──────────
  // A line is ALWAYS stored in the base unit — quantity and price are base, so
  // stock, COGS, the below-cost guard and the sale payload never see packets and
  // the money math is identical to a base sale. `sellUnit === 'ALT'` only changes
  // how the line is DISPLAYED and how typed entry is interpreted, via conv
  // (base per one alt unit, e.g. 0.25 KG per packet).
  const convOf = (productId) => {
    const p = productById[productId];
    const c = Number(p?.conversion_factor);
    return (p?.secondary_unit && c > 0) ? c : 0;
  };
  const isAlt = (item) => item.sellUnit === 'ALT' && convOf(item.productId) > 0;
  // Unit label + fraction rules for how the line reads right now.
  const dispUnit = (item) => isAlt(item) ? productById[item.productId].secondary_unit : unitOf(item.productId);
  // Base <-> display conversions. Round display qty to 3dp to kill float noise.
  const toDispQty   = (item) => isAlt(item) ? Number((item.quantity / convOf(item.productId)).toFixed(3)) : item.quantity;
  const toDispPrice = (item) => isAlt(item) ? Number((item.price   * convOf(item.productId)).toFixed(2)) : item.price;

  const toggleLineUnit = (uid) => {
    setCart(prev => prev.map(i => {
      if (keyOf(i) !== uid) return i;
      if (!(convOf(i.productId) > 0)) return i;         // no alt unit → no toggle
      return { ...i, sellUnit: i.sellUnit === 'ALT' ? 'BASE' : 'ALT' };
    }));
  };

  const updateQuantity = (uid, delta) => {
    setCart(prev => prev.map(item => {
      if (keyOf(item) === uid) {
        const unit = unitOf(item.productId);
        const available = getAvailableStock(item.productId);
        // Step by unit: whole pieces, or half-kilos on weight goods — or one
        // whole alt unit (a packet = conv base) when the line sells by packet.
        // Rounded through clampQty so 0.1 + 0.2 never lands as 0.30000000000000004.
        const step = delta * (isAlt(item) ? convOf(item.productId) : qtyStepButton(unit));
        const next = clampQty(Math.max(0, item.quantity + step), unit);
        if (exceedsStock(next, available)) {
          addNotification(`Only ${formatQtyWithUnit(available, unit)} in stock`, 'error');
          return item;
        }
        return { ...item, quantity: next };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const setQuantityDirect = (uid, val) => {
    // parseFloat, not parseInt: typing 0.25 used to yield 0 and silently
    // delete the cart line, which is why part-kilo sales were entered as
    // quantity 1 with the real money typed into the rate.
    const raw = parseFloat(val);
    if (isNaN(raw) || raw < 0) return;
    setCart(prev => {
      const line = prev.find(i => keyOf(i) === uid);
      if (!line) return prev;
      const unit = unitOf(line.productId);
      // Typed value is in the display unit. For a packet line, one typed packet
      // is conv base units, so convert before storing (stock stays in base).
      const baseRaw = isAlt(line) ? raw * convOf(line.productId) : raw;
      const qty = clampQty(baseRaw, unit);
      if (qty === 0) return prev.filter(i => keyOf(i) !== uid);
      const available = getAvailableStock(line.productId);
      if (exceedsStock(qty, available)) {
        addNotification(`Only ${formatQtyWithUnit(available, unit)} in stock`, 'error');
        return prev.map(i => (keyOf(i) === uid ? { ...i, quantity: clampQty(available, unit) } : i));
      }
      return prev.map(i => (keyOf(i) === uid ? { ...i, quantity: qty } : i));
    });
  };

  const setItemPrice = (uid, val) => {
    const price = parseFloat(val);
    setCart(prev => prev.map(i =>
      // Typed price is per display unit. A per-packet price divided by conv is
      // the per-base price we store (so quantity*price stays the true total).
      keyOf(i) === uid ? { ...i, price: isNaN(price) ? i.price : (isAlt(i) ? price / convOf(i.productId) : price) } : i
    ));
  };

  const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  // Tax inclusive: price already contains GST → extract tax from subtotal
  // Tax exclusive: price is pre-tax → add tax on top
  const tax = noGst ? 0 : cart.reduce((acc, item) => {
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
  // NONE / INCLUSIVE: price is final, tax not added on top. EXCLUSIVE: add tax.
  const grossTotal = ((taxInclusive || noGst) ? subtotal + deliveryFeeAmt : subtotal + tax + deliveryFeeAmt) + serviceChargeAmt;
  // Flat order discount, clamped to [0, grossTotal].
  const discountAmt = Math.min(Math.max(parseFloat(discount) || 0, 0), grossTotal);
  const total = grossTotal - discountAmt;

  // The one figure the cashier acts on, and what it is called right now.
  // Logic and its tests live in ../lib/checkoutMoney.
  // Pass what the client already owes: a surplus from someone with dues is
  // very likely a debt payment, and the block must not assert "change" while
  // that choice is still open. Walk-ins owe nothing, so they read as before.
  const money = checkoutMoney(
    total, amountReceived, paymentMethod, formatCurrency,
    Number(allClients.find(c => c.id === selectedClientId)?.outstanding_balance || 0),
  );

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
      // Serialised items are discrete; ceil so a fractional line still
      // demands at least one serial rather than passing the check vacuously.
      return filled < Math.max(1, Math.ceil(l.quantity));
    });
    if (missingSerial.length > 0) {
      addNotification(`Enter IMEI/serial for: ${missingSerial.map(l => l.name).join(', ')}`, 'error');
      return;
    }
    setIsSubmitting(true);
    saveState.start();
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
      const itemsWithSerials = cart.map(l => {
        let out = l;
        if (productById[l.productId]?.track_serial) {
          out = { ...out, imeis: (lineImeis[l.uid] || []).map(s => s.trim()).filter(Boolean) };
        }
        // Snapshot the packet view so the receipt can print "4 Packet @ ₹40"
        // without needing the product's conversion at render time. quantity and
        // price stay base — the money and stock are unaffected.
        if (isAlt(l)) {
          out = { ...out, sellUnitName: productById[l.productId].secondary_unit,
                          sellQty: toDispQty(l), sellUnitPrice: toDispPrice(l) };
        }
        return out;
      });
      // The actual cash handed over (may exceed the bill -> change, or be
      // applied to previous dues). paidAmount is capped at the bill, so without
      // this the real tender is lost on reprint.
      //
      // Computed here rather than after the sale so it can ride along on the
      // payload: a sale queued offline has no second chance to send it.
      const tendered = explicitPaid !== null
        ? explicitPaid
        : (isCreditSale ? 0 : total);
      const saleData = {
        id: saleId,
        clientId: selectedClientId,
        amountReceived: tendered,
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
        const raw = result.error.message || 'Sale could not be recorded';
        // process_sale raises a MARKER followed by a readable sentence. The
        // marker is for code; the cashier gets the sentence. Both of these are
        // REFUSALS rather than failures -- the bill is fine, the shop's own
        // rule says this one cannot go through -- so the cart and the modal
        // stay exactly as they are and the cashier decides what to do.
        const REFUSALS = [
          ['CREDIT_LIMIT_EXCEEDED', 'Credit limit reached'],
          ['NEGATIVE_STOCK_BLOCKED', 'Not enough stock'],
        ];
        const hit = REFUSALS.find(([marker]) => raw.includes(marker));
        const msg = hit
          ? raw.replace(new RegExp(`^.*${hit[0]}:\\s*`), '')
          : raw;
        addNotification(hit ? `${hit[1]}: ${msg}` : `Checkout failed: ${msg}`, 'error');
        saveState.fail();
        return; // keep cart + modal so user can retry
      }
      // Persist the tender computed above.
      //
      // This used to run only when the cashier typed into "Amount received",
      // which is the slow path — on a normal cash sale the field is left blank
      // and the column was never written at all (populated on 1 of 437 sales
      // for one live tenant). The tender is known in that case: a non-credit
      // sale is paid in full, a credit sale tenders nothing at the till.
      //
      // SKIPPED when the sale was queued rather than sent. There is no row on
      // the server to update yet, so this awaited a call that could not
      // succeed: the cashier waited for it to fail and the tender was lost
      // anyway. A queued sale carries amountReceived on its payload instead,
      // and placeSale queues the update alongside the sale (see useSales.js).
      if (!result?.queued) {
        try {
          const { supabase } = await import('../../../lib/supabase');
          const { error: arErr } = await supabase
            .from('sales').update({ amount_received: tendered }).eq('id', saleId);
          // Non-fatal (the sale itself is already recorded) but never silent —
          // a swallowed failure here is exactly how the column went empty.
          if (arErr) console.error('[SALE] amount_received save failed:', arErr.message, arErr);
        } catch (e) {
          console.error('[SALE] amount_received save threw:', e);
        }
      }
      // Money received → the DB trigger trg_sales_post_ledger posts the
      // account_transactions IN entry server-side now (idempotent on sale id),
      // so web, desktop AND mobile sales all hit Cash & Bank identically.
      // No client-side posting — doing both double-counted the sale.
      // Serials are NOT written from here.
      //
      // This used to insert into `serial_numbers` and had never once succeeded:
      // it sent `serial` and `sale_id` where the columns are `serial_number`
      // and `sold_in_id`, and status 'SOLD' where the constraint wants
      // lowercase. All of it inside a non-fatal catch, so every failure was
      // swallowed into a toast nobody saw, and the table holds zero rows.
      //
      // The server already does this properly: write_sale_lines reads `imeis`
      // off each item in p_items and inserts one sale_item_serials row per
      // unit, in the same transaction as the sale. A second client-side write
      // could only ever disagree with it. The IMEI report reads that table.
      addNotification(
        editId
          ? `Sale updated: ${formatCurrency(total)}`
          : fulfillmentType === 'DELIVERY'
            ? `Sale recorded, added to the delivery queue.`
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

      saveState.ok();
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
      saveState.fail();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Shared bits of the redesigned till.
  const selectedClient = selectedClientId !== 'WALKIN' ? allClients.find(c => c.id === selectedClientId) : null;
  const initialsOf = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  const fieldCls = 'w-full h-9 rounded-[10px] bg-surface px-3 text-[13.5px] text-ink tabular-nums shadow-[inset_0_0_0_1px_var(--color-line)] outline-none transition-shadow duration-(--dur-press) placeholder:text-mute focus:shadow-[inset_0_0_0_2px_var(--color-ink)]';
  const secHead = 'font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute';
  const itemWord = (n) => `${n} item${n === 1 ? '' : 's'}`;
  // A product's stock / flag pills, shared by the grid tile and the list row.
  const stockFlags = (product, { stock, isSvc, outOfStock, lowStock, ms }) => (
    <>
      {isSvc ? <Badge tone="info">Service</Badge>
        : outOfStock ? <Badge tone="bad">Out of stock</Badge>
        : lowStock ? <Badge tone="warn">Low · {stock} left</Badge>
        : <span className="tabular-nums">{stock} in stock</span>}
      {isExpired(product.id) ? (
        <Badge tone="bad">Expired {formatShortDateTime(batchExpiry[product.id])}</Badge>
      ) : isNearExpiry(product.id) ? (
        <Badge tone="warn">Expires {formatShortDateTime(batchExpiry[product.id])}</Badge>
      ) : null}
      {!outOfStock && ms.isLoss && <Badge tone="bad">Below cost</Badge>}
      {!outOfStock && !ms.isLoss && ms.belowFloor && <Badge tone="warn">Low margin</Badge>}
    </>
  );

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
    {/* Modifier picker (restaurant) */}
    {modPicker && (
      <ModifierSheet
        product={modPicker.product}
        currencySymbol={businessProfile?.currencySymbol || '₹'}
        onCancel={() => setModPicker(null)}
        onConfirm={(chosen) => { addToCart(modPicker.product, chosen); setModPicker(null); }}
      />
    )}
    {/* The till stays mounted under the checkout (hidden), so the search box,
        the cart and anything half-typed are exactly as they were on "Back to
        cart". */}
    <div className={cn('grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_392px] gap-5 lg:h-[calc(100vh-196px)] lg:min-h-[540px]', showCheckout && 'hidden')}>
      {/* Product Selection Area */}
      <div className="flex flex-col min-h-0 min-w-0">
        <div className="m-rise flex items-center gap-2.5 mb-3" style={{ '--i': 1 }}>
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-mute pointer-events-none" size={16} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search by name, SKU or scan a barcode"
              className="w-full h-10 rounded-pill bg-well pl-10 pr-12 text-[13.5px] text-ink outline-none placeholder:text-mute transition-shadow duration-(--dur-press) focus:shadow-[inset_0_0_0_2px_var(--color-ink)]"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onKeyDown={handleSearchEnter}
            />
            {canCameraScan ? (
              <button
                type="button"
                onClick={() => setScanOpen(true)}
                aria-label="Scan a barcode with the camera"
                title="Scan with the camera"
                className="m-press absolute right-1.5 top-1/2 -translate-y-1/2 grid place-items-center w-7 h-7 rounded-xl bg-surface text-ink-2 shadow-[0_0_0_1px_var(--color-line)] hover:bg-tile"
              >
                <ScanBarcode size={15} />
              </button>
            ) : (
              // No camera API here -- a scanner gun types into this box instead,
              // so the icon stays as a hint about what the field accepts.
              <ScanBarcode
                size={16}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-mute pointer-events-none"
              />
            )}
          </div>
          <div className="inline-flex shrink-0 rounded-pill bg-well p-[3px]" role="group" aria-label="View">
            {[['list', 'List view', List], ['grid', 'Grid view', LayoutGrid]].map(([mode, label, Icon]) => (
              <button key={mode} type="button" onClick={() => setViewMode(mode)} aria-label={label} title={label} aria-pressed={viewMode === mode}
                className={cn('m-press grid place-items-center px-2.5 py-1.5 rounded-pill',
                  viewMode === mode ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(17,20,24,0.12)]' : 'text-body hover:text-ink')}>
                <Icon size={15} />
              </button>
            ))}
          </div>
        </div>

        {/* Category pills */}
        {productCategories.length > 0 && (
          <div className="m-rise mb-3.5 shrink-0" style={{ '--i': 2 }}>
            <FilterPills
              ariaLabel="Category"
              className="flex-nowrap overflow-x-auto no-scrollbar"
              items={[{ key: 'ALL', label: 'All' }, ...productCategories.map(c => ({ key: c, label: c }))]}
              value={categoryFilter}
              onChange={(c) => setCategoryFilter(c === categoryFilter ? 'ALL' : c)}
            />
          </div>
        )}

        {/* GRID view: tap a tile to add it; "One less" takes one off. */}
        {viewMode === 'grid' && (
        <div className="m-rise grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 overflow-y-auto pr-1 pb-4 content-start min-h-0 max-h-[60vh] lg:max-h-none" style={{ '--i': 3 }}>
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
              role="button"
              tabIndex={outOfStock ? -1 : 0}
              aria-disabled={outOfStock || undefined}
              aria-label={`Add ${product.name}`}
              onClick={() => !outOfStock && addToCart(product)}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget || outOfStock) return;
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addToCart(product); }
              }}
              className={cn('m-press relative flex flex-col rounded-xl border bg-surface p-3 text-left',
                outOfStock ? 'opacity-50 cursor-not-allowed border-line'
                  : inCart ? 'cursor-pointer border-amber shadow-[inset_0_0_0_1px_var(--color-amber)] hover:bg-tile'
                  : ms.isLoss ? 'cursor-pointer border-[#F5C2C2] hover:bg-tile'
                  : 'cursor-pointer border-line hover:bg-tile')}>
              {cartQty > 0 && (
                <span className="absolute top-2.5 right-2.5 min-w-[22px] h-[22px] px-1.5 rounded-pill bg-amber text-white font-tight text-[12px] font-semibold grid place-items-center tabular-nums">{cartQty}</span>
              )}
              <div className="w-[38px] h-[38px] rounded-[10px] overflow-hidden bg-tile grid place-items-center mb-2.5">
                {product.image
                  ? <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                  : <span className="font-tight text-[12.5px] font-semibold text-body uppercase">{(product.name||'?').slice(0,2)}</span>}
              </div>
              <b className="block font-tight text-[13.5px] font-semibold leading-[1.3] text-ink line-clamp-2 min-h-[35px]">{product.name}</b>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className={cn('font-tight text-[15px] font-semibold tabular-nums', ms.isLoss ? 'text-bad-text' : 'text-ink')}>{formatCurrency(product.sellingPrice)}</span>
                {product.taxRate > 0 && <small className="text-[11.5px] text-mute">{product.taxRate}% GST</small>}
              </div>
              <div className={cn('mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-body', cartQty > 0 && 'pr-8')}>
                {stockFlags(product, { stock, isSvc, outOfStock, lowStock, ms })}
              </div>
              {!outOfStock && cartQty > 0 && (
                <button type="button" onClick={(e) => { e.stopPropagation(); updateQuantity(product.id, -1); }}
                  aria-label={`One less ${product.name}`} title="One less"
                  className="m-press absolute bottom-2.5 right-2.5 grid place-items-center w-7 h-7 rounded-xl bg-well text-ink-2 hover:bg-[#E8E8E7]">
                  <Minus size={14} />
                </button>
              )}
            </div>
            );
          })}
        </div>
        )}

        {viewMode === 'list' && (
        <div className="m-rise flex flex-col overflow-y-auto pr-1 pb-4 min-h-0 max-h-[60vh] lg:max-h-none" style={{ '--i': 3 }}>
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
              className={cn('group flex items-center gap-3 px-3 py-2.5 rounded-xl border-b border-sep last:border-b-0 transition-colors duration-(--dur-press)',
                outOfStock ? 'opacity-50 cursor-not-allowed'
                  : inCart ? 'cursor-pointer bg-amber-soft/60 shadow-[inset_0_0_0_1px_var(--color-amber)] hover:bg-amber-soft'
                  : ms.isLoss ? 'cursor-pointer bg-bad-soft/50 hover:bg-bad-soft'
                  : ms.belowFloor ? 'cursor-pointer bg-amber-soft/40 hover:bg-amber-soft/70'
                  : 'cursor-pointer hover:bg-tile')}
            >
              {/* Thumbnail / initial */}
              <div className="relative shrink-0">
                <div className="w-9 h-9 rounded-[10px] grid place-items-center overflow-hidden bg-tile">
                  {product.image
                    ? <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                    : <span className="font-tight text-[12px] font-semibold text-body uppercase">{(product.name || '?').slice(0, 2)}</span>
                  }
                </div>
                {cartQty > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-pill bg-amber text-white font-tight text-[10.5px] font-semibold grid place-items-center ring-2 ring-surface tabular-nums">
                    {cartQty}
                  </span>
                )}
              </div>

              {/* Name + SKU */}
              <div className="flex-1 min-w-0">
                <div className="font-tight text-[13.5px] font-semibold text-ink truncate leading-tight">{product.name}</div>
                {product.sku && <div className="text-[12px] text-mute truncate">{product.sku}</div>}
              </div>

              {/* Price + tax, then stock and flags */}
              <div className="text-right shrink-0">
                <div className="flex items-baseline justify-end gap-1.5">
                  <span className={cn('font-tight text-[14px] font-semibold tabular-nums leading-none', ms.isLoss ? 'text-bad-text' : 'text-ink')}>
                    {formatCurrency(product.sellingPrice)}
                  </span>
                  {product.taxRate > 0 && <small className="text-[11.5px] text-mute">{product.taxRate}% GST</small>}
                </div>
                <div className="mt-1 flex flex-wrap items-center justify-end gap-1.5 text-[12px] text-body">
                  {stockFlags(product, { stock, isSvc, outOfStock, lowStock, ms })}
                </div>
              </div>

              {/* Add / quantity stepper. When the item is in the cart show
                  −/qty/+; otherwise a single + that's always a clear tap
                  target (the whole row is still clickable too). */}
              {!outOfStock && (
                cartQty > 0 ? (
                  <div className="flex items-center rounded-pill bg-well shrink-0" onClick={e => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => updateQuantity(product.id, -1)}
                      aria-label="One less"
                      className="m-press grid place-items-center w-7 h-7 rounded-xl text-ink-2 hover:bg-[#E8E8E7]"
                    ><Minus size={13} /></button>
                    <span className="min-w-[22px] text-center font-tight text-[13px] font-semibold text-ink tabular-nums">{cartQty}</span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(product.id, 1)}
                      aria-label="One more"
                      className="m-press grid place-items-center w-7 h-7 rounded-xl text-ink-2 hover:bg-[#E8E8E7]"
                    ><Plus size={13} /></button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); addToCart(product); }}
                    aria-label={`Add ${product.name}`}
                    className="m-press grid place-items-center w-8 h-8 rounded-xl bg-well text-ink-2 opacity-70 group-hover:opacity-100 hover:bg-amber hover:text-white shrink-0"
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
      <aside className="m-rise flex flex-col min-h-0 rounded-[14px] border border-line bg-surface" style={{ '--i': 2 }} aria-label="Cart">
        {/* Cart header */}
        <div className="flex items-center gap-2 px-[18px] pt-4 pb-3 flex-wrap">
          <h3 className="font-tight text-[16px] font-semibold text-ink">Cart</h3>
          <span className="mr-auto text-[13px] text-body">· {itemWord(cart.length)}</span>
          {/* Store selector — only when the tenant has more than one POS
              store. Tags the sale with where it was rung. */}
          {stores.length > 1 && (
            <label className="relative inline-flex items-center gap-1.5 rounded-pill pl-3 pr-7 py-[5px] font-tight text-[12.5px] font-semibold text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)] cursor-pointer" title="Store this sale is rung at">
              <em className="not-italic font-medium text-mute">Store</em>
              <select
                value={storeId}
                onChange={e => setStoreId(e.target.value)}
                className="appearance-none bg-transparent outline-none cursor-pointer max-w-[120px] truncate"
              >
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <ChevronDown size={13} className="absolute right-2.5 text-mute pointer-events-none" />
            </label>
          )}
          {tableLabel && cart.length > 0 && (
            <Button variant="dark" size="xs" onClick={handleSendKOT} disabled={unsentKOTCount === 0} title="Send to kitchen">
              <ChefHat /> Send KOT{unsentKOTCount > 0 ? ` (${unsentKOTCount})` : ''}
            </Button>
          )}
          {cart.length > 0 && (
            <Button variant="secondary" size="xs" onClick={holdSale} title="Hold sale">Hold</Button>
          )}
        </div>

        {/* Parked / held sales — tap to resume. */}
        {parked.length > 0 && (
          <div className="flex items-center gap-1.5 px-[18px] pb-3 overflow-x-auto no-scrollbar">
            <span className={cn(secHead, 'shrink-0 mr-0.5')}>Held · {parked.length}</span>
            {parked.map(p => (
              <button key={p.id} type="button" onClick={() => resumeSale(p)} title="Resume this sale"
                className="m-press inline-flex items-center gap-1.5 shrink-0 rounded-pill bg-tile px-2.5 py-[5px] font-tight text-[12px] font-semibold text-ink-2 hover:bg-well">
                {p.label}
                <span role="button" aria-label="Remove held sale" title="Remove held sale"
                  onClick={(e) => { e.stopPropagation(); persistParked(parked.filter(x => x.id !== p.id)); }}
                  className="text-mute hover:text-bad-text"><X size={12} /></span>
              </button>
            ))}
          </div>
        )}

        {/* Client — Walk-in by default; search, pick, or add a new one. */}
        <div ref={clientDropRef} className="relative mx-[18px] mb-1.5">
          {selectedClientId !== 'WALKIN' && !clientDropOpen ? (
            <>
              <div className="flex items-center gap-2.5 rounded-xl bg-tile px-3 py-2.5">
                <span className="grid place-items-center w-8 h-8 shrink-0 rounded-full bg-amber-soft font-tight text-[12px] font-semibold text-amber-text">{initialsOf(selectedClient?.name)}</span>
                <span className="min-w-0 flex-1">
                  <b className="block font-tight text-[13.5px] font-semibold text-ink truncate">{selectedClient?.name || 'Unknown'}</b>
                  {(selectedClient?.phone || selectedClient?.address) && (
                    <small className="block text-[12px] text-mute truncate">{selectedClient?.phone || selectedClient?.address}</small>
                  )}
                </span>
                <Button variant="link" size="xs" className="px-0 h-auto"
                  onClick={() => { setClientDropOpen(true); setTimeout(() => clientInputRef.current?.focus(), 0); }}>
                  Change
                </Button>
                <button
                  type="button"
                  onClick={() => { setSelectedClientId('WALKIN'); setClientSearch(''); setClientDropOpen(false); }}
                  aria-label="Back to walk-in" title="Back to walk-in"
                  className="m-press grid place-items-center w-6 h-6 rounded-xl bg-well text-mute hover:text-ink shrink-0"
                >
                  <X size={12} />
                </button>
              </div>
              {Number(selectedClient?.outstanding_balance) > 0 && (
                <div className="mt-1 pl-0.5 text-[12px] text-amber-text tabular-nums">
                  Already owes {formatCurrency(selectedClient.outstanding_balance)}
                </div>
              )}
            </>
          ) : (
            /* Search input — always visible when no client selected or editing */
            <div className="relative">
              <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-mute pointer-events-none" />
              <input
                ref={clientInputRef}
                type="text"
                aria-label="Client"
                placeholder="Walk-in. Search a client by name or phone"
                className={cn(fieldCls, 'h-10 rounded-xl bg-tile pl-9 pr-8 shadow-none')}
                value={clientSearch}
                onChange={e => { setClientSearch(e.target.value); setClientDropOpen(true); }}
                onFocus={() => setClientDropOpen(true)}
              />
              {clientSearch && (
                <button
                  type="button"
                  onClick={() => { setClientSearch(''); setClientDropOpen(false); }}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-mute hover:text-ink"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          )}

          {/* Dropdown results */}
          {clientDropOpen && (
            <div className="m-dialog absolute z-50 top-full mt-1 left-0 right-0 bg-surface rounded-xl shadow-[0_0_0_1px_var(--color-line),0_16px_40px_-16px_rgba(17,20,24,0.35)] overflow-hidden">
              <div className="max-h-52 overflow-y-auto">
                {/* Walk-in option */}
                <button
                  type="button"
                  onClick={() => { setSelectedClientId('WALKIN'); setClientDropOpen(false); setClientSearch(''); }}
                  className={cn('w-full text-left px-3.5 py-2.5 font-tight text-[13px] font-semibold flex items-center justify-between hover:bg-tile border-b border-sep',
                    selectedClientId === 'WALKIN' ? 'text-amber-text bg-amber-soft/50' : 'text-ink-2')}
                >
                  Walk-in, no client
                  {selectedClientId === 'WALKIN' && <Check size={13} />}
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
                      className={cn('w-full text-left px-3.5 py-2 flex items-center justify-between hover:bg-tile', selectedClientId === c.id && 'bg-amber-soft/50')}
                    >
                      <span className="flex flex-col min-w-0 flex-1">
                        <span className={cn('font-tight text-[13px] font-semibold truncate', selectedClientId === c.id ? 'text-amber-text' : 'text-ink')}>
                          {c.name || 'Unnamed'}
                        </span>
                        {(c.phone || c.address) && (
                          <span className="text-[11.5px] text-mute truncate">
                            {c.phone || c.address}
                          </span>
                        )}
                      </span>
                      {Number(c.outstanding_balance) > 0 && (
                        <Badge tone="warn" className="ml-2 shrink-0">Due {formatCurrency(c.outstanding_balance)}</Badge>
                      )}
                      {selectedClientId === c.id && <Check size={13} className="shrink-0 text-amber-text ml-2" />}
                    </button>
                  ))
                }

                {/* Empty state */}
                {clientSearch && allClients.filter(c =>
                  (c.name || '').toLowerCase().includes(clientSearch.toLowerCase()) ||
                  (c.phone || '').toLowerCase().includes(clientSearch.toLowerCase())
                ).length === 0 && (
                  <div className="px-4 py-4 text-center text-[12px] text-mute">No clients match "{clientSearch}"</div>
                )}
              </div>

              {/* Add new customer */}
              {!showAddCust ? (
                <button
                  type="button"
                  onClick={() => { setShowAddCust(true); setNewCust(n => ({ ...n, name: clientSearch.trim() })); }}
                  className="w-full text-left px-3.5 py-2.5 font-tight text-[13px] font-semibold flex items-center gap-2 text-amber-text hover:bg-amber-soft/50 border-t border-sep"
                >
                  <Plus size={14} /> Add new customer
                </button>
              ) : (
                <div className="p-3 border-t border-sep bg-tile space-y-2">
                  <div className="flex gap-1 rounded-pill bg-well p-[3px]" role="group" aria-label="Customer type">
                    {[['B2C', 'Individual'], ['B2B', 'Business']].map(([v, label]) => (
                      <button key={v} type="button" onClick={() => setNewCust(n => ({ ...n, type: v }))} aria-pressed={newCust.type === v}
                        className={cn('m-press flex-1 px-3 py-1.5 rounded-pill font-tight text-[12.5px] font-semibold',
                          newCust.type === v ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(17,20,24,0.12)]' : 'text-body hover:text-ink')}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <input value={newCust.name} onChange={e => setNewCust(n => ({ ...n, name: e.target.value }))}
                    placeholder="Customer name*" aria-label="Customer name"
                    className={fieldCls} />
                  <input value={newCust.phone} onChange={e => setNewCust(n => ({ ...n, phone: e.target.value }))}
                    inputMode="numeric" placeholder="Phone number*" aria-label="Phone number"
                    className={fieldCls} />
                  {newCust.type === 'B2C' ? (
                    <input value={newCust.aadhaar} onChange={e => setNewCust(n => ({ ...n, aadhaar: e.target.value }))}
                      inputMode="numeric" placeholder="Aadhaar, optional, 12 digits" aria-label="Aadhaar"
                      className={fieldCls} />
                  ) : (
                    <input value={newCust.gstin} onChange={e => setNewCust(n => ({ ...n, gstin: e.target.value.toUpperCase() }))}
                      placeholder="GSTIN, optional, 15 characters" aria-label="GSTIN"
                      className={fieldCls} />
                  )}
                  <div key={custShake ? custErr : 'ok'} className={custShake}><FieldError message={custErr} /></div>
                  <div className="flex gap-2 pt-0.5">
                    <Button variant="secondary" size="sm" className="flex-1 bg-surface" onClick={() => setShowAddCust(false)}>Cancel</Button>
                    <Button size="sm" className="flex-1" onClick={saveNewCustomer} disabled={savingCust}>
                      {savingCust ? 'Saving' : 'Save and select'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Lines */}
        <div ref={cartScrollRef} className="flex-1 min-h-[120px] overflow-y-auto scroll-smooth px-[18px] pt-1">
          {cart.map(item => {
            const cost = fifoCosts[item.productId] ?? 0;
            const belowCost = cost > 0 && item.price <= cost;
            const k = item.uid || item.productId;
            return (
              <div
                key={k}
                data-cart-row={k}
                className={cn('grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-1.5 py-[11px] border-t border-sep first:border-t-0',
                  belowCost && 'bg-bad-soft -mx-2 px-2 rounded-lg')}
              >
                {/* Product name + modifiers + below-cost hint + unit toggle */}
                <div className="min-w-0">
                  <b className="block font-tight text-[13.5px] font-semibold text-ink truncate">{item.name}</b>
                  {item.modLabel && (
                    <div className="text-[12px] font-medium text-amber-text truncate">+ {item.modLabel}</div>
                  )}
                  {/* Sell by base unit or alternate (packet). Only shown when the
                      product carries an alt unit. Deducts base either way. */}
                  {convOf(item.productId) > 0 && (
                    <button
                      type="button"
                      onClick={() => toggleLineUnit(k)}
                      className="mt-0.5 inline-flex items-center gap-1 font-tight text-[11.5px] font-semibold text-amber-text hover:underline"
                      title={`1 ${productById[item.productId].secondary_unit} = ${convOf(item.productId)} ${unitOf(item.productId)}`}
                    >
                      {isAlt(item)
                        ? <>by {productById[item.productId].secondary_unit} · {formatQtyWithUnit(item.quantity, unitOf(item.productId))} stock</>
                        : <>sell by {productById[item.productId].secondary_unit}?</>}
                    </button>
                  )}
                  {belowCost && (
                    <div className="text-[12px] font-semibold text-bad-text mt-0.5 tabular-nums">
                      Min cost: {formatCurrency(cost)}
                    </div>
                  )}
                </div>

                {/* Line total */}
                <div className="font-tight text-[14px] font-semibold text-ink tabular-nums text-right">
                  {formatCurrency(item.price * item.quantity)}
                </div>

                {/* Quantity, price, remove. The quantity control is its own
                    component: see QtyField for why. */}
                <div className="flex items-start gap-2 text-[12px] text-mute">
                  <div className="flex flex-col items-center gap-0.5">
                    <QtyField
                      value={toDispQty(item)}
                      unit={dispUnit(item)}
                      onStep={(d) => updateQuantity(k, d)}
                      onCommit={(text) => setQuantityDirect(k, text)}
                    />
                    {!isAlt(item) && subQtyLabel(item.quantity, unitOf(item.productId)) && (
                      <div className="text-[10.5px] text-mute tabular-nums leading-none">
                        {subQtyLabel(item.quantity, unitOf(item.productId))}
                      </div>
                    )}
                  </div>
                  <div className="relative w-[84px]">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12.5px] text-mute pointer-events-none">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      aria-label={`Price of ${item.name}`}
                      value={toDispPrice(item)}
                      onChange={e => setItemPrice(k, e.target.value)}
                      className={cn('w-full h-7 pl-5 pr-1.5 rounded-lg bg-surface font-tight text-[12.5px] font-medium tabular-nums outline-none transition-shadow duration-(--dur-press)',
                        belowCost
                          ? 'text-bad-text shadow-[inset_0_0_0_1px_#F5C2C2] focus:shadow-[inset_0_0_0_2px_var(--color-bad)]'
                          : 'text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)] focus:shadow-[inset_0_0_0_2px_var(--color-ink)]')}
                    />
                  </div>
                  <span className="h-7 leading-7">each</span>
                </div>

                {/* Remove */}
                <button
                  type="button"
                  onClick={() => setCart(prev => prev.filter(i => (i.uid || i.productId) !== k))}
                  aria-label={`Remove ${item.name}`} title="Remove"
                  className="justify-self-end self-start mt-1 text-faint hover:text-bad-text transition-colors duration-(--dur-press)"
                >
                  <X size={14} strokeWidth={2} />
                </button>
              </div>
            );
          })}
          {cart.length === 0 && (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Package size={32} className="mb-2 text-faint" />
              <div className="text-[13px] text-body mb-4">Cart is empty</div>
              {quickAddProducts.length > 0 && (
                <div className="w-full text-left">
                  <div className={cn(secHead, 'mb-2')}>Quick add</div>
                  <div className="grid grid-cols-2 gap-2">
                    {quickAddProducts.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        data-card
                        onClick={() => addToCart(p)}
                        className="m-press rounded-xl px-3 py-2.5 text-left bg-surface shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile"
                      >
                        <div className="font-tight text-[13px] font-semibold text-ink truncate">{p.name}</div>
                        <div className="font-tight text-[12px] font-medium text-body tabular-nums mt-0.5">{formatCurrency(p.sellingPrice)}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-[18px] pb-[18px] border-t border-line">
          {/* Service charge (restaurant) */}
          {isRestoPOS && (
            <div className="flex items-center gap-2 mt-3">
              <span className={cn(secHead, 'w-14')}>Service</span>
              <div className="flex gap-1 flex-1">
                {[0, 5, 10].map(pct => (
                  <button key={pct} type="button" onClick={() => setServiceChargePct(pct)} aria-pressed={Number(serviceChargePct) === pct}
                    className={cn('m-press flex-1 px-2 py-1.5 rounded-pill font-tight text-[12.5px] font-semibold',
                      Number(serviceChargePct) === pct ? 'bg-ink text-white' : 'bg-well text-body hover:text-ink')}>
                    {pct === 0 ? 'None' : `${pct}%`}
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Split bill (restaurant) — equal split display aid */}
          {isRestoPOS && total > 0 && (
            <div className="flex items-center gap-2 mt-3">
              <span className={cn(secHead, 'w-14')}>Split</span>
              <div className="flex items-center rounded-pill bg-well">
                <button type="button" onClick={() => setSplitN(n => Math.max(1, n - 1))} aria-label="Fewer guests" className="m-press grid place-items-center w-7 h-7 rounded-xl text-ink-2 hover:bg-[#E8E8E7]"><Minus size={12} /></button>
                <span className="min-w-[22px] text-center font-tight text-[13px] font-semibold tabular-nums">{splitN}</span>
                <button type="button" onClick={() => setSplitN(n => n + 1)} aria-label="More guests" className="m-press grid place-items-center w-7 h-7 rounded-xl text-ink-2 hover:bg-[#E8E8E7]"><Plus size={12} /></button>
              </div>
              {splitN > 1 && (
                <span className="font-tight text-[12.5px] font-semibold text-amber-text ml-auto tabular-nums">
                  {formatCurrency(total / splitN)} <span className="text-mute font-normal">per guest</span>
                </span>
              )}
            </div>
          )}
          {/* Order discount (flat amount) */}
          <div className="flex items-center justify-between gap-2.5 mt-3 text-[13px] text-body">
            <label htmlFor="pos-discount">Discount, flat ₹</label>
            <div className="relative w-[120px]">
              <input
                id="pos-discount"
                type="number" min="0" inputMode="decimal" placeholder="0"
                className={cn(fieldCls, 'text-right', discountAmt > 0 && 'pr-8')}
                value={discount}
                onChange={e => setDiscount(e.target.value)}
              />
              {discountAmt > 0 && (
                <button type="button" onClick={() => setDiscount('')} aria-label="Clear discount"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-mute hover:text-bad-text"><X size={13} /></button>
              )}
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-line">
            <div className="flex justify-between py-[3px] text-[13px] text-body">
              <span>{taxInclusive ? 'Subtotal, without tax' : 'Subtotal'}</span>
              <span className="font-tight font-medium text-ink-2 tabular-nums">{formatCurrency(taxableAmount)}</span>
            </div>
            <div className="flex justify-between py-[3px] text-[13px] text-body">
              <span>{taxInclusive ? 'Tax, included' : 'Tax'}</span>
              <span className="font-tight font-medium text-ink-2 tabular-nums">{formatCurrency(tax)}</span>
            </div>
            {serviceChargeAmt > 0 && (
              <div className="flex justify-between py-[3px] text-[13px] text-body">
                <span>Service charge ({serviceChargePct}%)</span>
                <span className="font-tight font-medium text-ink-2 tabular-nums">{formatCurrency(serviceChargeAmt)}</span>
              </div>
            )}
            {discountAmt > 0 && (
              <div className="flex justify-between py-[3px] text-[13px] text-body">
                <span>Discount</span>
                <span className="font-tight font-medium text-bad-text tabular-nums">−{formatCurrency(discountAmt)}</span>
              </div>
            )}
            <div className="flex justify-between items-baseline mt-2 pt-2.5 border-t border-sep font-tight font-semibold text-ink">
              <span className="text-[15px]">Total</span>
              <span className="text-[24px] tracking-[-0.02em] tabular-nums"><RollingNumber text={formatCurrency(total)} /></span>
            </div>
            {taxInclusive && (
              <p className="mt-1 text-[12px] text-mute">
                Listed prices include GST, so the subtotal is shown without tax.
              </p>
            )}
          </div>

          {/* Below-cost hard block */}
          {(() => {
            const belowCostItems = cart.filter(item => {
              const cost = fifoCosts[item.productId] ?? 0;
              return cost > 0 && item.price <= cost;  // at OR below cost — same-as-purchase counts
            });
            const hasFloorWarn = cart.some(item => {
              const ms = marginStatus[item.productId];
              return ms?.belowFloor && !ms?.isLoss;
            });
            return (
              <>
                {belowCostItems.length > 0 && (
                  <div className="flex items-start gap-2 mt-3 px-3 py-2.5 rounded-xl bg-bad-soft text-bad-text">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <p className="text-[12.5px] font-medium leading-snug">
                      {isOwner ? 'At or below purchase cost' : 'Cannot sell at or below purchase cost'}. {belowCostItems.map(i => i.name).join(', ')}.{isOwner ? ' Owner override, you may still checkout.' : ''}
                    </p>
                  </div>
                )}
                {hasFloorWarn && belowCostItems.length === 0 && (
                  <div className="flex items-start gap-2 mt-3 px-3 py-2.5 rounded-xl bg-amber-soft text-amber-text">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <p className="text-[12.5px] font-medium leading-snug">
                      Some items are below your minimum margin floor.
                    </p>
                  </div>
                )}
                <Button
                  size="lg"
                  disabled={cart.length === 0 || (belowCostItems.length > 0 && !isOwner)}
                  onClick={() => setShowCheckout(true)}
                  className="w-full mt-3.5 justify-between px-5"
                >
                  <span>Checkout</span>
                  <span className="tabular-nums">{formatCurrency(total)}</span>
                </Button>
              </>
            );
          })()}
        </div>
      </aside>
    </div>

      {/* Full-page Checkout */}
      {showCheckout && (
      <section aria-label="Checkout">
        {/* Header */}
        <div className="m-rise flex items-center gap-3.5 mb-[18px]">
          <button
            type="button"
            onClick={() => setShowCheckout(false)}
            className="inline-flex items-center gap-1.5 font-tight text-[13px] font-semibold text-body hover:text-ink transition-colors duration-(--dur-press)"
          >
            <ChevronLeft size={15} /> Back to cart
          </button>
          <h3 className="font-tight text-[20px] font-semibold tracking-[-0.02em] text-ink">Checkout</h3>
          <span className="text-[13px] text-body">{itemWord(cart.length)}</span>
        </div>

        {/* Body */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-5 items-start">

            {/* Left: Order Summary */}
            <div className="space-y-4 min-w-0">
              <Card className="m-rise" style={{ '--i': 1 }}>
                <CardHeader title="Order summary" aside={
                  <Badge tone={taxInclusive ? 'info' : 'neutral'}>{taxInclusive ? 'Prices include GST' : 'Tax exclusive'}</Badge>
                } />
                <div className="mt-2">
                  {cart.map((item) => (
                    <div key={item.uid || item.productId} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-[9px] border-t border-sep first:border-t-0">
                      <div className="min-w-0">
                        <div className="text-[13.5px] text-ink truncate">{item.name}</div>
                        {item.modLabel && <div className="text-[12px] font-medium text-amber-text truncate">+ {item.modLabel}</div>}
                        <small className="block text-[12px] text-mute tabular-nums">{formatCurrency(item.price)} × {item.quantity}</small>
                      </div>
                      <div className="font-tight text-[13.5px] font-medium text-ink tabular-nums">
                        {formatCurrency(item.price * item.quantity)}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Totals */}
                <div className="mt-3.5 rounded-xl bg-tile px-3.5 py-3">
                  <div className="flex justify-between py-[3px] text-[13px] text-body">
                    <span>{taxInclusive ? 'Taxable, taken out of the prices' : 'Subtotal'}</span>
                    <span className="font-tight font-medium text-ink-2 tabular-nums">{formatCurrency(taxableAmount)}</span>
                  </div>
                  {tax > 0 && (
                    <div className="flex justify-between py-[3px] text-[13px] text-body">
                      <span>{taxInclusive ? 'GST, included' : 'GST'}</span><span className="font-tight font-medium text-ink-2 tabular-nums">{formatCurrency(tax)}</span>
                    </div>
                  )}
                  {deliveryFeeAmt > 0 && (
                    <div className="flex justify-between py-[3px] text-[13px] text-body">
                      <span className="flex items-center gap-1"><Truck size={12} /> Delivery fee</span>
                      <span className="font-tight font-medium text-ink-2 tabular-nums">+{formatCurrency(deliveryFeeAmt)}</span>
                    </div>
                  )}
                  {discountAmt > 0 && (
                    <div className="flex justify-between py-[3px] text-[13px] text-body">
                      <span>Discount</span>
                      <span className="font-tight font-medium text-bad-text tabular-nums">−{formatCurrency(discountAmt)}</span>
                    </div>
                  )}
                  <div className="flex justify-between mt-1.5 pt-[9px] border-t border-line font-tight text-[14px] font-semibold text-ink">
                    <span>Total</span><span className="tabular-nums">{formatCurrency(total)}</span>
                  </div>
                </div>
              </Card>

              {/* The client, what they already owe, and what this bill makes
                  it. Whether to extend more credit is decided by the total
                  exposure, not by this bill alone, so the cashier should not
                  have to add it up in their head at the counter. */}
              {selectedClient && (() => {
                const due = Number(selectedClient?.outstanding_balance) || 0;
                return (
                  <Card className="m-rise" style={{ '--i': 2 }}>
                    <div className="flex items-center gap-2.5">
                      <span className="grid place-items-center w-8 h-8 shrink-0 rounded-full bg-amber-soft font-tight text-[12px] font-semibold text-amber-text">{initialsOf(selectedClient.name)}</span>
                      <div className="min-w-0">
                        <h3 className="font-tight text-[15px] font-semibold text-ink truncate">{selectedClient.name}</h3>
                        {selectedClient.phone && <div className="text-[12.5px] text-body">{selectedClient.phone}</div>}
                      </div>
                    </div>
                    {due > 0.01 && (
                      <div className="grid grid-cols-2 gap-2.5 mt-3">
                        <div className="rounded-xl bg-tile px-3.5 py-3">
                          <span className={secHead}>Already owes</span>
                          <b className="block mt-0.5 font-tight text-[18px] font-semibold text-ink tabular-nums">{formatCurrency(due)}</b>
                        </div>
                        <div className="rounded-xl bg-amber-soft px-3.5 py-3">
                          <span className={cn(secHead, 'text-amber-text')}>With this bill</span>
                          <b className="block mt-0.5 font-tight text-[18px] font-semibold text-ink tabular-nums">{formatCurrency(due + total)}</b>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })()}
            </div>

            {/* Right: Fulfillment + Payment */}
            <div className="min-w-0">

              {/* The figure the cashier acts on — deliberately the largest
                  thing in the panel, and it renames itself as the sale
                  progresses (due → change → still to collect). See
                  `checkoutMoney`. */}
              {(() => {
                const tone = {
                  due:    'bg-ink text-white',
                  credit: 'bg-ink text-white',
                  change: 'bg-good text-white',
                  exact:  'bg-good text-white',
                  short:  'bg-amber text-white',
                  // Green says "hand it back, done". This one is an open
                  // decision, not a completed action, so it reads neutral.
                  'change-or-credit': 'bg-ink text-white',
                  // Fall back rather than render `undefined` as a class, which
                  // paints white text on a transparent panel.
                }[money.tone] || 'bg-ink text-white';
                return (
                  <div className={cn('m-rise rounded-[14px] px-5 py-[18px]', tone)} style={{ '--i': 1 }} aria-live="polite">
                    <div className="font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-white/70">
                      {money.label}
                    </div>
                    <div className="mt-2 mb-1.5 font-tight text-[36px] leading-[1.05] font-semibold tracking-[-0.03em] tabular-nums">
                      {formatCurrency(money.value)}
                    </div>
                    {money.sub && (
                      <div className="text-[12.5px] leading-[1.4] text-white/80">{money.sub}</div>
                    )}
                  </div>
                );
              })()}

              <div className="m-rise" style={{ '--i': 2 }}>
              {/* Fulfillment */}
              <div className={cn(secHead, 'mt-[18px] mb-2')}>Fulfilment</div>
              <OptionGroup cols={2} aria-label="Fulfilment">
                {[
                  { key: 'PICKUP',   label: 'Store pickup', icon: <Store />,  desc: 'Collect from store' },
                  { key: 'DELIVERY', label: 'Delivery',     icon: <Truck />,  desc: 'Van delivery' },
                ].map(({ key, label, icon, desc }) => (
                  <OptionCard key={key} selected={fulfillmentType === key} onClick={() => setFulfillmentType(key)}
                    icon={icon} title={label} hint={desc} />
                ))}
              </OptionGroup>

              {/* Delivery Details */}
              {fulfillmentType === 'DELIVERY' && (
                <div className="mt-2.5 rounded-xl border border-line p-3.5 space-y-3">
                  {/* Address — pre-filled from client, user can pick or override */}
                  <div>
                    <label htmlFor="co-del-address" className="flex items-center gap-1 mb-1.5 font-tight text-[12.5px] font-semibold text-ink-2">
                      <MapPin size={12} /> Delivery address
                    </label>
                    {/* Client address shortcut */}
                    {selectedClientId !== 'WALKIN' && (() => {
                      const client = allClients.find(c => c.id === selectedClientId);
                      return client?.address && deliveryDetails.address !== client.address ? (
                        <button
                          type="button"
                          data-card
                          onClick={() => setDeliveryDetails(p => ({ ...p, address: client.address }))}
                          className="m-press w-full mb-2 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-soft text-left hover:bg-amber-soft/70"
                        >
                          <MapPin size={13} className="text-amber-text shrink-0" />
                          <div className="min-w-0">
                            <div className="font-tight text-[12px] font-semibold text-amber-text">Use client address</div>
                            <div className="text-[12px] text-ink truncate">{client.address}</div>
                          </div>
                          <Check size={13} className="text-amber-text shrink-0 ml-auto" />
                        </button>
                      ) : null;
                    })()}
                    <textarea
                      id="co-del-address"
                      rows={2}
                      placeholder="Full delivery address"
                      value={deliveryDetails.address}
                      onChange={e => setDeliveryDetails(p => ({ ...p, address: e.target.value }))}
                      className={cn(fieldCls, 'h-auto py-2 resize-none')}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="co-del-zone" className="block mb-1.5 font-tight text-[12.5px] font-semibold text-ink-2">Zone or area</label>
                      <input id="co-del-zone" type="text" placeholder="e.g. North zone"
                        value={deliveryDetails.zone}
                        onChange={e => setDeliveryDetails(p => ({ ...p, zone: e.target.value }))}
                        className={fieldCls}
                      />
                    </div>
                    <div>
                      <label htmlFor="co-del-date" className="flex items-center gap-1 mb-1.5 font-tight text-[12.5px] font-semibold text-ink-2"><Calendar size={12} /> Date</label>
                      <input id="co-del-date" type="date"
                        value={deliveryDetails.date}
                        min={new Date().toISOString().split('T')[0]}
                        onChange={e => setDeliveryDetails(p => ({ ...p, date: e.target.value }))}
                        className={fieldCls}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="co-del-fee" className="block mb-1.5 font-tight text-[12.5px] font-semibold text-ink-2">Delivery fee</label>
                      <input id="co-del-fee" type="number" placeholder="0" min="0"
                        value={deliveryDetails.fee}
                        onChange={e => setDeliveryDetails(p => ({ ...p, fee: e.target.value }))}
                        className={fieldCls}
                      />
                    </div>
                    <div>
                      <label htmlFor="co-del-notes" className="flex items-center gap-1 mb-1.5 font-tight text-[12.5px] font-semibold text-ink-2"><MessageSquare size={12} /> Notes</label>
                      <input id="co-del-notes" type="text" placeholder="e.g. Call before"
                        value={deliveryDetails.notes}
                        onChange={e => setDeliveryDetails(p => ({ ...p, notes: e.target.value }))}
                        className={fieldCls}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* IMEI / serial capture for serialized products */}
              {serialLines.length > 0 && (
                <div className="mt-3 rounded-xl bg-amber-soft p-3.5">
                  <div className={cn(secHead, 'text-amber-text mb-2')}>IMEI or serial number</div>
                  <div className="space-y-3">
                    {serialLines.map(l => (
                      <div key={l.uid}>
                        <div className="font-tight text-[12.5px] font-semibold text-ink mb-1">{l.name} · {formatQtyWithUnit(l.quantity, unitOf(l.productId))}</div>
                        <div className="space-y-1.5">
                          {Array.from({ length: Math.max(1, Math.ceil(l.quantity)) }).map((_, idx) => (
                            <input
                              key={idx}
                              value={(lineImeis[l.uid] || [])[idx] || ''}
                              onChange={e => setImei(l.uid, idx, e.target.value)}
                              inputMode="numeric"
                              aria-label={`${l.name}, unit ${idx + 1} IMEI or serial`}
                              placeholder={`Unit ${idx + 1}, scan or type the IMEI or serial`}
                              className={fieldCls}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Payment Method */}
              <div className={cn(secHead, 'mt-[18px] mb-2')}>Payment method</div>
              {(() => {
                const groups = typeGroups.length > 0
                  ? typeGroups
                  : [
                      { type: 'CASH', accs: [], defaultAcc: null },
                      { type: 'UPI',  accs: [], defaultAcc: null },
                      { type: 'BANK', accs: [], defaultAcc: null },
                    ];
                return (
                  <OptionGroup cols={groups.length >= 4 ? 4 : groups.length} aria-label="Payment method">
                    {groups.map(({ type, defaultAcc }) => {
                      const icon = type === 'CASH' ? <Banknote /> : type === 'UPI' ? <Smartphone /> : type === 'CARD' ? <CreditCard /> : <Landmark />;
                      const label = type === 'CASH' ? 'Cash' : type === 'UPI' ? 'UPI' : type === 'CARD' ? 'Card' : 'Bank';
                      return (
                        <OptionCard key={type} selected={paymentMethod === type} icon={icon} title={label}
                          className="flex-col gap-[5px] px-1.5 py-3 text-center"
                          onClick={() => {
                            setPaymentMethod(type);
                            setPaymentAccountId(defaultAcc ? defaultAcc.id : null);
                          }} />
                      );
                    })}
                  </OptionGroup>
                );
              })()}

              {/* Client Credit — full-width row */}
              <OptionCard
                className={cn('mt-2', selectedClientId === 'WALKIN' && 'opacity-50 cursor-not-allowed')}
                selected={paymentMethod === 'CREDIT'}
                icon={<FileText />}
                title="Client credit"
                hint={selectedClientId === 'WALKIN' ? 'Select a client first' : `Add the bill to ${selectedClient?.name || 'the client'}'s account`}
                onClick={() => {
                  if (selectedClientId === 'WALKIN') { addNotification('Select a client before choosing Credit.', 'info'); return; }
                  setPaymentMethod('CREDIT');
                }}
              />

              {/* Account sub-selector — only when active type has >1 account */}
              {(() => {
                const activeGroup = typeGroups.find(g => g.type === paymentMethod);
                if (!activeGroup || activeGroup.accs.length <= 1) return null;
                return (
                  <div className="mt-2.5 flex items-center gap-2 text-[12.5px] text-body">
                    <span id="co-account-label">Account</span>
                    <div className="relative">
                      <select
                        aria-labelledby="co-account-label"
                        value={paymentAccountId || activeGroup.defaultAcc.id}
                        onChange={e => setPaymentAccountId(e.target.value)}
                        className="appearance-none rounded-pill bg-surface pl-3 pr-8 py-[5px] font-tight text-[12.5px] font-semibold text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)] outline-none cursor-pointer"
                      >
                        {activeGroup.accs.map(a => (
                          <option key={a.id} value={a.id}>{a.name}{a.is_default ? ' (Default)' : ''}</option>
                        ))}
                      </select>
                      <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-mute pointer-events-none" />
                    </div>
                  </div>
                );
              })()}

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
                    <div className="mt-3 rounded-xl bg-amber-soft px-3.5 py-3 text-[12.5px] font-medium text-amber-text">
                      Add a UPI ID to this account (Settings, Cash and Bank) to show a payment QR.
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
                  <div className="m-dialog mt-3 rounded-xl border border-line p-4 flex flex-col items-center gap-2.5">
                    <div className="bg-surface p-3 rounded-xl shadow-[0_0_0_1px_var(--color-line)]">
                      <QRCodeSVG value={upiUri} size={150} level="M" includeMargin={false} />
                    </div>
                    <div className="font-tight text-[15px] font-semibold text-ink tabular-nums">
                      {formatCurrency(total)}
                    </div>
                    <div className="text-[12px] text-body">
                      UPI: <b className="font-semibold text-ink">{upiId}</b><CopyButton value={upiId} label="Copy UPI ID" size={12} className="ml-1 align-middle" />
                      {selectedUpiAcc && <span className="text-mute"> · {selectedUpiAcc.name}</span>}
                    </div>
                    <Button variant="link" size="xs" className="px-0 h-auto"
                      onClick={() => window.open(
                        popoutUrl, 'payqr',
                        'width=520,height=720,menubar=no,toolbar=no,location=no,status=no'
                      )}
                    >
                      Show on customer screen <ArrowUpRight />
                    </Button>
                  </div>
                );
              })()}

              {/* Amount Received — partial pay + change calc */}
              <label htmlFor="co-amount" className={cn(secHead, 'block mt-[18px] mb-2')}>
                {paymentMethod === 'CREDIT' ? 'Part payment now, optional' : 'Amount received, optional'}
              </label>
              <input
                id="co-amount"
                type="number" step="0.01" min="0"
                placeholder={paymentMethod === 'CREDIT' ? 'e.g. 100, the rest goes to credit' : 'Leave blank if paid in full'}
                value={amountReceived}
                onChange={(e) => setAmountReceived(e.target.value)}
                className={cn(fieldCls, 'h-10 text-[14px]')}
              />
              {/* The change / balance chip that used to sit here is gone: the
                  block at the top of this panel now carries it at a size that
                  can be read across a counter. Repeating it small underneath
                  would just be a second place to look. */}

              {/* Confirm */}
              <SaveButton
                variant="amber"
                onClick={handleCompleteSale}
                disabled={isSubmitting || cart.length === 0}
                className="w-full mt-4 !h-[52px] !text-[15.5px] font-tight !font-semibold"
                status={saveState.status}
                savingLabel="Processing"
                /* Say what pressing this does, not just the bill amount. When
                   there is change to hand back, that is the cashier's next
                   physical action and it belongs on the button. */
                idleLabel={money.tone === 'change'
                    ? `Complete · return ${formatCurrency(money.value)}`
                    : money.tone === 'change-or-credit'
                      /* Not "return": the next screen offers to put this
                         against the client's dues instead, and promising a
                         refund here gets the cash counted out first. */
                      ? `Complete · ${formatCurrency(money.value)} over`
                      : `Confirm and pay ${formatCurrency(total)}`}
              />
              </div>
            </div>
          </div>
      </section>
    )}

    {/* The camera scanner. Commits through commitCode, exactly as a typed
        code does, and stays open so a basket can be scanned in one go. */}
    <ScanSheet open={scanOpen} onClose={() => setScanOpen(false)} onCode={commitCode} />
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
  const [collectErr, setCollectErr]   = useState('');
  const collectState = useSaveStatus();
  const today = new Date().toISOString().slice(0, 10);
  const fmt   = (v) => `${currency}${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const collect = async (amount) => {
    if (!amount || amount <= 0) { onClose(); return; }
    setBusy(true);
    setCollectErr('');
    collectState.start();
    let r;
    try { r = await onRecordPayment(clientId, amount, today, 'Collected at POS', [], method); }
    catch (e) { r = { success: false, error: e }; }
    setBusy(false);
    if (r && r.success === false) {
      // Real reason, dialog stays open so the cashier can retry.
      setCollectErr(`Payment not recorded: ${r.error?.message || r.error || 'unknown error'}`);
      collectState.fail();
      return;
    }
    collectState.ok();
    setTimeout(onClose, 700);
  };

  const methods = ['CASH', 'UPI', 'BANK'];
  const methodLabel = { CASH: 'Cash', UPI: 'UPI', BANK: 'Bank' };
  const initials = String(clientName || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

  // Escape, the scrim and the close button all mean "not now" (the same as
  // Skip / Give as change), but never while a payment is being recorded: the
  // answer, and any error, has to land somewhere the cashier can see it.
  return (
    <Dialog
      open
      onClose={() => { if (!busy) onClose(); }}
      title={
        <span className="flex items-center gap-3">
          <span className="grid place-items-center w-10 h-10 shrink-0 rounded-full bg-amber-soft font-tight text-[13px] font-semibold text-amber-text">{initials}</span>
          <span className="min-w-0">
            <span className="block truncate">{clientName}</span>
            <span className="block mt-0.5 font-ui text-[13px] font-normal tracking-normal text-amber-text tabular-nums">{fmt(outstanding)} outstanding</span>
          </span>
        </span>
      }
    >
          {excess > 0 ? (
            /* ── Excess mode ── */
            <>
              <p className="text-[14.5px] text-ink-2">
                Customer paid <b className="font-tight font-semibold text-ink tabular-nums">{fmt(excess)}</b> extra.
                Apply it to their balance?
              </p>

              <div className="mt-2 space-y-2">
                {/* Apply to outstanding */}
                <OptionCard
                  variant="choice"
                  primary
                  disabled={busy}
                  onClick={() => collect(excess)}
                  title={`Apply ${fmt(excess)} to outstanding`}
                  hint={`Balance ${fmt(outstanding)} → ${fmt(outstanding - excess)} · change ${currency}0`}
                />

                {/* Give change */}
                <OptionCard
                  variant="choice"
                  disabled={busy}
                  onClick={onClose}
                  title={`Give ${fmt(excess)} as change`}
                  hint={`Outstanding stays ${fmt(outstanding)}`}
                />
              </div>
              <FieldError message={collectErr} />

              {/* Cancel for excess mode */}
              <div className="flex mt-4">
                <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
              </div>
            </>
          ) : (
            /* ── Collect mode ── */
            <>
              <p className="text-[14.5px] text-ink-2">Collect outstanding payment now?</p>

              {/* Amount */}
              <div className="mt-3.5">
                <label htmlFor="collect-amt" className="block mb-1.5 font-tight text-[12.5px] font-semibold text-ink-2">Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13.5px] text-mute pointer-events-none">{currency}</span>
                  <Input
                    id="collect-amt"
                    type="number"
                    value={collectAmt}
                    onChange={e => setCollectAmt(e.target.value)}
                    className="pl-7"
                    min="0"
                    max={outstanding}
                  />
                </div>
              </div>

              {/* Method */}
              <div className="mt-3.5">
                <span className="block mb-1.5 font-tight text-[12.5px] font-semibold text-ink-2">Method</span>
                <div className="inline-flex w-full rounded-pill bg-well p-[3px]" role="group" aria-label="Method">
                  {methods.map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMethod(m)}
                      aria-pressed={method === m}
                      className={`m-press flex-1 px-3 py-[7px] rounded-pill font-tight text-[13px] font-semibold ${
                        method === m
                          ? 'bg-ink text-white'
                          : 'text-body hover:text-ink'
                      }`}
                    >
                      {methodLabel[m]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-5">
                <Button variant="secondary" className="flex-1" onClick={onClose} disabled={busy}>
                  Skip
                </Button>
                <SaveButton
                  variant="amber"
                  onClick={() => collect(Math.min(parseFloat(collectAmt) || 0, outstanding))}
                  disabled={busy || !parseFloat(collectAmt)}
                  status={collectState.status}
                  savingLabel="Recording"
                  idleLabel={`Collect ${fmt(Math.min(parseFloat(collectAmt)||0, outstanding))}`}
                  className="flex-[2] font-tight !font-semibold"
                />
              </div>
              <FieldError message={collectErr} />
            </>
          )}
    </Dialog>
  );
}

export default InvoiceBuilder;
