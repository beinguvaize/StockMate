import React, { useState } from 'react';
import { LoadingBlock } from '../../components/ui/States';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { useSales } from '../../hooks/useSales';
import { useInventory } from '../../hooks/useInventory';
import { usePeople } from '../../hooks/usePeople';
import { useNotifications } from '../../context/NotificationContext';
import { ShoppingCart, History, Plus, ReceiptText, TrendingUp, Receipt, BarChart2, LayoutGrid } from 'lucide-react';
import { generateRef, formatCurrency, todayISOInAppTZ } from '../../lib/utils';
import Button from '../../shared/Button';
import Modal from '../../shared/Modal';
import InvoiceBuilder from './components/InvoiceBuilder';
import InvoiceList from './components/InvoiceList';
import SalePrintDispatcher from './components/SalePrintDispatcher';
import SalesReturnForm from './components/SalesReturnForm';
import SalesReturnsList from './components/SalesReturnsList';
import ConvertToInvoiceSheet from './components/ConvertToInvoiceSheet';
import TablesFloor from './components/TablesFloor';
import { useTables } from '../../hooks/useTables';
import { useKOT } from '../../hooks/useKOT';
import { printKOT } from '../../lib/kotPrint';
import { deductRecipeIngredients } from '../../lib/recipeDeduct';
import { calculateGST } from '../../lib/gstEngine';
import { supabase } from '../../lib/supabase';

