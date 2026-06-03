import React, { useState } from 'react';
import { LoadingBlock } from '../../components/ui/States';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { useSales } from '../../hooks/useSales';
import { useInventory } from '../../hooks/useInventory';
import { usePeople } from '../../hooks/usePeople';
import { useNotifications } from '../../context/NotificationContext';
import { ShoppingCart, History, Plus, ReceiptText, TrendingUp, Receipt, BarChart2 } from 'lucide-react';
import { generateRef, formatCurrency, todayISOInAppTZ } from '../../lib/utils';
import Button from '../../shared/Button';
import Modal from '../../shared/Modal';
import InvoiceBuilder from './components/InvoiceBuilder';
import InvoiceList from './components/InvoiceList';
import SalePrintDispatcher from './components/SalePrintDispatcher';
import SalesReturnForm from './components/SalesReturnForm';
import ConvertToInvoiceSheet from './components/ConvertToInvoiceSheet';
import { calculateGST } from '../../lib/gstEngine';
import { supabase } from '../../lib/supabase';

const SalesPage = () => {
  // Sale picked for GST-invoice conversion. When set, the ConvertToInvoiceSheet
  // modal opens and collects customer / GSTIN info before firing the RPC.
  const [convertSale, setConvertSale] = useState(null);
  const [convertSubmitting, setConvertSubmitting] = useState(false);
  const { addNotification } = useNotifications();
  const { currentTenantId, businessProfile, currentTenant } = useTenant();
  const { sales, clients, invoices, placeSale, dispatchSale, createInvoice, deleteSale: removeSale, settleSale, processSalesReturn, convertSaleToInvoice, loading: salesLoading } = useSales(currentTenantId, { plan: currentTenant?.plan || 'STARTER' });

  // Wrap placeSale: auto-create invoice for credit sales (settlement) and
  // delivery sales (van dispatch queue), or both when combined.
  const addSale = async (saleData) => {
    const result = await placeSale(saleData);
    if (result?.error) return result;

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

  const [activeTab, setActiveTab] = useState('pos'); // 'pos' or 'history'
  const [printingSale, setPrintingSale] = useState(null);
  const [returnSale, setReturnSale] = useState(null);
  const [returnLoading, setReturnLoading] = useState(false);

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
            {activeTab === 'pos' ? 'Sales' : 'History'}<span className="text-accent-signature">.</span>
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
          <button
            onClick={() => setActiveTab('pos')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-pill text-xs font-bold transition-all ${
              activeTab === 'pos' ? 'bg-accent-signature text-button-text shadow-lg' : 'text-gray-400 hover:text-ink-primary'
            }`}
          >
            <ShoppingCart size={13} /> New Sale
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
        {activeTab === 'pos' ? (
          <InvoiceBuilder
            products={products}
            inventoryBalances={inventoryBalances}
            clients={clients}
            onPlaceSale={addSale}
            currentTenantId={currentTenantId}
            taxMode={businessProfile?.tax_mode || 'EXCLUSIVE'}
            businessProfile={businessProfile}
            topSellingIds={topSellingIds}
            stores={posStores}
          />
        ) : (
          <InvoiceList
            sales={sales}
            clients={clients}
            staff={staff}
            products={products}
            invoices={invoices}
            onDelete={removeSale}
            onSettle={settleSale}
            onPrint={printSale}
            onReturn={setReturnSale}
            onDispatch={dispatchSale}
            onConvertToInvoice={(sale) => setConvertSale(sale)}
          />
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
