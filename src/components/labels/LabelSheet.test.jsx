import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Printed labels must come out of the printer exactly as before the redesign.
 *
 * The old print sheet lived inside LabelPrinting.jsx as closures. GoldenSheet
 * below is that code copied VERBATIM from the pre-redesign file (web-redesign
 * at 2acf116d, src/pages/LabelPrinting.jsx lines 135-161 and 393-398). The new
 * LabelSheet must render byte-for-byte the same markup for every template and
 * every field combination.
 *
 * react-barcode draws its bars in an effect, so on the server it renders an
 * empty <svg>. It is replaced here with a stub that writes every prop it was
 * given, so the comparison covers barcode value, symbology, bar width, bar
 * height, font size, margin and whether the digits print.
 */
vi.mock('react-barcode', () => ({
  default: (props) => <svg data-barcode={JSON.stringify(props)} />,
}));

globalThis.React = React;
const { default: Barcode } = await import('react-barcode');
const { LABEL_TEMPLATES, barcodeFormat, paginate, printLabels } = await import('../../lib/labelPrint');
const { default: LabelSheet } = await import('./LabelSheet.jsx');

// ── Verbatim copy of the pre-redesign print sheet ──────────────────────────
function GoldenSheet({ pages, fields, template, businessProfile }) {
  const fs = (k) => ({ fontSize: `${fields[k].size}pt`, fontWeight: fields[k].bold ? 800 : 500 });
  const LabelCell = ({ p }) => (
    <div className="label">
      {fields.biz.on && businessProfile?.name && <div className="biz" style={fs('biz')}>{businessProfile.name}</div>}
      {fields.name.on && <div className="name" style={fs('name')}>{p.name}</div>}
      {fields.sku.on && p.sku && <div className="sku" style={fs('sku')}>{p.sku}</div>}
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
      {fields.price.on && (
        <div className="price" style={fs('price')}>MRP ₹{Number(p.sellingPrice || 0).toFixed(2)}</div>
      )}
      {fields.tax.on && <div className="tax" style={fs('tax')}>Incl. of all taxes</div>}
    </div>
  );
  return (
    <div style={{ display: 'none' }}>
      {pages.map((page, pi) => (
        <div className="sheet" key={pi}>
          {page.map(({ p, key }) => <LabelCell key={key} p={p} />)}
        </div>
      ))}
    </div>
  );
}

const DEFAULT_FIELDS = {
  biz:   { on: true,  size: 6,  bold: true,  label: 'Business name' },
  name:  { on: true,  size: 7,  bold: true,  label: 'Product name' },
  sku:   { on: false, size: 5,  bold: false, label: 'SKU' },
  price: { on: true,  size: 8,  bold: true,  label: 'MRP price' },
  tax:   { on: true,  size: 4.5, bold: false, label: '"Incl. of all taxes"' },
};
const ALL_ON = Object.fromEntries(Object.entries(DEFAULT_FIELDS).map(([k, f]) => [k, { ...f, on: true, bold: !f.bold, size: f.size + 1.5 }]));
const ALL_OFF = Object.fromEntries(Object.entries(DEFAULT_FIELDS).map(([k, f]) => [k, { ...f, on: false }]));

const products = [
  { id: 'p1', name: 'Sample item one', sku: 'SKU-1', barcode: '2100000000012', sellingPrice: 142 },      // valid EAN-13
  { id: 'p2', name: 'Sample item two', sku: '', barcode: '210000000002', sellingPrice: '48.5' },         // 12 digits
  { id: 'p3', name: 'Sample item three', sku: 'SKU-3', barcode: 'ABC-123', sellingPrice: 0 },            // CODE128
  { id: 'p4', name: 'Sample item four', sku: 'SKU-4', barcode: null, sellingPrice: 799 },                // none
  { id: 'p5', name: 'Sample item five', barcode: '2100000000013', sellingPrice: undefined },             // bad check digit
];
const qty = { p1: 3, p2: 1, p3: 2, p4: 1, p5: 70 };
const cells = products.flatMap((p) => Array.from({ length: qty[p.id] || 0 }, (_, i) => ({ p, key: `${p.id}-${i}` })));

