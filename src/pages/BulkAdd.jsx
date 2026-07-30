import React, { useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, RotateCcw, CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTenant } from '../context/TenantContext';

// Bulk Add — in-app spreadsheet (myBillBook-style). Type directly or paste
// straight from Excel / Google Sheets (TSV clipboard): no file needed.
// Entities: clients, suppliers, products. Payload shapes mirror ImportData.

const ENTITIES = {
  clients: {
    title: 'Bulk Import Clients',
    cols: [
      { key: 'name', label: 'Client Name*', w: 200, required: true },
      { key: 'phone', label: 'Mobile Number', w: 130 },
      { key: 'email', label: 'Email', w: 170 },
      { key: 'gstin', label: 'GSTIN', w: 160, validate: v => !v || v.trim().length === 15 || 'GSTIN must be 15 chars' },
      { key: 'address', label: 'Address', w: 220 },
      { key: 'state', label: 'State', w: 120 },
      { key: 'client_type', label: 'Type (B2B/B2C)', w: 110 },
      { key: 'credit_days', label: 'Credit Days', w: 90, num: true },
    ],
  },
  suppliers: {
    title: 'Bulk Import Suppliers',
    cols: [
      { key: 'name', label: 'Supplier Name*', w: 200, required: true },
      { key: 'contact_person', label: 'Contact Person', w: 150 },
      { key: 'phone', label: 'Mobile Number', w: 130 },
      { key: 'email', label: 'Email', w: 170 },
      { key: 'gstin', label: 'GSTIN', w: 160, validate: v => !v || v.trim().length === 15 || 'GSTIN must be 15 chars' },
      { key: 'address', label: 'Address', w: 220 },
    ],
  },
  products: {
    title: 'Bulk Import Products',
    cols: [
      { key: 'name', label: 'Product Name*', w: 220, required: true },
      { key: 'category', label: 'Category', w: 120 },
      { key: 'sellingPrice', label: 'Selling Price*', w: 110, num: true, required: true, validate: v => Number(v) > 0 || 'Must be > 0' },
      { key: 'costPrice', label: 'Cost Price*', w: 100, num: true, required: true, validate: v => Number(v) > 0 || 'Must be > 0' },
      { key: 'stock', label: 'Opening Stock', w: 105, num: true },
      { key: 'taxRate', label: 'GST %', w: 75, num: true },
      { key: 'unit', label: 'Unit', w: 70 },
      { key: 'hsn', label: 'HSN', w: 90 },
      { key: 'barcode', label: 'Barcode', w: 140 },
    ],
  },
};

const EMPTY_ROWS = 20;
const genId = (p) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const blankRow = (cols) => Object.fromEntries(cols.map(c => [c.key, '']));

