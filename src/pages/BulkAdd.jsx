import React, { useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2, RotateCcw, Check, X, AlertTriangle, Loader2, Download } from 'lucide-react';
import { Button } from '../components/ui/button';
import { FilterPills } from '../components/ui/Tabs';
import { Note, ProgressBar, downloadCsv } from '../components/tools/parts';
import { supabase } from '../lib/supabase';
import { useTenant } from '../context/TenantContext';
import { normalizeHsn } from '../lib/hsn';
import { isTransportFailure } from '../lib/writeOutcome';
import { maskGstin, plainLabel, rowErrors, rowOutcome, summarize, needsLook } from '../lib/bulkRows';
import { cn } from '../lib/utils';

// Bulk Add — in-app spreadsheet (myBillBook-style). Type directly or paste
// straight from Excel / Google Sheets (TSV clipboard): no file needed.
// Entities: clients, suppliers, products. Payload shapes mirror ImportData.
// Callers: Clients (?type=clients), Suppliers (?type=suppliers) and
// Inventory (?type=products).

const gstinCheck = v => !v || v.trim().length === 15 || 'GSTIN must be 15 characters';

const ENTITIES = {
  clients: {
    title: 'Bulk add clients',
    cols: [
      { key: 'name', label: 'Client name*', w: 200, required: true },
      { key: 'phone', label: 'Mobile number', w: 130 },
      { key: 'email', label: 'Email', w: 170 },
      { key: 'gstin', label: 'GSTIN', w: 160, validate: gstinCheck, mask: true },
      { key: 'address', label: 'Address', w: 220 },
      { key: 'state', label: 'State', w: 120 },
      { key: 'client_type', label: 'Type (B2B/B2C)', w: 110 },
      { key: 'credit_days', label: 'Credit days', w: 90, num: true },
    ],
  },
  suppliers: {
    title: 'Bulk add suppliers',
    cols: [
      { key: 'name', label: 'Supplier name*', w: 200, required: true },
      { key: 'contact_person', label: 'Contact person', w: 150 },
      { key: 'phone', label: 'Mobile number', w: 130 },
      { key: 'email', label: 'Email', w: 170 },
      { key: 'gstin', label: 'GSTIN', w: 160, validate: gstinCheck, mask: true },
      { key: 'address', label: 'Address', w: 220 },
    ],
  },
  products: {
    title: 'Bulk add products',
    cols: [
      { key: 'name', label: 'Product name*', w: 220, required: true },
      { key: 'category', label: 'Category', w: 120 },
      { key: 'sellingPrice', label: 'Selling price*', w: 110, num: true, required: true, validate: v => Number(v) > 0 || 'Selling price must be more than 0' },
      { key: 'costPrice', label: 'Cost price*', w: 100, num: true, required: true, validate: v => Number(v) > 0 || 'Cost price must be more than 0' },
      { key: 'stock', label: 'Opening stock', w: 105, num: true },
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

const STATUS_VIEW = {
  saved:   { cls: 'text-good-text font-semibold', icon: Check, text: 'Saved' },
  failed:  { cls: 'text-bad-text font-semibold', icon: X, text: 'Not saved' },
  unsure:  { cls: 'text-amber-text font-semibold', icon: AlertTriangle, text: 'Not sure' },
  saving:  { cls: 'text-mute', text: 'Saving…' },
  waiting: { cls: 'text-mute', text: 'Waiting' },
  skipped: { cls: 'text-mute', text: 'Skipped, has errors' },
};

const BulkAdd = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { currentTenantId } = useTenant();
  const type = ENTITIES[params.get('type')] ? params.get('type') : 'clients';
  const cfg = ENTITIES[type];

  const [rows, setRows] = useState(() => Array.from({ length: EMPTY_ROWS }, () => blankRow(cfg.cols)));
  const [status, setStatus] = useState('idle'); // idle | saving | done
  const [result, setResult] = useState(null);
  // Per grid row, after a save: { state, reason?, note? }. Display only.
  const [rowStatus, setRowStatus] = useState({});
  const [progress, setProgress] = useState({ done: 0, total: 0, problems: 0 });
  const [view, setView] = useState('all');
  const [focused, setFocused] = useState(null);   // "r:key" of the cell being typed in
  // A second click while the first save is still in flight must not send the
  // rows twice. The button is disabled too; this covers the gap before React
  // re-renders.
  const savingRef = useRef(false);

  const setCell = (r, key, val) => {
    setRows(rs => rs.map((row, i) => (i === r ? { ...row, [key]: val } : row)));
    // The row changed, so whatever the last save said about it is stale.
    setRowStatus(st => (st[r] ? Object.fromEntries(Object.entries(st).filter(([k]) => Number(k) !== r)) : st));
  };

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

  const errorsFor = (row) => rowErrors(row, cfg.cols);

  const validRows = filled.filter(({ row }) => Object.keys(errorsFor(row)).length === 0);
  const invalidRows = filled.filter(({ row }) => Object.keys(errorsFor(row)).length > 0);
  const invalidCount = invalidRows.length;

  const save = async () => {
    if (!validRows.length || !currentTenantId || savingRef.current) return;
    savingRef.current = true;
    setStatus('saving');
    setView('all');
    let inserted = 0, failed = 0;
    // Why rows failed, in the server's words: a bare "n failed" hides the
    // reason (a duplicate, a refused column, a dropped connection).
    const reasons = [];
    const statusOf = {};
    invalidRows.forEach(({ i }) => { statusOf[i] = { state: 'skipped' }; });
    validRows.forEach(({ i }) => { statusOf[i] = { state: 'waiting' }; });
    const push = () => setRowStatus({ ...statusOf });
    push();
    setProgress({ done: 0, total: validRows.length, problems: 0 });
    let problems = 0;

    // HSN values dropped for not being a legal code — reported, never silent.
    const badHsn = [];
    const hsnNote = {};   // grid row -> note
    const payloads = validRows.map(({ row, i }) => {
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
        // KNOWN DEFECT (not fixed in the redesign, owner decision): this
        // writes products.stock directly and creates no inventory_balances
        // row, unlike ImportData which applies the opening quantity through
        // adjust_inventory_atomic. The next movement re-derives stock from
        // the balances and the opening quantity vanishes.
        stock: Number(row.stock) || 0,
        taxRate: Number(row.taxRate) || 0,
        unit: row.unit?.trim() || 'pcs',
        // Same rule as the importer: a SKU is not a tax code.
        hsn_code: (() => {
          const h = normalizeHsn(row.hsn);
          if (h.status === 'invalid') {
            badHsn.push(`${row.name?.trim() || '?'} (${h.raw})`);
            hsnNote[i] = `HSN ${h.raw} is not a real code (needs 4, 6 or 8 digits), so it was left blank. Fix it on the product.`;
          }
          return h.code;
        })(),
        barcode: row.barcode?.trim() || null,
      };
    });
    const gridRowOf = validRows.map(({ i }) => i);

    try {
      // Chunked inserts — keeps payloads small and survives single bad rows.
      const table = type;
      for (let i = 0; i < payloads.length; i += 50) {
        const chunk = payloads.slice(i, i + 50);
        const chunkRows = gridRowOf.slice(i, i + 50);
        chunkRows.forEach(r => { statusOf[r] = { state: 'saving' }; });
        push();
        const { error } = await supabase.from(table).insert(chunk);
        if (!error) {
          inserted += chunk.length;
          chunkRows.forEach(r => { statusOf[r] = { state: 'saved', note: hsnNote[r] }; });
          setProgress({ done: inserted + failed, total: payloads.length, problems });
          push();
          continue;
        }
        const firstTryDropped = isTransportFailure(error);
        // Fall back row-by-row so one bad row doesn't sink the chunk.
        for (let j = 0; j < chunk.length; j++) {
          const p = chunk[j];
          const r = chunkRows[j];
          const { error: e2 } = await supabase.from(table).insert(p);
          if (e2) {
            failed++;
            problems++;
            console.error(`[BulkAdd] ${type} row failed:`, p.name, e2);
            if (reasons.length < 5) reasons.push(`${p.name}: ${e2.message || String(e2)}`);
            statusOf[r] = rowOutcome(e2, { firstTryDropped, isTransport: isTransportFailure });
          } else {
            inserted++;
            statusOf[r] = { state: 'saved', note: hsnNote[r] };
          }
          setProgress({ done: inserted + failed, total: payloads.length, problems });
          push();
        }
      }
    } finally {
      savingRef.current = false;
    }
    setResult({ inserted, failed, badHsn, reasons });
    setStatus('done');
  };

  const reset = () => {
    setRows(Array.from({ length: EMPTY_ROWS }, () => blankRow(cfg.cols)));
    setStatus('idle');
    setResult(null);
    setRowStatus({});
    setView('all');
  };

  const noun = type === 'products' ? 'products' : type;
  const saving = status === 'saving';
  const statuses = Object.values(rowStatus);
  const sum = summarize(statuses);
  const showStatus = status !== 'idle' && statuses.length > 0;
  const partly = status === 'done' && (sum.failed > 0 || sum.unsure > 0);
  const lookCount = statuses.filter(needsLook).length;

  const visible = rows.map((row, r) => ({ row, r })).filter(({ r }) => {
    if (!partly || view === 'all') return true;
    const st = rowStatus[r];
    return view === 'look' ? needsLook(st) : st?.state === 'saved';
  });

  const downloadNotSaved = () => {
    const bad = rows.map((row, r) => ({ row, r, st: rowStatus[r] })).filter(x => x.st && (x.st.state === 'failed' || x.st.state === 'unsure'));
    downloadCsv(`bulk_add_${type}_not_saved.csv`,
      ['Row', ...cfg.cols.map(c => plainLabel(c.label)), 'Status', 'Reason'],
      bad.map(({ row, r, st }) => [r + 1, ...cfg.cols.map(c => row[c.key]), st.state === 'unsure' ? 'Not sure' : 'Not saved', st.reason || '']));
  };

  const errorList = invalidRows.flatMap(({ row, i }) => Object.values(errorsFor(row)).map(m => `row ${i + 1} ${m}`));
  const subtitle = saving
    ? 'Keep this tab open until it finishes.'
    : 'Type directly, or copy rows in Excel or Google Sheets and paste anywhere in the grid. Columns fill in by themselves.';
  const addLabel = `Add ${validRows.length || ''} ${validRows.length === 1 ? noun.replace(/s$/, '') : noun}`.replace(/\s+/g, ' ');
  const colCount = cfg.cols.length + 2 + (showStatus ? 1 : 0);

  // Web redesign (approved mockups bulkadd-01..07): same grid, same paste,
  // same checks and the same inserts. New: a status per row while saving and
  // after, the server's reason under each row that did not save, and "Not
  // sure" where the answer never came back.
  return (
    <div className="flex flex-col pb-16">
      <div className="m-rise mb-4" style={{ '--i': 0 }}>
        <button type="button" onClick={() => navigate(-1)}
          className="m-press inline-flex items-center gap-1.5 font-tight text-[13px] font-semibold text-body hover:text-ink">
          <ArrowLeft size={15} /> Back
        </button>
      </div>
      <header className="m-rise mb-4 flex flex-wrap items-center gap-3" style={{ '--i': 0 }}>
        <div className="min-w-0 flex-1">
          <h3 className="font-tight text-[20px] font-semibold leading-[1.2] tracking-[-0.02em] text-ink">{cfg.title}</h3>
          <p className="mt-0.5 text-[13px] text-body">{subtitle}</p>
        </div>
        {!saving && <Button variant="secondary" onClick={reset}><RotateCcw /> Reset</Button>}
        <Button onClick={save} disabled={!validRows.length || saving} aria-busy={saving}>
          {saving ? <><Loader2 className="animate-spin motion-reduce:animate-none" /> Saving…</> : addLabel}
        </Button>
      </header>

      {saving && (
        <div className="mb-3.5 rounded-[14px] border border-line bg-surface px-[18px] py-3.5" role="status">
          <div className="mb-2 text-[13px] text-body">
            <b className="font-semibold text-ink">Saving {Math.min(progress.done + 1, progress.total)} of {progress.total} rows</b>
            {' '}· {progress.problems} {progress.problems === 1 ? 'problem' : 'problems'} so far
          </div>
          <ProgressBar value={progress.done} max={progress.total} label="Rows saved" />
        </div>
      )}

      {!saving && invalidCount > 0 && (
        <Note tone="a" className="m-rise mb-3" role="status">
          <b>{invalidCount} {invalidCount === 1 ? 'row has errors' : 'rows have errors'} and will be skipped:</b>{' '}
          {errorList.slice(0, 4).join(' · ')}
          {errorList.length > 4 ? ` · and ${errorList.length - 4} more` : ''}. Hover a red cell to see why.
        </Note>
      )}

      {status === 'done' && result && !partly && (
        <Note tone="g" role="status" className="mb-3.5">
          <b>{result.inserted} {result.inserted === 1 ? noun.replace(/s$/, '') : noun} added.</b>{' '}
          {type === 'products' && <>They are in Inventory now. <button type="button" onClick={() => navigate('/inventory')} className="font-tight font-semibold underline-offset-4 hover:underline">Open Inventory</button> · </>}
          <button type="button" onClick={reset} className="font-tight font-semibold underline-offset-4 hover:underline">Add more</button>
        </Note>
      )}

      {/* The row still saved; only the bad HSN was dropped. Say which, so it
          can be corrected now rather than at filing time. */}
      {status === 'done' && result?.badHsn?.length > 0 && (
        <Note tone="a" className="mb-3.5">
          <b>{result.badHsn.length} HSN {result.badHsn.length === 1 ? 'code was' : 'codes were'} not valid and {result.badHsn.length === 1 ? 'was' : 'were'} left blank</b>{' '}
          (must be 4, 6 or 8 digits): {result.badHsn.slice(0, 6).join(', ')}
          {result.badHsn.length > 6 ? ` and ${result.badHsn.length - 6} more` : ''}.
        </Note>
      )}

      {partly && (
        <>
          <div role="status" className="mb-3.5 grid grid-cols-2 overflow-hidden rounded-[14px] border border-line bg-surface sm:grid-cols-4">
            {[
              ['Rows sent', sum.sent, '', 'from the grid'],
              ['Saved', sum.saved, 'text-good-text', sum.noted ? `${sum.noted} of them with a note` : 'in the shop now'],
              ['Not saved', sum.failed, 'text-bad-text', 'reason on each row'],
              ['Not sure', sum.unsure, 'text-amber-text', 'check before sending again'],
            ].map(([k, v, tone, hint], i) => (
              <div key={k} className={cn('px-4 py-3', i > 0 && 'border-l border-sep')}>
                <span className="font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute">{k}</span>
                <b className={cn('mt-1 block font-tight text-[22px] font-semibold tabular-nums', tone)}>{v}</b>
                <small className="text-[12px] text-body">{hint}</small>
              </div>
            ))}
          </div>
          {sum.saved > 0 && (
            <Note tone="a" role="alert" className="mb-3">
              <b>{sum.saved} {sum.saved === 1 ? 'row is' : 'rows are'} already saved.</b> {addLabel} sends every row in the grid again, saved ones included, and would add them twice. Clear or Reset the saved rows first, or fix the rows that did not save in their own screen.
            </Note>
          )}
          <div className="mb-3 flex flex-wrap items-center gap-2.5">
            <FilterPills ariaLabel="Show rows" value={view} onChange={setView}
              items={[{ key: 'all', label: 'All', count: sum.sent }, { key: 'look', label: 'Needs a look', count: lookCount }, { key: 'saved', label: 'Saved', count: sum.saved }]} />
            <span className="flex-1" />
            <Button variant="secondary" size="sm" onClick={downloadNotSaved} disabled={sum.failed + sum.unsure === 0}>
              <Download /> Download rows not saved
            </Button>
          </div>
        </>
      )}

      {/* Grid */}
      <div className="m-rise max-h-[68vh] overflow-auto rounded-[14px] bg-surface shadow-[inset_0_0_0_1px_var(--color-line)]" style={{ '--i': 2 }}>
        <table className="w-max min-w-full border-separate border-spacing-0">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="w-[38px] border-b border-r border-sep bg-tile px-1 py-[9px] font-tight text-[11.5px] font-semibold text-ink-2">#</th>
              {cfg.cols.map(c => (
                <th key={c.key} style={{ minWidth: c.w }} className={cn('whitespace-nowrap border-b border-r border-sep bg-tile px-2.5 py-[9px] font-tight text-[11.5px] font-semibold text-ink-2', c.num ? 'text-right' : 'text-left')}>
                  {c.required ? <>{plainLabel(c.label)} <span className="text-bad-text">*</span></> : c.label}
                </th>
              ))}
              {showStatus && <th className="w-[210px] border-b border-r border-sep bg-tile px-2.5 py-[9px] text-left font-tight text-[11.5px] font-semibold text-ink-2">Status</th>}
              <th className="w-[34px] border-b border-sep bg-tile" />
            </tr>
          </thead>
          <tbody>
            {visible.map(({ row, r }) => {
              const errs = filled.some(f => f.i === r) ? errorsFor(row) : {};
              const st = rowStatus[r];
              const done = st?.state === 'saved';
              const bad = st?.state === 'failed';
              const maybe = st?.state === 'unsure' || (done && st?.note);
              const why = (bad || st?.state === 'unsure') ? st.reason : (done ? st.note : null);
              const rowBg = bad ? 'bg-[#FFF8F8]' : st?.state === 'unsure' ? 'bg-[#FFFBF4]' : done ? 'bg-[#FAFAF9]' : '';
              const sv = st ? STATUS_VIEW[st.state] : null;
              return (
                <React.Fragment key={r}>
                  <tr className={rowBg}>
                    <td className={cn('w-[38px] border-b border-r border-sep text-center font-tight text-[12px] font-medium', bad ? 'bg-bad-soft text-bad-text' : 'bg-tile text-faint')}>{r + 1}</td>
                    {cfg.cols.map((c, ci) => {
                      const id = `${r}:${c.key}`;
                      const raw = row[c.key];
                      const shown = c.mask && focused !== id ? maskGstin(raw) : raw;
                      return (
                        <td key={c.key} title={errs[c.key] || ''}
                          className={cn('h-9 border-b border-r border-sep p-0 align-middle', errs[c.key] && 'bg-bad-soft shadow-[inset_0_0_0_1.5px_#F5B5B5]')}>
                          <input
                            className={cn('w-full bg-transparent px-2.5 py-2 text-[13px] outline-none placeholder:text-mute focus:shadow-[inset_0_0_0_2px_var(--color-ink)]',
                              c.num && 'text-right font-tight tabular-nums', errs[c.key] ? 'text-bad-text' : done ? 'text-mute' : 'text-ink')}
                            value={shown}
                            readOnly={saving}
                            aria-label={`${plainLabel(c.label)}, row ${r + 1}`}
                            aria-invalid={!!errs[c.key]}
                            onFocus={() => setFocused(id)}
                            onBlur={() => setFocused(f => (f === id ? null : f))}
                            onChange={e => setCell(r, c.key, e.target.value)}
                            onPaste={e => handlePaste(e, r, ci)}
                          />
                        </td>
                      );
                    })}
                    {showStatus && (
                      <td className="w-[210px] whitespace-nowrap border-b border-r border-sep px-2.5 text-[12.5px]">
                        {sv && (
                          <span className={cn('inline-flex items-center gap-1.5', done && st.note ? 'font-semibold text-amber-text' : sv.cls)}>
                            {sv.icon && <sv.icon size={13} strokeWidth={2.4} aria-hidden="true" />}
                            {done && st.note ? 'Saved, HSN left blank' : sv.text}
                          </span>
                        )}
                      </td>
                    )}
                    <td className="w-[34px] border-b border-sep text-center">
                      <button type="button" disabled={saving} onClick={() => { setRows(rs => rs.map((x, i) => i === r ? blankRow(cfg.cols) : x)); setRowStatus(s => { const n = { ...s }; delete n[r]; return n; }); }}
                        className="m-press p-1 text-faint hover:text-bad-text disabled:opacity-40" title="Clear row" aria-label={`Clear row ${r + 1}`}>
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                  {why && (
                    <tr className={maybe && !bad ? 'bg-[#FFFBF4]' : 'bg-[#FFF8F8]'}>
                      <td colSpan={colCount} className={cn('border-b border-sep pb-[9px] pl-12 pr-2.5 pt-0 text-[12px]', maybe && !bad ? 'text-amber-text' : 'text-bad-text')}>
                        Row {r + 1}: {why}{st?.state === 'unsure' && ' Look for it before you send it again.'}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {(type === 'clients' || type === 'suppliers') && (
        <p className="mt-2 text-[12px] text-mute">
          GSTINs are shown part-hidden here because they carry the PAN; the full number shows while you type in the cell.
          {type === 'clients' && ' Type anything other than B2B in Type and the client is saved as B2C.'}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="text-[12px] text-mute">
          {EMPTY_ROWS} empty rows to start · rows with errors are skipped, the rest are added
        </span>
        <span className="flex-1" />
        <button type="button" disabled={saving} onClick={() => setRows(rs => [...rs, ...Array.from({ length: 10 }, () => blankRow(cfg.cols))])}
          className="m-press rounded-pill border border-dashed border-[#D6D5D2] px-3.5 py-[7px] font-tight text-[12.5px] font-semibold text-body hover:bg-tile disabled:opacity-40">
          + 10 more rows
        </button>
      </div>
    </div>
  );
};

export default BulkAdd;