const golden = (template, fields, name) => renderToStaticMarkup(
  <GoldenSheet pages={paginate(cells, template)} fields={fields} template={template} businessProfile={name ? { name } : null} />);
const next = (template, fields, name) => renderToStaticMarkup(
  <div style={{ display: 'none' }}><LabelSheet pages={paginate(cells, template)} fields={fields} template={template} bizName={name} /></div>);

describe('label print sheet', () => {
  for (const t of LABEL_TEMPLATES) {
    for (const [fname, fields] of [['default', DEFAULT_FIELDS], ['all on', ALL_ON], ['all off', ALL_OFF]]) {
      for (const name of ['Sample Shop', '']) {
        it(`${t.id} · ${fname} fields · ${name ? 'with' : 'without'} shop name: identical to before`, () => {
          const a = golden(t, fields, name);
          expect(a).toContain('class="label"');
          expect(next(t, fields, name)).toBe(a);
        });
      }
    }
  }

  it('prints the barcode value, symbology and size the label always had', () => {
    const out = next(LABEL_TEMPLATES.find((t) => t.id === 'A4_24'), DEFAULT_FIELDS, 'Sample Shop');
    expect(out).toContain('&quot;value&quot;:&quot;2100000000012&quot;,&quot;format&quot;:&quot;EAN13&quot;,&quot;width&quot;:1,&quot;height&quot;:34');
    expect(out).toContain('&quot;value&quot;:&quot;ABC-123&quot;,&quot;format&quot;:&quot;CODE128&quot;');
    expect(out).toContain('&quot;value&quot;:&quot;2100000000013&quot;,&quot;format&quot;:&quot;CODE128&quot;');
    expect(out).toContain('MRP ₹142.00');
    expect(out).toContain('no barcode');
    const small = next(LABEL_TEMPLATES.find((t) => t.id === 'T38x2'), DEFAULT_FIELDS, 'Sample Shop');
    expect(small).toContain('&quot;height&quot;:22');
  });

  it('keeps every template at its printed size', () => {
    expect(LABEL_TEMPLATES.map((t) => [t.id, t.page.w, t.page.h, t.label.w, t.label.h, t.cols, t.rows, t.gapX, t.gapY, t.marginX, t.marginY])).toEqual([
      ['T38x2', 78, 25, 38, 25, 2, 1, 2, 0, 0, 0],
      ['T38', 38, 25, 38, 25, 1, 1, 0, 0, 0, 0],
      ['T50', 50, 25, 50, 25, 1, 1, 0, 0, 0, 0],
      ['A4_65', 210, 297, 38.1, 21.2, 5, 13, 2.5, 0, 4.7, 10.7],
      ['A4_40', 210, 297, 52.5, 29.7, 4, 10, 0, 0, 0, 0],
      ['A4_24', 210, 297, 70, 37.1, 3, 8, 0, 0, 0, 0],
    ]);
  });

  it('writes the popup page at the exact mm of the template', () => {
    let written = '';
    const fake = { document: { write: (s) => { written += s; }, close() {} }, focus() {}, print() {} };
    const orig = globalThis.window;
    globalThis.window = { open: () => fake };
    vi.useFakeTimers();
    try {
      const t = LABEL_TEMPLATES.find((x) => x.id === 'A4_65');
      expect(printLabels(t, '<div class="sheet"></div>')).toBe(true);
      expect(written).toContain('@page { size: 210mm 297mm; margin: 0; }');
      expect(written).toContain('padding: 10.7mm 4.7mm;');
      expect(written).toContain('grid-template-columns: repeat(5, 38.1mm);');
      expect(written).toContain('grid-auto-rows: 21.2mm;');
      expect(written).toContain('column-gap: 2.5mm; row-gap: 0mm;');
      expect(written).toContain('width: 38.1mm; height: 21.2mm;');
      expect(written).toContain('<body><div class="sheet"></div></body>');
      globalThis.window = { open: () => null };
      expect(printLabels(t, '')).toBe(false);
    } finally {
      vi.useRealTimers();
      globalThis.window = orig;
    }
  });
});
