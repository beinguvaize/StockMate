import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import './invoiceModels.css';
import { buildInvoicePrintData, amt, rupees } from '../../lib/invoicePrintData';
import { resolvePrintFor, docTypeKeyFor, DEFAULT_MODEL_ACCENT, MODEL_TEXT_DEFAULTS } from '../../lib/printSettings';

/**
 * The four A4 invoice models (approved invoices-18 Classic, 19 Modern,
 * 20 Bold header, 21 Compact) and, through the shop's document rules, the
 * bill of supply (24) and the plain invoice of a shop with no GST
 * registration.
 *
 * Each model prints what lib/invoicePrintData hands it: stored figures and
 * the document rules. A model decides layout only. What the document is
 * called, whether tax is shown and which fields are locked on is never a
 * model's choice.
 */

// ── shared pieces ─────────────────────────────────────────────────────────

const Logo = ({ d }) => (d.show.logo && d.business.logo ? <img className="logo" src={d.business.logo} alt="" /> : null);

const ShopLines = ({ d, as: Tag = 'small', joinAddress = false }) => (
  <>
    <Tag>
      {d.business.address}
      {d.show.phone && (d.business.phone || d.business.email) && (
        <>{joinAddress ? ' · ' : <br />}{[d.business.phone, d.business.email].filter(Boolean).join(' · ')}</>
      )}
    </Tag>
    {(d.business.gstin || d.business.state) && (
      <Tag>
        {d.business.gstin && (d.show.gstin) && <>GSTIN <b>{d.business.gstin}</b></>}
        {d.business.gstin && d.show.gstin && d.business.state && ' · '}
        {d.business.state && <>State {d.business.state}</>}
      </Tag>
    )}
  </>
);

const BuyerTax = ({ d }) => (
  d.buyer.gstin ? <>GSTIN <b>{d.buyer.gstin}</b></> : (d.showTax ? <>GSTIN <b>Unregistered</b></> : null)
);

const Declaration = ({ d }) => (d.declaration ? <div className="decl">{d.declaration}</div> : null);

const Discount = ({ l }) => (
  l.discount !== null && l.discount > 0
    ? <>{amt(l.discount)}{l.discountPct ? <small>{l.discountPct}%</small> : null}</>
    : l.discountPct ? <>{l.discountPct}%</> : '–'
);

