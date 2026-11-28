import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTenant } from '../../context/TenantContext';
import { Button } from '../../components/ui/button';
import OptionCard, { OptionGroup } from '../../components/ui/OptionCard';
import { Switch } from '../../components/documents/DocParts';
import { PanelHead, Stack, SCard, FormRow, MaskedInput, fieldCls, useSaveState, SaveMsg } from './parts';
import { businessFormFrom, withCountry } from './lib/settingsLib';
import { rereadSaved } from './lib/reread';
import { cn } from '../../lib/utils';

/**
 * Business (approved settings-03): details, tax and compliance, banking and
 * country. One save for all four cards, through updateBusinessProfile, with
 * the same fields as before.
 */

const TAX_MODES = [
  { value: 'EXCLUSIVE', label: 'Tax exclusive', desc: 'Price shown before GST, tax added on top' },
  { value: 'INCLUSIVE', label: 'Tax inclusive', desc: 'Price already includes GST, tax taken out of the total' },
  { value: 'NONE',      label: 'No GST',        desc: 'Not filing GST. Profit counts full amounts' },
];

const COUNTRIES = [
  ['United Arab Emirates', 'United Arab Emirates'], ['United States', 'United States'], ['United Kingdom', 'United Kingdom'],
  ['Canada', 'Canada'], ['Australia', 'Australia'], ['India', 'India'],
];
const CURRENCIES = [
  ['INR', 'INR, Indian rupee'], ['AED', 'AED, UAE dirham'], ['USD', 'USD, US dollar'], ['EUR', 'EUR, Euro'], ['GBP', 'GBP, British pound'],
];

const selectCls = cn(fieldCls, 'max-w-[380px] appearance-none pr-8 bg-[length:12px] bg-[right_12px_center] bg-no-repeat',
  "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235F646B' stroke-width='2.4'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")]");

const SwitchLine = ({ checked, onChange, label, children }) => (
  <div className="flex items-start gap-3">
    <Switch checked={checked} onChange={onChange} label={label} />
    <span className="text-[12.5px] leading-[1.45] text-body">{children}</span>
  </div>
);

