import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Tag } from 'lucide-react';
import { useTenant } from '../../context/TenantContext';
import POSReceipt from '../../components/invoice/POSReceipt';
import { RECEIPT_META } from '../../components/invoice/invoiceLayouts';
import { Button, buttonVariants } from '../../components/ui/button';
import OptionCard, { OptionGroup } from '../../components/ui/OptionCard';
import { Seg, Switch } from '../../components/documents/DocParts';
import { PanelHead, Stack, SCard, FormRow, SwitchRow, SubHead, fieldCls, useSaveState, SaveMsg } from './parts';
import { rereadSaved } from './lib/reread';
import { cn } from '../../lib/utils';

/**
 * Printing (approved settings-09): receipt printer, thermal receipt design,
 * the A4 invoice (designed on Customise invoice) and labels.
 *
 * Both save buttons write print_settings and bill_settings together through
 * updateBusinessProfile, as before; every device and the phone print with
 * them. The A4 designer that used to sit in this card behind a tab nobody
 * could open is gone: A4 is designed on /settings/invoice.
 */

const BILL_DEFAULTS = {
  show_business_name: true,
  show_address: true, show_phone: true, show_gstin: true, show_customer_name: true,
  show_customer_phone: true, show_customer_gstin: true, show_bill_no: true, show_date: true,
  show_tax_breakdown: true, show_upi: true, show_discount: true,
  show_party_balance: true, show_payment_status: true, show_footer: true, show_terms: true,
  paper_width: '80',
  labels: {},
};

// No invoiceTemplate here: a shop that never chose an A4 design must not have
// one written for it by saving the receipt settings.
const PREF_BASE = { paper: '80', copies: 1, autoPrint: false, receiptTemplate: 'classic', docTexts: {}, invOpts: {}, invAccent: '#0f172a', customFields: [] };

const SHOW = [
  ['show_business_name', 'Business name'], ['show_address', 'Business address'], ['show_phone', 'Business phone'],
  ['show_gstin', 'Business GSTIN'], ['show_bill_no', 'Bill number'], ['show_date', 'Date'],
  ['show_customer_name', 'Customer name'], ['show_customer_phone', 'Customer phone'], ['show_customer_gstin', 'Customer GSTIN'],
  ['show_tax_breakdown', 'Tax breakdown'], ['show_discount', 'Discount line'], ['show_party_balance', 'Previous balance'],
  ['show_payment_status', 'Payment status'], ['show_upi', 'UPI QR / ID'], ['show_footer', 'Footer message'],
  ['show_terms', 'Terms & conditions'],
];

const LABELS = [
  ['bill_title', 'Title'], ['footer_message', 'Footer'], ['_lbl_billTo', 'Customer prefix'], ['_lbl_phone', 'Phone prefix'],
  ['_lbl_gstin', 'GSTIN prefix'], ['_lbl_subtotal', 'Subtotal label'], ['_lbl_total', 'Total label'], ['_lbl_upi', 'UPI prefix'],
];

const SAMPLE_RECEIPT = {
  invoice_number: '001042',
  invoice_date: new Date().toISOString(),
  payment_status: 'PAID',
  grand_total: 405, paid_amount: 405, discount_total: 0, round_off: 0,
  items: [
    { name: 'Basmati Rice 5kg', quantity: 2, rate: 80, taxRate: 0 },
    { name: 'Sunflower Oil 1L', quantity: 1, rate: 245, taxRate: 0 },
  ],
};

function Stepper({ value, onChange, min = 1, max = 3, label }) {
  return (
    <span className="inline-flex h-[34px] items-center rounded-pill bg-well" role="group" aria-label={label}>
      <button type="button" aria-label="Fewer" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}
        className="m-press grid h-[34px] w-[34px] place-items-center font-tight text-[16px] font-semibold text-ink-2 disabled:opacity-40">−</button>
      <span className="min-w-[28px] text-center font-tight text-[13.5px] font-semibold tabular-nums" aria-live="polite">{value}</span>
      <button type="button" aria-label="More" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}
        className="m-press grid h-[34px] w-[34px] place-items-center font-tight text-[16px] font-semibold text-ink-2 disabled:opacity-40">+</button>
    </span>
  );
}