/** The item table. Columns follow the options and the document rules. */
const Items = ({ d, cls }) => {
  const s = d.show;
  return (
    <table className={`items ${cls}`}>
      <thead>
        <tr>
          <th className="c ix">#</th>
          <th>Description</th>
          {s.hsn && <th>HSN/SAC</th>}
          <th className="r">Qty</th>
          {s.unitCol && <th>Unit</th>}
          <th className="r">Rate</th>
          {s.discountCol && <th className="r">Discount</th>}
          {d.showTax ? <><th className="r">Taxable value</th><th className="r">GST</th></> : <th className="r">Amount</th>}
        </tr>
      </thead>
      <tbody>
        {d.lines.map((l, i) => (
          <tr key={i}>
            <td className="c ix">{i + 1}</td>
            <td><b>{l.name}</b>{s.desc && l.note ? <small>{l.note}</small> : null}</td>
            {s.hsn && <td>{l.hsn || '—'}</td>}
            <td className="r n">{l.qty}</td>
            {s.unitCol && <td>{l.unit}</td>}
            <td className="r n">{amt(l.rate)}</td>
            {s.discountCol && <td className="r n disc"><Discount l={l} /></td>}
            {d.showTax
              ? <><td className="r n">{amt(l.taxable)}</td><td className="r n">{l.taxRate}%</td></>
              : <td className="r n">{amt(l.total)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

/** Tax by rate, with the stored totals underneath. */
const TaxSummary = ({ d, cls = 'line' }) => {
  if (!d.showTax || d.show.taxSummary === 'off') return null;
  const inter = d.meta.isInterstate;
  const t = d.totals;
  return (
    <table className={`tsum ${cls}`}>
      <thead>
        <tr>
          <th>GST rate</th><th className="r">Taxable value</th>
          {inter ? <th className="r">IGST</th> : <><th className="r">{d.labels.cgst}</th><th className="r">{d.labels.sgst}</th></>}
          <th className="r">Total tax</th>
        </tr>
      </thead>
      <tbody>
        {d.rateSummary.map((r) => (
          <tr key={r.rate}>
            <td>{r.rate}%</td><td className="r n">{amt(r.taxable)}</td>
            {inter ? <td className="r n">{amt(r.igst)}</td> : <><td className="r n">{amt(r.cgst)}</td><td className="r n">{amt(r.sgst)}</td></>}
            <td className="r n">{amt(r.cgst + r.sgst + r.igst)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Total</td><td className="r n">{amt(t.taxable)}</td>
          {inter ? <td className="r n">{amt(t.igst)}</td> : <><td className="r n">{amt(t.cgst)}</td><td className="r n">{amt(t.sgst)}</td></>}
          <td className="r n">{amt(t.totalTax)}</td>
        </tr>
      </tfoot>
    </table>
  );
};

/** One line per rate, for the compact model. */
const TaxSlab = ({ d }) => {
  if (!d.showTax || d.show.taxSummary === 'off') return null;
  const inter = d.meta.isInterstate;
  return (
    <div className="slab">
      <i className="lb">Tax by rate</i>
      {d.rateSummary.map((r) => (inter
        ? `${r.rate}%: taxable ${amt(r.taxable)}, IGST ${amt(r.igst)}`
        : `${r.rate}%: taxable ${amt(r.taxable)}, ${d.labels.cgst} ${amt(r.cgst)}, ${d.labels.sgst} ${amt(r.sgst)}`)).join(' · ')}
      {` · total tax ${amt(d.totals.totalTax)}`}
    </div>
  );
};

const Totals = ({ d, cls = '' }) => {
  const t = d.totals;
  const inter = d.meta.isInterstate;
  return (
    <div className={`tots2 ${cls}`}>
      {d.showTax ? (
        <>
          <div><span>Taxable value</span><span className="n">{amt(t.taxable)}</span></div>
          {inter
            ? <div><span>IGST</span><span className="n">{amt(t.igst)}</span></div>
            : <>
                <div><span>{d.labels.cgst}</span><span className="n">{amt(t.cgst)}</span></div>
                <div><span>{d.labels.sgst}</span><span className="n">{amt(t.sgst)}</span></div>
              </>}
        </>
      ) : (
        <div><span>Value of goods</span><span className="n">{amt(t.taxable + t.totalTax)}</span></div>
      )}
      {Math.abs(t.roundOff) > 0.004 && <div><span>Round off</span><span className="n">{t.roundOff < 0 ? `−${amt(-t.roundOff)}` : amt(t.roundOff)}</span></div>}
      <div className="gt"><span>Total</span><span className="n">{rupees(t.payable)}</span></div>
      {t.paid > 0 && <div><span>Amount paid</span><span className="n">−{amt(t.paid)}</span></div>}
      {t.paid > 0 && <div className="bd"><span>Balance due</span><span className="n">{rupees(t.balance)}</span></div>}
      {d.show.partyBalance && Math.abs(t.previous) > 0.004 && (
        <>
          <div className="pv"><span>Previous balance</span><span className="n">{amt(t.previous)}</span></div>
          <div><span>Current balance</span><span className="n">{rupees(t.previous + t.payable)}</span></div>
        </>
      )}
    </div>
  );
};

const Words = ({ d, label = 'Amount in words' }) => (d.show.words ? <div className="words"><i className="lb">{label}</i>{d.amountWords}</div> : null);

const PayTo = ({ d }) => {
  const b = d.business;
  const bankOn = d.show.bank && (b.upi || b.bank.name || b.bank.account);
  if (!bankOn && !d.upiUri) return null;
  return (
    <div className="payb">
      {d.upiUri && (
        <div>
          <QRCodeSVG className="qr" value={d.upiUri} size={58} level="M" includeMargin={false} />
          <div className="qrcap">Scan {rupees(d.due)}</div>
        </div>
      )}
      {bankOn && (
        <div>
          <i className="lb">Pay to</i>
          {b.upi && <div>UPI <b>{b.upi}</b></div>}
          {(b.bank.name || b.bank.account || b.bank.ifsc) && (
            <div>{[b.bank.name, b.bank.account && `A/c ${b.bank.account}`, b.bank.ifsc && `IFSC ${b.bank.ifsc}`].filter(Boolean).join(' · ')}</div>
          )}
        </div>
      )}
    </div>
  );
};

const Terms = ({ d }) => (d.show.terms && d.terms.length ? (
  <div className="terms2"><i className="lb">Terms</i><ol>{d.terms.map((t, i) => <li key={i}>{t}</li>)}</ol></div>
) : null);

const Sign = ({ d }) => (d.show.sign ? (
  <div className="sig">
    <span>For {d.business.name}</span>
    {d.business.signature ? <img src={d.business.signature} alt="" /> : <i />}
    <b>{d.signLabel}</b>
  </div>
) : null);

const Custom = ({ d }) => (d.customFields.length ? (
  <div className="cfx">{d.customFields.map((f, i) => <span key={i}>{f.label}: <b>{f.value}</b></span>)}</div>
) : null);

const Foot = ({ d }) => (d.show.thanks && d.footer ? <div className="foot3">{d.footer}</div> : null);

// ── Model A, Classic GST ──────────────────────────────────────────────────

const ClassicModel = ({ d }) => (
  <>
    <div className="frame">
      <div className="ttl"><b>{d.title.toUpperCase()}</b><span>Original for recipient</span></div>
      <Declaration d={d} />
      <div className="g2 b">
        <div className="cell sel">
          <Logo d={d} />
          <div>
            <h4>{d.business.name}</h4>
            {d.business.address}
            {d.show.phone && (d.business.phone || d.business.email) && <><br />{[d.business.phone, d.business.email].filter(Boolean).join(' · ')}</>}
            {(d.business.gstin || d.business.state) && (
              <><br />{d.business.gstin && d.show.gstin && <>GSTIN <b>{d.business.gstin}</b>{d.business.state && ' · '}</>}{d.business.state && <>State {d.business.state}</>}</>
            )}
          </div>
        </div>
        <div className="cell meta">
          <div><i>{d.docKey === 'BILL_OF_SUPPLY' ? 'Bill no.' : 'Invoice no.'}</i><b>{d.meta.number}</b></div>
          <div><i>{d.docKey === 'BILL_OF_SUPPLY' ? 'Bill date' : 'Invoice date'}</i><b>{d.meta.date}</b></div>
          {d.meta.due && <div><i>Due date</i><b>{d.meta.due}</b></div>}
          {d.meta.placeOfSupply && <div><i>Place of supply</i><b>{d.meta.placeOfSupply}</b></div>}
          {d.showTax && <div><i>Reverse charge</i><b>{d.meta.reverseCharge}</b></div>}
          {d.meta.eway && <div><i>e-Way bill</i><b>{d.meta.eway}</b></div>}
        </div>
      </div>
      <div className="g2 b">
        <div className="cell">
          <i className="lb">Bill to</i><b className="nm">{d.buyer.name}</b>
          {d.show.clientAddr && d.buyer.address && <>{d.buyer.address}<br /></>}
          {d.show.phone && d.buyer.phone && <>{d.buyer.phone}<br /></>}
          <BuyerTax d={d} />{d.buyer.state && <>{(d.buyer.gstin || d.showTax) && ' · '}State {d.buyer.state}</>}
        </div>
        <div className="cell">
          <i className="lb">Ship to</i><b className="nm">{d.buyer.name}</b>
          {d.buyer.shipAddress && <>{d.buyer.shipAddress}<br /></>}
          {d.meta.vehicle && <>Vehicle {d.meta.vehicle}</>}
        </div>
      </div>
      {d.customFields.length > 0 && <div className="g2 b"><div className="cell" style={{ gridColumn: '1 / -1' }}><Custom d={d} /></div></div>}
      <Items d={d} cls="gridt" />
      <div className="g2 b">
        <div className="cell">
          {d.showTax && d.show.taxSummary !== 'off' && <><i className="lb">Tax summary</i><TaxSummary d={d} cls="gridt" /></>}
          <Words d={d} />
          <PayTo d={d} />
        </div>
        <div className="cell tcell"><Totals d={d} /></div>
      </div>
      <div className="g2 b last">
        <div className="cell"><Terms d={d} /></div>
        <div className="cell"><Sign d={d} /></div>
      </div>
    </div>
    <Foot d={d} />
  </>
);

// ── Model B, Modern minimal ───────────────────────────────────────────────

const ModernModel = ({ d }) => {
  const beside = d.show.taxSummary === 'beside';
  return (
    <>
      <header className="hd">
        <div className="brand">
          <Logo d={d} />
          <div><h4>{d.business.name}</h4><ShopLines d={d} /></div>
        </div>
        <div className="doct"><h1>{d.title}</h1><span>Original for recipient</span></div>
      </header>
      <Declaration d={d} />
      <div className="duebar">
        <div><i>Balance due</i><b className="n">{rupees(d.totals.balance)}</b></div>
        <div><i>Due date</i><b>{d.meta.due || '—'}</b></div>
        <div><i>{d.docKey === 'BILL_OF_SUPPLY' ? 'Bill no.' : 'Invoice no.'}</i><b>{d.meta.number}</b></div>
        <div><i>{d.docKey === 'BILL_OF_SUPPLY' ? 'Bill date' : 'Invoice date'}</i><b>{d.meta.date}</b></div>
      </div>
      <div className="parties">
        <div>
          <i className="lb">Bill to</i><b className="nm">{d.buyer.name}</b>
          {d.show.clientAddr && d.buyer.address && <>{d.buyer.address}<br /></>}
          {d.show.phone && d.buyer.phone && <>{d.buyer.phone}<br /></>}
          <BuyerTax d={d} />
        </div>
        <div>
          <i className="lb">Place of supply</i><b className="nm">{d.meta.placeOfSupply || '—'}</b>
          {d.showTax && <>Reverse charge: {d.meta.reverseCharge}</>}
        </div>
        <div>
          {(d.meta.eway || d.meta.vehicle) && (
            <><i className="lb">Transport</i>{d.meta.eway && <b className="nm">e-Way {d.meta.eway}</b>}{d.meta.vehicle && <>Vehicle {d.meta.vehicle}</>}</>
          )}
        </div>
      </div>
      <Custom d={d} />
      <Items d={d} cls="line" />
      <div className="lower">
        <div className="lft">
          {!beside && <TaxSummary d={d} />}
          <Words d={d} />
        </div>
        <div>
          {beside && <TaxSummary d={d} />}
          <Totals d={d} cls="mod" />
        </div>
      </div>
      <footer className="ft">
        <div><PayTo d={d} /></div>
        <div><Terms d={d} /></div>
        <div><Sign d={d} /></div>
      </footer>
      <Foot d={d} />
    </>
  );
};

// ── Model C, Bold header ──────────────────────────────────────────────────

const BoldModel = ({ d }) => {
  const beside = d.show.taxSummary === 'beside';
  return (
    <>
      <header className="band">
        <div className="brand">
          <Logo d={d} />
          <div><h4>{d.business.name}</h4><ShopLines d={d} /></div>
        </div>
        <div className="doct"><h1>{d.title.toUpperCase()}</h1><span>{d.meta.number} · {d.meta.date}</span><em>Original for recipient</em></div>
      </header>
      <Declaration d={d} />
      <div className="cards">
        <div className="cd">
          <i className="lb">Bill to</i><b className="nm">{d.buyer.name}</b>
          {d.show.clientAddr && d.buyer.address && <>{d.buyer.address}<br /></>}
          {d.show.phone && d.buyer.phone && <>{d.buyer.phone}<br /></>}
          <BuyerTax d={d} />{d.buyer.state && <>{(d.buyer.gstin || d.showTax) && ' · '}State {d.buyer.state}</>}
        </div>
        <div className="cd kv2">
          <div><i>Due date</i><b>{d.meta.due || '—'}</b></div>
          <div><i>Place of supply</i><b>{d.meta.placeOfSupply || '—'}</b></div>
          {d.showTax && <div><i>Reverse charge</i><b>{d.meta.reverseCharge}</b></div>}
          {d.meta.eway && <div><i>e-Way bill</i><b>{d.meta.eway}</b></div>}
          {d.meta.vehicle && <div><i>Vehicle</i><b>{d.meta.vehicle}</b></div>}
        </div>
      </div>
      <Custom d={d} />
      <Items d={d} cls="solid" />
      <div className="lower">
        <div className="lft">
          {!beside && <TaxSummary d={d} />}
          <Words d={d} />
          <PayTo d={d} />
        </div>
        <div>
          {beside && <TaxSummary d={d} />}
          <Totals d={d} cls="boldt" />
        </div>
      </div>
      <footer className="ft2">
        <div><Terms d={d} /></div>
        <div><Sign d={d} /></div>
      </footer>
      <Foot d={d} />
    </>
  );
};

// ── Model D, Compact ──────────────────────────────────────────────────────

const CompactModel = ({ d }) => (
  <>
    <header className="hd">
      <div>
        <Logo d={d} />
        <div>
          <h4>{d.business.name}</h4>
          {d.business.address}{d.show.phone && d.business.phone ? ` · ${d.business.phone}` : ''}
          {(d.business.gstin || d.business.state) && (
            <><br />{d.business.gstin && d.show.gstin && <>GSTIN <b>{d.business.gstin}</b>{d.business.state && ' · '}</>}{d.business.state && <>State {d.business.state}</>}</>
          )}
        </div>
      </div>
      <div className="doct"><b>{d.title.toUpperCase()}</b> · Original for recipient</div>
    </header>
    <Declaration d={d} />
    <div className="mline">
      <span><i>No.</i> <b>{d.meta.number}</b></span>
      <span><i>Date</i> <b>{d.meta.date}</b></span>
      {d.meta.due && <span><i>Due</i> <b>{d.meta.due}</b></span>}
      {d.meta.placeOfSupply && <span><i>Place of supply</i> <b>{d.meta.placeOfSupply}</b></span>}
      {d.showTax && <span><i>Reverse charge</i> <b>{d.meta.reverseCharge}</b></span>}
      {d.meta.eway && <span><i>e-Way</i> <b>{d.meta.eway}</b></span>}
      {d.meta.vehicle && <span><i>Vehicle</i> <b>{d.meta.vehicle}</b></span>}
    </div>
    <div className="mline to">
      <span>
        <i>Bill to</i> <b>{d.buyer.name}</b>
        {d.show.clientAddr && d.buyer.address && <>, {d.buyer.address}</>}
        {(d.buyer.gstin || d.showTax) && <> · <BuyerTax d={d} /></>}
        {d.buyer.state && <> · State {d.buyer.state}</>}
      </span>
    </div>
    <Custom d={d} />
    <Items d={d} cls="dense" />
    <div className="cfoot">
      <div className="cl">
        <TaxSlab d={d} />
        <Words d={d} label="In words" />
        <PayTo d={d} />
        <Terms d={d} />
      </div>
      <div className="cr"><Totals d={d} cls="cmp2" /><Sign d={d} /></div>
    </div>
    <Foot d={d} />
  </>
);

const BODIES = {
  'model-classic': { Body: ClassicModel, cls: 'm-classic' },
  'model-modern': { Body: ModernModel, cls: 'm-modern' },
  'model-bold': { Body: BoldModel, cls: 'm-bold' },
  'model-compact': { Body: CompactModel, cls: 'm-compact' },
};

/** Build the print data for one invoice with one shop's settings. */
export function modelData({ invoice, business, client, printPrefs, docKey, overrides = {} }) {
  const base = resolvePrintFor(printPrefs, docKey || docTypeKeyFor(business));
  return buildInvoicePrintData({
    invoice, business, client,
    opts: overrides.opts ? { ...base.opts, ...overrides.opts } : base.opts,
    texts: overrides.texts ? { ...base.texts, ...overrides.texts } : base.texts,
    defaultTerms: MODEL_TEXT_DEFAULTS.invTerms,
    customFields: overrides.customFields || printPrefs?.customFields || [],
  });
}

/**
 * One invoice in one model. `printPrefs` is print_settings as stored;
 * `overrides` are the Customise page's unsaved choices (opts, texts, accent).
 */
export default function InvoiceModel({ model, invoice, business, client, printPrefs, docKey, overrides = {} }) {
  const entry = BODIES[model] || BODIES['model-modern'];
  const d = modelData({ invoice, business, client, printPrefs, docKey: docKey || undefined, overrides });
  const accent = overrides.accent || resolvePrintFor(printPrefs, d.docKey).accent || DEFAULT_MODEL_ACCENT;
  const { Body } = entry;
  return (
    <article className={`im ${entry.cls}`} style={{ '--acc': accent }} data-model={model} data-doc={d.docKey}>
      <Body d={d} />
    </article>
  );
}

export const INVOICE_MODEL_BODIES = Object.keys(BODIES);
