// Turns the on-screen invoice template into a real A4 PDF.
//
// The template is rendered off screen exactly as the viewer shows it
// (InvoiceTemplate in previewMode, so no toolbar), painted to a canvas with
// html2canvas-pro, cut into A4 pages at row boundaries (planPdfPages) and
// written as JPEG pages with jsPDF. Print, the phone, WhatsApp and email all
// get the same layout because they all come from the same template.
//
// The PDF libraries are imported on first use, so the app's main bundle does
// not carry them.

import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { planPdfPages, lastInkRow } from './invoiceShare';

const A4_W_MM = 210;
const A4_H_MM = 297;
const SHEET_PX = 794;           // 210 mm at 96 css px per inch
const SCALE = 2;                // sharp enough to read and print, small enough to send
const JPEG_QUALITY = 0.82;
const TOP_MARGIN_MM = 8;        // breathing room at the top of page 2 onwards

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

async function waitForPaint(root, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  // The template mounts synchronously, but give React and layout two frames.
  await nextFrame(); await nextFrame();
  while (!root.querySelector('.inv-sheet') && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
  }
  const imgs = [...root.querySelectorAll('img')];
  await Promise.race([
    Promise.all(imgs.map((img) => (img.complete ? Promise.resolve() : img.decode().catch(() => {})))),
    new Promise((r) => setTimeout(r, Math.max(0, deadline - Date.now()))),
  ]);
  if (document.fonts?.ready) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
  await nextFrame();
}

// y positions (css px from the sheet top) where cutting a page is clean.
function cleanBreaks(sheet) {
  const top = sheet.getBoundingClientRect().top;
  const ys = [];
  sheet.querySelectorAll('tr, .inv-sheet > div > div, .inv-sheet > div, [data-pdf-break]').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.height > 0) ys.push(r.bottom - top);
  });
  return ys;
}

// The last row of the canvas with anything on it, read in strips from the
// bottom so a long invoice is not copied out in one piece.
function bottomOfInk(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const strip = 256;
  for (let end = canvas.height; end > 0; end -= strip) {
    const start = Math.max(0, end - strip);
    const { data } = ctx.getImageData(0, start, canvas.width, end - start);
    const row = lastInkRow(data, canvas.width, end - start);
    if (row >= 0) return start + row + 1;
  }
  return canvas.height;
}

/**
 * @returns {Promise<{ blob: Blob, pages: number, bytes: number }>}
 */
export async function renderInvoicePdf({ invoice, businessProfile, client, title = 'Invoice' }) {
  if (!invoice) throw new Error('No invoice to turn into a PDF');

  const [tplMod, h2cMod, pdfMod] = await Promise.all([
    import('../components/invoice/InvoiceTemplate'),
    import('html2canvas-pro'),
    import('jspdf'),
  ]).catch((e) => { throw new Error(`Could not load the PDF tools: ${e?.message || e}`); });
  const InvoiceTemplate = tplMod.default;
  const html2canvas = h2cMod.default;
  const { jsPDF } = pdfMod;

  // Off screen but laid out (display:none would not paint).
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.setAttribute('data-invoice-pdf-host', 'true');
  Object.assign(host.style, {
    position: 'fixed', left: '-12000px', top: '0', width: `${SHEET_PX + 20}px`,
    background: '#fff', pointerEvents: 'none', zIndex: '-1',
  });
  document.body.appendChild(host);
  const root = createRoot(host);

  try {
    flushSync(() => {
      root.render(React.createElement(InvoiceTemplate, {
        invoice, businessProfile: businessProfile || {}, client: client || undefined,
        previewMode: true, onClose: () => {},
      }));
    });
    await waitForPaint(host);
    const sheet = host.querySelector('.inv-sheet');
    if (!sheet) throw new Error('The invoice layout did not appear');
    sheet.style.transform = 'none';
    sheet.style.boxShadow = 'none';
    // Lay it out the way it prints: no A4 minimum height and no blank filler
    // rows (the template's own print CSS does the same), so a short invoice is
    // one page and a long one is not padded.
    sheet.style.minHeight = '0';
    host.querySelectorAll('.print-empty-row, .print-hidden').forEach((el) => { el.style.display = 'none'; });
    await nextFrame();

    const cssW = sheet.offsetWidth || SHEET_PX;
    const cssH = sheet.scrollHeight;
    const canvas = await html2canvas(sheet, {
      scale: SCALE, useCORS: true, backgroundColor: '#ffffff', logging: false,
      width: cssW, height: cssH, windowWidth: cssW + 20, windowHeight: cssH, scrollX: 0, scrollY: 0,
    }).catch((e) => { throw new Error(`Could not draw the invoice: ${e?.message || e}`); });
    if (!canvas.width || !canvas.height) throw new Error('The invoice drew as an empty picture');

    const pxPerCss = canvas.width / cssW;
    const pageHpx = Math.floor(canvas.width * (A4_H_MM / A4_W_MM));
    const marginPx = Math.round(canvas.width * (TOP_MARGIN_MM / A4_W_MM));
    // Blank space under the last line is not content: it must not start a page.
    const inkBottom = bottomOfInk(canvas);
    const pages = planPdfPages({
      contentHeight: Math.min(canvas.height, inkBottom + Math.round(6 * pxPerCss)),
      pageHeight: pageHpx,
      breaks: cleanBreaks(sheet).map((y) => y * pxPerCss),
      topMargin: marginPx,
    });
    if (!pages.length) throw new Error('The invoice has no pages');

    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    doc.setProperties({ title: `${title} ${invoice.invoice_number || ''}`.trim(), creator: 'bookledger' });
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    const ctx = slice.getContext('2d');
    const mmPerPx = A4_W_MM / canvas.width;

    pages.forEach((p, i) => {
      const h = p.end - p.start;
      slice.height = h;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, slice.width, h);
      ctx.drawImage(canvas, 0, p.start, canvas.width, h, 0, 0, canvas.width, h);
      const data = slice.toDataURL('image/jpeg', JPEG_QUALITY);
      if (i > 0) doc.addPage('a4', 'portrait');
      doc.addImage(data, 'JPEG', 0, i === 0 ? 0 : TOP_MARGIN_MM, A4_W_MM, h * mmPerPx, undefined, 'FAST');
    });

    const blob = doc.output('blob');
    return { blob, pages: pages.length, bytes: blob.size };
  } finally {
    root.unmount();
    host.remove();
  }
}
