import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useTenant } from '../context/TenantContext';
import { supabase } from '../lib/supabase';
import {
  Upload, Download, CheckCircle2, XCircle, AlertCircle,
  Users, Package, Loader2, FileSpreadsheet, ChevronRight,
} from 'lucide-react';

// ─── Column definitions ───────────────────────────────────────────────────────

const CLIENT_COLS = [
  { key: 'name',        label: 'Name',        required: true,  type: 'string' },
  { key: 'phone',       label: 'Phone',       required: false, type: 'string' },
  { key: 'email',       label: 'Email',       required: false, type: 'string' },
  { key: 'address',     label: 'Address',     required: false, type: 'string' },
  { key: 'gstin',       label: 'GSTIN',       required: false, type: 'string' },
  { key: 'state',       label: 'State',       required: false, type: 'string' },
  { key: 'state_code',  label: 'State Code',  required: false, type: 'string' },
  { key: 'client_type', label: 'Client Type', required: false, type: 'string', note: 'B2B or B2C' },
  { key: 'credit_days', label: 'Credit Days', required: false, type: 'number' },
];

const PRODUCT_COLS = [
  { key: 'name',         label: 'Name',          required: true,  type: 'string' },
  { key: 'category',     label: 'Category',      required: false, type: 'string' },
  { key: 'sellingPrice', label: 'Selling Price',  required: true,  type: 'number' },
  { key: 'costPrice',    label: 'Cost Price',     required: false, type: 'number' },
  { key: 'stock',        label: 'Opening Stock',  required: false, type: 'number' },
  { key: 'taxRate',      label: 'GST Rate (%)',   required: false, type: 'number', note: '0,5,12,18,28' },
  { key: 'unit',         label: 'Unit',           required: false, type: 'string', note: 'e.g. pcs, kg, box' },
  { key: 'hsn',          label: 'HSN Code',       required: false, type: 'string' },
  { key: 'mrp',          label: 'MRP',            required: false, type: 'number' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const generateId = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 10; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
};

const buildTemplate = (cols, sheetName) => {
  const headers = cols.map(c => c.label);
  const example = cols.map(c => {
    if (c.key === 'name') return sheetName === 'Clients' ? 'ABC Traders' : 'Premium Rice';
    if (c.key === 'phone') return '9876543210';
    if (c.key === 'email') return 'info@example.com';
    if (c.key === 'address') return '123 MG Road, Chennai';
    if (c.key === 'gstin') return '33AABCU9603R1ZX';
    if (c.key === 'state') return 'Tamil Nadu';
    if (c.key === 'state_code') return '33';
    if (c.key === 'client_type') return 'B2B';
    if (c.key === 'credit_days') return 30;
    if (c.key === 'category') return 'Grains';
    if (c.key === 'sellingPrice') return 120;
    if (c.key === 'costPrice') return 95;
    if (c.key === 'stock') return 500;
    if (c.key === 'taxRate') return 5;
    if (c.key === 'unit') return 'kg';
    if (c.key === 'hsn') return '1006';
    if (c.key === 'mrp') return 140;
    return '';
  });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  // column widths
  ws['!cols'] = cols.map(c => ({ wch: Math.max(c.label.length + 4, 16) }));
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${sheetName}_Import_Template.xlsx`);
};

const parseSheet = (file, cols) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { defval: '' });

        // ── Header validation ──────────────────────────────────────────
        const requiredLabels = cols.filter(c => c.required).map(c => c.label.toLowerCase());
        const fileHeaders = raw.length > 0
          ? Object.keys(raw[0]).map(k => k.trim().toLowerCase())
          : [];
        const missing = requiredLabels.filter(l => !fileHeaders.includes(l));
        if (missing.length > 0) {
          reject(new Error(`HEADER_MISMATCH:${missing.map(m => `"${m}"`).join(', ')}`));
          return;
        }

        // normalise keys: match by label (case-insensitive)
        const labelToKey = {};
        cols.forEach(c => { labelToKey[c.label.toLowerCase()] = c.key; });
        const rows = raw.map(r => {
          const out = {};
          Object.entries(r).forEach(([k, v]) => {
            const mapped = labelToKey[k.trim().toLowerCase()];
            if (mapped) out[mapped] = v;
          });
          return out;
        });
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });

const validate = (rows, cols) =>
  rows.map((row, i) => {
    const errors = [];
    cols.forEach(c => {
      if (c.required && !String(row[c.key] ?? '').trim()) {
        errors.push(`"${c.label}" required`);
      }
      if (c.type === 'number' && row[c.key] !== '' && row[c.key] !== undefined) {
        if (isNaN(Number(row[c.key]))) errors.push(`"${c.label}" must be number`);
      }
    });
    return { row, errors, index: i + 2 }; // +2 for header row
  });

// ─── Sub-components ───────────────────────────────────────────────────────────

const StatusBadge = ({ count, label, color }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
    {count} {label}
  </span>
);

const PreviewTable = ({ validated, cols }) => {
  const show = validated.slice(0, 10);
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-gray-50">
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 w-8">#</th>
            {cols.map(c => (
              <th key={c.key} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">
                {c.label}{c.required ? ' *' : ''}
              </th>
            ))}
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {show.map(({ row, errors, index }) => (
            <tr key={index} className={errors.length ? 'bg-red-50' : 'bg-white'}>
              <td className="px-3 py-2 text-gray-400 text-xs">{index}</td>
              {cols.map(c => (
                <td key={c.key} className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-[140px] truncate">
                  {String(row[c.key] ?? '')}
                </td>
              ))}
              <td className="px-3 py-2">
                {errors.length
                  ? <span className="text-red-600 text-xs">{errors.join(', ')}</span>
                  : <CheckCircle2 size={14} className="text-emerald-500" />
                }
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {validated.length > 10 && (
        <div className="px-4 py-2 text-xs text-gray-400 bg-gray-50 border-t border-gray-100">
          Showing 10 of {validated.length} rows
        </div>
      )}
    </div>
  );
};

// ─── Import panel (shared for both tabs) ─────────────────────────────────────

const ImportPanel = ({ type, cols, tenantId, onDone }) => {
  const fileRef = useRef();
  const [validated, setValidated] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | previewing | importing | done | error
  const [result, setResult] = useState({ inserted: 0, failed: 0 });
  const [errorMsg, setErrorMsg] = useState('');

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const rows = await parseSheet(file, cols);
      if (!rows.length) { setErrorMsg('File is empty.'); setStatus('error'); return; }
      setValidated(validate(rows, cols));
      setStatus('previewing');
    } catch (err) {
      if (err.message?.startsWith('HEADER_MISMATCH:')) {
        const missing = err.message.replace('HEADER_MISMATCH:', '');
        setErrorMsg(`Wrong template. Missing required columns: ${missing}. Download the correct template and try again.`);
      } else {
        setErrorMsg('Could not parse file. Make sure it is .xlsx or .xls');
      }
      setStatus('error');
    }
  };

  const validRows = validated?.filter(v => !v.errors.length) ?? [];
  const invalidCount = (validated?.length ?? 0) - validRows.length;

  const handleImport = async () => {
    if (!validRows.length) return;
    setStatus('importing');
    let inserted = 0, failed = 0;

    for (const { row } of validRows) {
      const id = generateId();
      let payload;

      if (type === 'clients') {
        payload = {
          id,
          tenant_id: tenantId,
          name: String(row.name || '').trim(),
          phone: String(row.phone || '').trim() || null,
          email: String(row.email || '').trim() || null,
          address: String(row.address || '').trim() || null,
          gstin: String(row.gstin || '').trim() || null,
          state: String(row.state || '').trim() || null,
          state_code: String(row.state_code || '').trim() || null,
          client_type: ['B2B', 'B2C'].includes(String(row.client_type || '').toUpperCase())
            ? String(row.client_type).toUpperCase()
            : 'B2C',
          credit_days: Number(row.credit_days) || 0,
        };
        const { error } = await supabase.from('clients').insert(payload);
        error ? failed++ : inserted++;
      } else {
        payload = {
          id,
          tenant_id: tenantId,
          name: String(row.name || '').trim(),
          category: String(row.category || '').trim() || null,
          sellingPrice: Number(row.sellingPrice) || 0,
          costPrice: Number(row.costPrice) || 0,
          stock: Number(row.stock) || 0,
          taxRate: Number(row.taxRate) || 0,
          unit: String(row.unit || '').trim() || null,
          hsn_code: String(row.hsn || '').trim() || null,
        };
        const { error } = await supabase.from('products').insert(payload);
        if (error) { console.error('Product import error:', error.message, payload); failed++; }
        else inserted++;
      }
    }

    setResult({ inserted, failed });
    setStatus('done');
    if (inserted > 0) onDone?.();
  };

  const reset = () => {
    setValidated(null);
    setStatus('idle');
    setErrorMsg('');
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="space-y-6">
      {/* Template download */}
      <div className="flex items-center justify-between p-4 bg-blue-50 rounded-xl border border-blue-100">
        <div>
          <p className="text-sm font-semibold text-blue-900">Download Template</p>
          <p className="text-xs text-blue-600 mt-0.5">Use this template to prepare your data</p>
        </div>
        <button
          onClick={() => buildTemplate(cols, type === 'clients' ? 'Clients' : 'Products')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Download size={15} />
          Template.xlsx
        </button>
      </div>

      {/* Column guide */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Expected Columns</p>
        <div className="flex flex-wrap gap-2">
          {cols.map(c => (
            <span
              key={c.key}
              className={`px-2 py-1 rounded-md text-xs font-medium border ${
                c.required
                  ? 'bg-red-50 border-red-200 text-red-700'
                  : 'bg-gray-50 border-gray-200 text-gray-600'
              }`}
            >
              {c.label}{c.required ? ' *' : ''}{c.note ? ` (${c.note})` : ''}
            </span>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">* Required fields</p>
      </div>

      {/* Upload zone */}
      {status === 'idle' || status === 'error' ? (
        <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer bg-gray-50 hover:bg-gray-100 hover:border-gray-300 transition-all">
          <Upload size={28} className="text-gray-400 mb-2" />
          <p className="text-sm font-semibold text-gray-600">Click to upload .xlsx file</p>
          <p className="text-xs text-gray-400 mt-1">Excel files only (.xlsx, .xls)</p>
          {status === 'error' && (
            <p className="text-xs text-red-600 mt-2 font-medium">{errorMsg}</p>
          )}
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
        </label>
      ) : null}

      {/* Preview */}
      {(status === 'previewing' || status === 'importing') && validated && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSpreadsheet size={16} className="text-gray-400" />
              <span className="text-sm font-semibold text-gray-700">{validated.length} rows detected</span>
              <StatusBadge count={validRows.length} label="valid" color="bg-emerald-100 text-emerald-700" />
              {invalidCount > 0 && (
                <StatusBadge count={invalidCount} label="errors" color="bg-red-100 text-red-700" />
              )}
            </div>
            <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-600 underline">
              Change file
            </button>
          </div>

          <PreviewTable validated={validated} cols={cols} />

          {invalidCount > 0 && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-lg">
              <AlertCircle size={15} className="text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700">
                {invalidCount} rows have errors and will be skipped. Fix your file and re-upload, or proceed to import only the {validRows.length} valid rows.
              </p>
            </div>
          )}

          <button
            onClick={handleImport}
            disabled={status === 'importing' || !validRows.length}
            className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {status === 'importing'
              ? <><Loader2 size={16} className="animate-spin" /> Importing…</>
              : <><Upload size={16} /> Import {validRows.length} {type === 'clients' ? 'Clients' : 'Products'}</>
            }
          </button>
        </div>
      )}

      {/* Result */}
      {status === 'done' && (
        <div className="space-y-4">
          <div className="p-5 bg-emerald-50 border border-emerald-100 rounded-xl">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 size={20} className="text-emerald-600" />
              <p className="text-sm font-bold text-emerald-800">Import Complete</p>
            </div>
            <div className="flex gap-6">
              <div>
                <p className="text-2xl font-black text-emerald-700">{result.inserted}</p>
                <p className="text-xs text-emerald-600">Successfully imported</p>
              </div>
              {result.failed > 0 && (
                <div>
                  <p className="text-2xl font-black text-red-600">{result.failed}</p>
                  <p className="text-xs text-red-500">Failed (duplicate or DB error)</p>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={reset}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-sm font-semibold text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Import Another File
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ImportData({ modal = false }) {
  const { currentTenantId } = useTenant();
  const [tab, setTab] = useState('clients');

  const tabs = [
    { key: 'clients',  label: 'Clients',  icon: <Users size={16} />,   cols: CLIENT_COLS  },
    { key: 'products', label: 'Products', icon: <Package size={16} />, cols: PRODUCT_COLS },
  ];

  return (
    <div className={modal ? 'space-y-6' : 'max-w-3xl mx-auto px-4 py-8 space-y-6'}>
      {/* Header — hide when embedded in modal (modal has its own header) */}
      {!modal && (
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Import Data</h1>
          <p className="text-sm text-gray-500 mt-1">
            Bulk upload clients and products via Excel. Data is isolated to your account.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 p-1 bg-gray-100 rounded-xl w-fit">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === t.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Panel */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        {tabs.map(t =>
          tab === t.key ? (
            <ImportPanel
              key={t.key}
              type={t.key}
              cols={t.cols}
              tenantId={currentTenantId}
              onDone={() => {}}
            />
          ) : null
        )}
      </div>
    </div>
  );
}