const SalesPage = () => {
  // Sale picked for GST-invoice conversion. When set, the ConvertToInvoiceSheet
  // modal opens and collects customer / GSTIN info before firing the RPC.
  const [convertSale, setConvertSale] = useState(null);
  const [convertSubmitting, setConvertSubmitting] = useState(false);
  const { addNotification } = useNotifications();
  const { currentTenantId, businessProfile, currentTenant, businessType, isModuleOn } = useTenant();
  const isResto = businessType === 'RESTAURANT';
  // Non-restaurant tenants have no floor tables — skip that fetch entirely.
  const tablesApi = useTables(currentTenantId, isResto);

  // Estimate → POS handoff: read items stashed by the Estimates page, map them
  // to InvoiceBuilder cart lines, consume the stash once.
  const [estimateCart] = useState(() => {
    try {
      const raw = sessionStorage.getItem('estimate_cart');
      if (!raw) return null;
      sessionStorage.removeItem('estimate_cart');
      const { items } = JSON.parse(raw);
      if (!Array.isArray(items) || !items.length) return null;
      return items.map(it => ({
        uid: it.id, productId: it.id, name: it.name,
        basePrice: Number(it.rate) || 0, price: Number(it.rate) || 0,
        quantity: Number(it.qty) || 1, taxRate: Number(it.taxRate) || 0,
        modifiers: [], modLabel: null,
      }));
    } catch { return null; }
  });
  const { createTicket } = useKOT(currentTenantId);
  // The table whose tab is currently open in the builder (restaurant only).
  const [activeTable, setActiveTable] = useState(null); // { table, tab }

  // Fire a kitchen order ticket for the active table, then print it.
  const sendTableKOT = async (items) => {
    const { data, error } = await createTicket({
      tableId: activeTable?.table?.id || null,
      tableLabel: activeTable?.table?.label || null,
      items,
    });
    if (error) { addNotification('KOT failed: ' + error.message, 'error'); return false; }
    printKOT(data);
    addNotification(`KOT #${data.ticket_no} sent to kitchen`, 'success');
    return true;
  };
  const { sales, clients, invoices, salesReturns, placeSale, editSale, dispatchSale, createInvoice, deleteSale: removeSale, settleSale, processSalesReturn, convertSaleToInvoice, loading: salesLoading } = useSales(currentTenantId, { plan: currentTenant?.plan || 'STARTER' });

  // Wrap placeSale: auto-create invoice for credit sales (settlement) and
  // delivery sales (van dispatch queue), or both when combined.
  const addSale = async (saleData) => {
    const result = await placeSale(saleData);
    if (result?.error) return result;

    // R5: restaurant dish sale → deduct BOM ingredients from stock.
    if (isResto && isModuleOn('recipe_deduct')) {
      try {
        const { deducted } = await deductRecipeIngredients(currentTenantId, saleData.items || []);
        if (deducted > 0) refetchInventory?.();
      } catch (e) { console.error('[recipeDeduct] failed:', e); }
    }

    const isCredit   = saleData.paymentMethod === 'CREDIT';
    const isDelivery = saleData.fulfillmentType === 'DELIVERY';
    const hasClient  = saleData.clientId && saleData.clientId !== 'WALKIN';

    // Build invoice items (shared for credit + delivery paths)
    const needsInvoice = (isCredit && hasClient) || isDelivery;
    if (needsInvoice) {
      const client = clients.find(c => c.id === saleData.clientId);
      const draftItems = (saleData.items || []).map(i => ({
        name:     i.name,
        qty:      i.quantity,
        rate:     i.price,
        taxRate:  i.taxRate || 0,
        sku:      i.sku || '',
        hsn_code: i.hsn_code || '',
        unit:     i.unit || 'PCS',
      }));
      // Single source of GST truth — keeps taxable/tax/grand consistent.
      const gst = calculateGST(draftItems, businessProfile?.state || '', client?.state || '');

      await createInvoice({
        sale_id:         result.id,
        client_id:       saleData.clientId,
        client_name:     client?.name || 'Walk-in',
        items:           gst.items,
        subtotal:        gst.subtotal,
        taxable_amount:  gst.taxable,
        tax_total:       gst.totalTax,
        cgst_amount:     gst.cgst,
        sgst_amount:     gst.sgst,
        igst_amount:     gst.igst,
        is_interstate:   gst.isInterstate,
        round_off:       gst.roundOff,
        grand_total:     gst.grandTotal,
        paid_amount:     isCredit ? 0 : gst.grandTotal,
        payment_status:  isCredit ? 'UNPAID' : 'PAID',
        // Delivery tracking
        delivery_required: isDelivery,
        delivery_status:   isDelivery ? 'PENDING' : null,
        delivery_address:  isDelivery ? (saleData.deliveryAddress || null) : null,
        delivery_zone:     isDelivery ? (saleData.deliveryZone    || null) : null,
        delivery_date:     isDelivery ? (saleData.deliveryDate    || null) : null,
        delivery_notes:    isDelivery ? (saleData.deliveryNotes   || null) : null,
        delivery_fee:      isDelivery ? (saleData.deliveryFee     || 0)    : 0,
      });
    }

    refetchInventory();
    return result;
  };
  const { products, inventoryBalances, inventoryLocations, loading: productsLoading, refetch: refetchInventory } = useInventory(currentTenantId);
  // Stores where POS sales are rung (warehouses/branches, not vehicles).
  const posStores = (inventoryLocations || []).filter(l => (l.type || 'WAREHOUSE') !== 'VEHICLE' && !l.deleted_at);
  const { users: staff = [] } = usePeople(currentTenantId);

  const [activeTab, setActiveTab] = useState('pos'); // 'tables' | 'pos' | 'history'
  const [historyView, setHistoryView] = useState('sales'); // 'sales' | 'returns'
  const [printingSale, setPrintingSale] = useState(null);
  const [returnSale, setReturnSale] = useState(null);
  const [returnLoading, setReturnLoading] = useState(false);

  // Sale being edited → opens the POS builder prefilled. editCart maps the
  // stored sale.items shape onto InvoiceBuilder cart lines.
  const [editingSale, setEditingSale] = useState(null);
  const editCart = React.useMemo(() => {
    if (!editingSale) return null;
    return (editingSale.items || []).map(it => {
      const pid = it.productId || it.id;
      return {
        uid: pid, productId: pid, name: it.name || it.productName || 'Item',
        basePrice: Number(it.rate ?? it.price ?? 0), price: Number(it.rate ?? it.price ?? 0),
        quantity: Number(it.quantity) || 1, taxRate: Number(it.taxRate ?? it.tax_rate ?? 0),
        modifiers: [], modLabel: null,
      };
    });
  }, [editingSale]);
  const editMeta = React.useMemo(() => editingSale ? {
    clientId: editingSale.shopId || editingSale.clientId || editingSale.client_id || 'WALKIN',
    paymentMethod: editingSale.paymentMethod || editingSale.payment_method || 'CASH',
  } : null, [editingSale]);

  const returnedSaleIds = React.useMemo(
    () => new Set((salesReturns || []).map(r => r.sale_id).filter(Boolean)),
    [salesReturns]
  );

  const startEdit = (sale) => { setEditingSale(sale); setActiveTab('pos'); };
  const handleEditSale = async (saleData) => {
    const result = await editSale(editingSale.id, saleData);
    if (result?.error) { addNotification('Update failed: ' + result.error.message, 'error'); return result; }
    return result;
  };

  // Restaurant: land on the floor (tables) view by default, once.
  const restoDefaulted = React.useRef(false);
  React.useEffect(() => {
    if (isResto && !restoDefaulted.current) {
      restoDefaulted.current = true;
      setActiveTab('tables');
    }
  }, [isResto]);

  // Open (or resume) a table's tab → bind it to the builder.
  const openTable = async (table, existingTab) => {
    let tab = existingTab;
    if (!tab) {
      const { data, error } = await tablesApi.openTab(table.id);
      if (error) { addNotification('Could not open table: ' + error.message, 'error'); return; }
      tab = data;
    }
    setActiveTable({ table, tab });
    setActiveTab('pos');
  };

  // Persist the builder's cart back onto the open tab.
  const persistTabCart = React.useCallback((cart) => {
    if (activeTable?.tab?.id) tablesApi.saveTab(activeTable.tab.id, cart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTable]);

  // After a table sale is placed, close the tab and return to the floor.
  const placeTableSale = async (saleData) => {
    const result = await addSale(saleData);
    if (!result?.error && activeTable?.tab?.id) {
      await tablesApi.settleTab(activeTable.tab.id, result.id || null);
      setActiveTable(null);
      setActiveTab('tables');
    }
    return result;
  };

  const handleSalesReturn = async (payload) => {
    setReturnLoading(true);
    const { error } = await processSalesReturn({ ...payload, id: generateRef('CRN') });
    setReturnLoading(false);
    if (error) { addNotification('Return failed: ' + error.message, 'error'); return; }
    setReturnSale(null);
    addNotification('Return processed — stock restored.', 'success');
  };

  // Fast-moving products — rank by total quantity sold over the recent
  // sales window so the POS "Quick add" tiles surface what actually moves.
  const topSellingIds = React.useMemo(() => {
    const cutoff = Date.now() - 60 * 86400000; // last 60 days
    const qty = {};
    (sales || []).forEach(s => {
      const t = new Date(s.created_at || s.date).getTime();
      if (!isNaN(t) && t < cutoff) return;
      (Array.isArray(s.items) ? s.items : []).forEach(i => {
        const id = i.id || i.productId;
        if (!id) return;
        qty[id] = (qty[id] || 0) + (Number(i.quantity) || 0);
      });
    });
    return Object.entries(qty).sort((a, b) => b[1] - a[1]).map(([id]) => id);
  }, [sales]);

  const printSale = (sale) => setPrintingSale(sale);
  const printingClient = printingSale
    ? clients.find(c => c.id === (printingSale.shopId ?? printingSale.shop_id ?? printingSale.clientId)) || null
    : null;

  const isLoading = salesLoading || productsLoading;

  // Today's stats
  const todayStats = React.useMemo(() => {
    const today = todayISOInAppTZ();
    const todaySales = (sales || []).filter(s => (s.created_at || '').startsWith(today));
    const revenue = todaySales.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
    const count = todaySales.length;
    const avg = count > 0 ? revenue / count : 0;
    return { revenue, count, avg };
  }, [sales]);

  // Timeout guard: if loading for >10s, break out and render with whatever data is available
  const [loadTimeout, setLoadTimeout] = React.useState(false);
  React.useEffect(() => {
    if (!isLoading) { setLoadTimeout(false); return; }
    const t = setTimeout(() => setLoadTimeout(true), 10000);
    return () => clearTimeout(t);
  }, [isLoading]);

  if (isLoading && !loadTimeout) return <LoadingBlock label="Loading point of sale…" />;

  return (
    <div className="animate-fade-in flex flex-col gap-2">
      <div className="flex justify-between items-center py-2 border-b border-black/5">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-black font-sora text-ink-primary leading-none">
            {activeTab === 'tables' ? 'Tables' : activeTab === 'pos' ? (isResto ? 'Order' : 'Sales') : 'History'}<span className="text-accent-signature">.</span>
          </h1>
          {/* Today's live stats */}
          <div className="hidden sm:flex items-center gap-1.5">
            <div className="flex items-center gap-1.5 bg-white border border-black/8 text-ink-primary px-2.5 py-1 rounded-lg h-7">
              <TrendingUp size={10} className="text-emerald-500 shrink-0" />
              <span className="text-[10px] font-black">{formatCurrency(todayStats.revenue)}</span>
              <span className="text-[9px] font-medium text-gray-400">today</span>
            </div>
            <div className="flex items-center gap-1.5 bg-white border border-black/8 text-ink-primary px-2.5 py-1 rounded-lg h-7">
              <Receipt size={10} className="opacity-40 shrink-0" />
              <span className="text-[10px] font-black">{todayStats.count}</span>
              <span className="text-[9px] font-medium text-gray-400">txns</span>
            </div>
            {todayStats.count > 0 && (
              <div className="flex items-center gap-1.5 bg-white border border-black/8 text-ink-primary px-2.5 py-1 rounded-lg h-7">
                <BarChart2 size={10} className="opacity-40 shrink-0" />
                <span className="text-[10px] font-black">{formatCurrency(todayStats.avg)}</span>
                <span className="text-[9px] font-medium text-gray-400">avg</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-1 bg-canvas p-1 rounded-pill shadow-inner">
          {isResto && (
            <button
              onClick={() => { setActiveTable(null); setActiveTab('tables'); }}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-pill text-xs font-bold transition-all ${
                activeTab === 'tables' ? 'bg-accent-signature text-button-text shadow-lg' : 'text-gray-400 hover:text-ink-primary'
              }`}
            >
              <LayoutGrid size={13} /> Tables
            </button>
          )}
          <button
            onClick={() => setActiveTab('pos')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-pill text-xs font-bold transition-all ${
              activeTab === 'pos' ? 'bg-accent-signature text-button-text shadow-lg' : 'text-gray-400 hover:text-ink-primary'
            }`}
          >
            <ShoppingCart size={13} /> {isResto ? 'Order' : 'New Sale'}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-pill text-xs font-bold transition-all ${
              activeTab === 'history' ? 'bg-accent-signature text-button-text shadow-lg' : 'text-gray-400 hover:text-ink-primary'
            }`}
          >
            <History size={13} /> History
          </button>
        </div>
      </div>

<div>
        {isResto && activeTab === 'tables' ? (
          <TablesFloor
            tables={tablesApi.tables}
            openTabs={tablesApi.openTabs}
            tabTotal={tablesApi.tabTotal}
            onOpenTable={openTable}
            addTable={tablesApi.addTable}
            deleteTable={tablesApi.deleteTable}
            transferTab={tablesApi.transferTab}
            mergeTabs={tablesApi.mergeTabs}
            updateTable={tablesApi.updateTable}
            currencySymbol={businessProfile?.currencySymbol || '₹'}
          />
        ) : activeTab === 'pos' ? (
          <>
            {isResto && activeTable && (
              <div className="flex items-center justify-between mb-2 px-4 py-2 rounded-xl bg-amber-50 border border-amber-200">
                <span className="text-sm font-bold text-ink-primary">Table {activeTable.table.label}</span>
                <button onClick={() => { setActiveTable(null); setActiveTab('tables'); }}
                  className="text-[12px] font-bold text-amber-700 hover:underline">← Back to floor</button>
              </div>
            )}
            {editingSale && (
              <div className="flex items-center justify-between mb-2 px-4 py-2 rounded-xl bg-amber-50 border border-amber-200">
                <span className="text-sm font-bold text-ink-primary">
                  Editing sale #{String(editingSale.id).split('-').pop()} — stock & balance re-sync on save
                </span>
                <button onClick={() => { setEditingSale(null); setActiveTab('history'); }}
                  className="text-[12px] font-bold text-amber-700 hover:underline">Cancel edit</button>
              </div>
            )}
            <InvoiceBuilder
              key={editingSale?.id || activeTable?.tab?.id || (estimateCart ? 'estimate' : 'walkin')}
              products={products}
              inventoryBalances={inventoryBalances}
              clients={clients}
              onPlaceSale={editingSale ? handleEditSale : (isResto && activeTable ? placeTableSale : addSale)}
              currentTenantId={currentTenantId}
              taxMode={businessProfile?.tax_mode || 'EXCLUSIVE'}
              businessProfile={businessProfile}
              topSellingIds={topSellingIds}
              stores={posStores}
              initialCart={editCart || activeTable?.tab?.cart || estimateCart || null}
              onCartChange={isResto && activeTable ? persistTabCart : null}
              tableLabel={activeTable?.table?.label || null}
              onSendKOT={isResto && activeTable ? sendTableKOT : null}
              businessType={businessType}
              editId={editingSale?.id || null}
              editMeta={editMeta}
              onEditDone={() => { setEditingSale(null); setActiveTab('history'); }}
            />
          </>
        ) : (
          <>
            {/* Sales / Returns sub-tabs */}
            <div className="flex gap-1 mb-3">
              {[['sales', 'Sales', sales.length], ['returns', 'Returns', salesReturns.length]].map(([k, label, n]) => (
                <button key={k} onClick={() => setHistoryView(k)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    historyView === k ? 'bg-ink-primary text-white' : 'bg-canvas text-gray-500 hover:text-ink-primary'
                  }`}>
                  {label}<span className={`ml-1.5 ${historyView === k ? 'opacity-60' : 'text-gray-400'}`}>{n}</span>
                </button>
              ))}
            </div>
            {historyView === 'sales' ? (
              <InvoiceList
                sales={sales}
                clients={clients}
                staff={staff}
                products={products}
                invoices={invoices}
                returnedSaleIds={returnedSaleIds}
                onDelete={removeSale}
                onSettle={settleSale}
                onPrint={printSale}
                onReturn={setReturnSale}
                onEdit={startEdit}
                onDispatch={dispatchSale}
                onConvertToInvoice={(sale) => setConvertSale(sale)}
              />
            ) : (
              <SalesReturnsList returns={salesReturns} />
            )}
          </>
        )}
      </div>

      {/* Convert to GST Invoice Modal — collects customer/GSTIN before RPC */}
      <Modal
        isOpen={!!convertSale}
        onClose={() => !convertSubmitting && setConvertSale(null)}
        title="Issue GST Tax Invoice"
        subtitle={convertSale ? `From sale ${convertSale.id?.slice(0, 12) || ''}` : ''}
      >
        {convertSale && (
          <ConvertToInvoiceSheet
            sale={convertSale}
            clients={clients}
            submitting={convertSubmitting}
            onCancel={() => setConvertSale(null)}
            onSubmit={async (form) => {
              setConvertSubmitting(true);
              try {
                // Brand-new customer → create the clients row first so the
                // RPC has a stable client_id to attach the invoice to and
                // future sales to the same customer can link directly.
                let clientId = form.client_id;
                if (!clientId && form.name && form.gstin) {
                  try {
                    const newId =
                      'CLI-' + Date.now().toString(36).toUpperCase() +
                      '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
                    const { data: ins, error: insErr } = await supabase
                      .from('clients')
                      .insert({
                        id:                  newId,
                        tenant_id:           currentTenantId,
                        name:                form.name,
                        phone:               form.phone || null,
                        address:             form.address || null,
                        gst_no:              form.gstin,
                        gstin:               form.gstin,
                        state:               form.place_of_supply || null,
                        outstanding_balance: 0,
                      })
                      .select('id')
                      .maybeSingle();
                    if (insErr) {
                      // eslint-disable-next-line no-console
                      console.warn('[convert] client auto-create failed (non-fatal)', insErr);
                    } else if (ins?.id) {
                      clientId = ins.id;
                    }
                  } catch (cerr) {
                    // eslint-disable-next-line no-console
                    console.warn('[convert] client insert threw (non-fatal)', cerr);
                  }
                }

                const result = await convertSaleToInvoice(convertSale.id, {
                  client_id:        clientId,
                  client_name:      form.name,
                  gstin:            form.gstin,
                  address:          form.address,
                  phone:            form.phone,
                  place_of_supply:  form.place_of_supply,
                  due_days:         form.due_days,
                  notes:            form.notes,
                });
                if (result.error) {
                  throw result.error;
                }
                addNotification?.(
                  result.already_existed
                    ? `Already converted: ${result.invoice_number}`
                    : `Invoice ${result.invoice_number} created`,
                  'SYSTEM UPDATE'
                );
                setConvertSale(null);
              } finally {
                setConvertSubmitting(false);
              }
            }}
          />
        )}
      </Modal>

      {/* Sales Return Modal */}
      <Modal
        isOpen={!!returnSale}
        onClose={() => setReturnSale(null)}
        title="Process Sales Return"
        subtitle="Credit note — stock will be restocked"
      >
        {returnSale && (
          <SalesReturnForm
            sale={returnSale}
            clients={clients}
            products={products}
            onSave={handleSalesReturn}
            loading={returnLoading}
          />
        )}
      </Modal>

      {printingSale && (
        <SalePrintDispatcher
          sale={printingSale}
          client={printingClient}
          business={businessProfile || {}}
          onClose={() => setPrintingSale(null)}
        />
      )}
    </div>
  );
};

export default SalesPage;
