import React, { useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, RotateCcw, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { supabase } from '../lib/supabase';
import { useTenant } from '../context/TenantContext';
import { normalizeHsn } from '../lib/hsn';

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
    // Why rows failed, in the server's words: a bare "n failed" hides the
    // reason (a duplicate, a refused column, a dropped connection).
    const reasons = [];

    // HSN values dropped for not being a legal code — reported, never silent.
    const badHsn = [];
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
        // Same rule as the importer: a SKU is not a tax code.
        hsn_code: (() => {
          const h = normalizeHsn(row.hsn);
          if (h.status === 'invalid') badHsn.push(`${row.name?.trim() || '?'} (${h.raw})`);
          return h.code;
        })(),
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
        if (e2) {
          failed++;
          console.error(`[BulkAdd] ${type} row failed:`, p.name, e2);
          if (reasons.length < 5) reasons.push(`${p.name}: ${e2.message || String(e2)}`);
        } else inserted++;
      }
    }
    setResult({ inserted, failed, badHsn, reasons });
    setStatus('done');
  };

  const reset = () => {
    setRows(Array.from({ length: EMPTY_ROWS }, () => blankRow(cfg.cols)));
    setStatus('idle');
    setResult(null);
  };

  const inputCls = 'w-full bg-transparent px-2.5 py-2 text-[13px] text-ink placeholder:text-mute outline-none focus:bg-amber-soft/40';
  const noun = type === 'products' ? 'products' : type;

  // Web redesign (approved mockup suppliers-14): same grid, same paste, same
  // checks and the same inserts; only the look changed, and a failed row now
  // says why.
  return (
    <div className="flex flex-col pb-16">
      <header className="m-rise mb-[18px] flex flex-wrap items-center gap-3.5" style={{ '--i': 0 }}>
        <button type="button" onClick={() => navigate(-1)}
          className="m-press inline-flex items-center gap-1.5 font-tight text-[13px] font-semibold text-body hover:text-ink">
          <ArrowLeft size={15} /> Back
        </button>
        <h3 className="font-tight text-[20px] font-semibold tracking-[-0.02em]">{cfg.title}</h3>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" onClick={reset}><RotateCcw /> Reset</Button>
          <Button onClick={save} disabled={!validRows.length || status === 'saving'}>
            {status === 'saving' ? <Loader2 className="animate-spin" /> : <Plus />}
            Import {validRows.length || ''} {validRows.length === 1 ? noun.replace(/s$/, '') : noun}
          </Button>
        </div>
      </header>
      <p className="m-rise -mt-2 mb-3.5 text-[13px] text-mute" style={{ '--i': 0 }}>
        Type directly, or copy rows in Excel or Google Sheets and paste anywhere in the grid. Columns fill in by themselves.
      </p>

      {invalidCount > 0 && (
        <div className="m-rise mb-3.5 flex items-start gap-2.5 rounded-xl bg-amber-soft px-3 py-2.5 text-[12.5px] text-amber-text" style={{ '--i': 1 }}>
          <AlertTriangle size={16} className="mt-px shrink-0" />
          <span>{invalidCount} {invalidCount === 1 ? 'row has' : 'rows have'} errors (red cells). {invalidCount === 1 ? 'It' : 'They'} will be skipped.</span>
        </div>
      )}

      {status === 'done' && result && (
        <div role="status" className={`mb-3.5 rounded-xl px-3.5 py-2.5 text-[12.5px] font-medium ${result.failed > 0 ? 'bg-bad-soft text-bad-text' : 'bg-good-soft text-good-text'}`}>
          <div className="flex items-center gap-2">
            {result.failed > 0 ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
            {result.inserted} added{result.failed > 0 ? ` · ${result.failed} failed` : ''}.
            <button type="button" onClick={reset} className="ml-1 underline underline-offset-2">Add more</button>
          </div>
          {result.reasons?.length > 0 && (
            <ul className="mt-1.5 list-disc pl-6 font-normal">
              {result.reasons.map((r) => <li key={r} className="break-words">{r}</li>)}
              {result.failed > result.reasons.length && <li>and {result.failed - result.reasons.length} more</li>}
            </ul>
          )}
          {/* The row still saved; only the bad HSN was dropped. Say which, so it
              can be corrected now rather than at filing time. */}
          {result.badHsn?.length > 0 && (
            <div className="mt-2 border-t border-black/5 pt-2 font-normal text-amber-text">
              {result.badHsn.length} HSN {result.badHsn.length === 1 ? 'code was' : 'codes were'} not valid (must be 4, 6 or 8 digits) and left blank:{' '}
              {result.badHsn.slice(0, 6).join(', ')}
              {result.badHsn.length > 6 ? ` and ${result.badHsn.length - 6} more` : ''}.
            </div>
          )}
        </div>
      )}

      {/* Grid */}
      <div className="m-rise max-h-[68vh] overflow-auto rounded-xl bg-surface shadow-[inset_0_0_0_1px_var(--color-line)]" style={{ '--i': 2 }}>
        <table className="w-max min-w-full border-separate border-spacing-0">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="w-10 border-b border-r border-line bg-tile px-1 py-[9px] font-tight text-[12px] font-semibold text-ink-2">#</th>
              {cfg.cols.map(c => (
                <th key={c.key} style={{ minWidth: c.w }} className="whitespace-nowrap border-b border-r border-line bg-tile px-2.5 py-[9px] text-left font-tight text-[12px] font-semibold text-ink-2">
                  {c.required ? <>{c.label.replace(/\*$/, '')} <span className="text-bad-text">*</span></> : c.label}
                </th>
              ))}
              <th className="w-9 border-b border-line bg-tile" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => {
              const errs = filled.some(f => f.i === r) ? errorsFor(row) : {};
              return (
                <tr key={r}>
                  <td className="w-10 border-b border-r border-sep bg-[#FCFBF9] text-center font-tight text-[11.5px] font-medium text-mute">{r + 1}</td>
                  {cfg.cols.map((c, ci) => (
                    <td key={c.key} title={errs[c.key] || ''}
                      className={`h-9 border-b border-r p-0 align-top ${errs[c.key] ? 'border-sep bg-[#FEF6F6] shadow-[inset_0_0_0_1px_#F5C2C2]' : 'border-sep'}`}>
                      <input
                        className={inputCls}
                        value={row[c.key]}
                        aria-label={`${c.label.replace(/\*$/, '')}, row ${r + 1}`}
                        aria-invalid={!!errs[c.key]}
                        onChange={e => setCell(r, c.key, e.target.value)}
                        onPaste={e => handlePaste(e, r, ci)}
                      />
                      {errs[c.key] && <small className="-mt-1.5 block px-2.5 pb-1.5 font-tight text-[11px] font-semibold text-bad-text">{errs[c.key]}</small>}
                    </td>
                  ))}
                  <td className="w-9 border-b border-sep text-center">
                    <button type="button" onClick={() => setRows(rs => rs.map((x, i) => i === r ? blankRow(cfg.cols) : x))}
                      className="m-press p-1 text-faint hover:text-bad-text" title="Clear row" aria-label={`Clear row ${r + 1}`}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button type="button" onClick={() => setRows(rs => [...rs, ...Array.from({ length: 10 }, () => blankRow(cfg.cols))])}
        className="m-press mt-3 self-start rounded-pill px-3.5 py-[7px] font-tight text-[12.5px] font-semibold text-body shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile">
        + 10 more rows
      </button>
    </div>
  );
};

export default BulkAdd;
