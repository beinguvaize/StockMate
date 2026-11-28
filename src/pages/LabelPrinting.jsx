import React, { useEffect, useMemo, useRef, useState } from 'react';
import Barcode from 'react-barcode';
import { Printer, Search, Wand2, Minus, Plus, Package, ScanBarcode, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTenant } from '../context/TenantContext';
import { Button } from '../components/ui/button';
import Dialog from '../components/ui/Dialog';
import { Note, Eyebrow, EmptyCard } from '../components/tools/parts';
import LabelSheet from '../components/labels/LabelSheet';
import { isTransportFailure } from '../lib/writeOutcome';
import { cn } from '../lib/utils';
import {
  LABEL_TEMPLATES, barcodeFormat, genInternalBarcode, printLabels, paginate,
} from '../lib/labelPrint';

// Utilities → Barcode & Labels.
// Pick products + qty → choose a label template + fields → preview → print.
// Barcodes render as SVG (react-barcode); print clones the hidden sheet HTML
// into a popup with exact-mm @page CSS (works on thermal + A4 printers).
//
// Web redesign (approved mockups labels-01..06). The print sheet is
// components/labels/LabelSheet, unchanged, and pinned by its test: only the
// screen changed. Generating barcodes now asks first and says which saved.

// Names as the mockup writes them; the template itself (sizes) is untouched.
const TEMPLATE_NAMES = {
  T38x2: '38 × 25 mm · thermal roll, 2 across',
  T38:   '38 × 25 mm · thermal roll, 1 across',
  T50:   '50 × 25 mm · thermal roll',
  A4_65: 'A4 sheet · 65 labels (38.1 × 21.2 mm)',
  A4_40: 'A4 sheet · 40 labels (52.5 × 29.7 mm)',
  A4_24: 'A4 sheet · 24 labels (70 × 37.1 mm)',
};

