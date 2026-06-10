import React from 'react';

// Alternative A4 tax-invoice layouts (structurally distinct designs).
// Each receives a prepared data pack `d` from InvoiceTemplate plus the
// customizable texts. `editable` turns the marked texts contentEditable
// (used by Settings → Printing document designer); production prints render
// the same markup as plain text.

export const Editable = ({ on, value, onChange, className = '', style }) =>
  on ? (
    <span
      contentEditable
      suppressContentEditableWarning
      className={`${className} outline-none ring-1 ring-amber-300/70 bg-amber-50/40 rounded-[2px] px-0.5 cursor-text`}
      style={style}
      onBlur={e => onChange?.(e.currentTarget.textContent.trim())}
    >{value}</span>
  ) : (
    <span className={className} style={style}>{value}</span>
  );

const money = (n) => `₹${Number(n || 0).toFixed(2)}`;

export const DEFAULT_INV_OPTS = {
  logo: true, gstin: true, hsn: true, clientAddr: true, phone: true,
  words: true, terms: true, sign: true, upiQr: true,
};
export const ACCENT_SWATCHES = ['#0f172a', '#166534', '#0e7490', '#7e22ce', '#b91c1c', '#4f46e5', '#b45309', '#c2410c'];

const TotalsRows = ({ d, labelCls = 'text-slate-500', valCls = '' }) => (
  <>
    <div className="flex justify-between py-0.5"><span className={labelCls}>Taxable Amount</span><span className={valCls}>{money(d.totals.taxable)}</span></div>
    {d.isInterstate ? (
      <div className="flex justify-between py-0.5"><span className={labelCls}>IGST</span><span className={valCls}>{money(d.totals.igst)}</span></div>
    ) : (
      <>
        <div className="flex justify-between py-0.5"><span className={labelCls}>CGST</span><span className={valCls}>{money(d.totals.cgst)}</span></div>
        <div className="flex justify-between py-0.5"><span className={labelCls}>SGST</span><span className={valCls}>{money(d.totals.sgst)}</span></div>
      </>
    )}
    {Math.abs(d.totals.roundOff) > 0.004 && (
      <div className="flex justify-between py-0.5"><span className={labelCls}>Round Off</span><span className={valCls}>{money(d.totals.roundOff)}</span></div>
    )}
  </>
);