export default function PrintPanel() {
  const { currentTenantId: tenantId, businessProfile, updateBusinessProfile } = useTenant();
  const [billSet, setBillSet] = useState({ ...BILL_DEFAULTS, ...(businessProfile?.bill_settings || {}) });
  useEffect(() => {
    setBillSet({ ...BILL_DEFAULTS, ...(businessProfile?.bill_settings || {}) });
  }, [businessProfile?.bill_settings]);

  const key = `print_settings_${tenantId || 'default'}`;
  const [prefs, setPrefs] = useState(() => {
    // Tenant-level settings (DB) are the source of truth; localStorage only
    // bridges saves made before print_settings moved server-side.
    try { return { ...PREF_BASE, ...(JSON.parse(localStorage.getItem(key)) || {}) }; }
    catch { return PREF_BASE; }
  });
  useEffect(() => {
    if (businessProfile?.print_settings && typeof businessProfile.print_settings === 'object') {
      setPrefs((prev) => ({ ...PREF_BASE, ...prev, ...businessProfile.print_settings }));
    }
  }, [businessProfile?.print_settings]);

  const lastSent = useRef(null);
  const recheck = useCallback(
    () => rereadSaved({ table: 'business_profile', idCol: 'tenant_id', id: tenantId, sent: lastSent.current }),
    [tenantId],
  );
  // One state per button, so the message shows on the card that was pressed.
  const printerSave = useSaveState({ recheck });
  const designSave = useSaveState({ recheck });

  const save = (state) => {
    try { localStorage.setItem(key, JSON.stringify(prefs)); } catch { /* same-browser cache only */ }
    // Tenant-level: every device and the mobile app print with these settings.
    const patch = { print_settings: prefs, bill_settings: { ...(businessProfile?.bill_settings || {}), ...billSet } };
    lastSent.current = patch;
    (state === printerSave ? designSave : printerSave).clear();
    return state.run(() => updateBusinessProfile(patch), 'Saved. Every device prints with these.');
  };

  const setLabel = (k, v) => {
    if (k.startsWith('_lbl_')) {
      const lk = k.replace('_lbl_', '');
      setBillSet((b) => ({ ...b, labels: { ...(b.labels || {}), [lk]: v } }));
    } else {
      setBillSet((b) => ({ ...b, [k]: v }));
    }
  };
  const labelValue = (k) => (k.startsWith('_lbl_') ? billSet.labels?.[k.replace('_lbl_', '')] : billSet[k]) || '';

  return (
    <div>
      <PanelHead title="Printing" sub="Receipt printer, receipt design, the A4 invoice and labels." />
      <Stack>
        <SCard title="Receipt printer" sub="Applies to cash receipts printed after each sale."
          footer={<>
            <SaveMsg state={printerSave} noun="print settings change" />
            <Button variant="dark" size="sm" onClick={() => save(printerSave)} disabled={printerSave.busy}>{printerSave.busy ? 'Saving…' : 'Save changes'}</Button>
          </>}>
          <FormRow label="Paper width" hint="Match your thermal printer roll.">
            <Seg ariaLabel="Paper width" value={prefs.paper} onChange={(v) => setPrefs((p) => ({ ...p, paper: v }))}
              options={[['58', '58 mm'], ['80', '80 mm'], ['A4', 'A4']]} />
          </FormRow>
          <FormRow label="Copies per receipt" hint="Up to 3.">
            <Stepper label="Copies per receipt" value={prefs.copies} onChange={(v) => setPrefs((p) => ({ ...p, copies: v }))} />
          </FormRow>
          <FormRow label="Auto-print" hint="Open the print dialog after each sale.">
            <Switch label="Auto-print" checked={!!prefs.autoPrint} onChange={(v) => setPrefs((p) => ({ ...p, autoPrint: v }))} />
          </FormRow>
        </SCard>

        <SCard pad title="A4 invoice" sub="Style, colour, what shows and the text, for each document type. Phone and web print the same."
          footer={<Link to="/settings/invoice" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>Customise invoice<ChevronRight aria-hidden="true" /></Link>}>
          <p className="text-[13px] text-mute">Tax invoice, bill of supply and the plain invoice each keep their own settings.</p>
        </SCard>

        <SCard pad title="Thermal receipt design" sub="Pick a design and choose what prints. Saved with the button below; phone and web print the same."
          footer={<>
            <SaveMsg state={designSave} noun="receipt design change" />
            <Button onClick={() => save(designSave)} disabled={designSave.busy}>{designSave.busy ? 'Saving…' : 'Save design and text'}</Button>
          </>}>
          <OptionGroup cols={3} aria-label="Receipt design" className="mb-3.5">
            {RECEIPT_META.map((t) => (
              <OptionCard key={t.id} title={t.name} hint={t.blurb} selected={prefs.receiptTemplate === t.id}
                onClick={() => setPrefs((p) => ({ ...p, receiptTemplate: t.id }))} />
            ))}
          </OptionGroup>
          <div className="grid gap-[18px] lg:grid-cols-[minmax(0,1fr)_270px]">
            <div className="grid place-items-center overflow-auto rounded-xl bg-tile p-[18px]">
              {/* The real receipt component, so what is toggled here is what prints (web and phone). */}
              <POSReceipt key={JSON.stringify(billSet)} bare invoice={SAMPLE_RECEIPT}
                businessProfile={{ ...(businessProfile || {}), bill_settings: billSet }} client={{ name: 'Walk-in' }} />
            </div>
            <div>
              <SubHead>Paper width</SubHead>
              <Seg ariaLabel="Receipt paper width" value={billSet.paper_width || '80'} onChange={(v) => setBillSet((b) => ({ ...b, paper_width: v }))}
                options={[['80', '80 mm'], ['58', '58 mm']]} />
              <SubHead>Show or hide</SubHead>
              {SHOW.map(([k, label]) => (
                <SwitchRow key={k} label={label} checked={!!billSet[k]} onChange={(v) => setBillSet((b) => ({ ...b, [k]: v }))} />
              ))}
              <SubHead>Field labels</SubHead>
              <div className="grid grid-cols-2 gap-1.5">
                {LABELS.map(([k, ph]) => (
                  <input key={k} value={labelValue(k)} placeholder={ph} aria-label={ph} onChange={(e) => setLabel(k, e.target.value)}
                    className={cn(fieldCls, 'h-8 px-2.5 text-[12.5px]')} />
                ))}
              </div>
            </div>
          </div>
        </SCard>

        <SCard title="Barcode labels" sub="Label templates, field sizes and bulk barcode printing.">
          <FormRow label="Labels tool" hint="Design and print price labels for products.">
            <Link to="/labels" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}><Tag aria-hidden="true" />Open labels</Link>
          </FormRow>
        </SCard>
      </Stack>
    </div>
  );
}
