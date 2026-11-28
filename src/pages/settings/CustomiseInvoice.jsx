import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock, Printer, RotateCcw, Upload, Plus, X } from 'lucide-react';
import './customiseInvoice.css';
import { useTenant } from '../../context/TenantContext';
import { uploadProductImage } from '../../lib/supabase';
import { documentRules } from '../../lib/gstDocument';
import {
  INVOICE_MODELS, isInvoiceModel, MODEL_ACCENTS, DOC_TYPE_TABS, docTypeKeyFor, lockedOptsFor,
  formValuesFor, defaultFormValues, countChanges, withDocTypeSaved,
} from '../../lib/printSettings';
import { sampleInvoice, SAMPLE_CLIENT } from '../../lib/sampleInvoice';
import InvoiceTemplate from '../../components/invoice/InvoiceTemplate';
import ScaledSheet from '../../components/invoices/ScaledSheet';
import WriteFailure from '../../components/invoices/WriteFailure';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Tabs } from '../../components/ui/Tabs';
import { Seg, Switch } from '../../components/documents/DocParts';
import { cn } from '../../lib/utils';

/**
 * Customise invoice (approved invoices-22 and 23).
 *
 * Options on the left, the live A4 preview on the right, one tab per
 * document type. Saved to business_profile.print_settings under docTypes
 * (lib/printSettings), so phone and web print the same. GST fields the
 * document type may not hide are shown locked, "Required by GST", from the
 * shop's document rules.
 *
 * Not built from the mockup, because nothing prints them today: font choice,
 * paper size (A5, thermal) and original / duplicate / triplicate copies.
 */

// Print settings as InvoiceTemplate reads them: the saved object, else the
// same-browser copy older saves left behind.
const readStored = (biz, tenantId) => {
  if (biz?.print_settings && typeof biz.print_settings === 'object') return biz.print_settings;
  try {
    return JSON.parse(localStorage.getItem(`print_settings_${tenantId || 'default'}`))
      || JSON.parse(localStorage.getItem('print_settings_default')) || {};
  } catch { return {}; }
};

// The shop as the preview should see it for a tab: the tab decides the
// document type, whatever the shop is registered as today.
const previewShop = (biz = {}, key) => {
  if (key === 'TAX_INVOICE') return { ...biz, gst_registration_type: 'REGULAR', gst_no: biz.gst_no || 'Your GSTIN', tax_mode: biz.tax_mode === 'NONE' ? 'EXCLUSIVE' : biz.tax_mode };
  if (key === 'BILL_OF_SUPPLY') return { ...biz, gst_registration_type: 'COMPOSITION', gst_no: biz.gst_no || 'Your GSTIN' };
  return { ...biz, gst_registration_type: 'UNREGISTERED' };
};

const SHOW = [
  ['logo', 'Logo'],
  ['phone', 'Shop phone and email'],
  ['discountCol', 'Discount column'],
  ['unitCol', 'Unit column'],
  ['desc', 'Item notes'],
  ['words', 'Amount in words'],
  ['taxSummary', 'Tax summary table'],
  ['bank', 'Bank details'],
  ['upiQr', 'UPI QR code', 'Customer scans to pay the balance due'],
  ['terms', 'Terms'],
  ['sign', 'Signature box'],
  ['thanks', '“Thank you” line'],
  ['partyBalance', 'Previous balance', 'Adds what the client already owes'],
];

const REQUIRED = {
  TAX_INVOICE: [
    'Your GSTIN and state', 'Invoice number and date', 'Buyer name, address and GSTIN', 'Place of supply',
    'HSN/SAC column', 'Taxable value', 'Tax rate and CGST/SGST amounts', 'Total',
  ],
};

