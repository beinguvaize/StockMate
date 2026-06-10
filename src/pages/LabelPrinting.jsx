import React, { useEffect, useMemo, useRef, useState } from 'react';
import Barcode from 'react-barcode';
import { Printer, ScanBarcode, Search, Wand2, Minus, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTenant } from '../context/TenantContext';
import {
  LABEL_TEMPLATES, barcodeFormat, genInternalBarcode, printLabels, paginate,
} from '../lib/labelPrint';

// Utilities → Barcode & Labels.
// Pick products + qty → choose a label template + fields → preview → print.
// Barcodes render as SVG (react-barcode); print clones the hidden sheet HTML
// into a popup with exact-mm @page CSS (works on thermal + A4 printers).
const LabelPrinting = () => {
  const { currentTenantId, businessProfile } = useTenant();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [qty, setQty] = useState({});            // productId -> label count
  const [templateId, setTemplateId] = useState('T38x2');
  const [fields, setFields] = useState({ biz: true, name: true, price: true, sku: false, tax: true });
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState('');
  const sheetRef = useRef(null);

  const template = LABEL_TEMPLATES.find(t => t.id === templateId);

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
  const generateMissing = async () => {
    setGenerating(true);
    setMsg('');
    try {
      const taken = new Set(products.map(p => p.barcode).filter(Boolean));
      const missing = products.filter(p => !p.barcode);
      for (const p of missing) {
        const code = genInternalBarcode(taken);
        taken.add(code);
        const { error } = await supabase
          .from('products')
          .update({ barcode: code, barcode_type: 'EAN13' })
          .eq('id', p.id)
          .eq('tenant_id', currentTenantId);
        if (error) throw error;
      }
      await load();
      setMsg(`Generated barcodes for ${missing.length} product${missing.length === 1 ? '' : 's'}.`);
    } catch (e) {
      setMsg(`Generate failed: ${e.message || e}`);
    } finally {
      setGenerating(false);
    }
  };

  const handlePrint = () => {
    if (!sheetRef.current || totalLabels === 0) return;
    const ok = printLabels(template, sheetRef.current.innerHTML);
    if (!ok) setMsg('Popup blocked — allow popups for this site to print.');
  };

  // One label cell. Used for both on-screen preview and the hidden print sheet.
  const LabelCell = ({ p }) => (
    <div className="label">
      {fields.biz && businessProfile?.name && <div className="biz">{businessProfile.name}</div>}
      {fields.name && <div className="name">{p.name}</div>}
      {fields.sku && p.sku && <div className="sku">{p.sku}</div>}
      {p.barcode ? (
        <div className="bc">
          <Barcode
            value={p.barcode}
            format={barcodeFormat(p.barcode)}
            width={1}
            height={template.label.h >= 30 ? 34 : 22}
            fontSize={8}
            margin={0}
            displayValue
          />
        </div>
      ) : (
        <div className="sku">no barcode</div>
      )}
      {fields.price && (
        <div className="price">MRP ₹{Number(p.sellingPrice || 0).toFixed(2)}</div>
      )}
      {fields.tax && <div className="tax">Incl. of all taxes</div>}
    </div>
  );

  // Expanded cells: each product repeated qty times.
  const cells = selected.flatMap(p => Array.from({ length: qty[p.id] || 0 }, (_, i) => ({ p, key: `${p.id}-${i}` })));
  const pages = paginate(cells, template);

  // Screen preview scale: mm → px at ~3.2 px/mm capped to container.
  const previewScale = 3.2;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-black text-ink-primary flex items-center gap-2">
            <ScanBarcode size={20} className="text-accent-signature" /> Barcode &amp; Labels
          </h1>
          <p className="text-[12px] text-ink-tertiary">Generate product barcodes and print price labels — thermal rolls or A4 sticker sheets.</p>
        </div>
        <div className="flex items-center gap-2">
          {missingBarcodes > 0 && (
            <button
              onClick={generateMissing}
              disabled={generating}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-accent-signature/40 text-accent-signature text-[12px] font-bold hover:bg-accent-signature/10 disabled:opacity-60"
            >
              <Wand2 size={14} /> {generating ? 'Generating…' : `Generate ${missingBarcodes} missing barcode${missingBarcodes === 1 ? '' : 's'}`}
            </button>
          )}
          <button
            onClick={handlePrint}
            disabled={totalLabels === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-signature text-white text-[12px] font-black disabled:opacity-40"
          >
            <Printer size={14} /> Print {totalLabels > 0 ? `${totalLabels} label${totalLabels === 1 ? '' : 's'}` : ''}
          </button>
        </div>
      </div>

      {msg && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-accent-signature/10 border border-accent-signature/30 text-[12px] font-semibold text-ink-primary">
          {msg}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-5">
        {/* ── Left: product picker ── */}
        <div className="bg-white rounded-xl border border-black/5 shadow-sm">
          <div className="p-3 border-b border-black/5">
            <div className="flex items-center gap-2 bg-surface rounded-lg px-3">
              <Search size={14} className="text-ink-tertiary shrink-0" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search name, SKU or barcode…"
                className="flex-1 bg-transparent py-2.5 text-[13px] outline-none"
              />
            </div>
          </div>
          <div className="max-h-[520px] overflow-y-auto divide-y divide-black/5">
            {loading ? (
              <div className="p-6 text-center text-[12px] text-ink-tertiary">Loading products…</div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-[12px] text-ink-tertiary">No products found.</div>
            ) : filtered.map(p => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-ink-primary truncate">{p.name}</div>
                  <div className="text-[11px] text-ink-tertiary font-mono truncate">
                    {p.barcode || 'no barcode'} · ₹{Number(p.sellingPrice || 0).toFixed(2)} · stock {p.stock ?? 0}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => setCount(p.id, (qty[p.id] || 0) - 1)}
                    className="w-7 h-7 rounded-md border border-black/10 flex items-center justify-center hover:bg-surface">
                    <Minus size={12} />
                  </button>
                  <input
                    type="number"
                    value={qty[p.id] || 0}
                    onChange={e => setCount(p.id, parseInt(e.target.value, 10) || 0)}
                    className="w-14 text-center text-[13px] font-bold border border-black/10 rounded-md py-1 outline-none focus:border-accent-signature"
                  />
                  <button onClick={() => setCount(p.id, (qty[p.id] || 0) + 1)}
                    className="w-7 h-7 rounded-md border border-black/10 flex items-center justify-center hover:bg-surface">
                    <Plus size={12} />
                  </button>
                  {p.stock > 0 && (
                    <button onClick={() => setCount(p.id, p.stock)}
                      className="text-[10px] font-bold text-accent-signature px-1.5 hover:underline" title="Set to stock count">
                      =stock
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right: template + preview ── */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-black/5 shadow-sm p-4">
            <label className="block text-[10px] font-black uppercase tracking-wider text-ink-tertiary mb-1.5">Label template</label>
            <select
              value={templateId}
              onChange={e => setTemplateId(e.target.value)}
              className="w-full border border-black/10 rounded-lg px-3 py-2.5 text-[13px] font-semibold outline-none focus:border-accent-signature bg-white"
            >
              {LABEL_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>

            <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4">
              {[
                ['biz', 'Business name'],
                ['name', 'Product name'],
                ['price', 'MRP price'],
                ['sku', 'SKU'],
                ['tax', '"Incl. of all taxes"'],
              ].map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 text-[12px] font-semibold text-ink-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fields[k]}
                    onChange={e => setFields({ ...fields, [k]: e.target.checked })}
                    className="accent-[#D97706]"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-black/5 shadow-sm p-4">
            <div className="text-[10px] font-black uppercase tracking-wider text-ink-tertiary mb-2">
              Preview {pages.length > 0 && `· ${pages.length} page${pages.length === 1 ? '' : 's'}`}
            </div>
            {totalLabels === 0 ? (
              <div className="py-10 text-center text-[12px] text-ink-tertiary">
                Pick products on the left to preview labels.
              </div>
            ) : (
              <div className="overflow-auto max-h-[440px] rounded-lg bg-surface p-3">
                {/* first page only on screen, scaled */}
                <div
                  className="bg-white shadow border border-black/10 mx-auto"
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
                    <div key={key} className="overflow-hidden text-center flex flex-col items-center justify-center border border-dashed border-black/10"
                      style={{ padding: 2 }}>
                      {fields.biz && businessProfile?.name && <div className="text-[8px] font-bold uppercase truncate w-full">{businessProfile.name}</div>}
                      {fields.name && <div className="text-[9px] font-bold truncate w-full">{p.name}</div>}
                      {fields.sku && p.sku && <div className="text-[7px]">{p.sku}</div>}
                      {p.barcode ? (
                        <Barcode value={p.barcode} format={barcodeFormat(p.barcode)} width={1} height={template.label.h >= 30 ? 30 : 20} fontSize={8} margin={0} displayValue />
                      ) : <div className="text-[7px] text-red-500">no barcode</div>}
                      {fields.price && <div className="text-[10px] font-black">MRP ₹{Number(p.sellingPrice || 0).toFixed(2)}</div>}
                      {fields.tax && <div className="text-[6px]">Incl. of all taxes</div>}
                    </div>
                  ))}
                </div>
                {pages.length > 1 && (
                  <div className="text-center text-[11px] text-ink-tertiary mt-2">+ {pages.length - 1} more page{pages.length === 2 ? '' : 's'} when printed</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hidden full print sheet — innerHTML is cloned into the print popup */}
      <div ref={sheetRef} style={{ display: 'none' }}>
        {pages.map((page, pi) => (
          <div className="sheet" key={pi}>
            {page.map(({ p, key }) => <LabelCell key={key} p={p} />)}
          </div>
        ))}
      </div>
    </div>
  );
};

export default LabelPrinting;
