import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { useTenant } from '../context/TenantContext';
import { restInsert, restRpc } from '../lib/supabase';
import { normalizeHsn } from '../lib/hsn';
import { resolveHeaders, ITEM_COLUMNS, PARTY_COLUMNS, SUPPLIER_COLUMNS } from '../lib/importSheet';
import { isTransportFailure } from '../lib/writeOutcome';
import { applyMapping, defaultMapping, mappingProblems } from '../lib/importMapping';
import { Button } from '../components/ui/button';
import { FilterPills } from '../components/ui/Tabs';
import { Note, Eyebrow, IconTile, ProgressBar, downloadCsv } from '../components/tools/parts';
import { cn } from '../lib/utils';
import {
  Upload, Download, Check, FileSpreadsheet, ArrowRight, ChevronDown, AlertTriangle, CheckCircle2,
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

const SUPPLIER_COLS = [
  { key: 'name',           label: 'Name',           required: true,  type: 'string' },
  { key: 'contact_person', label: 'Contact Person',  required: false, type: 'string' },
  { key: 'phone',          label: 'Phone',           required: false, type: 'string' },
  { key: 'email',          label: 'Email',           required: false, type: 'string' },
  { key: 'address',        label: 'Address',         required: false, type: 'string' },
  { key: 'notes',          label: 'Notes',           required: false, type: 'string' },
];

const PRODUCT_COLS = [
  { key: 'name',         label: 'Name',          required: true,  type: 'string' },
  { key: 'category',     label: 'Category',      required: false, type: 'string' },
  { key: 'sellingPrice', label: 'Selling Price',  required: true,  type: 'number', mustBePositive: true },
  { key: 'costPrice',    label: 'Cost Price',     required: true,  type: 'number', mustBePositive: true },
  { key: 'stock',        label: 'Opening Stock',  required: false, type: 'number' },
  { key: 'taxRate',      label: 'GST Rate (%)',   required: false, type: 'number', note: '0, 5, 12, 18, 28' },
  { key: 'unit',         label: 'Unit',           required: false, type: 'string', note: 'pcs, kg, box' },
  { key: 'hsn',          label: 'HSN Code',       required: false, type: 'string' },
  { key: 'barcode',      label: 'Barcode',        required: false, type: 'string' },
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
    if (c.key === 'name') return sheetName === 'Clients' ? 'ABC Traders' : sheetName === 'Suppliers' ? 'Global Supplies Co.' : 'Premium Rice';
    if (c.key === 'contact_person') return 'Ravi Kumar';
    if (c.key === 'phone') return '9876543210';
    if (c.key === 'email') return 'info@example.com';
    if (c.key === 'address') return '123 MG Road, Chennai';
    if (c.key === 'notes') return 'Preferred vendor for grains';
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
    if (c.key === 'barcode') return '8901234567890';
    return '';
  });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  // column widths
  ws['!cols'] = cols.map(c => ({ wch: Math.max(c.label.length + 4, 16) }));
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${sheetName}_Import_Template.xlsx`);
};

// Reads the first sheet. Header matching is the same as before (resolveHeaders
// knows other billing apps' spellings and still prefers our own labels); the
// matches now come back to the screen so they can be checked and changed
// before anything is read, instead of being applied silently.
const readSheet = (file, cols, kind) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { defval: '' });

        const aliasTable = kind === 'products' ? ITEM_COLUMNS
          : kind === 'suppliers' ? SUPPLIER_COLUMNS : PARTY_COLUMNS;
        const fileHeaders = raw.length > 0 ? Object.keys(raw[0]) : [];
        const { headerToKey, missingRequired } = resolveHeaders(fileHeaders, aliasTable, cols);

        if (missingRequired.length > 0) {
          reject(new Error(`HEADER_MISMATCH:${missingRequired.map(m => `"${m}"`).join(', ')}`));
          return;
        }
        resolve({ raw, headers: fileHeaders, mapping: defaultMapping(fileHeaders, headerToKey, cols) });
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
        errors.push(`"${c.label}" is empty`);
      }
      if (c.type === 'number' && row[c.key] !== '' && row[c.key] !== undefined) {
        if (isNaN(Number(row[c.key]))) errors.push(`"${c.label}" must be a number`);
        else if (c.mustBePositive && !(Number(row[c.key]) > 0)) errors.push(`"${c.label}" must be more than 0`);
      }
    });
    return { row, errors, index: i + 2 }; // +2 for header row
  });

const NOUN = { clients: 'clients', suppliers: 'suppliers', products: 'products' };
const SHEET = { clients: 'Clients', suppliers: 'Suppliers', products: 'Products' };
const OPEN_LIST = { clients: ['/clients', 'Open Clients'], suppliers: ['/suppliers', 'Open Suppliers'], products: ['/inventory', 'Open Inventory'] };
const count = (n, noun) => `${n} ${n === 1 ? noun.replace(/s$/, '') : noun}`;

// ─── Sub-components ───────────────────────────────────────────────────────────

const PreviewTable = ({ validated, cols }) => {
  const [only, setOnly] = useState('all');
  const errs = validated.filter(v => v.errors.length);
  const list = only === 'errors' ? errs : validated;
  const show = list.slice(0, 10);
  const hiddenErrs = errs.filter(e => !show.includes(e));
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <FilterPills ariaLabel="Rows to show" value={only} onChange={setOnly}
          items={[{ key: 'all', label: 'All', count: validated.length }, { key: 'errors', label: 'Only errors', count: errs.length }]} />
        <span className="flex-1" />
        <span className="text-[12px] text-mute">Row numbers match your Excel sheet</span>
      </div>
      <div className="overflow-x-auto rounded-[14px] border border-line bg-surface">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="bg-tile">
              <th className="px-3 py-[9px] text-left font-tight text-[11.5px] font-semibold text-ink-2">Row</th>
              {cols.map(c => (
                <th key={c.key} className={cn('whitespace-nowrap px-3 py-[9px] font-tight text-[11.5px] font-semibold text-ink-2', c.type === 'number' ? 'text-right' : 'text-left')}>
                  {c.label}{c.required ? ' *' : ''}
                </th>
              ))}
              <th className="px-3 py-[9px] text-left font-tight text-[11.5px] font-semibold text-ink-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {show.map(({ row, errors, index }) => (
              <tr key={index} className={cn('border-t border-sep', errors.length && 'bg-[#FFF8F8]')}>
                <td className="px-3 py-[9px] font-tight text-[12px] font-medium text-mute">{index}</td>
                {cols.map(c => (
                  <td key={c.key} className={cn('max-w-[160px] truncate whitespace-nowrap px-3 py-[9px] text-[13px] text-ink', c.type === 'number' && 'text-right tabular-nums')}>
                    {String(row[c.key] ?? '')}
                  </td>
                ))}
                <td className="px-3 py-[9px]">
                  {errors.length
                    ? <span className="text-[12.5px] text-bad-text">{errors.join(', ')}</span>
                    : <Check size={15} strokeWidth={2.4} className="text-good" aria-label="Ready" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length > 10 && (
          <div className="border-t border-line bg-tile px-3.5 py-[9px] text-[12px] text-mute">
            Showing 10 of {list.length} rows
            {hiddenErrs.length > 0 && ` · more errors on row${hiddenErrs.length === 1 ? '' : 's'} ${hiddenErrs.slice(0, 5).map(e => e.index).join(', ')}${hiddenErrs.length > 5 ? '…' : ''}`}
          </div>
        )}
      </div>
    </>
  );
};

const FileCard = ({ name, detail, onChange }) => (
  <div className="mb-3.5 flex items-center gap-3 rounded-xl px-3.5 py-3 shadow-[inset_0_0_0_1px_var(--color-line)]">
    <IconTile icon={FileSpreadsheet} />
    <div className="min-w-0 flex-1">
      <b className="block truncate font-tight text-[13.5px] font-semibold text-ink">{name}</b>
      <small className="text-[12px] text-mute">{detail}</small>
    </div>
    {onChange && <button type="button" onClick={onChange} className="font-tight text-[13px] font-semibold text-amber-text hover:underline">Change file</button>}
  </div>
);

// ─── Import panel (shared for both tabs) ─────────────────────────────────────

const ImportPanel = ({ type, cols, tenantId, onDone }) => {
  const navigate = useNavigate();
  const fileRef = useRef();
  const [sheet, setSheet] = useState(null);         // { name, raw, headers, mapping }
  const [validated, setValidated] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | mapping | previewing | importing | done | error
  const [result, setResult] = useState({ inserted: 0, failed: 0 });
  const [errorMsg, setErrorMsg] = useState('');
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const importingRef = useRef(false);

  const handleFile = async (file) => {
    if (!file) return;
    try {
      const read = await readSheet(file, cols, type);
      if (!read.raw.length) { setErrorMsg('File is empty.'); setStatus('error'); return; }
      setSheet({ name: file.name, ...read });
      setStatus('mapping');
    } catch (err) {
      if (err.message?.startsWith('HEADER_MISMATCH:')) {
        const missing = err.message.replace('HEADER_MISMATCH:', '');
        setErrorMsg(`This file is missing columns we need: ${missing}. Download the template and try again.`);
      } else {
        setErrorMsg('Could not read this file. Use .xlsx or .xls.');
      }
      setStatus('error');
    }
  };

  const setMap = (header, key) => setSheet(s => {
    const mapping = { ...s.mapping };
    // One file column per field: taking a field frees it from any other column.
    if (key) for (const h of Object.keys(mapping)) if (mapping[h] === key) mapping[h] = '';
    mapping[header] = key;
    return { ...s, mapping };
  });

  const checkRows = () => {
    setValidated(validate(applyMapping(sheet.raw, sheet.mapping), cols));
    setStatus('previewing');
  };

  const validRows = validated?.filter(v => !v.errors.length) ?? [];
  const invalidCount = (validated?.length ?? 0) - validRows.length;

  const handleImport = async () => {
    if (!validRows.length || importingRef.current) return;
    importingRef.current = true;
    setStatus('importing');
    setProgress(0);
    let inserted = 0, failed = 0;
    // HSN values dropped for not being a legal code — reported, never silent.
    const badHsn = [];
    // Products that imported but whose opening quantity did not land.
    const badStock = [];
    // Per sheet row, for the result screen: which did not import and why, and
    // which imported with a note. The writes below are unchanged.
    const notImported = [];
    const notes = [];
    let done = 0;

    try {
      for (const { row, index } of validRows) {
        const id = generateId();
        let payload;
        const rowName = String(row.name || '').trim();
        const miss = (error) => notImported.push({ index, name: rowName, row, reason: String(error?.message || error || '').trim(), unsure: isTransportFailure(error) });

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
          const { error } = await restInsert('clients', payload);
          if (error) { failed++; miss(error); } else inserted++;
        } else if (type === 'suppliers') {
          payload = {
            id,
            tenant_id: tenantId,
            name: String(row.name || '').trim(),
            contact_person: String(row.contact_person || '').trim() || null,
            phone: String(row.phone || '').trim() || null,
            email: String(row.email || '').trim() || null,
            address: String(row.address || '').trim() || null,
            notes: String(row.notes || '').trim() || '',
            created_at: new Date().toISOString(),
          };
          const { error } = await restInsert('suppliers', payload);
          if (error) { console.error('Supplier import error:', error.message, payload); failed++; miss(error); }
          else inserted++;
        } else {
          payload = {
            id,
            tenant_id: tenantId,
            name: String(row.name || '').trim(),
            category: String(row.category || '').trim() || null,
            sellingPrice: Number(row.sellingPrice) || 0,
            costPrice: Number(row.costPrice) || 0,
            // NOT stock. products.stock is a derived mirror of
            // inventory_balances maintained by trg_sync_product_stock
            // (20260730_products_stock_single_writer.sql). Writing it here set a
            // number no location actually held: the opening quantity showed on
            // the item and in no warehouse, and the next movement recomputed it
            // from the balances and wiped it. The opening stock is applied below
            // through adjust_inventory_atomic, which is how the stock screen
            // does it and the only writer the trigger agrees with.
            taxRate: Number(row.taxRate) || 0,
            unit: String(row.unit || '').trim() || null,
            // Only a real 4/6/8-digit code. A SKU in the HSN column used to be
            // written through verbatim and then printed on invoices and filed in
            // the GSTR-1 HSN summary.
            hsn_code: (() => {
              const h = normalizeHsn(row.hsn);
              if (h.status === 'invalid') {
                badHsn.push(`${String(row.name || '').trim()} (${h.raw})`);
                notes.push({ index, name: rowName, why: `HSN ${h.raw} is not valid (4, 6 or 8 digits), left blank` });
              }
              return h.code;
            })(),
            barcode: String(row.barcode || '').trim() || null,
          };
          const { error } = await restInsert('products', payload);
          if (error) { console.error('Product import error:', error.message, payload); failed++; miss(error); }
          else {
            inserted++;
            const opening = Number(row.stock) || 0;
            if (opening > 0) {
              const { error: stockErr } = await restRpc('adjust_inventory_atomic', {
                p_product_id: id,
                p_location_id: null,
                p_amount: opening,
                p_reason: 'Opening stock (import)',
                p_user_id: null,
                p_tenant_id: tenantId,
                p_consume_batches: true,
                // A cost on the opening quantity creates a real FIFO batch, so
                // the first sale of an imported item has a COGS instead of
                // falling back to costPrice.
                p_unit_cost: Number(payload.costPrice) > 0 ? Number(payload.costPrice) : null,
              });
              // Never silent: the product exists but holds no stock, and only
              // saying so lets anyone put that right.
              if (stockErr) {
                console.error('Opening stock failed:', stockErr.message, payload.name);
                badStock.push(`${payload.name} (${opening})`);
                notes.push({
                  index, name: rowName,
                  why: isTransportFailure(stockErr)
                    ? `Could not confirm its opening stock of ${opening} (connection dropped). Check the stock in Inventory before setting it`
                    : `Imported without its opening stock of ${opening}. Set it in Inventory (${stockErr.message || 'no reason given'})`,
                });
              }
            }
          }
        }
        done++;
        setProgress(done);
      }
    } finally {
      importingRef.current = false;
    }

    setResult({ inserted, failed, badHsn, badStock, notImported, notes });
    setStatus('done');
    if (inserted > 0) onDone?.();
  };

  const reset = () => {
    setValidated(null);
    setSheet(null);
    setStatus('idle');
    setErrorMsg('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const noun = NOUN[type];
  const downloadNotImported = () => {
    downloadCsv(`import_${type}_not_imported.csv`, ['Row', ...cols.map(c => c.label), 'Reason'],
      (result.notImported || []).map(n => [n.index, ...cols.map(c => n.row[c.key]), n.unsure ? `Not sure, may have imported: ${n.reason}` : n.reason]));
  };

  const mapped = sheet ? Object.values(sheet.mapping).filter(Boolean).length : 0;
  const problems = sheet ? mappingProblems(sheet.mapping, cols) : [];
  const firstRow = sheet?.raw[0] || {};
  const field = 'h-[34px] w-full appearance-none rounded-[10px] bg-surface pl-3 pr-8 text-[13px] shadow-[inset_0_0_0_1px_var(--color-line)] outline-none focus:shadow-[inset_0_0_0_2px_var(--color-ink)]';

  return (
    <div>
      {/* Template + columns + upload */}
      {(status === 'idle' || status === 'error') && (
        <>
          <div className="flex flex-wrap items-center gap-3.5 rounded-xl bg-tile px-4 py-3.5">
            <IconTile icon={FileSpreadsheet} className="bg-white" />
            <div className="min-w-0 flex-1">
              <b className="block font-tight text-[14px] font-semibold text-ink">Start from our template</b>
              <small className="text-[12.5px] text-body">{SHEET[type]}_Import_Template.xlsx · one example row filled in</small>
            </div>
            <Button variant="secondary" onClick={() => buildTemplate(cols, SHEET[type])}>
              <Download aria-hidden="true" /> Download template
            </Button>
          </div>

          <Eyebrow className="mt-[18px]">Columns we read</Eyebrow>
          <div className="flex flex-wrap gap-1.5">
            {cols.map(c => (
              <span key={c.key}
                className={cn('rounded-pill px-2.5 py-1 text-[12.5px] font-medium', c.required ? 'bg-amber-soft font-semibold text-amber-text' : 'bg-well text-ink-2')}>
                {c.label}{c.required ? ' *' : ''}{c.note ? ` (${c.note})` : ''}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[12px] text-mute">* must be filled. Headers from other billing apps (Item Name, Sale Price, Purchase Price…) are matched for you.</p>

          <label
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
            className={cn('mt-4 block cursor-pointer rounded-[14px] border-[1.5px] border-dashed px-5 py-[34px] text-center transition-colors duration-(--dur-press)',
              status === 'error' ? 'border-[#F0B4B4] bg-[#FFFAFA]' : dragOver ? 'border-ink-2 bg-tile' : 'border-[#D6D5D2] bg-[#FCFCFB] hover:bg-tile')}>
            <div className="mx-auto mb-2.5 grid h-[46px] w-[46px] place-items-center rounded-[14px] bg-white text-ink-2 shadow-[0_0_0_1px_var(--color-line)]">
              <Upload size={20} strokeWidth={1.9} aria-hidden="true" />
            </div>
            <b className="block font-tight text-[14px] font-semibold text-ink">Choose an Excel file, or drop it here</b>
            <small className="text-[12.5px] text-body">.xlsx or .xls · the first sheet is read</small>
            {status === 'error' && <div role="alert" className="mt-2.5 text-[13px] font-medium text-bad-text">{errorMsg}</div>}
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="sr-only" onChange={e => handleFile(e.target.files[0])} />
          </label>
        </>
      )}

      {/* Match columns */}
      {status === 'mapping' && sheet && (
        <>
          <FileCard name={sheet.name} detail={`${sheet.raw.length} rows · ${sheet.headers.length} columns`} onChange={reset} />
          <div className="mb-2.5 flex items-center gap-2.5">
            <Eyebrow className="mb-0">Match your columns</Eyebrow>
            <span className="flex-1" />
            <span className="text-[12px] text-mute">{mapped} of {sheet.headers.length} columns will be read</span>
          </div>
          <div className="hidden grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)_minmax(0,1fr)_22px] gap-3 pb-2.5 font-tight text-[11.5px] font-semibold text-mute sm:grid">
            <span>In your file</span><span /><span>Goes into</span><span>First row</span><span />
          </div>
          {sheet.headers.map(h => {
            const key = sheet.mapping[h] || '';
            return (
              <div key={h} className="grid grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)] items-center gap-3 border-t border-sep py-2.5 text-[13px] sm:grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)_minmax(0,1fr)_22px]">
                <span className={cn('justify-self-start truncate rounded-[7px] bg-tile px-[9px] py-[5px] font-mono text-[13px] font-semibold', key ? 'text-ink-2' : 'text-mute line-through')}>{h}</span>
                <ArrowRight size={16} className="text-faint" aria-hidden="true" />
                <div className="relative">
                  <select value={key} onChange={e => setMap(h, e.target.value)} aria-label={`Field for ${h}`} className={cn(field, key ? 'text-ink' : 'text-mute')}>
                    <option value="">Do not import</option>
                    {cols.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                  <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-mute" aria-hidden="true" />
                </div>
                <span className="hidden truncate text-[12.5px] text-mute sm:block">e.g. {String(firstRow[h] ?? '') || '—'}</span>
                <span className="hidden sm:block">{key ? <Check size={16} strokeWidth={2.4} className="text-good" aria-label="Read" /> : <span className="text-mute">—</span>}</span>
              </div>
            );
          })}
          {sheet.headers.length - mapped > 0 && (
            <Note tone="n" className="mt-3">
              {sheet.headers.length - mapped} {sheet.headers.length - mapped === 1 ? 'column is' : 'columns are'} not read:{' '}
              {sheet.headers.filter(h => !sheet.mapping[h]).join(', ')}. Pick a field for any you want brought in.
            </Note>
          )}
          {problems.length > 0 && (
            <Note tone="r" role="alert" className="mt-3">Pick a column for {problems.map(p => `"${p}"`).join(', ')}: {problems.length === 1 ? 'it has' : 'they have'} to be filled.</Note>
          )}
          <div className="mt-4 flex items-center gap-2.5">
            <span className="flex-1" />
            <Button variant="secondary" onClick={reset}>Back</Button>
            <Button onClick={checkRows} disabled={problems.length > 0}>Check {sheet.raw.length} rows</Button>
          </div>
        </>
      )}

      {/* Preview */}
      {status === 'previewing' && validated && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
            <FileSpreadsheet size={16} className="text-mute" aria-hidden="true" />
            <b className="font-semibold">{validated.length} rows found</b>
            <span className="rounded-pill bg-good-soft px-[9px] py-[3px] font-tight text-[11.5px] font-semibold text-good-text">{validRows.length} ready</span>
            {invalidCount > 0 && <span className="rounded-pill bg-bad-soft px-[9px] py-[3px] font-tight text-[11.5px] font-semibold text-bad-text">{invalidCount} with errors</span>}
            <span className="flex-1" />
            <button type="button" onClick={() => setStatus('mapping')} className="font-tight text-[13px] font-semibold text-body hover:text-ink">Columns</button>
            <button type="button" onClick={reset} className="font-tight text-[13px] font-semibold text-amber-text hover:underline">Change file</button>
          </div>

          <PreviewTable validated={validated} cols={cols} />

          {invalidCount > 0 && (
            <Note tone="a" className="mt-3">
              <b>{invalidCount} {invalidCount === 1 ? 'row has errors' : 'rows have errors'} and will be skipped.</b> Fix the file and choose it again, or go on and import only the {validRows.length} ready rows.
            </Note>
          )}

          <div className="mt-4 flex items-center">
            <span className="flex-1" />
            <Button onClick={handleImport} disabled={!validRows.length}>
              <Upload aria-hidden="true" /> Import {count(validRows.length, noun)}
            </Button>
          </div>
        </>
      )}

      {/* Importing */}
      {status === 'importing' && (
        <div role="status">
          <FileCard name={sheet?.name || 'Your file'} detail={`${validRows.length} rows going in${invalidCount ? ` · ${invalidCount} skipped for errors` : ''}`} />
          <div className="mb-2 flex items-center gap-1.5 text-[13px]">
            <b className="font-semibold text-ink">Importing {Math.min(progress + 1, validRows.length)} of {validRows.length}</b>
            {type === 'products' && <span className="text-[12px] text-mute">· opening stock is added as each product goes in</span>}
          </div>
          <ProgressBar value={progress} max={validRows.length} label="Rows imported" />
          <p className="mt-2.5 text-[12px] text-mute">Keep this tab open until it finishes.</p>
          <div className="mt-4 flex">
            <span className="flex-1" />
            <Button disabled aria-busy="true">Importing…</Button>
          </div>
        </div>
      )}

      {/* Result */}
      {status === 'done' && (() => {
        const withProblems = result.failed > 0 || (result.notes?.length || 0) > 0;
        const [to, openLabel] = OPEN_LIST[type];
        return (
          <div role="status">
            <div className="mb-3 flex items-center gap-2.5">
              <IconTile icon={withProblems ? AlertTriangle : CheckCircle2}
                className={withProblems ? 'bg-amber-soft text-amber-text' : 'bg-good-soft text-good-text'} />
              <div>
                <h3 className="font-tight text-[17px] font-semibold text-ink">{withProblems ? 'Import finished, with problems' : 'Import finished'}</h3>
                <p className="text-[13px] text-body">{sheet?.name || 'Your file'} · {validRows.length} rows sent{invalidCount ? `, ${invalidCount} skipped before import` : ''}</p>
              </div>
            </div>
            <div className="mb-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div className="rounded-xl bg-good-soft px-3.5 py-3"><b className="block font-tight text-[24px] font-semibold tabular-nums text-good-text">{result.inserted}</b><small className="text-[12.5px] text-body">Imported</small></div>
              <div className={cn('rounded-xl px-3.5 py-3', result.failed ? 'bg-bad-soft' : 'bg-tile')}><b className={cn('block font-tight text-[24px] font-semibold tabular-nums', result.failed ? 'text-bad-text' : 'text-ink')}>{result.failed}</b><small className="text-[12.5px] text-body">Not imported</small></div>
              <div className={cn('rounded-xl px-3.5 py-3', result.notes?.length ? 'bg-amber-soft' : 'bg-tile')}><b className={cn('block font-tight text-[24px] font-semibold tabular-nums', result.notes?.length ? 'text-amber-text' : 'text-ink')}>{new Set((result.notes || []).map(n => n.index)).size}</b><small className="text-[12.5px] text-body">Imported, with a note</small></div>
            </div>

            {result.notImported?.length > 0 && (
              <>
                <Eyebrow className="mt-[18px]">Rows not imported</Eyebrow>
                {result.notImported.map(n => (
                  <div key={n.index} className="grid grid-cols-[70px_minmax(0,1fr)] gap-3 border-t border-sep py-[9px] text-[13px] sm:grid-cols-[70px_minmax(0,1fr)_minmax(0,1.4fr)]">
                    <span className="font-tight text-mute">Row {n.index}</span>
                    <b className="truncate font-medium text-ink">{n.name}</b>
                    <span className={n.unsure ? 'text-amber-text' : 'text-bad-text'}>
                      {n.unsure
                        ? `Not sure: the connection dropped before the shop answered, so it may have imported. Look for it before importing it again${n.reason ? ` (${n.reason})` : ''}.`
                        : (n.reason || 'The shop refused it and gave no reason.')}
                    </span>
                  </div>
                ))}
              </>
            )}

            {result.notes?.length > 0 && (
              <>
                <Eyebrow className="mt-[18px]">Imported, but check these</Eyebrow>
                {result.notes.map((n, i) => (
                  <div key={`${n.index}-${i}`} className="grid grid-cols-[70px_minmax(0,1fr)] gap-3 border-t border-sep py-[9px] text-[13px] sm:grid-cols-[70px_minmax(0,1fr)_minmax(0,1.4fr)]">
                    <span className="font-tight text-mute">Row {n.index}</span>
                    <b className="truncate font-medium text-ink">{n.name}</b>
                    <span className="text-amber-text">{n.why}</span>
                  </div>
                ))}
              </>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              {result.notImported?.length > 0 && (
                <Button variant="secondary" onClick={downloadNotImported}><Download aria-hidden="true" /> Download rows not imported</Button>
              )}
              <span className="flex-1" />
              <Button variant="secondary" onClick={reset}>Import another file</Button>
              <Button onClick={() => navigate(to)}>{openLabel}</Button>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'clients',   label: 'Clients',   cols: CLIENT_COLS   },
  { key: 'suppliers', label: 'Suppliers', cols: SUPPLIER_COLS },
  { key: 'products',  label: 'Products',  cols: PRODUCT_COLS  },
];

/** Dark pill switch (mockup `.seg.sm`). */
export const DarkSeg = ({ value, onChange, options, ariaLabel, className }) => (
  <div role="radiogroup" aria-label={ariaLabel} className={cn('inline-flex rounded-pill bg-well p-[3px]', className)}>
    {options.map(([val, label]) => (
      <button key={val} type="button" role="radio" aria-checked={value === val} onClick={() => onChange(val)}
        className={cn('m-press rounded-pill px-[13px] py-1.5 font-tight text-[12.5px] font-semibold transition-colors duration-(--dur-press)',
          value === val ? 'bg-ink text-white' : 'text-body hover:text-ink')}>
        {label}
      </button>
    ))}
  </div>
);

export default function ImportData({ modal = false }) {
  const { currentTenantId } = useTenant();
  const [tab, setTab] = useState('clients');

  return (
    <div className={modal ? '' : 'mx-auto max-w-3xl px-4 py-8'}>
      {/* Header — hidden when embedded (Data tools has its own header) */}
      {!modal && (
        <div className="mb-4">
          <h1 className="font-tight text-[20px] font-semibold tracking-[-0.02em] text-ink">Bulk import · Upload Excel</h1>
          <p className="mt-0.5 text-[13px] text-body">Bulk import clients, suppliers and products via Excel. Data is isolated to your account.</p>
        </div>
      )}

      <DarkSeg ariaLabel="What to import" className="mb-4" value={tab} onChange={setTab} options={TABS.map(t => [t.key, t.label])} />

      {TABS.map(t =>
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
  );
}
