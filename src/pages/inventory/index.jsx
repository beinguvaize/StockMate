import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, X, ArrowLeftRight, Upload, Pencil, ChevronDown, ArrowUpRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { useInventory } from '../../hooks/useInventory';
import { useOrders } from '../../hooks/useOrders';
import { Tabs, FilterPills } from '../../components/ui/Tabs';
import { Eyebrow } from '../../components/ui/FigureStrip';
import { Button } from '../../components/ui/button';
import { PageSkeleton } from '../../components/ui/States';
import { cn } from '../../lib/utils';
import {
  filterProducts, inventoryKpis, stockBarParts, priceListCounts, bulkEditPatch, applyEach,
} from '../../lib/inventoryView';
import StockTable from './components/StockTable';
import AddItemModal from './components/AddItemModal';
import BatchesModal from './components/BatchesModal';
import PriceListsTab from './components/PriceListsTab';
import StockAdjustModal from './components/StockAdjustModal';
import StockHistoryTab from './components/StockHistoryTab';
import TransferStockModal from './components/TransferStockModal';
import ItemDetailView from './components/ItemDetailView';
import { BulkEditDialog, DeleteProductsDialog } from './components/BulkDialogs';

/**
 * Inventory (web redesign, approved inventory-01…16).
 *
 * Products, Stock history and Price lists are tabs of one page; Add and Edit
 * product take the page over; everything else is a dialog or the side panel.
 * What each screen writes is unchanged: products through useInventory's
 * add / update / delete, stock through adjust_inventory_atomic and
 * transfer_inventory_atomic, prices through useOrders. Stock, cost and batch
 * figures are only ever read here.
 */
