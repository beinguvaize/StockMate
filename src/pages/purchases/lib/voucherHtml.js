// The printed purchase voucher.
//
// Rendered as a standalone document rather than a React subtree, because it
// goes into its own window where the app's CSS variables do not exist — every
// colour here is a literal on purpose. Layout follows the sample approved on
// 5 Aug (mockups/purchase-voucher.html): system sans, hairline rules, tabular
// numerals, no display face, so it reads as the same product as the reports.

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const money = (n, cur = '₹') =>
  `${cur}${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const plain = (n) =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const longDate = (d) => {
  const dt = new Date(`${String(d || '').slice(0, 10)}T00:00:00`);
  return Number.isNaN(dt.getTime())
    ? String(d || '—')
    : dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
};

const shortDate = (d) => {
  const dt = new Date(`${String(d || '').slice(0, 10)}T00:00:00`);
  return Number.isNaN(dt.getTime())
    ? String(d || '—')
    : dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export function voucherHtml(m, businessProfile = {}) {
  const cur = businessProfile.currencySymbol || '₹';
  const reg = m.registered;

  // Tax columns only exist when there is a tax invoice behind them.
  const head = reg
    ? `<th class="sn">#</th><th>Particulars</th><th>HSN</th><th class="ctr">Qty</th>
       <th class="num">Rate</th><th class="num">Taxable</th><th class="ctr">GST</th><th class="num">Amount</th>`
    : `<th class="sn">#</th><th>Particulars</th><th>HSN</th><th class="ctr">Qty</th>
       <th class="num">Rate</th><th class="num">Amount</th>`;

  const rows = m.items.map((it, i) => {
    const hsn = it.hsn
      ? `<td class="hsn">${esc(it.hsn)}</td>`
      : `<td class="hsn hsn-missing">—</td>`;
    const common = `
      <td class="sn">${i + 1}</td>
      <td><div class="item-name">${esc(it.name)}</div><div class="item-sub">Ref ${esc(it.ref)}</div></td>
      ${hsn}
      <td class="ctr">${plain(it.qty).replace(/\.00$/, '')} ${esc(it.unit)}</td>
      <td class="num">${plain(it.rate)}</td>`;
    return reg
      ? `<tr>${common}<td class="num">${plain(it.taxable)}</td><td class="ctr">${it.gstRate ?? 0}%</td><td class="num">${plain(it.amount)}</td></tr>`
      : `<tr>${common}<td class="num">${plain(it.amount)}</td></tr>`;
  }).join('');

  const sums = reg
    ? `<div class="row"><span>Taxable value</span><span>${plain(m.taxable)}</span></div>
       ${m.interstate
         ? `<div class="row sub"><span>IGST</span><span>${plain(m.igst)}</span></div>`
         : `<div class="row sub"><span>CGST</span><span>${plain(m.cgst)}</span></div>
            <div class="row"><span>SGST</span><span>${plain(m.sgst)}</span></div>`}`
    : `<div class="row"><span>Items (${m.items.length})</span><span>${plain(m.total)}</span></div>`;

  // Says what is missing, never what is unproven. A blank GSTIN is an absent
  // record, not evidence the supplier is unregistered.
  const callout = reg ? '' : `
    <div class="callout">
      No GSTIN on file for this supplier, so no tax split is shown and
      <b>input tax credit cannot be claimed</b> against this voucher yet.
      Add their GSTIN if they are registered — this is a missing record, not a
      statement that they are unregistered.
    </div>`;

  const itcNote = reg && m.tax > 0
    ? ` · input tax credit ${money(m.tax, cur)}`
    : '';

  return `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(m.voucherNo)}</title>
