import React, { useState, useRef} from 'react';
import { createPortal } from 'react-dom';
import {
  X, Download, Upload, FileJson, Eye,
  CheckCircle2, AlertCircle, Check, FileSpreadsheet, ChevronLeft
} from 'lucide-react';
import { useInventory } from '../hooks/useInventory';
import { usePeople } from '../hooks/usePeople';
import { useSales } from '../hooks/useSales';
import { useFinance } from '../hooks/useFinance';
import { usePayroll } from '../hooks/usePayroll';
import { useNotifications } from '../hooks/useNotifications';
import { useTenant } from '../context/TenantContext';

const MODULES = [
 { key: 'products', label: 'Products',
   fields: ['id','sku','name','category','unit','costPrice','sellingPrice','stock','taxRate','tags','image'],
   requiredFields: ['name','costPrice','sellingPrice'],
   signatureFields: ['costPrice','sellingPrice','stock','taxRate'],
 },
 { key: 'shops', label: 'Clients / Shops',
   fields: ['id','name','contact','phone','address'],
   requiredFields: ['name'],
   signatureFields: ['contact','phone','address'],
 },
 { key: 'orders', label: 'Orders',
   fields: ['id','shopId','date','totalAmount','totalCogs','paymentMethod','paymentStatus','status'],
   requiredFields: ['shopId','totalAmount','date'],
   signatureFields: ['shopId','totalAmount','paymentMethod','paymentStatus'],
 },
 { key: 'expenses', label: 'Expenses',
   fields: ['id','category','amount','note','date'],
   requiredFields: ['category','amount','date'],
   signatureFields: ['category','amount','note'],
 },
 { key: 'employees', label: 'Employees',
   fields: ['id','name','role','status','salary'],
   requiredFields: ['name','salary'],
   signatureFields: ['role','salary'],
 },
];

/**
 * CSV Utility Functions
 */
const escapeCSV = (val) => {
 if (val === null || val === undefined) return '';
 const str = String(val);
 if (str.includes(',') || str.includes('"') || str.includes('\n')) {
 return `"${str.replace(/"/g, '""')}"`;
}
 return str;
};

const parseCSV = (text) => {
 const lines = text.split('\n').filter(l => l.trim());
 if (lines.length < 2) return [];
 
 const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
 const records = [];

 for (let i = 1; i < lines.length; i++) {
 const values = [];
 let current = '';
 let inQuotes = false;
 
 for (const char of lines[i]) {
 if (char === '"') {
 inQuotes = !inQuotes;
} else if (char === ',' && !inQuotes) {
 values.push(current.trim());
 current = '';
} else {
 current += char;
}
}
 values.push(current.trim());

 const record = {};
 headers.forEach((h, idx) => {
 let val = values[idx] || '';
 // Try to parse numbers
 if (/^\d+\.?\d*$/.test(val)) val = parseFloat(val);
 // Try to parse arrays (like tags)
 if (val && typeof val === 'string' && val.startsWith('[')) {
 try { val = JSON.parse(val);} catch (e) { /* keep as string */}
}
 record[h] = val;
});
 records.push(record);
}
 return records;
};