const Inventory = () => {
  const { currentUser, isOwner } = useAuth();
  const { currentTenantId, businessProfile } = useTenant();
  const {
    products,
    productCategories: categories,
    inventoryBalances: balances,
    inventoryLocations,
    loading,
    refetch,
    addProduct,
    updateProduct,
    deleteProduct,
    adjustStock,
    transferStock,
  } = useInventory(currentTenantId);

  const { priceLists, upsertPrice, deletePrice } = useOrders(currentTenantId);
  const navigate = useNavigate();
  const [viewing, setViewing] = useState(null); // { product, items }

  // Last purchase rate per product = the newest batch's unit_cost. Distinct
  // from products.costPrice (the weighted average of open batches): this is
  // today's restock cost, the number that answers "is my price above what it
  // now costs me to buy". Lean select — just the three columns needed.
  const [lastBuy, setLastBuy] = useState({});
  useEffect(() => {
    if (!currentTenantId) return;
    let cancelled = false;
    supabase
      .from('product_batches')
      .select('product_id, unit_cost, received_date')
      .eq('tenant_id', currentTenantId)
      .order('received_date', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        const m = {};
        // First row per product = newest received = last buy.
        data.forEach(b => { if (!(b.product_id in m)) m[b.product_id] = Number(b.unit_cost); });
        setLastBuy(m);
      });
    return () => { cancelled = true; };
  }, [currentTenantId, products.length]);

  const [tab, setTab] = useState('products');            // products | history | prices
  const [form, setForm] = useState(null);                // null | { product: null | {...} }
  const [batchesFor, setBatchesFor] = useState(null);
  const [adjustingProduct, setAdjustingProduct] = useState(null);
  const [adjustSaving, setAdjustSaving] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);        // products to delete, or null
  const searchRef = useRef(null);

  // Filter + search state
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');   // ALL | STANDARD | SERVICE | RAW | FINISHED
  const [stockFilter, setStockFilter] = useState('ALL'); // ALL | IN | LOW | OUT
  const [categoryFilter, setCategoryFilter] = useState('');

  // "/" jumps to search unless the user is already typing in a field.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
      if (!searchRef.current) return;
      e.preventDefault();
      searchRef.current.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Every barcode already in use, so "Assign" in the item form cannot mint one
  // a product already carries. A duplicate barcode rings up the wrong item at
  // the counter, which is the single failure a barcode exists to prevent.
  const existingBarcodes = useMemo(
    () => new Set((products || []).map(p => p.barcode).filter(Boolean)),
    [products]);

  const categoryOptions = useMemo(() => {
    const set = new Set(products.map(p => p.category).filter(Boolean));
    return Array.from(set).sort();
  }, [products]);

  const filteredProducts = useMemo(
    () => filterProducts(products, { query: searchTerm, type: typeFilter, stock: stockFilter, category: categoryFilter }),
    [products, searchTerm, typeFilter, stockFilter, categoryFilter]);

  // A product deleted or filtered away elsewhere drops out of the selection.
  const selectedProducts = useMemo(() => products.filter(p => selected.has(p.id)), [products, selected]);

  const activeFilterCount =
    (searchTerm ? 1 : 0) + (typeFilter !== 'ALL' ? 1 : 0) +
    (stockFilter !== 'ALL' ? 1 : 0) + (categoryFilter ? 1 : 0);
  const clearAllFilters = () => {
    setSearchTerm(''); setTypeFilter('ALL'); setStockFilter('ALL'); setCategoryFilter('');
  };

  const kpis = useMemo(() => inventoryKpis(products), [products]);
  const plCounts = useMemo(() => priceListCounts(priceLists || []), [priceLists]);

  const getStock = (product) => {
    const fromBalances = balances
      .filter(b => b.product_id === product.id)
      .reduce((s, b) => s + Number(b.quantity), 0);
    return fromBalances || Number(product.stock) || 0;
  };

  const handleAdjust = async (productId, delta, reason, locationId, unitCost) => {
    setAdjustSaving(true);
    try {
      return await adjustStock(productId, delta, reason, locationId ?? null, unitCost);
    } finally {
      setAdjustSaving(false);
    }
  };

  const handleSaveProduct = async (data) => {
    if (form?.product) {
      const { error } = await updateProduct(form.product.id, data);
      return { error };
    }
    const { error } = await addProduct(data);
    return { error };
  };

  // Bulk edit and delete: the same writes as before, one product at a time,
  // but every refusal is kept and shown rather than dropped.
  const runBulkEdit = async (patch) => {
    const res = await applyEach(selectedProducts, (p) => {
      const updates = bulkEditPatch(p, patch);
      return Object.keys(updates).length ? updateProduct(p.id, updates) : { error: null };
    });
    if (!res.failed.length) { setSelected(new Set()); setBulkEditOpen(false); }
    else setSelected(new Set(res.failed.map(f => f.item.id)));
    return res;
  };
  const runDelete = async (list) => {
    const res = await applyEach(list, (p) => deleteProduct(p.id));
    const gone = new Set(res.done.map(p => p.id));
    setSelected(prev => new Set([...prev].filter(id => !gone.has(id))));
    if (viewing && gone.has(viewing.product.id)) setViewing(null);
    if (!res.failed.length) setDeleting(null);
    return res;
  };

  if (loading) return <PageSkeleton cards={4} rows={10} />;

  const cur = businessProfile?.currencySymbol || '₹';
  const inr = (n) => Math.round(n).toLocaleString('en-IN');
  const hasNonStandard = products.some(p => (p.product_type || 'STANDARD').toUpperCase() !== 'STANDARD');
  const toggleStock = (k) => setStockFilter(f => (f === k ? 'ALL' : k));
  const openAdd = () => { setViewing(null); setForm({ product: null }); };
  const openEdit = (p) => { setViewing(null); setForm({ product: p }); };
  const bar = stockBarParts(kpis);

  // Add / Edit product takes the page over (approved inventory-10, -11).
  if (form) {
    return (
      <AddItemModal
        isOpen
        onClose={() => setForm(null)}
        onSave={handleSaveProduct}
        editingProduct={form.product}
        productCategories={categories}
        tenantId={currentTenantId}
        /* So "Assign" cannot mint a code another product already has. */
        existingBarcodes={existingBarcodes}
        onReread={refetch}
      />
    );
  }

  const tabItems = [
    { key: 'products', label: 'Products', count: products.length.toLocaleString('en-IN') },
    { key: 'history', label: 'Stock history' },
    { key: 'prices', label: 'Price lists', count: plCounts.total ? plCounts.total.toLocaleString('en-IN') : undefined },
  ];

  return (
    <div className="flex flex-col pb-16">
      <div className="m-rise mb-[18px] -mt-1 flex flex-wrap items-end gap-x-4 border-b border-line">
        <Tabs ariaLabel="Inventory" items={tabItems} value={tab} onChange={setTab}
          className="border-b-0 overflow-x-auto no-scrollbar" />
        {tab === 'products' && (
          <div className="ml-auto flex flex-wrap items-center gap-2 pb-1.5">
            {inventoryLocations.length > 1 && (
              <Button variant="secondary" size="xs" className="h-8 px-3.5" onClick={() => setShowTransfer(true)}><ArrowLeftRight /> Transfer stock</Button>
            )}
            <Button variant="secondary" size="xs" className="h-8 px-3.5" onClick={() => navigate('/bulk-add?type=products')}><Upload /> Bulk import</Button>
            <Button size="xs" className="h-8 px-3.5" onClick={openAdd}><Plus /> Add product</Button>
          </div>
        )}
      </div>

      {tab === 'history' && <StockHistoryTab tenantId={currentTenantId} products={products} />}

      {tab === 'prices' && (
        <PriceListsTab
          products={products}
          priceLists={priceLists}
          onUpsert={upsertPrice}
          onDelete={deletePrice}
          currencySymbol={cur}
        />
      )}

      {tab === 'products' && (<>
        {/* Strip */}
        <div className="m-rise mb-5 grid grid-cols-2 gap-y-3 md:grid-cols-4" style={{ '--i': 1 }}>
          <StripFigure label="Stock value at cost" value={`${cur}${inr(kpis.stockValue)}`}>
            {bar && (
              <div className="mt-[9px] mb-1.5 flex h-1.5 max-w-[190px] gap-0.5 overflow-hidden rounded-pill" title="Products in stock, low, out">
                {bar.in > 0 && <i className="block h-full bg-good" style={{ width: `${bar.in}%` }} />}
                {bar.low > 0 && <i className="block h-full bg-amber" style={{ width: `${bar.low}%` }} />}
                {bar.out > 0 && <i className="block h-full bg-bad" style={{ width: `${bar.out}%` }} />}
              </div>
            )}
            <small className="block text-[12.5px] text-body sm:whitespace-nowrap tabular-nums">
              {kpis.totalUnits.toLocaleString('en-IN')} units · {kpis.inCount} in, {kpis.lowStock} low, {kpis.outOfStock} out
            </small>
            {kpis.rawValue > 0 && (
              <small className="mt-0.5 block text-[11.5px] text-mute whitespace-nowrap tabular-nums">incl. {cur}{inr(kpis.rawValue)} raw material</small>
            )}
          </StripFigure>
          <StripFigure label="Retail value" value={`${cur}${inr(kpis.retailValue)}`}>
            <small className="block text-[12.5px] text-body sm:whitespace-nowrap tabular-nums">
              {kpis.marginValue !== 0 ? (
                <span className={cn('font-semibold', kpis.marginValue > 0 ? 'text-good-text' : 'text-bad-text')}>
                  {kpis.marginValue >= 0 ? '+' : '−'}{cur}{inr(Math.abs(kpis.marginValue))} margin
                </span>
              ) : null}
              {kpis.marginValue !== 0 ? ' · ' : ''}sellable stock
            </small>
          </StripFigure>
          <StripFigure label="Low stock" value={kpis.lowStock} valueCls={kpis.lowStock > 0 ? 'text-amber-text' : ''}
            onClick={kpis.lowStock > 0 ? () => toggleStock('LOW') : null} active={stockFilter === 'LOW'}>
            <small className="block text-[12.5px] text-body whitespace-nowrap">products{kpis.lowStock > 0 ? ' · click to filter' : ''}</small>
          </StripFigure>
          <StripFigure label="Out of stock" value={kpis.outOfStock} valueCls={kpis.outOfStock > 0 ? 'text-bad-text' : ''}
            onClick={kpis.outOfStock > 0 ? () => toggleStock('OUT') : null} active={stockFilter === 'OUT'}>
            <small className="block text-[12.5px] text-body whitespace-nowrap">products{kpis.outOfStock > 0 ? ' · click to filter' : ''}</small>
          </StripFigure>
        </div>

        {/* Tools, or the bulk bar while products are ticked */}
        {selectedProducts.length > 0 && isOwner ? (
          <div className="m-rise mb-3 flex items-center gap-3 rounded-[14px] bg-ink py-2.5 pr-3 pl-[18px] text-white shadow-[0_16px_34px_-18px_rgba(17,20,24,0.6)]">
            <b className="font-tight text-[13.5px] font-semibold tabular-nums">{selectedProducts.length} selected</b>
            <button type="button" onClick={() => setSelected(new Set())}
              className="text-[12.5px] text-white/70 underline underline-offset-2 hover:text-white">Clear</button>
            <span className="flex-1" />
            <Button size="xs" className="h-8 bg-white/10 px-3.5 text-white hover:bg-white/20" onClick={() => setBulkEditOpen(true)}><Pencil /> Bulk edit</Button>
            <Button size="xs" className="h-8 bg-transparent px-3.5 text-[#FCA5A5] shadow-[inset_0_0_0_1px_rgba(252,165,165,0.45)] hover:bg-white/5" onClick={() => setDeleting(selectedProducts)}>Delete</Button>
          </div>
        ) : (
          <div className="m-rise mb-3 flex flex-wrap items-center gap-2.5" style={{ '--i': 2 }}>
            <FilterPills ariaLabel="Stock"
              value={['ALL', 'LOW', 'OUT'].includes(stockFilter) ? stockFilter : 'ALL'}
              onChange={setStockFilter}
              items={[
                { key: 'ALL', label: 'All', count: products.length.toLocaleString('en-IN') },
                { key: 'LOW', label: 'Low', count: kpis.lowStock },
                { key: 'OUT', label: 'Out', count: kpis.outOfStock },
              ]} />
            <div className="relative w-full sm:w-[280px]">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mute" size={16} />
              <input ref={searchRef} type="text" value={searchTerm}
                aria-label="Search name, SKU or barcode"
                onChange={e => setSearchTerm(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape' && searchTerm) { e.stopPropagation(); setSearchTerm(''); } }}
                placeholder="Search name, SKU or barcode"
                className="h-9 w-full rounded-pill bg-well pl-10 pr-10 text-[13px] text-ink outline-none placeholder:text-mute transition-shadow duration-(--dur-press) focus:shadow-[inset_0_0_0_2px_var(--color-ink)]" />
              {searchTerm ? (
                <button type="button" onClick={() => setSearchTerm('')} aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-mute hover:text-ink"><X size={14} /></button>
              ) : (
                <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-[5px] bg-surface px-1.5 py-px font-tight text-[11px] font-semibold text-mute shadow-[0_0_0_1px_rgba(17,20,24,0.08)]">/</span>
              )}
            </div>
            <PillSelect label="Category" value={categoryFilter} onChange={setCategoryFilter}
              options={[{ value: '', label: 'All' }, ...categoryOptions.map(c => ({ value: c, label: c }))]} />
            {hasNonStandard && (
              <PillSelect label="Type" value={typeFilter} onChange={setTypeFilter}
                options={[
                  { value: 'ALL', label: 'All' }, { value: 'STANDARD', label: 'Standard' }, { value: 'SERVICE', label: 'Services' },
                  { value: 'RAW', label: 'Raw material' }, { value: 'FINISHED', label: 'Finished' },
                ]} />
            )}
            {activeFilterCount > 0 && (
              <button type="button" onClick={clearAllFilters}
                className="whitespace-nowrap text-[12.5px] text-body underline underline-offset-2 hover:text-ink">Clear filters</button>
            )}
          </div>
        )}

        <StockTable
          products={filteredProducts}
          totalProducts={products.length}
          onClearFilters={clearAllFilters}
          onAddProduct={openAdd}
          inventoryBalances={balances}
          lastBuy={lastBuy}
          currencySymbol={cur}
          onView={(product, items) => setViewing({ product, items })}
          onEdit={openEdit}
          onDelete={(p) => setDeleting([p])}
          onAdjust={isOwner ? (product) => setAdjustingProduct(product) : null}
          onBatches={setBatchesFor}
          onPrintBarcode={() => navigate('/labels')}
          selectable={!!isOwner}
          selected={selected}
          onSelectedChange={setSelected}
        />
        {products.length > 0 && (
          <div className="m-rise flex flex-wrap items-center justify-between gap-3 px-1 pt-3.5 text-[13px] text-body" style={{ '--i': 5 }}>
            <span className="tabular-nums">
              Showing {filteredProducts.length.toLocaleString('en-IN')} of {products.length.toLocaleString('en-IN')} products
              {kpis.uniqueCats > 0 && ` · ${kpis.uniqueCats} ${kpis.uniqueCats === 1 ? 'category' : 'categories'}`}
            </span>
            <span className="hidden text-[12px] text-mute sm:inline">Click a row for its details · press / to search</span>
          </div>
        )}
      </>)}

      {bulkEditOpen && selectedProducts.length > 0 && (
        <BulkEditDialog
          count={selectedProducts.length}
          categories={categoryOptions}
          onClose={() => setBulkEditOpen(false)}
          onApply={runBulkEdit}
          onReread={refetch}
        />
      )}

      {deleting && deleting.length > 0 && (
        <DeleteProductsDialog
          products={deleting}
          onClose={() => setDeleting(null)}
          onDelete={runDelete}
          onReread={refetch}
        />
      )}

      {viewing && (
        <ItemDetailView
          product={products.find(p => p.id === viewing.product.id) || viewing.product}
          items={viewing.items}
          onSelect={(p) => setViewing(v => ({ ...v, product: p }))}
          locations={inventoryLocations || []}
          balances={balances || []}
          tenantId={currentTenantId}
          currencySymbol={cur}
          onClose={() => setViewing(null)}
          onEdit={openEdit}
          onAdjust={isOwner ? (p) => { setViewing(null); setAdjustingProduct(p); } : null}
          onPrintBarcode={() => navigate('/labels')}
          onReorder={(p) => navigate(`/purchases?reorder=${encodeURIComponent(p.id)}`)}
          onBatches={(p) => setBatchesFor(p)}
          onDelete={async (p) => {
            const res = await runDelete([p]);
            return res.failed[0] ? { error: res.failed[0].error } : { error: null };
          }}
          onReread={refetch}
        />
      )}

      <BatchesModal
        isOpen={!!batchesFor}
        onClose={() => setBatchesFor(null)}
        product={batchesFor}
        tenantId={currentTenantId}
        currencySymbol={cur}
      />

      {adjustingProduct && (
        <StockAdjustModal
          product={adjustingProduct}
          currentStock={getStock(adjustingProduct)}
          onConfirm={handleAdjust}
          onClose={() => setAdjustingProduct(null)}
          onReread={refetch}
          saving={adjustSaving}
        />
      )}

      {showTransfer && (
        <TransferStockModal
          products={products}
          locations={inventoryLocations}
          balances={balances}
          onTransfer={transferStock}
          onClose={() => setShowTransfer(false)}
          userId={currentUser?.id || currentUser?.email || null}
        />
      )}
    </div>
  );
};

/** One figure of the strip; tappable when it filters the list. */
function StripFigure({ label, value, valueCls, onClick, active = false, children }) {
  const body = (
    <>
      <Eyebrow>{label}</Eyebrow>
      <b className={cn('mt-1.5 mb-1 block font-tight text-[24px] font-semibold leading-[1.15] tracking-[-0.02em] tabular-nums whitespace-nowrap text-ink', valueCls)}>{value}</b>
      {children}
    </>
  );
  // Hairline dividers between figures; on two columns the third starts a row.
  const base = 'relative min-w-0 px-[22px] py-0.5 text-left border-l border-sep first:border-l-0 first:pl-0 [&:nth-child(3)]:border-l-0 [&:nth-child(3)]:pl-0 md:[&:nth-child(3)]:border-l md:[&:nth-child(3)]:pl-[22px]';
  if (!onClick) return <div className={base}>{body}</div>;
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cn(base, 'group/fig m-press rounded-xl hover:bg-tile', active && 'bg-amber-soft hover:bg-amber-soft')}>
      {body}
      <ArrowUpRight size={14} aria-hidden="true"
        className="absolute right-2.5 top-1 text-faint opacity-0 transition-opacity duration-(--dur-press) group-hover/fig:opacity-100" />
    </button>
  );
}

/** "Category  All ⌄": a native select drawn as an outlined pill. */
function PillSelect({ label, value, onChange, options }) {
  const current = options.find(o => o.value === value)?.label ?? 'All';
  return (
    <label className="m-press relative inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-pill py-[7px] pr-3 pl-3.5 font-tight text-[13px] font-semibold text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile focus-within:shadow-[inset_0_0_0_2px_var(--color-ink)]">
      <em className="not-italic font-medium text-mute">{label}</em>
      <span className="max-w-[160px] truncate">{current}</span>
      <ChevronDown size={14} className="text-mute" aria-hidden="true" />
      <select aria-label={label} value={value} onChange={e => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export default Inventory;
