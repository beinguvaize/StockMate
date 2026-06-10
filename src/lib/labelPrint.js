// Label printing engine — templates + barcode helpers for Utilities → Labels.
// Printing uses a popup window with @page CSS at exact mm so thermal label
// printers (TVS/TSC/Citizen via their driver) and A4 laser sheets both work
// without ZPL. Same popup pattern as purchases printVoucher.

// ── Templates ────────────────────────────────────────────────────────────────
// cols/rows describe one printed page. Thermal rolls repeat pages; A4 sheets
// are a fixed grid. All dims in mm.
export const LABEL_TEMPLATES = [
  {
    id: 'T38x2', name: '38×25mm — thermal roll, 2-up', kind: 'thermal',
    page: { w: 78, h: 25 }, label: { w: 38, h: 25 }, cols: 2, rows: 1, gapX: 2, gapY: 0,
    marginX: 0, marginY: 0,
  },
  {
    id: 'T38', name: '38×25mm — thermal roll, 1-up', kind: 'thermal',
    page: { w: 38, h: 25 }, label: { w: 38, h: 25 }, cols: 1, rows: 1, gapX: 0, gapY: 0,
    marginX: 0, marginY: 0,
  },
  {
    id: 'T50', name: '50×25mm — thermal roll', kind: 'thermal',
    page: { w: 50, h: 25 }, label: { w: 50, h: 25 }, cols: 1, rows: 1, gapX: 0, gapY: 0,
    marginX: 0, marginY: 0,
  },
  {
    id: 'A4_65', name: 'A4 sheet — 65 labels (38.1×21.2)', kind: 'a4',
    page: { w: 210, h: 297 }, label: { w: 38.1, h: 21.2 }, cols: 5, rows: 13, gapX: 2.5, gapY: 0,
    marginX: 4.7, marginY: 10.7,
  },
  {
    id: 'A4_40', name: 'A4 sheet — 40 labels (52.5×29.7)', kind: 'a4',
    page: { w: 210, h: 297 }, label: { w: 52.5, h: 29.7 }, cols: 4, rows: 10, gapX: 0, gapY: 0,
    marginX: 0, marginY: 0,
  },
  {
    id: 'A4_24', name: 'A4 sheet — 24 labels (70×37.1)', kind: 'a4',
    page: { w: 210, h: 297 }, label: { w: 70, h: 37.1 }, cols: 3, rows: 8, gapX: 0, gapY: 0,
    marginX: 0, marginY: 0,
  },
];

// ── Barcode helpers ──────────────────────────────────────────────────────────

// EAN-13 check digit for a 12-digit body.
export const ean13CheckDigit = (body12) => {
  const d = body12.split('').map(Number);
  const sum = d.reduce((s, n, i) => s + n * (i % 2 === 0 ? 1 : 3), 0);
  return String((10 - (sum % 10)) % 10);
};

// Pick the right symbology for a stored barcode value.
export const barcodeFormat = (value) => {
  if (/^\d{13}$/.test(value)) return 'EAN13';
  if (/^\d{12}$/.test(value)) return 'EAN13'; // react-barcode computes check digit
  return 'CODE128';
};

// Generate an internal numeric barcode (Code-128 friendly, EAN-length).
// Prefix 21 = GS1 "restricted circulation" range used for in-store codes.
export const genInternalBarcode = (existingSet) => {
  for (let i = 0; i < 50; i++) {
    const body = '21' + String(Math.floor(Math.random() * 1e10)).padStart(10, '0');
    const code = body + ean13CheckDigit(body);
    if (!existingSet.has(code)) return code;
  }
  return '21' + String(Date.now()).slice(-11);
};

// ── Print ────────────────────────────────────────────────────────────────────

// labelsHTML: flat HTML string of .label cells (already rendered, barcodes as
// inline SVG). Opens a popup sized print document and fires print.
export const printLabels = (template, labelsHTML) => {
  const t = template;
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><title>Labels</title><style>
    @page { size: ${t.page.w}mm ${t.page.h}mm; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; }
    .sheet {
      width: ${t.page.w}mm; height: ${t.page.h}mm;
      padding: ${t.marginY}mm ${t.marginX}mm;
      display: grid;
      grid-template-columns: repeat(${t.cols}, ${t.label.w}mm);
      grid-auto-rows: ${t.label.h}mm;
      column-gap: ${t.gapX}mm; row-gap: ${t.gapY}mm;
      page-break-after: always;
      align-content: start;
    }
    .label {
      width: ${t.label.w}mm; height: ${t.label.h}mm;
      overflow: hidden; text-align: center;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      padding: 0.8mm 1mm;
    }
    .biz  { font-size: 5.4pt; font-weight: 700; letter-spacing: .2px; text-transform: uppercase; white-space: nowrap; overflow: hidden; max-width: 100%; }
    .name { font-size: 6.2pt; font-weight: 700; white-space: nowrap; overflow: hidden; max-width: 100%; }
    .sku  { font-size: 5pt; color: #222; }
    .bc svg { display: block; }
    .price { font-size: 7.5pt; font-weight: 800; }
    .tax  { font-size: 4.6pt; color: #333; }
  </style></head><body>${labelsHTML}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 350);
  return true;
};

// Chunk rendered label nodes into per-page sheets.
export const paginate = (cells, template) => {
  const per = template.cols * template.rows;
  const pages = [];
  for (let i = 0; i < cells.length; i += per) pages.push(cells.slice(i, i + per));
  return pages;
};