<style>
  :root{--ink:#14161a;--ink-2:#454b54;--ink-3:#767d87;--line:#e3e5e9;--line-2:#f0f1f3;
        --pos:#15803d;--pos-bg:#f0fdf4;--neg:#b91c1c;--neg-bg:#fef2f2;--warn:#92400e;--warn-bg:#fffbeb}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#eceae6;color:var(--ink);padding:28px 20px;
       font:400 13px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
       font-variant-numeric:tabular-nums;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .voucher{max-width:820px;margin:0 auto;background:#fff;border:1px solid var(--line);
           border-radius:10px;padding:26px 28px 22px}
  .head{display:flex;justify-content:space-between;align-items:flex-start;gap:24px}
  .biz-name{font-size:16px;font-weight:650;letter-spacing:-.01em;margin-bottom:3px}
  .biz-meta{font-size:11.5px;color:var(--ink-2);line-height:1.55;max-width:46ch}
  .biz-meta b{font-weight:600;color:var(--ink);white-space:nowrap}
  .doc{text-align:right;flex:none}
  .doc-kind{font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3);margin-bottom:6px}
  .doc-no{font-size:15px;font-weight:650;margin-bottom:2px}
  .doc-date{font-size:11.5px;color:var(--ink-2)}
  .rule{height:1px;background:var(--line);margin:18px 0}
  .band{display:grid;grid-template-columns:1.4fr 1fr;gap:28px}
  .lbl{font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin-bottom:5px}
  .party-name{font-size:13.5px;font-weight:600;margin-bottom:3px}
  .party-meta{font-size:11.5px;color:var(--ink-2);line-height:1.55}
  .terms{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;font-size:11.5px}
  .terms dt{color:var(--ink-3)}
  .terms dd{font-weight:600;text-align:right}
  table{width:100%;border-collapse:collapse;margin-top:16px}
  thead th{font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-3);
           text-align:left;padding:0 0 7px;border-bottom:1px solid var(--line);white-space:nowrap}
  tbody td{font-size:12.5px;padding:9px 0;border-bottom:1px solid var(--line-2);vertical-align:top}
  .num{text-align:right;white-space:nowrap}
  .ctr{text-align:center;white-space:nowrap}
  .sn{color:var(--ink-3);width:26px}
  .item-name{font-weight:550}
  .item-sub{font-size:10.5px;color:var(--ink-3);margin-top:2px}
  .hsn{font-size:11px;color:var(--ink-2)}
  .hsn-missing{color:var(--ink-3)}
  .foot{display:grid;grid-template-columns:1fr 300px;gap:28px;margin-top:16px}
  .words p{font-size:12px;font-weight:600;line-height:1.5;max-width:38ch}
  .sums{font-size:12.5px}
  .sums .row{display:flex;justify-content:space-between;padding:5px 0}
  .sums .row.sub{border-top:1px solid var(--line-2)}
  .sums .row span:first-child{color:var(--ink-2)}
  .sums .row span:last-child{font-weight:600}
  .grand{display:flex;justify-content:space-between;padding:9px 0 0;margin-top:5px;
         border-top:2px solid var(--ink);font-size:15px;font-weight:700}
  .paidline{display:flex;justify-content:space-between;padding:5px 0;font-size:12.5px}
  .paidline span:last-child{font-weight:600}
  .due-amt{color:var(--neg)}
  .chip{display:inline-block;font-size:10px;font-weight:650;letter-spacing:.05em;text-transform:uppercase;padding:3px 8px;border-radius:20px}
  .chip-paid{background:var(--pos-bg);color:var(--pos);border:1px solid #bbf7d0}
  .chip-due{background:var(--neg-bg);color:var(--neg);border:1px solid #fecaca}
  .callout{margin-top:14px;padding:9px 12px;border-radius:8px;background:var(--warn-bg);
           border:1px solid #fde68a;font-size:11.5px;color:var(--warn);line-height:1.5}
  .signs{display:grid;grid-template-columns:repeat(3,1fr);gap:28px;margin-top:34px}
  .sign{text-align:center}
  .sign .line{border-top:1px solid var(--line);padding-top:6px;font-size:10.5px;color:var(--ink-3)}
  .fineprint{margin-top:20px;padding-top:12px;border-top:1px solid var(--line-2);font-size:10px;
             color:var(--ink-3);display:flex;justify-content:space-between;gap:16px}
  @media print{
    @page{size:A4;margin:14mm}
    body{background:#fff;padding:0}
    .voucher{border:none;border-radius:0;padding:0;max-width:none}
    tbody tr{page-break-inside:avoid}
    thead{display:table-header-group}
  }
</style></head><body>
<div class="voucher">
  <div class="head">
    <div>
      <div class="biz-name">${esc(businessProfile.name || 'Purchase Voucher')}</div>
      <div class="biz-meta">
        ${businessProfile.address ? esc(businessProfile.address) + '<br>' : ''}
        ${businessProfile.phone ? 'Phone ' + esc(businessProfile.phone) : ''}
        ${businessProfile.gst_no ? ' · GSTIN <b>' + esc(businessProfile.gst_no) + '</b>' : ''}
      </div>
    </div>
    <div class="doc">
      <div class="doc-kind">Purchase Voucher</div>
      <div class="doc-no">${esc(m.voucherNo)}</div>
      <div class="doc-date">${esc(longDate(m.date))}</div>
    </div>
  </div>

  <div class="rule"></div>

  <div class="band">
    <div>
      <div class="lbl">Supplier</div>
      <div class="party-name">${esc(m.supplierName)}</div>
      <div class="party-meta">
        ${m.supplierAddress ? esc(m.supplierAddress) + '<br>' : ''}
        ${m.supplierPhone ? 'Phone ' + esc(m.supplierPhone) + '<br>' : ''}
        ${m.gstin ? 'GSTIN <b>' + esc(m.gstin) + '</b>' : 'GSTIN — <i>not on file</i>'}
      </div>
    </div>
    <div>
      <div class="lbl">Details</div>
      <dl class="terms">
        <dt>Supplier bill no.</dt><dd>${m.billNo ? esc(m.billNo) : 'Not provided'}</dd>
        <dt>Received on</dt><dd>${esc(shortDate(m.date))}</dd>
        <dt>Payment</dt><dd>${esc(m.paymentType)}</dd>
        <dt>Status</dt><dd><span class="chip ${m.settled ? 'chip-paid' : 'chip-due'}">${m.settled ? 'Paid' : 'Part paid'}</span></dd>
      </dl>
    </div>
  </div>

  <table>
    <thead><tr>${head}</tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="foot">
    <div class="words">
      <div class="lbl">Amount in words</div>
      <p>${esc(m.words)}</p>
      ${callout}
    </div>
    <div class="sums">
      ${sums}
      <div class="grand"><span>Total</span><span>${money(m.total, cur)}</span></div>
      ${m.paid > 0 ? `<div class="paidline" style="margin-top:8px"><span>Paid</span><span>${plain(m.paid)}</span></div>` : ''}
      <div class="paidline"><span>Balance due</span><span class="${m.due > 0.005 ? 'due-amt' : ''}">${plain(m.due)}</span></div>
    </div>
  </div>

  <div class="signs">
    <div class="sign"><div class="line">Received by</div></div>
    <div class="sign"><div class="line">Store / verified by</div></div>
    <div class="sign"><div class="line">For ${esc(businessProfile.name || '')}</div></div>
  </div>

  <div class="fineprint">
    <span>Purchase voucher · not a tax invoice${itcNote} · goods received in good condition</span>
    <span>${esc(m.voucherNo)}</span>
  </div>
</div>
<script>window.onload=()=>{window.print();}</script>
</body></html>`;
}
