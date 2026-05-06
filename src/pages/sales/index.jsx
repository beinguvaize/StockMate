import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { useSales } from '../../hooks/useSales';
import { useInventory } from '../../hooks/useInventory';
import { usePeople } from '../../hooks/usePeople';
import { useNotifications } from '../../context/NotificationContext';
import { ShoppingCart, History, Plus, ReceiptText } from 'lucide-react';
import { generateRef } from '../../lib/utils';
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

  // Wrap placeSale: auto-create an UNPAID invoice for every credit sale so
  // the settlement page can show and settle it.
  const addSale = async (saleData) => {
    const result = await placeSale(saleData);
    if (!result.error && saleData.paymentMethod === 'CREDIT' && saleData.clientId && saleData.clientId !== 'WALKIN') {
      const client = clients.find(c => c.id === saleData.clientId);
      const invoiceItems = (saleData.items || []).map(i => ({
        name: i.name,
        qty: i.quantity,
        rate: i.price,
        taxRate: i.taxRate || 0,
        total: (i.price || 0) * (i.quantity || 1) * (1 + (i.taxRate || 0) / 100),
        sku: i.sku || '',
        hsn_code: i.hsn_code || '',
        unit: i.unit || 'PCS',
      }));
      // Calculate tax breakdown from line items
      const taxableAmt = invoiceItems.reduce((sum, i) => sum + i.rate * i.qty, 0);
      const totalTax   = invoiceItems.reduce((sum, i) => sum + i.rate * i.qty * (i.taxRate / 100), 0);
      const isInterstate = client?.state && businessProfile?.state
        ? client.state.trim().toLowerCase() !== businessProfile.state.trim().toLowerCase()
        : false;
      await createInvoice({
        sale_id: result.id,
        client_id: saleData.clientId,
        client_name: client?.name || 'Unknown',
        items: invoiceItems,
        grand_total: saleData.totalAmount,
        taxable_amount: taxableAmt,
        tax_total: totalTax,
        cgst_amount: isInterstate ? 0 : totalTax / 2,
        sgst_amount: isInterstate ? 0 : totalTax / 2,
        igst_amount: isInterstate ? totalTax : 0,
        is_interstate: isInterstate,
        paid_amount: 0,
        payment_status: 'UNPAID',
      });
    }
    if (!result.error) refetchInventory();
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

  if (isLoading) return (
    <div className="flex items-center justify-center p-20">
      <div className="text-sm font-bold opacity-50 animate-pulse">Loading sales...</div>
    </div>
  );

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <div className="flex justify-between items-end pb-6 border-b border-black/5 text-ink-primary">
        <div>
          <h1 className="text-4xl md:text-7xl font-black font-sora text-ink-primary leading-[0.85] tracking-tight mb-2">
            {activeTab === 'pos' ? 'Sales' : 'History'}<span className="text-accent-signature">.</span>
          </h1>
          <p className="text-xs font-semibold text-gray-600 opacity-80 mb-6">
            {activeTab === 'pos' ? 'Record sales and manage cart' : 'Past sales and invoices'}
          </p>
        </div>
        <div className="flex gap-2 bg-canvas p-1 rounded-pill mb-4 shadow-inner">
          <button
            onClick={() => setActiveTab('pos')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-pill text-xs font-bold transition-all ${
              activeTab === 'pos' ? 'bg-accent-signature text-button-text shadow-lg' : 'text-gray-400 hover:text-ink-primary'
            }`}
          >
            <ShoppingCart size={14} /> New Sale
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-pill text-xs font-bold transition-all ${
              activeTab === 'history' ? 'bg-accent-signature text-button-text shadow-lg' : 'text-gray-400 hover:text-ink-primary'
            }`}
          >
            <History size={14} /> History
          </button>
        </div>
      </div>

<div className="mt-2">
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
