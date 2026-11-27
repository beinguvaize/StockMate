import React, { useState, useEffect } from 'react';
import { PageSkeleton } from '../../components/ui/States';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { useSales } from '../../hooks/useSales';
import { useInventory } from '../../hooks/useInventory';
import { usePeople } from '../../hooks/usePeople';
import { useNotifications } from '../../context/NotificationContext';
import { ChevronLeft } from 'lucide-react';
import { generateRef, formatCurrency, todayISOInAppTZ } from '../../lib/utils';
import { Button } from '../../components/ui/button';
import { Tabs } from '../../components/ui/Tabs';
import Dialog from '../../components/ui/Dialog';
import TopBarSlot from '../../components/TopBarSlot';
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
  // Maximize window to full-screen in Electron (POS kiosk mode).
  // Cleanup restores on navigate-away. OS leave-full-screen event (e.g. Esc
  // on macOS) is handled in main.cjs → sends kioskChange to AppLayout.
  useEffect(() => {
    if (!window.electron?.window) return;
    window.electron.window.setKiosk(true);
    return () => window.electron.window.setKiosk(false);
  }, []);

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
  const { sales, clients, invoices, salesReturns, placeSale, editSale, dispatchSale, createInvoice, updateInvoiceDelivery, deleteSale: removeSale, settleSale, processSalesReturn, reverseSalesReturn, convertSaleToInvoice, loading: salesLoading } = useSales(currentTenantId, { plan: currentTenant?.plan || 'STARTER' });

  const handleReverseReturn = async (returnId) => {
    const { error } = await reverseSalesReturn(returnId);
    if (error) { addNotification('Undo failed: ' + error.message, 'error'); return; }
    addNotification('Return undone. Stock re-deducted, the sale can be edited again.', 'success');
  };

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

    // process_sale ALREADY writes the invoice when there is a named client and
    // money outstanding -- id 'INV-' || sale id. Creating another one here gave
    // every credit sale two invoices: the server's, correct, and this one with
    // its own id, so the ON CONFLICT (id) guard in process_sale never fired.
    // Six sales carried duplicates before this was caught, and a client
    // statement billed both.
    //
    // So only create when the server did not: a delivery that was paid in full
    // leaves nothing outstanding and therefore has no server invoice. When the
    // server did create one, add the delivery details to THAT row instead of
    // writing a second document.
    const totalAmount   = Number(saleData.totalAmount ?? result?.totalAmount ?? 0);
    const paidAmount    = Number(saleData.paidAmount ?? (isCredit ? 0 : totalAmount));
    const serverInvoiced = Boolean(hasClient) && (totalAmount - paidAmount) > 0.005;

    const needsInvoice = ((isCredit && hasClient) || isDelivery) && !serverInvoiced;

    if (serverInvoiced && isDelivery) {
      await updateInvoiceDelivery(`INV-${result.id}`, {
        delivery_required: true,
        delivery_status:   'PENDING',
        delivery_address:  saleData.deliveryAddress || null,
        delivery_zone:     saleData.deliveryZone    || null,
        delivery_date:     saleData.deliveryDate    || null,
        delivery_notes:    saleData.deliveryNotes   || null,
        delivery_fee:      saleData.deliveryFee     || 0,
      });
    }

    if (needsInvoice) {
      const client = clients.find(c => c.id === saleData.clientId);
      const draftItems = (saleData.items || []).map(i => ({
        name:     i.name,
        qty:      i.quantity,
        // POS prices INCLUDE GST -- the same convention process_sale and the ITC
        // back-out use. computeLineTax treats rate as exclusive and adds tax on
        // top, which is how the duplicate invoices came out at exactly 1.18x the
        // sale. Hand it the exclusive rate so the invoice total matches the sale.
        rate:     (Number(i.price) || 0) / (1 + ((Number(i.taxRate) || 0) / 100)),
        taxRate:  i.taxRate || 0,
        cess:     Number(i.cess ?? i.cess_rate ?? 0),
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
  const { users: staff = [], recordClientPayment } = usePeople(currentTenantId);

  const [activeTab, setActiveTab] = useState('pos'); // 'tables' | 'pos' | 'history' | 'returns'
  // The builder's full-page checkout is open (the tabs step aside for it).
  const [checkoutOpen, setCheckoutOpen] = useState(false);
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
    // Preserve original sale date so editing doesn't silently move the sale
    // to today (the builder defaults to todayISOInAppTZ() when date is absent).
    date: editingSale.date || null,
    // Original amount actually paid — prefilled so the edit keeps the real
    // payment state. Lower it to turn a Paid sale into Pending/Partial.
    paidAmount: Number(editingSale.paidAmount ?? editingSale.paid_amount ?? 0),
    totalAmount: Number(editingSale.totalAmount ?? editingSale.total_amount ?? 0),
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
    addNotification('Return processed, stock restored.', 'success');
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

  if (isLoading && !loadTimeout) return <PageSkeleton cards={3} rows={8} />;

  // Today's figures sit in the shell's top bar (TopBarSlot); between the
  // phone and desktop widths the top bar is hidden, so they show above the
  // tabs there instead, as they did before.
  const todayFigures = (
    <div className="flex items-center gap-3.5 text-[12.5px] text-body whitespace-nowrap [&>span+span]:pl-3.5 [&>span+span]:border-l [&>span+span]:border-sep" title="Today so far">
      <span>Today <b className="font-tight text-[13px] font-semibold text-ink tabular-nums">{formatCurrency(todayStats.revenue)}</b></span>
      <span><b className="font-tight text-[13px] font-semibold text-ink tabular-nums">{todayStats.count}</b> {todayStats.count === 1 ? 'bill' : 'bills'}</span>
      {todayStats.count > 0 && (
        <span>avg <b className="font-tight text-[13px] font-semibold text-ink tabular-nums">{formatCurrency(todayStats.avg)}</b></span>
      )}
    </div>
  );

  const tabItems = [
    ...(isResto ? [{ key: 'tables', label: 'Tables' }] : []),
    { key: 'pos', label: isResto ? 'Order' : 'New sale' },
    { key: 'history', label: 'History', count: (sales || []).length.toLocaleString('en-IN') },
    { key: 'returns', label: 'Returns', count: (salesReturns || []).length.toLocaleString('en-IN') },
  ];

  return (
    <div className="flex flex-col">
      <TopBarSlot>{todayFigures}</TopBarSlot>
      <div className="hidden sm:flex md:hidden mb-3">{todayFigures}</div>

      {/* Checkout takes the page over, as in the approved design: the tabs
          step aside while it is open and come back with "Back to cart". */}
      {!checkoutOpen && (
        <Tabs
          ariaLabel="Sales"
          className="m-rise mb-[18px] -mt-1 overflow-x-auto no-scrollbar"
          items={tabItems}
          value={activeTab}
          onChange={(k) => { if (k === 'tables') setActiveTable(null); setActiveTab(k); }}
        />
      )}

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
            {isResto && activeTable && !checkoutOpen && (
              <div className="m-rise flex items-center justify-between gap-3 mb-3 px-4 py-2.5 rounded-xl bg-amber-soft">
                <span className="font-tight text-[13.5px] font-semibold text-ink">Table {activeTable.table.label}</span>
                <Button variant="link" size="xs" className="px-0"
                  onClick={() => { setActiveTable(null); setActiveTab('tables'); }}>
                  <ChevronLeft /> Back to floor
                </Button>
              </div>
            )}
            {editingSale && !checkoutOpen && (
              <div className="m-rise flex items-center justify-between gap-3 mb-3 px-4 py-2.5 rounded-xl bg-amber-soft">
                <span className="text-[13px] text-ink-2">
                  <b className="font-tight font-semibold text-ink">Editing sale #{String(editingSale.id).split('-').pop()}</b>
                  <span className="text-body">, stock and balance re-sync on save</span>
                </span>
                <Button variant="secondary" size="xs" className="bg-surface"
                  onClick={() => { setEditingSale(null); setActiveTab('history'); }}>
                  Cancel edit
                </Button>
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
              scaleOn={isModuleOn('supermarket')}
              editId={editingSale?.id || null}
              editMeta={editMeta}
              onEditDone={() => { setEditingSale(null); setActiveTab('history'); }}
              onRecordPayment={recordClientPayment}
              onCheckoutChange={setCheckoutOpen}
            />
          </>
        ) : activeTab === 'history' ? (
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
          <SalesReturnsList returns={salesReturns} onReverse={handleReverseReturn} />
        )}
      </div>

      {/* Convert to GST Invoice Modal — collects customer/GSTIN before RPC */}
      <Dialog
        open={!!convertSale}
        onClose={() => !convertSubmitting && setConvertSale(null)}
        width={540}
        title="Issue GST tax invoice"
        subtitle={convertSale
          ? `From sale ${convertSale.id?.slice(0, 12) || ''} · ${formatCurrency(convertSale.totalAmount ?? convertSale.total_amount ?? 0)}`
          : ''}
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
      </Dialog>

      {/* Sales Return Modal */}
      <Dialog
        open={!!returnSale}
        onClose={() => setReturnSale(null)}
        title="Return items"
        subtitle="Credit note. Returned items go back into stock."
      >
        {returnSale && (
          <SalesReturnForm
            sale={returnSale}
            clients={clients}
            products={products}
            onSave={handleSalesReturn}
            loading={returnLoading}
            onCancel={() => setReturnSale(null)}
          />
        )}
      </Dialog>

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
