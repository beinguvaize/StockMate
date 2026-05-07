import React, { useState } from 'react';
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

const SalesPage = () => {
  const { addNotification } = useNotifications();
  const { currentTenantId, businessProfile } = useTenant();
  const { sales, clients, placeSale, createInvoice, deleteSale: removeSale, settleSale, processSalesReturn, loading: salesLoading } = useSales(currentTenantId);

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
      const invoiceItems = (saleData.items || []).map(i => ({
        name:     i.name,
        qty:      i.quantity,
        rate:     i.price,
        taxRate:  i.taxRate || 0,
        total:    (i.price || 0) * (i.quantity || 1) * (1 + (i.taxRate || 0) / 100),
        sku:      i.sku || '',
        hsn_code: i.hsn_code || '',
        unit:     i.unit || 'PCS',
      }));
      const taxableAmt   = invoiceItems.reduce((sum, i) => sum + i.rate * i.qty, 0);
      const totalTax     = invoiceItems.reduce((sum, i) => sum + i.rate * i.qty * (i.taxRate / 100), 0);
      const isInterstate = client?.state && businessProfile?.state
        ? client.state.trim().toLowerCase() !== businessProfile.state.trim().toLowerCase()
        : false;

      await createInvoice({
        sale_id:         result.id,
        client_id:       saleData.clientId,
        client_name:     client?.name || 'Walk-in',
        items:           invoiceItems,
        grand_total:     saleData.totalAmount,
        taxable_amount:  taxableAmt,
        tax_total:       totalTax,
        cgst_amount:     isInterstate ? 0 : totalTax / 2,
        sgst_amount:     isInterstate ? 0 : totalTax / 2,
        igst_amount:     isInterstate ? totalTax : 0,
        is_interstate:   isInterstate,
        paid_amount:     isCredit ? 0 : saleData.totalAmount,
        payment_status:  isCredit ? 'UNPAID' : 'PAID',
        // Delivery tracking
        delivery_required: isDelivery,
        delivery_status:   isDelivery ? 'PENDING' : null,
      });
    }

    refetchInventory();
    return result;
  };
  const { products, inventoryBalances, loading: productsLoading, refetch: refetchInventory } = useInventory(currentTenantId);
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

  if (isLoading && !loadTimeout) return (
    <div className="flex items-center justify-center p-20">
      <div className="text-sm font-bold opacity-50 animate-pulse">Loading sales...</div>
    </div>
  );

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
          />
        ) : (
          <InvoiceList
            sales={sales}
            clients={clients}
            staff={staff}
            products={products}
            onDelete={removeSale}
            onSettle={settleSale}
            onPrint={printSale}
            onReturn={setReturnSale}
          />
        )}
      </div>

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