const Group = ({ title, children, className }) => (
  <div className={cn('rounded-[14px] border border-line px-4 py-3.5', className)}>
    {title && <h5 className="mb-2.5 flex items-center gap-1.5 font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute">{title}</h5>}
    {children}
  </div>
);
const Lbl = ({ children, className, htmlFor }) => (
  <label htmlFor={htmlFor} className={cn('mb-1.5 block font-tight text-[12px] font-semibold text-ink-2', className)}>{children}</label>
);
const Hint = ({ children }) => <small className="mt-1.5 block text-[11.5px] leading-snug text-mute">{children}</small>;

const CustomiseInvoice = () => {
  const navigate = useNavigate();
  const { businessProfile, updateBusinessProfile, currentTenantId } = useTenant();
  const biz = businessProfile || {};
  const stored = useMemo(() => readStored(biz, currentTenantId), [biz, currentTenantId]);
  const shopKey = docTypeKeyFor(biz);

  const [tab, setTab] = useState(shopKey);
  const saved = useMemo(() => formValuesFor(stored, tab), [stored, tab]);
  const [form, setForm] = useState(saved);
  const [customFields, setCustomFields] = useState(() => (Array.isArray(stored.customFields) ? stored.customFields : []));
  // Back to what is stored when the tab changes or a save lands; not when
  // something else on the profile changes (a signature upload keeps the form).
  const savedKey = JSON.stringify(saved);
  useEffect(() => { setForm(saved); }, [savedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const [zoom, setZoom] = useState(null);           // null = fit the column
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const [justSaved, setJustSaved] = useState(false);
  const [testPage, setTestPage] = useState(false);
  const [sigBusy, setSigBusy] = useState(false);
  const [sigErr, setSigErr] = useState(null);

  const savedFields = Array.isArray(stored.customFields) ? stored.customFields : [];
  const changes = countChanges(form, saved) + (JSON.stringify(customFields) === JSON.stringify(savedFields) ? 0 : 1);
  const locked = lockedOptsFor(tab);
  const rulesForTab = documentRules(previewShop(biz, tab));
  const opts = { ...form.invOpts, ...locked };
  const legacy = !isInvoiceModel(form.invoiceTemplate);
  const modelName = INVOICE_MODELS.find((m) => m.id === form.invoiceTemplate)?.name || 'Your current design';

  const setOpt = (k, v) => setForm((f) => ({ ...f, invOpts: { ...f.invOpts, [k]: v } }));
  const setText = (k, v) => setForm((f) => ({ ...f, docTexts: { ...f.docTexts, [k]: v } }));

  const shop = previewShop(biz, tab);
  const sample = useMemo(() => sampleInvoice({ taxed: rulesForTab.showTax, sellerState: biz.state || 'Karnataka' }), [rulesForTab.showTax, biz.state]);
  const preview = (inPortal) => (
    <InvoiceTemplate
      previewMode={!inPortal}
      invoice={sample}
      businessProfile={{ ...shop, print_settings: { ...stored, customFields } }}
      client={SAMPLE_CLIENT}
      themeOverride={form.invoiceTemplate}
      optsOverride={opts}
      textsOverride={form.docTexts}
      accentOverride={form.invAccent}
      customFieldsOverride={customFields}
      onPrint={() => window.print()}
      onClose={() => setTestPage(false)}
    />
  );

  const save = async () => {
    setBusy(true); setFailure(null);
    const next = { ...withDocTypeSaved(stored, tab, form), customFields };
    const patch = { print_settings: next };
    // The invoice QR shows only when bill_settings allows it too; turning it on
    // here turns that on, so the switch does what it says.
    if (opts.upiQr && biz.bill_settings?.show_upi_invoice === false) {
      patch.bill_settings = { ...(biz.bill_settings || {}), show_upi_invoice: true };
    }
    const res = await updateBusinessProfile?.(patch);
    setBusy(false);
    if (!res || !res.success) { setFailure(res?.error || new Error('The server gave no answer.')); return; }
    try { localStorage.setItem(`print_settings_${currentTenantId || 'default'}`, JSON.stringify(next)); } catch { /* same-browser copy only */ }
    setJustSaved(true); setTimeout(() => setJustSaved(false), 1800);
  };

  const uploadSignature = async (file) => {
    if (!file) return;
    setSigBusy(true); setSigErr(null);
    const { url, error } = await uploadProductImage(file, currentTenantId);
    if (error || !url) { setSigErr(error || new Error('Upload gave no address.')); setSigBusy(false); return; }
    const res = await updateBusinessProfile?.({ signature_url: url });
    if (res && !res.success) setSigErr(res.error);
    setSigBusy(false);
  };
  const removeSignature = async () => {
    setSigBusy(true); setSigErr(null);
    const res = await updateBusinessProfile?.({ signature_url: null });
    if (res && !res.success) setSigErr(res.error);
    setSigBusy(false);
  };

  return (
    <div className="flex flex-col pb-16">
      {/* Header */}
      <div className="m-rise mb-4 flex flex-wrap items-start gap-3.5">
        <div className="min-w-0">
          <button type="button" onClick={() => navigate('/settings?tab=print')}
            className="inline-flex items-center gap-1 font-tight text-[13px] font-semibold text-body hover:text-ink">
            <ArrowLeft size={14} /> Settings · Printing
          </button>
          <h3 className="mt-2 font-tight text-[24px] font-semibold tracking-[-0.02em] text-ink">Customise invoice</h3>
          <p className="mt-1 text-[13px] text-body">How your documents look when you print or share them. Phone and web use the same settings.</p>
        </div>
        <div className="ml-auto mt-1 flex flex-wrap items-center gap-2">
          {changes > 0
            ? <span className="whitespace-nowrap rounded-pill bg-amber-soft px-2.5 py-[5px] font-tight text-[12px] font-semibold text-amber-text">{changes} unsaved {changes === 1 ? 'change' : 'changes'}</span>
            : <span className="mr-1 whitespace-nowrap text-[12px] text-mute">{justSaved ? 'Saved' : 'All changes saved'}</span>}
          <Button variant="secondary" onClick={() => setForm(defaultFormValues())}><RotateCcw /> Reset to default</Button>
          <Button variant="secondary" onClick={() => setTestPage(true)}><Printer /> Print a test page</Button>
          <Button onClick={save} disabled={busy || changes === 0}>{busy ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
      <WriteFailure error={failure} noun="setting" onReread={() => window.location.reload()} className="mb-3" />

      <div className="m-rise mb-[18px] flex flex-wrap items-end gap-3" style={{ '--i': 1 }}>
        <Tabs ariaLabel="Document type" value={tab} onChange={setTab}
          items={DOC_TYPE_TABS.map((t) => ({ key: t.key, label: t.label + (t.key === shopKey ? ' · yours' : '') }))} />
        <em className="ml-auto pb-2.5 text-[12px] not-italic text-mute">Each document keeps its own settings</em>
      </div>

      <div className="grid items-start gap-[18px] xl:grid-cols-[284px_284px_minmax(0,1fr)] lg:grid-cols-2">
        {/* Column 1: style, brand */}
        <div className="m-rise grid gap-3.5" style={{ '--i': 2 }}>
          <Group title="Style">
            <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Style">
              {INVOICE_MODELS.map((m) => {
                const on = form.invoiceTemplate === m.id;
                return (
                  <button key={m.id} type="button" data-card role="radio" aria-checked={on}
                    onClick={() => setForm((f) => ({ ...f, invoiceTemplate: m.id }))}
                    style={{ '--cz-acc': on ? form.invAccent : undefined }}
                    className={cn('m-press rounded-xl p-2 text-center', on ? 'shadow-[inset_0_0_0_2px_var(--color-ink)]' : 'shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile')}>
                    <div className={`cz-mini cz-mini-${m.id.replace('model-', '')}`}><i className="a" /><i className="b" /><i className="c" /><i className="d" /><i className="e" /></div>
                    <b className="mt-1.5 block font-tight text-[12px] font-semibold">{m.name}</b>
                    {m.id === 'model-modern' && <span className="block font-tight text-[10.5px] font-semibold text-mute">Default</span>}
                  </button>
                );
              })}
              {legacy && (
                <button type="button" data-card role="radio" aria-checked
                  className="m-press col-span-2 rounded-xl p-2 text-center shadow-[inset_0_0_0_2px_var(--color-ink)]">
                  <b className="block font-tight text-[12px] font-semibold">Your current design</b>
                  <span className="block text-[11px] text-mute">An older design, kept until you pick one above</span>
                </button>
              )}
            </div>
          </Group>

          <Group title="Brand">
            <Lbl>Logo</Lbl>
            <div className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 shadow-[inset_0_0_0_1px_var(--color-line)]">
              {biz.logo_url
                ? <img src={biz.logo_url} alt="" className="h-[34px] w-[34px] rounded-[9px] object-contain" />
                : <span className="grid h-[34px] w-[34px] place-items-center rounded-[9px] bg-well font-tight text-[11px] font-semibold text-mute">None</span>}
              <div className="min-w-0 flex-1">
                <b className="block truncate font-tight text-[12.5px] font-semibold">{biz.logo_url ? 'Your logo' : 'No logo yet'}</b>
                <small className="text-[11px] text-mute">Set in Business settings</small>
              </div>
              <Button variant="secondary" size="xs" onClick={() => navigate('/settings?tab=business')}>Change</Button>
            </div>
            <Lbl className="mt-3.5">Accent colour</Lbl>
            <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Accent colour">
              {MODEL_ACCENTS.map((c) => (
                <button key={c} type="button" data-card role="radio" aria-checked={form.invAccent === c} aria-label={`Accent ${c}`}
                  onClick={() => setForm((f) => ({ ...f, invAccent: c }))}
                  className={cn('m-press h-6 w-6 rounded-full', form.invAccent === c ? 'shadow-[0_0_0_2px_#fff,0_0_0_4px_var(--color-ink)]' : 'shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1)]')}
                  style={{ background: c }} />
              ))}
              <label className="relative grid h-6 w-6 cursor-pointer place-items-center rounded-full bg-surface font-tight text-[15px] font-semibold text-body shadow-[inset_0_0_0_1px_var(--color-line)]" title="Custom colour">
                +
                <input type="color" aria-label="Custom colour" value={form.invAccent} onChange={(e) => setForm((f) => ({ ...f, invAccent: e.target.value }))} className="absolute inset-0 cursor-pointer opacity-0" />
              </label>
            </div>
            <Hint>Dark colours stay readable when printed in black and white.</Hint>

            <Lbl className="mt-3.5">Signature image</Lbl>
            <div className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 shadow-[inset_0_0_0_1px_var(--color-line)]">
              {biz.signature_url
                ? <img src={biz.signature_url} alt="" className="h-[30px] w-[70px] object-contain" />
                : <span className="text-[12px] text-mute">None</span>}
              <span className="flex-1" />
              {biz.signature_url && <Button variant="secondary" size="xs" disabled={sigBusy} onClick={removeSignature}>Remove</Button>}
              <label className={cn('m-press inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-pill bg-well px-3 font-tight text-[12.5px] font-semibold text-ink hover:bg-[#E8E8E7]', sigBusy && 'pointer-events-none opacity-50')}>
                <Upload size={13} /> {sigBusy ? 'Working…' : biz.signature_url ? 'Replace' : 'Upload'}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => uploadSignature(e.target.files?.[0])} />
              </label>
            </div>
            <Hint>Saved straight away. A transparent PNG works best; it sits above the signature label.</Hint>
            <WriteFailure error={sigErr} noun="signature" onReread={() => window.location.reload()} className="mt-2" />
          </Group>
        </div>

        {/* Column 2: what shows, what GST requires */}
        <div className="m-rise grid gap-3.5" style={{ '--i': 3 }}>
          <Group title="Show on the invoice">
            {SHOW.map(([k, label, sub]) => {
              if (k === 'taxSummary') {
                if (!rulesForTab.showTax) return null;
                return (
                  <div key={k} className="flex flex-wrap items-center gap-2.5 border-t border-sep py-2 first:border-t-0">
                    <span className="flex-1 text-[13px] text-ink-2">{label}</span>
                    <Seg className="w-full [&>button]:flex-1 [&>button]:whitespace-nowrap [&>button]:px-2 [&>button]:text-[11.5px]" value={opts.taxSummary || 'below'} onChange={(v) => setOpt('taxSummary', v)} ariaLabel={label}
                      options={[['below', 'Below items'], ['beside', 'Beside totals'], ['off', 'Off']]} />
                  </div>
                );
              }
              return (
                <div key={k} className="flex items-center gap-2.5 border-t border-sep py-2 first:border-t-0">
                  <div className="min-w-0 flex-1">
                    <span className="text-[13px] text-ink-2">{label}</span>
                    {(sub || (k === 'discountCol' && !opts.discountCol)) && (
                      <small className="block text-[11.5px] leading-snug text-mute">{k === 'discountCol' ? 'Discounts are already inside each line\'s taxable value' : sub}</small>
                    )}
                  </div>
                  <Switch checked={!!opts[k]} onChange={(v) => setOpt(k, v)} label={label} />
                </div>
              );
            })}
            {tab !== 'TAX_INVOICE' && (
              <div className="flex items-center gap-2.5 border-t border-sep py-2">
                <div className="min-w-0 flex-1">
                  <span className="text-[13px] text-ink-2">HSN/SAC column</span>
                  <small className="block text-[11.5px] text-mute">Optional on this document</small>
                </div>
                <Switch checked={!!opts.hsn} onChange={(v) => setOpt('hsn', v)} label="HSN/SAC column" />
              </div>
            )}
          </Group>

          {REQUIRED[tab] && (
            <Group title={<><Lock size={13} /> Required by GST</>} className="bg-tile">
              <p className="-mt-1 mb-1.5 text-[12px] text-body">A registered shop cannot hide these on a tax invoice.</p>
              {REQUIRED[tab].map((r) => (
                <div key={r} className="flex items-center gap-2.5 border-t border-[#ECEBE8] py-2 first-of-type:border-t-0">
                  <span className="flex-1 text-[13px] text-mute">{r}</span>
                  <Lock size={14} className="text-mute" aria-label="Locked" />
                </div>
              ))}
            </Group>
          )}
          {tab === 'BILL_OF_SUPPLY' && (
            <Group title="Bill of supply">
              <p className="text-[12.5px] leading-relaxed text-body">
                Prints as <b className="font-semibold text-ink">Bill of Supply</b> with the composition declaration under the header, no GST column, no tax summary and no CGST or SGST lines. HSN/SAC is optional here.
              </p>
            </Group>
          )}
          {tab === 'INVOICE' && (
            <Group title="No GST registration">
              <p className="text-[12.5px] leading-relaxed text-body">
                Prints as <b className="font-semibold text-ink">Invoice</b>, with no GSTIN and no tax.
              </p>
            </Group>
          )}
        </div>

        {/* Column 3: live preview, text */}
        <div className="m-rise grid min-w-0 gap-3.5 lg:col-span-2 xl:col-span-1" style={{ '--i': 4 }}>
          <div className="rounded-[14px] bg-tile px-3.5 pt-3 pb-3.5">
            <div className="mb-3 flex items-center gap-2 text-[12px] text-body">
              <b className="font-tight text-[13px] font-semibold text-ink">Live preview</b>
              <span className="truncate">A4 · Original for recipient · {modelName}</span>
              <span className="flex-1" />
              <div className="inline-flex items-center rounded-pill bg-surface p-[3px]" aria-label="Zoom">
                <button type="button" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.4, +((z || 0.64) - 0.1).toFixed(2)))} className="grid h-6 w-6 place-items-center rounded-xl text-ink-2 hover:bg-well">−</button>
                <span className="min-w-[42px] text-center font-tight text-[12px] font-semibold tabular-nums">{zoom ? `${Math.round(zoom * 100)}%` : 'Fit'}</span>
                <button type="button" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(1, +((z || 0.64) + 0.1).toFixed(2)))} className="grid h-6 w-6 place-items-center rounded-xl text-ink-2 hover:bg-well">+</button>
              </div>
            </div>
            <div className="overflow-auto">
              <ScaledSheet scale={zoom || undefined}>{preview(false)}</ScaledSheet>
            </div>
            <p className="mt-2.5 text-center text-[12px] text-mute">Sample figures. Your real invoices fill in the same way.</p>
          </div>

          <Group title="Text">
            <Lbl>Invoice title</Lbl>
            <div className="flex h-9 items-center justify-between rounded-[10px] bg-tile px-3 text-[13px] text-mute shadow-[inset_0_0_0_1px_var(--color-line)]">
              <span>{rulesForTab.title}</span><Lock size={14} aria-label="Locked" />
            </div>
            <Hint>
              {tab === 'TAX_INVOICE' ? 'Required by GST. A registered shop\'s bill must read Tax Invoice.'
                : tab === 'BILL_OF_SUPPLY' ? 'Required by GST for a shop on the composition scheme.'
                : 'Set by your GST registration: a shop with no GSTIN issues an Invoice.'}
            </Hint>
            <Lbl className="mt-3" htmlFor="cz-foot">Footer note</Lbl>
            <Input id="cz-foot" value={form.docTexts.invFooter || ''} onChange={(e) => setText('invFooter', e.target.value)} />
            <Lbl className="mt-3" htmlFor="cz-terms">Terms and conditions</Lbl>
            <textarea id="cz-terms" rows={3} value={form.docTexts.invTerms || ''} onChange={(e) => setText('invTerms', e.target.value)}
              className="w-full resize-y rounded-[10px] px-3 py-2 text-[12.5px] leading-normal text-ink shadow-[inset_0_0_0_1px_var(--color-line)] outline-none focus:shadow-[inset_0_0_0_2px_var(--color-ink)]" />
            <Hint>One term per line; up to four print. Left as it is, your business terms print instead.</Hint>
            <Lbl className="mt-3" htmlFor="cz-sign">Signature label</Lbl>
            <Input id="cz-sign" value={form.docTexts.signLabel || ''} onChange={(e) => setText('signLabel', e.target.value)} />

            <Lbl className="mt-3.5">Custom fields</Lbl>
            {customFields.map((f, i) => (
              <div key={i} className="mb-1.5 flex items-center gap-1.5">
                <Input value={f.label} placeholder="Label" aria-label={`Custom field ${i + 1} label`} className="w-[40%]"
                  onChange={(e) => setCustomFields((cf) => cf.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <Input value={f.value} placeholder="Value" aria-label={`Custom field ${i + 1} value`} className="flex-1"
                  onChange={(e) => setCustomFields((cf) => cf.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                <Button variant="secondary" size="icon-sm" aria-label={`Remove custom field ${i + 1}`} onClick={() => setCustomFields((cf) => cf.filter((_, j) => j !== i))}><X size={13} /></Button>
              </div>
            ))}
            <button type="button" onClick={() => setCustomFields((cf) => [...cf, { label: '', value: '' }])}
              className="inline-flex items-center gap-1 font-tight text-[13px] font-semibold text-amber-text hover:underline underline-offset-4">
              <Plus size={13} /> Add a field
            </button>
            <Hint>Printed on every invoice, every document type.</Hint>
          </Group>
        </div>
      </div>

      {testPage && preview(true)}
    </div>
  );
};

export default CustomiseInvoice;
