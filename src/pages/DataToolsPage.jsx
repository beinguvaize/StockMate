import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, ChevronLeft } from 'lucide-react';
import { Tabs } from '../components/ui/Tabs';
import { Button } from '../components/ui/button';
import OptionCard, { OptionGroup } from '../components/ui/OptionCard';
import { Seg } from '../components/documents/DocParts';
import { useInventory } from '../hooks/useInventory';
import { usePeople } from '../hooks/usePeople';
import { useSales } from '../hooks/useSales';
import { useFinance } from '../hooks/useFinance';
import { usePayroll } from '../hooks/usePayroll';
import { useNotifications } from '../hooks/useNotifications';
import { useTenant } from '../context/TenantContext';
import { useAuth } from '../context/AuthContext';
import ImportData from './ImportData';
import { usePurchases } from '../hooks/usePurchases';
import TallyExportPanel from '../components/documents/TallyExportPanel';

// ─── CSV helpers (export only) ───────────────────────────────────────────────

const MODULES = [
  { key: 'products', label: 'Products',       fields: ['id','sku','name','category','unit','costPrice','sellingPrice','stock','taxRate','tags','image'] },
  { key: 'shops',    label: 'Clients',         fields: ['id','name','contact','phone','address'] },
  { key: 'orders',   label: 'Sales',           fields: ['id','shopId','date','totalAmount','totalCogs','paymentMethod','paymentStatus','status'] },
  { key: 'expenses', label: 'Expenses',        fields: ['id','category','amount','note','date'] },
  { key: 'employees',label: 'Employees',       fields: ['id','name','role','status','salary'] },
];

const escapeCSV = (val) => {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n'))
    return `"${str.replace(/"/g, '""')}"`;
  return str;
};


// ─── Main page ────────────────────────────────────────────────────────────────

export default function DataToolsPage() {
  const navigate = useNavigate();
  const { currentTenantId, currentTenant } = useTenant();
  const { isOwner } = useAuth();
  const { products, addProduct, updateProduct } = useInventory(currentTenantId);
  const { clients: shops, addClient: addShop, updateClient: updateShop } = usePeople(currentTenantId);
  const { sales: orders } = useSales(currentTenantId);
  const { expenses, addExpense } = useFinance(currentTenantId);
  const { employees, addEmployee, updateEmployee } = usePayroll(currentTenantId);
  const { addNotification } = useNotifications();

  // Suppliers come from here rather than usePeople's list so the Tally file's
  // creditor ledgers and its purchase vouchers are built from one source.
  const { purchases = [], suppliers = [] } = usePurchases(currentTenantId) || {};

  const TABS = [
    { key: 'export', label: 'Export data' },
    ...(isOwner ? [{ key: 'excel', label: 'Bulk import · Upload Excel' }] : []),
    ...(isOwner ? [{ key: 'tally', label: 'Export to Tally' }] : []),
  ];

  const [activeTab, setActiveTab]           = useState('export');
  const [selectedModule, setSelectedModule] = useState('products');
  const [exportFormat, setExportFormat]     = useState('csv');

  const getModuleData = (key) => {
    switch (key) {
      case 'products':  return products;
      case 'shops':     return shops;
      case 'orders':    return orders;
      case 'expenses':  return expenses;
      case 'employees': return employees;
      default:          return [];
    }
  };

  const handleExport = () => {
    const data = getModuleData(selectedModule);
    const mod  = MODULES.find(m => m.key === selectedModule);
    let content, mimeType, extension;
    if (exportFormat === 'json') {
      content = JSON.stringify(data, null, 2);
      mimeType = 'application/json'; extension = 'json';
    } else {
      const headers = mod.fields;
      const csvRows = [headers.join(',')];
      data.forEach(row => {
        const values = headers.map(h => {
          let val = row[h];
          if (Array.isArray(val)) val = JSON.stringify(val);
          return escapeCSV(val);
        });
        csvRows.push(values.join(','));
      });
      content = csvRows.join('\n');
      mimeType = 'text/csv'; extension = 'csv';
    }
    const blob = new Blob([content], { type: mimeType });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `ledgr_${selectedModule}_${new Date().toISOString().split('T')[0]}.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
    addNotification(`Exported ${data.length} ${mod.label} records as ${extension.toUpperCase()}`, 'success');
  };

  const currentModuleData = getModuleData(selectedModule);
  const currentMod = MODULES.find(m => m.key === selectedModule);

  return (
    <div className="flex flex-col pb-16">
      <div className="mb-4 flex flex-wrap items-center gap-3.5">
        <button type="button" onClick={() => navigate('/settings?tab=data')}
          className="m-press inline-flex h-8 items-center gap-1 rounded-pill bg-well pl-2 pr-3 font-tight text-[13px] font-semibold text-ink-2 hover:bg-[#E8E8E7]">
          <ChevronLeft size={16} aria-hidden="true" />Settings
        </button>
        <h3 className="font-tight text-[20px] font-semibold tracking-[-0.02em] text-ink">Data tools</h3>
        <span className="text-[13px] text-mute">Import and export your business data</span>
      </div>

      <Tabs ariaLabel="Data tools" className="mb-5" value={activeTab} onChange={setActiveTab}
        items={TABS.map(t => ({ key: t.key, label: t.label }))} />

      {/* Excel Bulk Import tab: the same importer as Inventory's bulk import. */}
      {activeTab === 'excel' && (
        <div className="max-w-[880px] rounded-[14px] border border-line bg-surface p-6">
          <ImportData modal />
        </div>
      )}

      {/* Tally XML export */}
      {activeTab === 'tally' && (
        <div className="max-w-[720px]">
          <TallyExportPanel
            sales={orders}
            purchases={purchases}
            clients={shops}
            suppliers={suppliers}
            shopName={currentTenant?.name}
          />
        </div>
      )}

      {activeTab === 'export' && (
        <div className="grid max-w-[880px] gap-4">
          <section className="overflow-hidden rounded-[14px] border border-line bg-surface">
            <div className="border-b border-sep px-5 pb-3.5 pt-4">
              <h4 className="font-tight text-[15px] font-semibold text-ink">Choose a list</h4>
              <p className="mt-0.5 text-[13px] text-body">Exports what this device has loaded for that list.</p>
            </div>
            <div className="px-5 py-4">
              <OptionGroup cols={1} aria-label="List to export" className="grid-cols-2 sm:grid-cols-5">
                {MODULES.map(mod => (
                  <OptionCard key={mod.key} title={mod.label}
                    hint={`${getModuleData(mod.key).length.toLocaleString('en-IN')} records`}
                    selected={selectedModule === mod.key} onClick={() => setSelectedModule(mod.key)} />
                ))}
              </OptionGroup>
              <div className="mb-1.5 mt-[18px] font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute">Format</div>
              <Seg ariaLabel="Format" value={exportFormat} onChange={setExportFormat} options={[['csv', 'CSV'], ['json', 'JSON']]} />
              {exportFormat === 'csv' && (
                <div className="mt-4 rounded-xl bg-tile px-3.5 py-[11px] text-[13px] text-body shadow-[inset_0_0_0_1px_var(--color-line)]">
                  Columns: {currentMod?.fields.join(', ')}.
                </div>
              )}
            </div>
            <div className="flex justify-end border-t border-sep bg-tile px-5 py-3">
              <Button onClick={handleExport} disabled={!currentModuleData.length}>
                <Download aria-hidden="true" />
                Export {currentModuleData.length.toLocaleString('en-IN')} {currentMod?.label.toLowerCase()}
              </Button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