const inr2 = (n) => `₹${Number(n || 0).toFixed(2)}`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const LabelPrinting = () => {
  const { currentTenantId, businessProfile } = useTenant();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [qty, setQty] = useState({});            // productId -> label count
  const [templateId, setTemplateId] = useState('T38x2');
  // Per-field config: visible, font size (pt) and bold — like big-brand label tools.
  const DEFAULT_FIELDS = {
    biz:   { on: true,  size: 6,  bold: true,  label: 'Shop name' },
    name:  { on: true,  size: 7,  bold: true,  label: 'Product name' },
    sku:   { on: false, size: 5,  bold: false, label: 'SKU' },
    price: { on: true,  size: 8,  bold: true,  label: 'MRP price' },
    tax:   { on: true,  size: 4.5, bold: false, label: '"Incl. of all taxes"' },
  };
  const settingsKey = `label_settings_${currentTenantId || 'default'}`;
  const [fields, setFields] = useState(DEFAULT_FIELDS);
  const [generating, setGenerating] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  // Generate dialog: the codes it will write, worked out when it opens so the
  // shopkeeper sees the exact numbers before anything is saved.
  const [genPlan, setGenPlan] = useState(null);   // [{ p, code }] | null
  const [genResult, setGenResult] = useState(null);

  // Load saved settings once per tenant.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(settingsKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.fields) {
          setFields(prev => {
            const merged = { ...prev };
            for (const k of Object.keys(merged)) {
              if (saved.fields[k]) merged[k] = { ...merged[k], ...saved.fields[k], label: merged[k].label };
            }
            return merged;
          });
        }
        if (saved.templateId) setTemplateId(saved.templateId);
      }
    } catch { /* corrupt settings — use defaults */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsKey]);

  const saveSettings = () => {
    localStorage.setItem(settingsKey, JSON.stringify({ fields, templateId }));
    setSavedTick(true);
    setTimeout(() => setSavedTick(false), 1500);
  };

  const setField = (k, patch) => setFields(f => ({ ...f, [k]: { ...f[k], ...patch } }));
  // pt -> on-screen px at the preview scale (1pt = 0.353mm, 3.2px/mm)
  const pt2px = (pt) => pt * 0.353 * 3.2;
  const [msg, setMsg] = useState('');
  const sheetRef = useRef(null);

  const template = LABEL_TEMPLATES.find(t => t.id === templateId) || LABEL_TEMPLATES[0];

  const load = async () => {
    if (!currentTenantId) return;
    setLoading(true);
    const { data } = await supabase
      .from('products')
      .select('id, name, sku, barcode, sellingPrice, stock, category')
      .eq('tenant_id', currentTenantId)
      .is('deleted_at', null)
      .order('name');
    setProducts(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [currentTenantId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.sku || '').toLowerCase().includes(q) ||
      (p.barcode || '').includes(q));
  }, [products, search]);

  const selected = useMemo(
    () => products.filter(p => (qty[p.id] || 0) > 0),
    [products, qty]
  );
  const totalLabels = selected.reduce((s, p) => s + (qty[p.id] || 0), 0);
  const missingBarcodes = products.filter(p => !p.barcode).length;

  const setCount = (id, n) => setQty(prev => ({ ...prev, [id]: Math.max(0, Math.min(999, n)) }));

  // Fill products.barcode for every product that lacks one. Internal numeric
  // codes in the GS1 in-store range (prefix 21) with EAN-13 check digit.
  const openGenerate = () => {
    const taken = new Set(products.map(p => p.barcode).filter(Boolean));
    const plan = products.filter(p => !p.barcode).map(p => {
      const code = genInternalBarcode(taken);
      taken.add(code);
      return { p, code };
    });
    setGenPlan(plan);
  };

  // Same writes as before, one product at a time, stopping at the first
  // failure. What changed: it asks first, and afterwards it says which saved,
  // which did not and why, and re-reads the list either way.
  const generateMissing = async () => {
    const plan = genPlan || [];
    setGenerating(true);
    setMsg('');
    setGenResult(null);
    const saved = [];
    let failed = null;
    try {
      for (const { p, code } of plan) {
        const { error } = await supabase
          .from('products')
          .update({ barcode: code, barcode_type: 'EAN13' })
          .eq('id', p.id)
          .eq('tenant_id', currentTenantId);
        if (error) { failed = { p, error }; break; }
        saved.push({ p, code });
      }
    } catch (e) {
      failed = { p: plan[saved.length]?.p, error: e };
    } finally {
      setGenPlan(null);
      // Re-read either way: after a dropped connection only the server knows.
      await load();
      setGenerating(false);
    }
    if (!failed) {
      setMsg(`Generated barcodes for ${saved.length} product${saved.length === 1 ? '' : 's'}.`);
    } else {
      setGenResult({
        total: plan.length,
        saved,
        failed: { name: failed.p?.name || 'A product', reason: String(failed.error?.message || failed.error || ''), unsure: isTransportFailure(failed.error) },
        notTried: plan.length - saved.length - 1,
      });
    }
  };

  const handlePrint = () => {
    if (!sheetRef.current || totalLabels === 0) return;
    const ok = printLabels(template, sheetRef.current.innerHTML);
    setMsg(ok ? '' : 'POPUP_BLOCKED');
  };

  // On-screen cell at preview scale; mirrors the print cell using pt->px conversion.
  // A4 sheets are drawn at half the thermal scale so a whole page fits the card.
  const previewScale = template.kind === 'a4' ? 1.6 : 3.2;
  const pvs = (k) => ({ fontSize: pt2px(fields[k].size) * (previewScale / 3.2), fontWeight: fields[k].bold ? 800 : 500, lineHeight: 1.15 });
  const PreviewCell = ({ p }) => (
    <div className="flex flex-col items-center justify-center overflow-hidden border border-dashed border-[#E1E1DE] text-center text-[#111]"
      style={{ padding: 2 }}>
      {fields.biz.on && businessProfile?.name && <div className="w-full truncate uppercase" style={pvs('biz')}>{businessProfile.name}</div>}
      {fields.name.on && <div className="w-full truncate" style={pvs('name')}>{p.name}</div>}
      {fields.sku.on && p.sku && <div style={pvs('sku')}>{p.sku}</div>}
      {p.barcode ? (
        <Barcode value={p.barcode} format={barcodeFormat(p.barcode)} width={previewScale < 3 ? 0.5 : 1}
          height={(template.label.h >= 30 ? 30 : 20) * (previewScale / 3.2)} fontSize={8 * (previewScale / 3.2)} margin={0} displayValue />
      ) : <div className="text-[7px] text-bad-text">no barcode</div>}
      {fields.price.on && <div style={pvs('price')}>MRP {inr2(p.sellingPrice)}</div>}
      {fields.tax.on && <div style={pvs('tax')}>Incl. of all taxes</div>}
    </div>
  );

  // Big single-label sample with mm dimension rulers (first selected or sample data).
  const sampleProduct = selected[0] || products[0] || { name: 'Item 1', sku: 'SKU-001', barcode: '2100000000013', sellingPrice: 100 };
  const bigScale = Math.min(6.5, 440 / template.label.w);
  const sfs = (k) => ({ fontSize: pt2px(fields[k].size) * (bigScale / 3.2), fontWeight: fields[k].bold ? 800 : 500 });
  const SampleLabel = () => (
    <div className="flex flex-col items-center pb-2 pt-[18px]">
      <div className="mb-1.5 border-t border-amber pt-[3px] text-center font-mono text-[10.5px] font-medium text-amber-text"
        style={{ width: template.label.w * bigScale }}>{template.label.w} mm</div>
      <div className="flex items-center gap-2">
        <div className="flex flex-col items-center justify-center overflow-hidden border border-[#D9D9D6] bg-white text-center leading-[1.2] text-[#111] shadow-[0_2px_8px_-4px_rgba(17,20,24,0.25)]"
          style={{ width: template.label.w * bigScale, height: template.label.h * bigScale, padding: 5 }}>
          {fields.biz.on && businessProfile?.name && <div className="w-full truncate uppercase" style={sfs('biz')}>{businessProfile.name}</div>}
          {fields.name.on && <div className="w-full truncate" style={sfs('name')}>{sampleProduct.name}</div>}
          {fields.sku.on && sampleProduct.sku && <div style={sfs('sku')}>{sampleProduct.sku}</div>}
          {sampleProduct.barcode && (
            <Barcode value={sampleProduct.barcode} format={barcodeFormat(sampleProduct.barcode)} width={Math.max(1, bigScale / 3)} height={template.label.h * bigScale * 0.3} fontSize={10} margin={0} displayValue />
          )}
          {fields.price.on && <div style={sfs('price')}>MRP {inr2(sampleProduct.sellingPrice)}</div>}
          {fields.tax.on && <div style={sfs('tax')}>Incl. of all taxes</div>}
        </div>
        <div className="flex items-center border-l border-amber pl-[5px] font-mono text-[10.5px] font-medium text-amber-text whitespace-nowrap"
          style={{ height: template.label.h * bigScale }}>{template.label.h} mm</div>
      </div>
    </div>
  );

  // Expanded cells: each product repeated qty times.
  const cells = selected.flatMap(p => Array.from({ length: qty[p.id] || 0 }, (_, i) => ({ p, key: `${p.id}-${i}` })));
  const pages = paginate(cells, template);
  const rollNote = template.kind === 'thermal'
    ? ` · one page is one ${template.cols > 1 ? `${template.cols}-label row` : 'label'} of the roll` : '';

  const card = 'rounded-[14px] border border-line bg-surface';

  return (
    <div className="flex flex-col pb-16">
      <header className="m-rise mb-3 flex flex-wrap items-center gap-2.5" style={{ '--i': 0 }}>
        <div className="min-w-0 flex-1">
          <div className="font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute">Barcode and labels</div>
          <p className="mt-0.5 text-[13px] text-body">Give products a barcode and print price labels, on thermal rolls or A4 sticker sheets</p>
        </div>
        {missingBarcodes > 0 && (
          <Button variant="secondary" size="sm" className="h-9" onClick={openGenerate} disabled={generating}>
            <Wand2 aria-hidden="true" />
            {generating ? 'Generating…' : `Generate ${missingBarcodes} missing barcode${missingBarcodes === 1 ? '' : 's'}`}
          </Button>
        )}
        <Button size="sm" className="h-9 px-4" onClick={handlePrint} disabled={totalLabels === 0}>
          <Printer aria-hidden="true" /> Print{totalLabels > 0 ? ` ${totalLabels} label${totalLabels === 1 ? '' : 's'}` : ''}
        </Button>
      </header>

      {msg === 'POPUP_BLOCKED' ? (
        <Note tone="a" role="alert" className="mb-3.5">
          <b>The print window was blocked.</b> Allow pop-ups for this site in the browser, then press Print again.
        </Note>
      ) : msg ? (
        <Note tone={msg.startsWith('Generated') ? 'g' : 'a'} role="status" className="mb-3.5">{msg}</Note>
      ) : null}

      {genResult && (
        <Note tone="a" role="alert" className="mb-3.5">
          <b>{genResult.saved.length} of {genResult.total} barcodes saved.</b>{' '}
          {genResult.saved.length > 0 && (
            <>
              {genResult.saved.slice(0, 3).map(({ p, code }) => `${p.name} now has ${code}`).join(', ')}
              {genResult.saved.length > 3 ? ` and ${genResult.saved.length - 3} more` : ''}.{' '}
            </>
          )}
          {genResult.failed.unsure
            ? <>{genResult.failed.name} could not be confirmed ({genResult.failed.reason || 'connection dropped'}). The list has been re-read from the shop, so it shows whether it saved.</>
            : <>{genResult.failed.name} did not save ({genResult.failed.reason || 'no reason given'}) and still has none.</>}
          {genResult.notTried > 0 && <> {plural(genResult.notTried, 'more product')} {genResult.notTried === 1 ? 'was' : 'were'} not tried.</>}
          {missingBarcodes > 0 && (
            <> <button type="button" onClick={openGenerate} className="font-tight font-semibold text-amber-text underline-offset-4 hover:underline">Try again</button></>
          )}
        </Note>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_520px]">
        {/* ── Left: product picker ── */}
        <div className="m-rise min-w-0" style={{ '--i': 1 }}>
          <div className={cn(card, 'overflow-hidden')}>
            <label className="m-3 flex items-center gap-2 rounded-pill bg-well py-2 pl-3.5 pr-3 text-[13px] text-mute">
              <Search size={15} aria-hidden="true" className="shrink-0" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, SKU or barcode"
                aria-label="Search name, SKU or barcode"
                className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-mute" />
            </label>
            {loading ? (
              <div className="border-t border-sep p-6 text-center text-[13px] text-mute">Loading products…</div>
            ) : filtered.length === 0 ? null : (
              <div className="max-h-[620px] overflow-y-auto">
                {filtered.map(p => {
                  const n = qty[p.id] || 0;
                  return (
                    <div key={p.id} className={cn('grid grid-cols-[minmax(0,1fr)_auto_46px] items-center gap-3 border-t border-sep px-4 py-2.5', n > 0 && 'bg-[#FFFBF4]')}>
                      <div className="min-w-0">
                        <b className="block truncate font-tight text-[13.5px] font-semibold text-ink">{p.name}</b>
                        <small className="block truncate text-[12px] tabular-nums text-mute">
                          {p.barcode ? p.barcode : <span className="text-bad-text">no barcode</span>} · {inr2(p.sellingPrice)} · stock {p.stock ?? 0}
                        </small>
                      </div>
                      <div className={cn('inline-flex h-[30px] items-center rounded-pill', n > 0 ? 'bg-amber-soft' : 'bg-well')}>
                        <button type="button" onClick={() => setCount(p.id, n - 1)} aria-label={`One label fewer for ${p.name}`}
                          className="m-press grid h-[30px] w-[30px] place-items-center rounded-pill text-ink-2"><Minus size={14} /></button>
                        <input type="number" value={n} aria-label={`Labels for ${p.name}`}
                          onChange={e => setCount(p.id, parseInt(e.target.value, 10) || 0)}
                          className="w-10 appearance-none bg-transparent text-center font-tight text-[13px] font-semibold tabular-nums text-ink outline-none [&::-webkit-inner-spin-button]:appearance-none" />
                        <button type="button" onClick={() => setCount(p.id, n + 1)} aria-label={`One label more for ${p.name}`}
                          className="m-press grid h-[30px] w-[30px] place-items-center rounded-pill text-ink-2"><Plus size={14} /></button>
                      </div>
                      {p.stock > 0 ? (
                        <button type="button" onClick={() => setCount(p.id, p.stock)} title="Set to stock count"
                          className="text-right font-tight text-[12px] font-semibold text-amber-text hover:underline">= stock</button>
                      ) : <span />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {!loading && filtered.length === 0 && (
            <EmptyCard icon={Package} title="No products found" className="mt-3">
              {products.length === 0 ? 'Add products in Inventory first.' : 'Clear the search to see every product.'}
            </EmptyCard>
          )}
        </div>

        {/* ── Right: template + preview ── */}
        <div className="m-rise flex min-w-0 flex-col gap-3" style={{ '--i': 2 }}>
          <div className={cn(card, 'p-4')}>
            <label htmlFor="label-template" className="mb-1.5 block font-tight text-[12px] font-semibold text-ink-2">Label template</label>
            <div className="relative">
              <select id="label-template" value={templateId} onChange={e => setTemplateId(e.target.value)}
                className="h-10 w-full appearance-none rounded-[10px] bg-surface pl-3 pr-9 text-[13.5px] text-ink shadow-[inset_0_0_0_1px_var(--color-line)] outline-none focus:shadow-[inset_0_0_0_2px_var(--color-ink)]">
                {LABEL_TEMPLATES.map(t => <option key={t.id} value={t.id}>{TEMPLATE_NAMES[t.id] || t.name}</option>)}
              </select>
              <ChevronDown size={14} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-mute" />
            </div>

            <div className="mt-3 rounded-xl border border-line">
              {Object.entries(fields).map(([k, f], i) => (
                <div key={k} className={cn('grid grid-cols-[20px_1fr_auto] items-center gap-2.5 px-3 py-2 text-[13px]', i > 0 && 'border-t border-sep', !f.on && 'text-mute')}>
                  <button type="button" role="checkbox" aria-checked={f.on} aria-label={`Show ${f.label}`}
                    onClick={() => setField(k, { on: !f.on })}
                    className={cn('m-press grid h-[18px] w-[18px] place-items-center rounded-[5px]', f.on ? 'bg-ink text-white' : 'bg-white shadow-[inset_0_0_0_1.5px_var(--color-faint)]')}>
                    {f.on && <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true"><path d="M2.5 6.2l2.2 2.2 4.8-4.9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </button>
                  <span>{f.label}</span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setField(k, { size: Math.max(3, +(f.size - 0.5).toFixed(1)) })} aria-label={`Smaller ${f.label}`}
                      className="m-press grid h-[26px] w-[26px] place-items-center rounded-[7px] font-tight text-[13px] font-semibold text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile">−</button>
                    <span className="min-w-8 text-center font-tight text-[12px] font-semibold tabular-nums text-ink">{f.size} pt</span>
                    <button type="button" onClick={() => setField(k, { size: Math.min(14, +(f.size + 0.5).toFixed(1)) })} aria-label={`Larger ${f.label}`}
                      className="m-press grid h-[26px] w-[26px] place-items-center rounded-[7px] font-tight text-[13px] font-semibold text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile">+</button>
                    <button type="button" onClick={() => setField(k, { bold: !f.bold })} aria-pressed={f.bold} aria-label={`Bold ${f.label}`}
                      className={cn('m-press grid h-[26px] w-[26px] place-items-center rounded-[7px] font-tight text-[13px] font-extrabold',
                        f.bold ? 'bg-ink text-white' : 'text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile')}>B</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2.5 flex items-center gap-2.5">
              <span className="text-[12px] text-mute">Saved on this computer only</span>
              <span className="flex-1" />
              <Button variant="secondary" size="xs" onClick={saveSettings}>{savedTick ? '✓ Saved' : 'Save settings'}</Button>
            </div>
          </div>

          <div className={cn(card, 'p-4')}>
            <Eyebrow>Label sample</Eyebrow>
            <SampleLabel />
            <Eyebrow className="mt-3.5">
              Page preview{totalLabels > 0 && pages.length > 0 && ` · ${plural(pages.length, 'page')}`}
            </Eyebrow>
            {totalLabels === 0 ? (
              <div className="flex flex-col items-center rounded-xl bg-tile px-3.5 py-[34px] text-[13px] text-body">
                Pick products on the left to preview labels.
              </div>
            ) : (
              <div className="flex max-h-[560px] flex-col items-center overflow-auto rounded-xl bg-tile p-3.5">
                {/* first page only on screen, scaled */}
                <div
                  className="bg-white shadow-[0_1px_4px_rgba(17,20,24,0.15)]"
                  style={{
                    width: template.page.w * previewScale,
                    minHeight: template.page.h * previewScale,
                    padding: `${template.marginY * previewScale}px ${template.marginX * previewScale}px`,
                    display: 'grid',
                    gridTemplateColumns: `repeat(${template.cols}, ${template.label.w * previewScale}px)`,
                    gridAutoRows: `${template.label.h * previewScale}px`,
                    columnGap: template.gapX * previewScale,
                    rowGap: template.gapY * previewScale,
                    alignContent: 'start',
                  }}
                >
                  {(pages[0] || []).map(({ p, key }) => (
                    <PreviewCell key={key} p={p} />
                  ))}
                </div>
                {pages.length > 1 && (
                  <span className="mt-2 text-[12px] text-mute">+ {pages.length - 1} more page{pages.length === 2 ? '' : 's'} when printed{rollNote}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={!!genPlan} onClose={() => { if (!generating) setGenPlan(null); }}
        title={`Give ${plural(genPlan?.length || 0, 'product')} a barcode?`} subtitle="For products that have none yet"
        footer={<>
          <Button variant="secondary" onClick={() => setGenPlan(null)} disabled={generating}>Cancel</Button>
          <Button onClick={generateMissing} disabled={generating || !genPlan?.length}>
            <ScanBarcode aria-hidden="true" />
            {generating ? 'Generating…' : `Generate ${plural(genPlan?.length || 0, 'barcode')}`}
          </Button>
        </>}>
        <div className="max-h-[320px] space-y-1.5 overflow-y-auto">
          {(genPlan || []).map(({ p, code }) => (
            <div key={p.id} className="flex justify-between gap-3 rounded-[10px] bg-tile px-3 py-[9px] text-[13px]">
              <span className="truncate">{p.name}</span><span className="tabular-nums">{code}</span>
            </div>
          ))}
        </div>
        <p className="mt-2.5 text-[12px] text-mute">
          Shop-only numbers that start with 21, so they never clash with a maker's barcode. They are saved on the product and print on every label after this.
        </p>
      </Dialog>

      {/* Hidden full print sheet — innerHTML is cloned into the print popup */}
      <div ref={sheetRef} style={{ display: 'none' }}>
        <LabelSheet pages={pages} fields={fields} template={template} bizName={businessProfile?.name} />
      </div>
    </div>
  );
};

export default LabelPrinting;
