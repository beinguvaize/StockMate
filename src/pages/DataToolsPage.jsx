import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, ChevronLeft, Database } from 'lucide-react';
import { Tabs, FilterPills } from '../components/ui/Tabs';
import { Button } from '../components/ui/button';
import { IconTile, Eyebrow } from '../components/tools/parts';
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

  const box = 'm-rise rounded-[14px] border border-line bg-surface px-[22px] py-5';

  const TABS = [
    { key: 'export', label: 'Export data' },
    ...(isOwner ? [{ key: 'excel', label: 'Bulk import (Excel)' }] : []),
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

  // Web redesign (approved mockups import-01..09): one box per tab, the same
  // exports, the same importer and the same Tally file.
  return (
    <div className="flex max-w-[1000px] flex-col pb-16">
      <div className="m-rise mb-4" style={{ '--i': 0 }}>
        <button type="button" onClick={() => navigate('/settings?tab=data')}
          className="m-press inline-flex items-center gap-1 font-tight text-[13px] font-semibold text-body hover:text-ink">
          <ChevronLeft size={16} aria-hidden="true" />Settings
        </button>
      </div>
      <div className="m-rise mb-4 flex items-center gap-3" style={{ '--i': 0 }}>
        <IconTile icon={Database} />
        <div>
          <h3 className="font-tight text-[20px] font-semibold leading-[1.2] tracking-[-0.02em] text-ink">Data tools</h3>
          <p className="mt-0.5 text-[13px] text-body">Bring your data in, or take it out</p>
        </div>
      </div>

      <Tabs ariaLabel="Data tools" className="m-rise mb-5" value={activeTab} onChange={setActiveTab}
        items={TABS.map(t => ({ key: t.key, label: t.label }))} />

      {/* Excel Bulk Import tab: the same importer as Inventory's bulk import. */}
      {activeTab === 'excel' && (
        <div className={box}>
          <ImportData modal />
        </div>
      )}

      {/* Tally XML export */}
      {activeTab === 'tally' && (
        <div className={box}>
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
        <>
          <div className={box}>
            <Eyebrow>What to export</Eyebrow>
            <FilterPills ariaLabel="List to export" value={selectedModule} onChange={setSelectedModule}
              items={MODULES.map(mod => ({ key: mod.key, label: mod.label, count: getModuleData(mod.key).length.toLocaleString('en-IN') }))} />
            <div className="mt-4 flex flex-wrap items-center gap-4 rounded-[14px] bg-tile px-[18px] py-4">
              <div>
                <small className="text-[12.5px] text-body">Records ready</small>
                <b className="block font-tight text-[30px] font-semibold tabular-nums text-ink">{currentModuleData.length.toLocaleString('en-IN')}</b>
              </div>
              <span className="flex-1 text-[12.5px] text-mute">Exports what this device has loaded for that list.</span>
              <Seg ariaLabel="Format" value={exportFormat} onChange={setExportFormat} options={[['csv', 'CSV'], ['json', 'JSON']]} />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              {exportFormat === 'csv' && (
                <span className="min-w-0 flex-1 text-[12px] text-mute">Columns: {currentMod?.fields.join(', ')}</span>
              )}
              <span className="flex-1" />
              <Button onClick={handleExport} disabled={!currentModuleData.length}>
                <Download aria-hidden="true" />
                Export {currentModuleData.length.toLocaleString('en-IN')} {currentMod?.label.toLowerCase()}
              </Button>
            </div>
          </div>
          {!isOwner && (
            <p className="mt-2.5 text-[12px] text-mute">Bulk import and Export to Tally show for the shop owner only.</p>
          )}
        </>
      )}
    </div>
  );
}