const ItemsTable = ({ d, headCls, rowBorder, cellPad = 'py-1.5 px-2', opts = DEFAULT_INV_OPTS }) => (
  <table className="w-full text-[10px]">
    <thead>
      <tr className={headCls}>
        {['#', 'Item', ...(opts.hsn ? ['HSN'] : []), 'Qty', 'Rate', 'GST%', 'Amount'].map((h) => (
          <th key={h} className={`${cellPad} font-bold ${['Qty','Rate','GST%','Amount'].includes(h) ? 'text-right' : h === 'HSN' ? 'text-center' : 'text-left'}`}>{h}</th>
        ))}
      </tr>
    </thead>
    <tbody>
      {d.items.map((it, i) => (
        <tr key={i} className={rowBorder}>
          <td className={cellPad}>{i + 1}</td>
          <td className={`${cellPad} font-semibold`}>{it.name}</td>
          {opts.hsn && <td className={`${cellPad} text-center`}>{it.hsn_code}</td>}
          <td className={`${cellPad} text-right`}>{it.qty} {it.unit}</td>
          <td className={`${cellPad} text-right`}>{money(it.rate)}</td>
          <td className={`${cellPad} text-right`}>{it.taxRate}%</td>
          <td className={`${cellPad} text-right font-semibold`}>{money(it.total)}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const FooterTexts = ({ texts, editable, onEdit, center = false }) => (
  <div className={`mt-auto pt-4 text-[9px] text-slate-500 ${center ? 'text-center' : ''}`}>
    <div className="font-bold uppercase tracking-widest mb-0.5 text-slate-400">Terms &amp; Conditions</div>
    <Editable on={editable} value={texts.invTerms} onChange={v => onEdit?.('invTerms', v)} className="block whitespace-pre-wrap" />
    <div className={`mt-3 text-[10px] font-semibold text-slate-700 ${center ? '' : 'text-center'}`}>
      <Editable on={editable} value={texts.invFooter} onChange={v => onEdit?.('invFooter', v)} />
    </div>
  </div>
);

const SignBlock = ({ d }) => (
  <div className="text-right mt-6">
    <div className="text-[10px] font-bold">For {d.business.name || 'Business'}</div>
    <div className="h-10" />
    <div className="border-t border-slate-400 pt-1 inline-block min-w-[48mm] text-center">
      <span className="text-[9px] font-bold text-slate-500">Authorised Signatory</span>
    </div>
  </div>
);

// ── Modern — logo-left banner, soft gray table, totals card ─────────────────
const ModernLayout = ({ d, texts, editable, onEdit, opts = DEFAULT_INV_OPTS, accent = '#0f172a' }) => (
  <div className="flex flex-col h-full text-slate-900">
    <div className="flex items-start justify-between pb-4 border-b-4" style={{ borderColor: accent }}>
      <div className="flex items-center gap-3">
        {opts.logo && d.business.logo_url && <img src={d.business.logo_url} alt="" className="h-12 object-contain" />}
        <div>
          <div className="text-[18px] font-extrabold leading-tight">{d.business.name}</div>
          <div className="text-[9px] text-slate-500 max-w-[80mm]">{d.business.address}</div>
          <div className="text-[9px] text-slate-500">
            {opts.phone && d.business.phone && <>Ph: {d.business.phone} · </>}
            {opts.gstin && d.business.gst_no && <>GSTIN: {d.business.gst_no}</>}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-[22px] font-extrabold tracking-tight" style={{ color: accent }}>TAX INVOICE</div>
        <div className="text-[10px] text-slate-500"># {d.invoice.invoice_no}</div>
        <div className="text-[10px] text-slate-500">{d.invoice.dateStr}</div>
      </div>
    </div>

    <div className="flex justify-between py-3 text-[10px]">
      <div>
        <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Billed To</div>
        <div className="font-bold text-[11px]">{d.client.name}</div>
        {opts.clientAddr && <div className="text-slate-500">{d.client.address}</div>}
        {opts.phone && <div className="text-slate-500">{d.client.contact}</div>}
      </div>
      <div className="text-right text-slate-500">
        <div>Place of Supply: {d.client.state || '—'}</div>
        <div>{d.isInterstate ? 'Interstate (IGST)' : 'Intrastate (CGST + SGST)'}</div>
      </div>
    </div>

    <ItemsTable d={d} opts={opts} headCls="bg-slate-100 text-slate-700" rowBorder="border-b border-slate-100" />

    <div className="flex justify-end mt-3">
      <div className="w-[70mm] text-[10px] bg-slate-50 rounded p-3">
        <TotalsRows d={d} />
        <div className="flex justify-between border-t-2 mt-1.5 pt-1.5 text-[12px] font-extrabold" style={{ borderColor: accent, color: accent }}>
          <span>Grand Total</span><span>{money(d.totals.grand)}</span>
        </div>
        {opts.words && <div className="text-[8.5px] text-slate-500 mt-1">{d.amountWords}</div>}
      </div>
    </div>

    {opts.terms && <FooterTexts texts={texts} editable={editable} onEdit={onEdit} />}
    {opts.sign && <SignBlock d={d} />}
  </div>
);

// ── Compact — dense, rule-lines only, fits long bills ───────────────────────
const CompactLayout = ({ d, texts, editable, onEdit, opts = DEFAULT_INV_OPTS, accent = '#0f172a' }) => (
  <div className="flex flex-col h-full text-slate-900">
    <div className="flex justify-between items-baseline border-b-2 border-slate-900 pb-1.5">
      <div className="text-[13px] font-extrabold uppercase">{d.business.name}</div>
      <div className="text-[10px] font-bold">TAX INVOICE · #{d.invoice.invoice_no} · {d.invoice.dateStr}</div>
    </div>
    <div className="flex justify-between text-[8.5px] text-slate-500 py-1 border-b border-slate-300">
      <span>{d.business.address} {opts.gstin && d.business.gst_no && <>· GSTIN {d.business.gst_no}</>}</span>
      <span>To: <b className="text-slate-800">{d.client.name}</b> {d.client.state && <>({d.client.state})</>}</span>
    </div>

    <ItemsTable d={d} opts={opts} headCls="border-b-2 border-slate-900" rowBorder="border-b border-slate-200" cellPad="py-1 px-1.5" />

    <div className="flex justify-between items-start border-t-2 border-slate-900 mt-1 pt-1.5 text-[10px]">
      <div className="text-[8.5px] text-slate-500 max-w-[95mm]">{opts.words ? d.amountWords : ''}</div>
      <div className="w-[62mm]">
        <TotalsRows d={d} />
        <div className="flex justify-between font-extrabold text-[11.5px] border-t border-slate-900 mt-1 pt-1">
          <span>TOTAL</span><span>{money(d.totals.grand)}</span>
        </div>
      </div>
    </div>

    {opts.terms && <FooterTexts texts={texts} editable={editable} onEdit={onEdit} />}
    {opts.sign && <SignBlock d={d} />}
  </div>
);

// ── Letterhead — centered identity, airy, boutique ──────────────────────────
const LetterheadLayout = ({ d, texts, editable, onEdit, opts = DEFAULT_INV_OPTS, accent = '#0f172a' }) => (
  <div className="flex flex-col h-full text-slate-900">
    <div className="text-center pb-4">
      {opts.logo && d.business.logo_url && <img src={d.business.logo_url} alt="" className="h-12 object-contain mx-auto mb-2" />}
      <div className="text-[20px] font-extrabold tracking-wide uppercase" style={{ color: accent }}>{d.business.name}</div>
      <div className="text-[9px] text-slate-500">{d.business.address}</div>
      <div className="text-[9px] text-slate-500">
        {opts.phone && d.business.phone && <>Ph: {d.business.phone}</>} {opts.gstin && d.business.gst_no && <> · GSTIN: {d.business.gst_no}</>}
      </div>
    </div>
    <div className="border-t-2 border-b py-1.5 flex justify-between text-[10px] font-bold" style={{ borderColor: accent }}>
      <span>TAX INVOICE</span>
      <span># {d.invoice.invoice_no}</span>
      <span>{d.invoice.dateStr}</span>
    </div>

    <div className="py-3 text-[10px] flex justify-between">
      <div>
        <span className="text-slate-400 font-bold uppercase text-[8.5px] tracking-widest">Billed to </span>
        <span className="font-bold">{d.client.name}</span>
        <span className="text-slate-500"> · {d.client.address}</span>
      </div>
      <span className="text-slate-500">{d.isInterstate ? 'IGST' : 'CGST + SGST'}</span>
    </div>

    <ItemsTable d={d} opts={opts} headCls="border-y border-slate-900 text-slate-600" rowBorder="border-b border-slate-100" />

    <div className="flex justify-end mt-3">
      <div className="w-[68mm] text-[10px]">
        <TotalsRows d={d} />
        <div className="flex justify-between border-y-2 my-1.5 py-1.5 text-[12px] font-extrabold" style={{ borderColor: accent, color: accent }}>
          <span>Grand Total</span><span>{money(d.totals.grand)}</span>
        </div>
        {opts.words && <div className="text-[8.5px] text-slate-500">{d.amountWords}</div>}
      </div>
    </div>

    {opts.terms && <FooterTexts texts={texts} editable={editable} onEdit={onEdit} center />}
    {opts.sign && <SignBlock d={d} />}
  </div>
);

export const INVOICE_LAYOUTS = {
  modern: ModernLayout,
  compact: CompactLayout,
  letterhead: LetterheadLayout,
};

export const INVOICE_LAYOUT_META = [
  { id: 'classic',    name: 'Classic GST',  blurb: 'Bordered grid, dense compliance layout' },
  { id: 'modern',     name: 'Modern',       blurb: 'Logo banner, soft table, totals card' },
  { id: 'compact',    name: 'Compact',      blurb: 'Dense rule-lines, fits long bills' },
  { id: 'letterhead', name: 'Letterhead',   blurb: 'Centered identity, airy boutique look' },
];

export const RECEIPT_META = [
  { id: 'classic', name: 'Classic', blurb: 'Dashed mono receipt' },
  { id: 'compact', name: 'Compact', blurb: 'Tight, solid rules' },
  { id: 'bold',    name: 'Bold',    blurb: 'Big header, inverse total' },
];

export const DEFAULT_DOC_TEXTS = {
  invTerms: 'Goods once sold will not be taken back or exchanged. Payment due within agreed credit period. Subject to local jurisdiction.',
  invFooter: 'Thank you for your business!',
  rcptFooter: 'Thank you! Visit again.',
};
