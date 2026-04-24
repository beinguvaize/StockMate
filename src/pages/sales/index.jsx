import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { useSales } from '../../hooks/useSales';
import { useInventory } from '../../hooks/useInventory';
import { usePeople } from '../../hooks/usePeople';
import { ShoppingCart, History, Plus, ReceiptText } from 'lucide-react';
import Button from '../../shared/Button';
import InvoiceBuilder from './components/InvoiceBuilder';
import InvoiceList from './components/InvoiceList';
import SalePrintDispatcher from './components/SalePrintDispatcher';

const SalesPage = () => {
  const { currentTenantId, businessProfile } = useTenant();
  const { sales, clients, placeSale: addSale, deleteSale: removeSale, settleSale, loading: salesLoading } = useSales(currentTenantId);
  const { products, loading: productsLoading } = useInventory(currentTenantId);
  const { users: staff = [] } = usePeople(currentTenantId);

  const [activeTab, setActiveTab] = useState('pos'); // 'pos' or 'history'
  const [printingSale, setPrintingSale] = useState(null);

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
          />
        )}
      </div>

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
