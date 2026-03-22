import React, { useState, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { 
    Download, Upload, FileSpreadsheet, FileJson, 
    X, CheckCircle2, AlertCircle, ChevronDown, Eye
} from 'lucide-react';

const MODULES = [
    { key: 'products', label: 'Products', fields: ['id','sku','name','category','unit','costPrice','sellingPrice','stock','taxRate','tags','image'] },
    { key: 'shops', label: 'Clients / Shops', fields: ['id','name','contact','phone','address'] },
    { key: 'orders', label: 'Orders', fields: ['id','shopId','date','totalAmount','totalCogs','paymentMethod','paymentStatus','status'] },
    { key: 'expenses', label: 'Expenses', fields: ['id','category','amount','note','date'] },
    { key: 'employees', label: 'Employees', fields: ['id','name','role','status','salary'] },
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
                try { val = JSON.parse(val); } catch (e) { /* keep as string */ }
            }
            record[h] = val;
        });
        records.push(record);
    }
    return records;
};

const DataTools = ({ isOpen, onClose }) => {
    const { 
        products, shops, orders, expenses, employees,
        addProduct, updateProduct, addShop, updateShop,
        addExpense, addEmployee, updateEmployee,
        addNotification
    } = useAppContext();

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

        const blob = new Blob([content], { type: mimeType });
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
                    setImportResult({ success: false, message: 'Invalid JSON file' });
                    return;
                }
            } else {
                records = parseCSV(text);
            }

            if (records.length === 0) {
                setImportResult({ success: false, message: 'No records found in file' });
                return;
            }

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
            setImportResult({ success: false, message: `Import failed: ${err.message}` });
        } finally {
            setImporting(false);
        }
    };

    const currentModuleData = getModuleData(selectedModule);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="glass-modal !max-w-[650px] !p-0 !rounded-bento overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="bg-ink-primary p-5 flex justify-between items-start">
                    <div>
                        <h1 className="text-3xl font-black text-surface tracking-tighter uppercase leading-none mb-1">DATA TOOLS.</h1>
                        <p className="text-[10px] font-black text-accent-signature uppercase tracking-[0.3em] opacity-70">IMPORT & EXPORT YOUR BUSINESS DATA</p>
                    </div>
                    <button 
                        onClick={onClose}
                        className="w-10 h-10 rounded-pill border border-surface/20 flex items-center justify-center hover:bg-surface/10 transition-all cursor-pointer text-surface"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-black/5">
                    <button 
                        className={`flex-1 py-4 text-[10px] font-black uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-3 ${activeTab === 'export' ? 'bg-accent-signature/10 text-ink-primary border-b-2 border-accent-signature' : 'text-ink-secondary hover:bg-canvas'}`}
                        onClick={() => { setActiveTab('export'); setImportData(null); setImportResult(null); }}
                    >
                        <Download size={16} /> Export Data
                    </button>
                    <button 
                        className={`flex-1 py-4 text-[10px] font-black uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-3 ${activeTab === 'import' ? 'bg-accent-signature/10 text-ink-primary border-b-2 border-accent-signature' : 'text-ink-secondary hover:bg-canvas'}`}
                        onClick={() => { setActiveTab('import'); setImportData(null); setImportResult(null); }}
                    >
                        <Upload size={16} /> Import Data
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
                    {/* Module Selector */}
                    <div>
                        <label className="text-[10px] font-black text-ink-secondary uppercase tracking-widest mb-2 block opacity-70">Select Data Module</label>
                        <div className="grid grid-cols-5 gap-2">
                            {MODULES.map(mod => (
                                <button
                                    key={mod.key}
                                    className={`py-3 px-4 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${
                                        selectedModule === mod.key
                                            ? 'bg-ink-primary text-accent-signature border-ink-primary shadow-lg'
                                            : 'bg-canvas text-ink-primary border-black/5 hover:border-accent-signature/30'
                                    }`}
                                    onClick={() => { setSelectedModule(mod.key); setImportData(null); setImportResult(null); }}
                                >
                                    {mod.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {activeTab === 'export' ? (
                        <>
                            {/* Export Stats */}
                            <div className="flex items-center gap-6 p-4 bg-canvas rounded-2xl border border-black/5">
                                <div className="flex-1">
                                    <div className="text-[9px] font-black uppercase tracking-widest text-ink-secondary opacity-70 mb-1">Records Available</div>
                                    <div className="text-3xl font-black text-ink-primary tracking-tighter">{currentModuleData.length}</div>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        className={`px-5 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all flex items-center gap-2 ${
                                            exportFormat === 'csv' 
                                                ? 'bg-ink-primary text-accent-signature border-ink-primary' 
                                                : 'bg-surface text-ink-primary border-black/10 hover:border-accent-signature/30'
                                        }`}
                                        onClick={() => setExportFormat('csv')}
                                    >
                                        <FileSpreadsheet size={14} /> CSV
                                    </button>
                                    <button
                                        className={`px-5 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all flex items-center gap-2 ${
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
                                className="btn-signature w-full !h-16 !rounded-2xl !text-sm"
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
                                className="bg-canvas p-4 rounded-2xl border-2 border-dashed border-black/10 hover:border-accent-signature/40 transition-all cursor-pointer flex flex-col items-center justify-center gap-3 min-h-[120px] group"
                                onClick={() => importRef.current?.click()}
                            >
                                <input
                                    ref={importRef}
                                    type="file"
                                    accept=".csv,.json"
                                    className="hidden"
                                    onChange={handleFileSelect}
                                />
                                <div className="w-14 h-14 rounded-2xl bg-surface border border-black/5 flex items-center justify-center text-ink-primary/20 group-hover:text-accent-signature/60 transition-colors">
                                    <Upload size={28} />
                                </div>
                                <span className="text-[10px] font-black text-ink-primary/30 uppercase tracking-widest group-hover:text-ink-primary/60 transition-colors">
                                    {importFileName || 'Click to select CSV or JSON file'}
                                </span>
                                <span className="text-[8px] font-bold text-ink-secondary/20 uppercase tracking-widest">Accepts .csv and .json files</span>
                            </div>

                            {/* Preview */}
                            {importPreview.length > 0 && (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-3">
                                        <Eye size={14} className="text-accent-signature" />
                                        <span className="text-[10px] font-black text-ink-primary uppercase tracking-widest">
                                            Preview ({importData?.length} total records)
                                        </span>
                                    </div>
                                    <div className="overflow-x-auto rounded-xl border border-black/5">
                                        <table className="w-full text-left border-collapse min-w-[600px]">
                                            <thead>
                                                <tr className="bg-canvas">
                                                    {Object.keys(importPreview[0]).slice(0, 6).map(key => (
                                                        <th key={key} className="px-3 py-2 text-[8px] font-black uppercase tracking-widest text-ink-secondary opacity-70 border-b border-black/5">{key}</th>
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
                                <div className={`p-4 rounded-2xl border flex items-center gap-3 ${
                                    importResult.success 
                                        ? 'bg-accent-signature/10 border-accent-signature/20 text-ink-primary' 
                                        : 'bg-red-50 border-red-200 text-red-700'
                                }`}>
                                    {importResult.success ? <CheckCircle2 size={18} className="text-accent-signature shrink-0" /> : <AlertCircle size={18} className="text-red-500 shrink-0" />}
                                    <span className="text-[10px] font-black uppercase tracking-widest">{importResult.message}</span>
                                </div>
                            )}

                            {/* Import Button */}
                            {importData && importData.length > 0 && !importResult?.success && (
                                <button
                                    className="btn-signature w-full !h-16 !rounded-2xl !text-sm"
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
    );
};

export default DataTools;
