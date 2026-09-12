import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Download, FileJson, FileSpreadsheet,
  ArrowLeft, Database,
} from 'lucide-react';
import { useInventory } from '../hooks/useInventory';
import { usePeople } from '../hooks/usePeople';
import { useSales } from '../hooks/useSales';
import { useFinance } from '../hooks/useFinance';
import { usePayroll } from '../hooks/usePayroll';
import { useNotifications } from '../hooks/useNotifications';
import { useTenant } from '../context/TenantContext';
import { useAuth } from '../context/AuthContext';
import ImportData from './ImportData';

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
  const { currentTenantId } = useTenant();
  const { isOwner } = useAuth();
  const { products, addProduct, updateProduct } = useInventory(currentTenantId);
  const { clients: shops, addClient: addShop, updateClient: updateShop } = usePeople(currentTenantId);
  const { sales: orders } = useSales(currentTenantId);
  const { expenses, addExpense } = useFinance(currentTenantId);
  const { employees, addEmployee, updateEmployee } = usePayroll(currentTenantId);
  const { addNotification } = useNotifications();

  const TABS = [
    { key: 'export', label: 'Export Data' },
    ...(isOwner ? [{ key: 'excel', label: 'Bulk Import · Upload Excel' }] : []),
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

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gray-900 flex items-center justify-center">
            <Database size={18} className="text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-foreground tracking-tight">Data Tools</h1>
            <p className="text-xs text-muted-foreground">Import &amp; export your business data</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === t.key
                ? 'bg-white text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-ink-secondary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">

        {/* Excel Bulk Import tab */}
        {activeTab === 'excel' && (
          <div className="p-6">
            <ImportData modal />
          </div>
        )}

        {/* Export / CSV-Import tabs */}
        {activeTab !== 'excel' && (
          <div className="p-6 space-y-6">
            {/* Module selector */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Data Module</p>
              <div className="flex flex-wrap gap-2">
                {MODULES.map(mod => (
                  <button
                    key={mod.key}
                    onClick={() => setSelectedModule(mod.key)}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-all ${
                      selectedModule === mod.key
                        ? 'bg-gray-900 text-emerald-400 border-gray-900'
                        : 'bg-muted text-ink-secondary border-border hover:border-gray-400'
                    }`}
                  >
                    {mod.label}
                  </button>
                ))}
              </div>
            </div>

            {/* EXPORT */}
            {activeTab === 'export' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-muted rounded-xl border border-border">
                  <div>
                    <p className="text-xs text-muted-foreground font-semibold">Records available</p>
                    <p className="text-3xl font-black text-foreground">{currentModuleData.length}</p>
                  </div>
                  <div className="flex gap-2">
                    {['csv', 'json'].map(fmt => (
                      <button
                        key={fmt}
                        onClick={() => setExportFormat(fmt)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
                          exportFormat === fmt
                            ? 'bg-gray-900 text-emerald-400 border-gray-900'
                            : 'bg-white text-ink-secondary border-border hover:border-gray-400'
                        }`}
                      >
                        {fmt === 'csv' ? <FileSpreadsheet size={13} /> : <FileJson size={13} />}
                        {fmt.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={handleExport}
                  disabled={!currentModuleData.length}
                  className="w-full flex items-center justify-center gap-3 py-4 bg-gray-900 text-white rounded-xl font-bold text-sm hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Download size={17} />
                  Export {currentModuleData.length} {MODULES.find(m => m.key === selectedModule)?.label} Records
                </button>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