const BulkAdd = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { currentTenantId } = useTenant();
  const type = ENTITIES[params.get('type')] ? params.get('type') : 'clients';
  const cfg = ENTITIES[type];

  const [rows, setRows] = useState(() => Array.from({ length: EMPTY_ROWS }, () => blankRow(cfg.cols)));
  const [status, setStatus] = useState('idle'); // idle | saving | done
  const [result, setResult] = useState(null);

  const setCell = (r, key, val) =>
    setRows(rs => rs.map((row, i) => (i === r ? { ...row, [key]: val } : row)));

  // Paste straight from Excel / Google Sheets: TSV expands from the focused cell.
  const handlePaste = (e, rIdx, cIdx) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text || (!text.includes('\t') && !text.includes('\n'))) return; // single-value paste = default
    e.preventDefault();
    const lines = text.replace(/\r/g, '').split('\n').filter(l => l.length);
    setRows(rs => {
      const next = [...rs];
      lines.forEach((line, dr) => {
        const cells = line.split('\t');
        const target = rIdx + dr;
        while (next.length <= target) next.push(blankRow(cfg.cols));
        next[target] = { ...next[target] };
        cells.forEach((val, dc) => {
          const col = cfg.cols[cIdx + dc];
          if (col) next[target][col.key] = val.trim();
        });
      });
      return next;
    });
  };

  const filled = useMemo(() => rows
    .map((row, i) => ({ row, i }))
    .filter(({ row }) => cfg.cols.some(c => String(row[c.key]).trim() !== '')), [rows, cfg.cols]);

  const errorsFor = (row) => {
    const errs = {};
    cfg.cols.forEach(c => {
      const v = String(row[c.key] ?? '').trim();
      if (c.required && !v) errs[c.key] = 'Required';
      else if (c.num && v && isNaN(Number(v))) errs[c.key] = 'Number';
      else if (c.validate) {
        const r = c.validate(v);
        if (r !== true && v) errs[c.key] = r;
      }
    });
    return errs;
  };

  const validRows = filled.filter(({ row }) => Object.keys(errorsFor(row)).length === 0);
  const invalidCount = filled.length - validRows.length;

  const save = async () => {
    if (!validRows.length || !currentTenantId) return;
    setStatus('saving');
    let inserted = 0, failed = 0;

    const payloads = validRows.map(({ row }) => {
      if (type === 'clients') return {
        id: genId('CLI'), tenant_id: currentTenantId,
        name: row.name.trim(),
        phone: row.phone?.trim() || null,
        email: row.email?.trim() || null,
        gstin: row.gstin?.trim() || null,
        address: row.address?.trim() || null,
        state: row.state?.trim() || null,
        client_type: ['B2B', 'B2C'].includes(String(row.client_type).toUpperCase()) ? String(row.client_type).toUpperCase() : 'B2C',
        credit_days: Number(row.credit_days) || 0,
      };
      if (type === 'suppliers') return {
        id: genId('SUP'), tenant_id: currentTenantId,
        name: row.name.trim(),
        contact_person: row.contact_person?.trim() || null,
        phone: row.phone?.trim() || null,
        email: row.email?.trim() || null,
        gstin: row.gstin?.trim() || null,
        address: row.address?.trim() || null,
        created_at: new Date().toISOString(),
      };
      return {
        id: genId('PROD'), tenant_id: currentTenantId,
        name: row.name.trim(),
        category: row.category?.trim() || 'Other',
        sellingPrice: Number(row.sellingPrice) || 0,
        costPrice: Number(row.costPrice) || 0,
        stock: Number(row.stock) || 0,
        taxRate: Number(row.taxRate) || 0,
        unit: row.unit?.trim() || 'pcs',
        hsn_code: row.hsn?.trim() || null,
        barcode: row.barcode?.trim() || null,
      };
    });

    // Chunked inserts — keeps payloads small and survives single bad rows.
    const table = type;
    for (let i = 0; i < payloads.length; i += 50) {
      const chunk = payloads.slice(i, i + 50);
      const { error } = await supabase.from(table).insert(chunk);
      if (!error) { inserted += chunk.length; continue; }
      // Fall back row-by-row so one bad row doesn't sink the chunk.
      for (const p of chunk) {
        const { error: e2 } = await supabase.from(table).insert(p);
        e2 ? failed++ : inserted++;
      }
    }
    setResult({ inserted, failed });
    setStatus('done');
  };

  const reset = () => {
    setRows(Array.from({ length: EMPTY_ROWS }, () => blankRow(cfg.cols)));
    setStatus('idle');
    setResult(null);
  };

  const inputCls = 'w-full bg-transparent px-2.5 py-2 text-[13px] text-foreground placeholder:text-muted-foreground outline-none focus:bg-muted';

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-3 mb-6 pb-5 border-b border-border">
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-md border border-border flex items-center justify-center text-ink-secondary hover:bg-muted transition-colors">
          <ArrowLeft size={15} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[20px] font-semibold text-foreground">{cfg.title}</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">Type directly, or copy rows in Excel / Google Sheets and paste anywhere in the grid — columns fill automatically.</p>
        </div>
        <button onClick={reset}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-border text-[13px] font-semibold text-ink-secondary hover:bg-muted transition-colors">
          <RotateCcw size={13} /> Reset
        </button>
        <button
          onClick={save}
          disabled={!validRows.length || status === 'saving'}
          className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-gray-900 text-white text-[13px] font-semibold hover:bg-gray-800 disabled:opacity-40 transition-colors"
        >
          {status === 'saving' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Import {validRows.length || ''} {type}
        </button>
      </header>

      {invalidCount > 0 && (
        <div className="mb-3 px-3.5 py-2.5 rounded-md bg-accent-signature/10 border border-accent-signature/25 text-[12.5px] text-accent-signature-hover font-medium">
          {invalidCount} row{invalidCount === 1 ? '' : 's'} have errors (red cells) — they'll be skipped.
        </div>
      )}

      {status === 'done' && result && (
        <div className="mb-3 px-3.5 py-2.5 rounded-md bg-emerald-50 border border-emerald-200 text-[12.5px] text-emerald-700 font-medium flex items-center gap-2">
          <CheckCircle2 size={15} />
          {result.inserted} added{result.failed > 0 ? ` · ${result.failed} failed` : ''}.
          <button onClick={reset} className="underline ml-1">Add more</button>
        </div>
      )}

      {/* Grid */}
      <div className="bg-white rounded-lg border border-border overflow-auto max-h-[68vh]">
        <table className="border-collapse w-max min-w-full">
          <thead className="sticky top-0 z-10">
            <tr className="bg-muted">
              <th className="w-10 border-b border-r border-border text-[11px] text-muted-foreground font-medium px-1 py-2.5">#</th>
              {cfg.cols.map(c => (
                <th key={c.key} style={{ minWidth: c.w }} className="border-b border-r border-border text-[12.5px] font-semibold text-ink-secondary px-2.5 py-2.5 text-left">
                  {c.label}
                </th>
              ))}
              <th className="w-9 border-b border-border" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => {
              const errs = filled.some(f => f.i === r) ? errorsFor(row) : {};
              return (
                <tr key={r} className="hover:bg-muted/40">
                  <td className="border-b border-r border-border text-center text-[11px] text-muted-foreground">{r + 1}</td>
                  {cfg.cols.map((c, ci) => (
                    <td key={c.key} title={errs[c.key] || ''}
                      className={`border-b border-r ${errs[c.key] ? 'border-red-300 bg-red-50' : 'border-border'} p-0`}>
                      <input
                        className={inputCls}
                        value={row[c.key]}
                        onChange={e => setCell(r, c.key, e.target.value)}
                        onPaste={e => handlePaste(e, r, ci)}
                      />
                    </td>
                  ))}
                  <td className="border-b border-border text-center">
                    <button onClick={() => setRows(rs => rs.map((x, i) => i === r ? blankRow(cfg.cols) : x))}
                      className="text-gray-200 hover:text-red-500 p-1 transition-colors" title="Clear row">
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button onClick={() => setRows(rs => [...rs, ...Array.from({ length: 10 }, () => blankRow(cfg.cols))])}
        className="mt-3 px-3.5 py-2 rounded-md border border-dashed border-border text-[12.5px] font-medium text-muted-foreground hover:border-gray-400 hover:text-ink-secondary transition-colors">
        + 10 more rows
      </button>
    </div>
  );
};

export default BulkAdd;