export default function BusinessPanel() {
  const { currentTenantId, businessProfile, updateBusinessProfile } = useTenant();
  const [form, setForm] = useState(() => businessFormFrom(businessProfile));
  const dirty = useRef(false);
  const lastSent = useRef(null);

  // Seed again when the profile arrives after first paint (or another device
  // saves), unless the owner has started typing.
  useEffect(() => {
    if (!dirty.current) setForm(businessFormFrom(businessProfile));
  }, [businessProfile]);

  const set = (patch) => { dirty.current = true; setForm((f) => ({ ...f, ...patch })); };

  const recheck = useCallback(
    () => rereadSaved({ table: 'business_profile', idCol: 'tenant_id', id: currentTenantId, sent: lastSent.current }),
    [currentTenantId],
  );
  const save = useSaveState({ recheck });

  const onSave = async (e) => {
    e?.preventDefault?.();
    lastSent.current = form;
    const ok = await save.run(() => updateBusinessProfile(form), 'Saved.');
    if (ok) dirty.current = false;
  };

  return (
    <form onSubmit={onSave}>
      <PanelHead title="Business" sub="Shop name, contact, tax, bank and currency." />
      <Stack>
        <SCard title="Business details" sub="Printed on every bill and invoice.">
          <FormRow label="Business name">
            <input required className={cn(fieldCls, 'max-w-[380px] font-semibold')} aria-label="Business name"
              value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Business name" />
          </FormRow>
          <FormRow label="Phone and email">
            <div className="grid max-w-[520px] grid-cols-1 gap-2.5 sm:grid-cols-2">
              <input className={fieldCls} aria-label="Contact phone" value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="Phone number" />
              <input type="email" className={fieldCls} aria-label="Official email" value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="Email address" />
            </div>
          </FormRow>
          <FormRow label="Address">
            <textarea rows={3} aria-label="Business address" value={form.address} onChange={(e) => set({ address: e.target.value })} placeholder="Full address"
              className={cn(fieldCls, 'h-auto min-h-[64px] max-w-[380px] resize-none py-2 leading-[1.45]')} />
          </FormRow>
        </SCard>

        <SCard title="Tax and compliance" sub="GST details, how prices carry tax, e-invoicing and stock control.">
          <FormRow label="GSTIN and PAN" hint="PAN is shown masked.">
            <div className="grid max-w-[520px] grid-cols-1 gap-2.5 sm:grid-cols-2">
              <input className={cn(fieldCls, 'tabular-nums')} aria-label="GSTIN" value={form.gst_no} onChange={(e) => set({ gst_no: e.target.value })} placeholder="GSTIN" />
              <MaskedInput aria-label="PAN number" value={form.pan_no} onChange={(v) => set({ pan_no: v })} placeholder="PAN" />
            </div>
          </FormRow>
          <FormRow label="Tax mode">
            <OptionGroup cols={3} aria-label="Tax mode" className="max-w-[560px]">
              {TAX_MODES.map((o) => (
                <OptionCard key={o.value} title={o.label} hint={o.desc} selected={form.tax_mode === o.value} onClick={() => set({ tax_mode: o.value })} />
              ))}
            </OptionGroup>
            <span className="mt-1.5 block text-[12.5px] text-mute">Applies to all invoices and counter sales. Save to update.</span>
          </FormRow>
          <FormRow label="E-invoice (IRN)">
            <SwitchLine checked={form.auto_irn_enabled} onChange={(v) => set({ auto_irn_enabled: v })} label="Auto-generate IRN for every invoice">
              Auto-generate an IRN for every invoice. Needed once yearly turnover passes ₹5 crore. Each invoice queues a request to the GST portal, fetched later by the worker.
            </SwitchLine>
          </FormRow>
          <FormRow label="Stock control">
            <SwitchLine checked={form.block_negative_stock} onChange={(v) => set({ block_negative_stock: v })} label="Refuse a sale that would take stock below zero">
              Refuse a sale that would take stock below zero. Enforced on the server, so the counter, the phone and a sale that syncs later all obey it. Services are never blocked. Turn on once the shelves are counted: a shop with negative balances today could not bill until they are fixed.
            </SwitchLine>
          </FormRow>
        </SCard>

        <SCard title="Banking and payments" sub="Printed on invoices so clients can pay you.">
          <FormRow label="Bank" hint="Account number is shown masked.">
            <div className="grid max-w-[520px] grid-cols-1 gap-2.5 sm:grid-cols-2">
              <input className={fieldCls} aria-label="Bank name" value={form.bank_name} onChange={(e) => set({ bank_name: e.target.value })} placeholder="Bank name" />
              <MaskedInput group aria-label="Account number" value={form.account_no} onChange={(v) => set({ account_no: v })} placeholder="Account number" />
            </div>
          </FormRow>
          <FormRow label="IFSC and UPI ID" hint="The UPI ID makes the pay QR.">
            <div className="grid max-w-[520px] grid-cols-1 gap-2.5 sm:grid-cols-2">
              <input className={cn(fieldCls, 'tabular-nums')} aria-label="IFSC code" value={form.ifsc_code} onChange={(e) => set({ ifsc_code: e.target.value })} placeholder="IFSC" />
              <input className={fieldCls} aria-label="UPI ID" value={form.upi_id} onChange={(e) => set({ upi_id: e.target.value })} placeholder="name@bank" />
            </div>
          </FormRow>
        </SCard>

        <SCard title="Country and currency" sub="Picking India sets rupees."
          footer={<>
            <SaveMsg state={save} noun="change" hint="One save for all four cards." />
            <Button type="submit" disabled={save.busy}>{save.busy ? 'Saving…' : 'Save settings'}</Button>
          </>}>
          <FormRow label="Country">
            <select className={selectCls} aria-label="Country" value={form.country}
              onChange={(e) => { dirty.current = true; setForm((f) => withCountry(f, e.target.value)); }}>
              {!form.country && <option value="">Choose a country</option>}
              {COUNTRIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </FormRow>
          <FormRow label="Currency">
            <select className={selectCls} aria-label="Currency" value={form.currency} onChange={(e) => set({ currency: e.target.value })}>
              {CURRENCIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </FormRow>
        </SCard>
      </Stack>
    </form>
  );
}