const DataTools = ({ isOpen, onClose}) => {
 const { currentTenantId } = useTenant();
 const { products, addProduct, updateProduct } = useInventory(currentTenantId);
 const { clients: shops, addClient: addShop, updateClient: updateShop } = usePeople(currentTenantId);
 const { sales: orders } = useSales(currentTenantId);
 const { expenses, addExpense } = useFinance(currentTenantId);
 const { employees, addEmployee, updateEmployee } = usePayroll(currentTenantId);
 const { addNotification } = useNotifications();

 const [activeTab, setActiveTab] = useState('export');
 const [selectedModule, setSelectedModule] = useState('products');
 const [exportFormat, setExportFormat] = useState('csv');
 const [importData, setImportData] = useState(null);
 const [importPreview, setImportPreview] = useState([]);
 const [importFileName, setImportFileName] = useState('');
 const [importing, setImporting] = useState(false);
 const [importResult, setImportResult] = useState(null);
 const importRef = useRef(null);

 if (!isOpen) return null;

 const getModuleData = (key) => {
 switch (key) {
 case 'products': return products;
 case 'shops': return shops;
 case 'orders': return orders;
 case 'expenses': return expenses;
 case 'employees': return employees;
 default: return [];
}
};

 /**
 * EXPORT
 */
 const handleExport = () => {
 const data = getModuleData(selectedModule);
 const mod = MODULES.find(m => m.key === selectedModule);
 let content, mimeType, extension;

 if (exportFormat === 'json') {
 content = JSON.stringify(data, null, 2);
 mimeType = 'application/json';
 extension = 'json';
} else {
 // CSV
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
 mimeType = 'text/csv';
 extension = 'csv';
}

 const blob = new Blob([content], { type: mimeType});
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = `ledgr_${selectedModule}_${new Date().toISOString().split('T')[0]}.${extension}`;
 a.click();
 URL.revokeObjectURL(url);

 addNotification(`Exported ${data.length} ${mod.label} records as ${extension.toUpperCase()}`, 'success');
};

 /**
 * IMPORT
 */
 const handleFileSelect = (e) => {
 const file = e.target.files?.[0];
 if (!file) return;

 setImportFileName(file.name);
 setImportResult(null);

 const reader = new FileReader();
 reader.onload = (ev) => {
 const text = ev.target.result;
 let records;

 if (file.name.endsWith('.json')) {
 try {
 records = JSON.parse(text);
 if (!Array.isArray(records)) records = [records];
} catch (err) {
 setImportResult({ success: false, message: 'Invalid JSON file'});
 return;
}
} else {
 records = parseCSV(text);
}

 if (records.length === 0) {
 setImportResult({ success: false, message: 'No records found in file'});
 return;
}

 // ── Header validation ──────────────────────────────────────────
 const fileHeaders = Object.keys(records[0]);
 const mod = MODULES.find(m => m.key === selectedModule);

 // 1. Check required fields all present
 const missingRequired = mod.requiredFields.filter(f => !fileHeaders.includes(f));
 if (missingRequired.length > 0) {
   // Check if it matches a different module (wrong file selected)
   const matchedMod = MODULES.find(m =>
     m.key !== selectedModule &&
     m.signatureFields.some(f => fileHeaders.includes(f))
   );
   const hint = matchedMod
     ? ` This looks like a ${matchedMod.label} file.`
     : '';
   setImportResult({
     success: false,
     message: `Wrong file for "${mod.label}". Missing required fields: ${missingRequired.join(', ')}.${hint} Select the correct module or fix the file.`,
   });
   setImportData(null);
   setImportPreview([]);
   return;
 }

 // 2. Check signature overlap — detect completely wrong entity
 const sigMatches = mod.signatureFields.filter(f => fileHeaders.includes(f));
 if (sigMatches.length === 0) {
   const matchedMod = MODULES.find(m =>
     m.key !== selectedModule &&
     m.signatureFields.some(f => fileHeaders.includes(f))
   );
   const hint = matchedMod ? ` Looks like a "${matchedMod.label}" file.` : '';
   setImportResult({
     success: false,
     message: `File headers don't match "${mod.label}" format.${hint} Expected: ${mod.signatureFields.join(', ')}.`,
   });
   setImportData(null);
   setImportPreview([]);
   return;
 }
 // ─────────────────────────────────────────────────────────────

 setImportData(records);
 setImportPreview(records.slice(0, 5));
};
 reader.readAsText(file);
};

 const handleImport = async () => {
 if (!importData || importData.length === 0) return;
 setImporting(true);

 try {
 const existingData = getModuleData(selectedModule);
 const existingIds = new Set(existingData.map(d => d.id));
 let added = 0, updated = 0;

 for (const record of importData) {
 // Ensure tags array for products
 if (selectedModule === 'products') {
 if (typeof record.tags === 'string') {
 record.tags = record.tags.split(',').map(t => t.trim()).filter(t => t);
}
 record.costPrice = parseFloat(record.costPrice) || 0;
 record.sellingPrice = parseFloat(record.sellingPrice) || 0;
 record.stock = parseInt(record.stock) || 0;
 record.taxRate = parseFloat(record.taxRate) || 0;
}
 if (selectedModule === 'expenses') {
 record.amount = parseFloat(record.amount) || 0;
}
 if (selectedModule === 'employees') {
 record.salary = parseFloat(record.salary) || 0;
}

 if (existingIds.has(record.id)) {
 // Update existing
 switch (selectedModule) {
 case 'products': await updateProduct(record); break;
 case 'shops': await updateShop(record); break;
 case 'employees': await updateEmployee(record); break;
}
 updated++;
} else {
 // Add new
 switch (selectedModule) {
 case 'products': await addProduct(record); break;
 case 'shops': await addShop(record); break;
 case 'expenses': await addExpense(record); break;
 case 'employees': await addEmployee(record); break;
}
 added++;
}
}

 setImportResult({
 success: true,
 message: `Successfully imported: ${added} new, ${updated} updated (${importData.length} total records)`
});
 addNotification(`Imported ${importData.length} ${MODULES.find(m => m.key === selectedModule)?.label} records`, 'success');
} catch (err) {
 console.error('Import error:', err);
 setImportResult({ success: false, message: `Import failed: ${err.message}`});
} finally {
 setImporting(false);
}
};

 const currentModuleData = getModuleData(selectedModule);

 return createPortal(
 <div className="fixed inset-0 z-50 flex flex-col bg-canvas animate-fade-in">
 {/* ── Top bar ── */}
 <div className="flex items-center gap-4 px-6 py-4 border-b border-black/5 bg-white shrink-0">
   <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full border border-black/5 hover:bg-canvas transition-all text-ink-primary shrink-0">
     <ChevronLeft size={18} />
   </button>
   <div className="min-w-0">
     <h1 className="text-lg font-black text-ink-primary leading-tight">Data Tools<span className="text-accent-signature">.</span></h1>
     <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Import &amp; export your business data</p>
   </div>
   <button onClick={onClose} className="ml-auto w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/5 transition-all text-gray-400 shrink-0">
     <X size={16} />
   </button>
 </div>

 {/* ── Scrollable content ── */}
 <div className="flex-1 overflow-y-auto">
 <div className="max-w-3xl mx-auto px-6 py-6 flex flex-col gap-4">

 {/* Tabs */}
 <div className="flex border-b border-black/5">
 <button 
 className={`flex-1 py-2 text-[10px] font-semibold transition-all flex items-center justify-center gap-3 ${activeTab === 'export' ? 'bg-accent-signature/10 text-ink-primary border-b-2 border-accent-signature' : 'text-gray-700 hover:bg-canvas'}`}
 onClick={() => { setActiveTab('export'); setImportData(null); setImportResult(null);}}
 >
 <Download size={16} /> Export Data
 </button>
 <button 
 className={`flex-1 py-2 text-[10px] font-semibold transition-all flex items-center justify-center gap-3 ${activeTab === 'import' ? 'bg-accent-signature/10 text-ink-primary border-b-2 border-accent-signature' : 'text-gray-700 hover:bg-canvas'}`}
 onClick={() => { setActiveTab('import'); setImportData(null); setImportResult(null);}}
 >
 <Upload size={16} /> Import Data
 </button>
 </div>

 {/* Content */}
 <div className="space-y-4">
 {/* Module Selector */}
 <div>
 <label className="text-[10px] font-semibold text-gray-700 mb-2 block opacity-70">Select Data Module</label>
 <div className="grid grid-cols-5 gap-2">
 {MODULES.map(mod => (
 <button
 key={mod.key}
 className={`py-3 px-4 rounded-xl text-[9px] font-semibold transition-all border ${
 selectedModule === mod.key
 ? 'bg-ink-primary text-accent-signature border-ink-primary shadow-lg'
 : 'bg-canvas text-ink-primary border-black/5 hover:border-accent-signature/30'
}`}
 onClick={() => { setSelectedModule(mod.key); setImportData(null); setImportResult(null);}}
 >
 {mod.label}
 </button>
 ))}
 </div>
 </div>

 {activeTab === 'export' ? (
 <>
 {/* Export Stats */}
 <div className="flex items-center gap-4 p-4 bg-canvas rounded-lg border border-black/5">
 <div className="flex-1">
 <div className="text-[9px] font-semibold text-gray-700 opacity-70 mb-1">Records Available</div>
 <div className="text-3xl font-semibold text-ink-primary">{currentModuleData.length}</div>
 </div>
 <div className="flex gap-2">
 <button
 className={`px-5 py-3 rounded-xl text-[9px] font-semibold border transition-all flex items-center gap-2 ${
 exportFormat === 'csv' 
 ? 'bg-ink-primary text-accent-signature border-ink-primary' 
 : 'bg-surface text-ink-primary border-black/10 hover:border-accent-signature/30'
}`}
 onClick={() => setExportFormat('csv')}
 >
 <FileSpreadsheet size={14} /> CSV
 </button>
 <button
 className={`px-5 py-3 rounded-xl text-[9px] font-semibold border transition-all flex items-center gap-2 ${
 exportFormat === 'json' 
 ? 'bg-ink-primary text-accent-signature border-ink-primary' 
 : 'bg-surface text-ink-primary border-black/10 hover:border-accent-signature/30'
}`}
 onClick={() => setExportFormat('json')}
 >
 <FileJson size={14} /> JSON
 </button>
 </div>
 </div>

 {/* Export Button */}
 <button
 className="btn-signature w-full !h-16 !rounded-lg !text-sm"
 onClick={handleExport}
 disabled={currentModuleData.length === 0}
 >
 <Download size={20} className="mr-3" />
 EXPORT {currentModuleData.length} {MODULES.find(m => m.key === selectedModule)?.label.toUpperCase()} RECORDS
 <div className="icon-nest !w-10 !h-10 ml-4">
 <CheckCircle2 size={22} />
 </div>
 </button>
 </>
 ) : (
 <>
 {/* File Upload */}
 <div
 className="bg-canvas p-4 rounded-lg border-2 border-dashed border-black/10 hover:border-accent-signature/40 transition-all cursor-pointer flex flex-col items-center justify-center gap-3 min-h-[120px] group"
 onClick={() => importRef.current?.click()}
 >
 <input
 ref={importRef}
 type="file"
 accept=".csv,.json"
 className="hidden"
 onChange={handleFileSelect}
 />
 <div className="w-14 h-14 rounded-lg bg-surface border border-black/5 flex items-center justify-center text-ink-primary/20 group-hover:text-accent-signature/60 transition-colors">
 <Upload size={28} />
 </div>
 <span className="text-[10px] font-semibold text-ink-primary/30 group-hover:text-ink-primary/60 transition-colors">
 {importFileName || 'Click to select CSV or JSON file'}
 </span>
 <span className="text-[8px] font-bold text-gray-700/20">Accepts .csv and .json files</span>
 <span className="text-[8px] font-bold text-gray-700/30 text-center px-4">
   Required: {MODULES.find(m => m.key === selectedModule)?.requiredFields.join(', ')}
 </span>
 </div>

 {/* Preview */}
 {importPreview.length > 0 && (
 <div className="space-y-3">
 <div className="flex items-center gap-3">
 <Eye size={14} className="text-accent-signature" />
 <span className="text-[10px] font-semibold text-ink-primary">
 Preview ({importData?.length} total records)
 </span>
 </div>
 <div className="overflow-x-auto rounded-xl border border-black/5">
 <table className="w-full text-left border-collapse min-w-[600px]">
 <thead>
 <tr className="bg-canvas">
 {Object.keys(importPreview[0]).slice(0, 6).map(key => (
 <th key={key} className="px-3 py-2 text-[8px] font-semibold text-gray-700 opacity-70 border-b border-black/5">{key}</th>
 ))}
 </tr>
 </thead>
 <tbody>
 {importPreview.map((row, i) => (
 <tr key={i} className="border-b border-black/5 last:border-none">
 {Object.values(row).slice(0, 6).map((val, j) => (
 <td key={j} className="px-3 py-2 text-[10px] font-bold text-ink-primary truncate max-w-[150px]">
 {Array.isArray(val) ? val.join(', ') : String(val ?? '')}
 </td>
 ))}
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 )}

 {/* Import Result */}
 {importResult && (
 <div className={`p-4 rounded-lg border flex items-center gap-3 ${
 importResult.success 
 ? 'bg-accent-signature/10 border-accent-signature/20 text-ink-primary' 
 : 'bg-red-50 border-red-200 text-red-700'
}`}>
 {importResult.success ? <CheckCircle2 size={18} className="text-accent-signature shrink-0" /> : <AlertCircle size={18} className="text-red-500 shrink-0" />}
 <span className="text-[10px] font-semibold">{importResult.message}</span>
 </div>
 )}

 {/* Import Button */}
 {importData && importData.length > 0 && !importResult?.success && (
 <button
 className="btn-signature w-full !h-16 !rounded-lg !text-sm"
 onClick={handleImport}
 disabled={importing}
 >
 {importing ? (
 <>
 <Upload size={20} className="mr-3 animate-pulse" />
 IMPORTING...
 </>
 ) : (
 <>
 <Upload size={20} className="mr-3" />
 IMPORT {importData.length} RECORDS INTO {MODULES.find(m => m.key === selectedModule)?.label.toUpperCase()}
 <div className="icon-nest !w-10 !h-10 ml-4">
 <CheckCircle2 size={22} />
 </div>
 </>
 )}
 </button>
 )}
 </>
 )}
 </div>
 </div>
 </div>
 </div>
 </div>,
 document.body
 );
};

export default DataTools;
