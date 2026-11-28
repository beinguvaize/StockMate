import React, { useEffect, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { INDIAN_STATES } from '../../lib/gstStates';
import { useDialogClose } from '../../hooks/useDialogClose';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import WriteFailure from '../invoices/WriteFailure';
import { classifyWriteFailure } from '../../lib/writeOutcome';
import { cn } from '../../lib/utils';
import { money } from '../../lib/clientView';
import { Pill } from '../payroll/parts';
import { ClientAvatar } from './parts';

/**
 * Add Client / Edit Client (approved mockup clients-14), the page today's
 * full-screen form became. Same fields, same check, same save: addClient or
 * updateClient from usePeople, raced against the same 15 second timeout.
 */
export const EMPTY_CLIENT = { name: '', contact: '', phone: '', email: '', address: '', gstin: '', state: '', state_code: '', pin_code: '', status: 'ACTIVE', client_type: 'B2C', price_tier: 'RETAIL', credit_days: 0, credit_limit: 0 };

export const formFromClient = (client) => ({
  name: client.name || '',
  contact: client.contact || '',
  phone: client.phone || '',
  email: client.email || '',
  address: client.address || '',
  gstin: client.gstin || '',
  state: client.state || '',
  state_code: client.state_code || '',
  pin_code: client.pin_code || '',
  status: client.status || 'ACTIVE',
  client_type: client.client_type || 'B2C',
  price_tier: client.price_tier || 'RETAIL',
  credit_days: client.credit_days ?? 0,
  credit_limit: client.credit_limit ?? 0,
});

const TIERS = [['RETAIL', 'Retail'], ['WHOLESALE', 'Wholesale'], ['DISTRIBUTOR', 'Distributor']];
const TERMS = [0, 7, 15, 30, 45, 60, 90];
const selCls = 'h-9 w-full rounded-[10px] bg-surface px-3 text-[13.5px] text-ink shadow-[inset_0_0_0_1px_var(--color-line)] focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--color-ink)]';

const Fl = ({ label, hint, full, children }) => (
  <label className={cn('block', full && 'sm:col-span-2')}>
    <span className="mb-[5px] block text-[12px] font-medium text-ink-2">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-[12px] text-mute">{hint}</span>}
  </label>
);

const Section = ({ no, title, sub, children }) => (
  <div className="rounded-[14px] border border-line bg-surface px-[18px] py-4">
    <div className="mb-3.5 flex items-center gap-3">
      <span className="grid h-7 w-7 place-items-center rounded-full bg-tile font-tight text-[12.5px] font-semibold text-ink-2">{no}</span>
      <div><h3 className="font-tight text-[14.5px] font-semibold">{title}</h3><small className="text-[12px] text-mute">{sub}</small></div>
    </div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
  </div>
);

export default function ClientForm({ client = null, addClient, updateClient, onCancel, onSaved, onReread }) {
  const editing = !!client;
  const [f, setF] = useState(() => (client ? formFromClient(client) : EMPTY_CLIENT));
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState('');
  const [failure, setFailure] = useState(null);
  useEffect(() => { setF(client ? formFromClient(client) : EMPTY_CLIENT); setProblem(''); setFailure(null); }, [client]);
  useDialogClose(() => { if (!saving) onCancel(); }, { lockScroll: false });

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e?.target ? e.target.value : e }));
  const unconfirmed = failure && classifyWriteFailure(failure).maySaved;

  const submit = async (e) => {
    e?.preventDefault();
    if (saving) return;
    setProblem(''); setFailure(null);
    if (!f.name.trim() || f.name.trim().length < 2) { setProblem('Business name must be at least 2 characters.'); return; }
    setSaving(true);
    try {
      const data = { ...f };
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out. Check your connection.')), 15000));
      const savePromise = editing ? updateClient({ ...client, ...data }) : addClient(data);
      const { error } = await Promise.race([savePromise, timeoutPromise]);
      if (error) { setFailure(error); return; }
      onSaved?.(editing ? 'updated' : 'added', data);
    } catch (err) {
      setFailure(err);
    } finally {
      setSaving(false);
    }
  };

  const chips = [
    <Pill key="t" tone={f.client_type === 'B2B' ? 'info' : 'good'}>{f.client_type}</Pill>,
    <Pill key="p">{TIERS.find(([v]) => v === f.price_tier)?.[1] || f.price_tier}</Pill>,
    Number(f.credit_days) > 0 ? <Pill key="c" tone="warn">Net {f.credit_days}</Pill> : null,
    f.gstin ? <Pill key="g" tone="good">GST</Pill> : null,
  ].filter(Boolean);

  return (
    <form onSubmit={submit} className="flex flex-col pb-16" data-testid="client-form">
      <div className="m-rise mb-4 flex flex-wrap items-center gap-2.5" style={{ '--i': 0 }}>
        <button type="button" onClick={onCancel} className="m-press inline-flex items-center gap-1 font-tight text-[13px] font-semibold text-body hover:text-ink">
          <ChevronLeft size={15} /> Clients
        </button>
        <h3 className="font-tight text-[20px] font-semibold tracking-[-0.02em]">{editing ? 'Edit Client' : 'Add Client'}</h3>
        <div className="flex-1" />
        <Button variant="secondary" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" disabled={saving || unconfirmed}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add client'}</Button>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_340px]">
        <div className="grid gap-3">
          <Section no="1" title="Client" sub="Who they are and how to reach them">
            <Fl label="Business or client name *" full><Input required autoFocus value={f.name} onChange={set('name')} placeholder="Business or client name" /></Fl>
            <Fl label="Contact person"><Input value={f.contact} onChange={set('contact')} placeholder="Person to ask for" /></Fl>
            <Fl label="Phone number"><Input type="tel" value={f.phone} onChange={set('phone')} placeholder="Mobile number" /></Fl>
            <Fl label="Email" full><Input type="email" value={f.email} onChange={set('email')} placeholder="billing@example.com" /></Fl>
          </Section>
          <Section no="2" title="Address" sub="Used on bills and for the place of supply">
            <Fl label="Address" full><Input value={f.address} onChange={set('address')} placeholder="Shop, street, area, city" /></Fl>
            <Fl label="State">
              <select className={selCls} value={f.state} onChange={(e) => {
                const sel = INDIAN_STATES.find((s) => s.name === e.target.value);
                setF((p) => ({ ...p, state: e.target.value, state_code: sel ? sel.code : p.state_code }));
              }}>
                <option value="">Select state</option>
                {INDIAN_STATES.map((s) => <option key={s.code} value={s.name}>{s.name}</option>)}
              </select>
            </Fl>
            <Fl label="PIN code"><Input maxLength={6} value={f.pin_code} onChange={set('pin_code')} placeholder="6 digits" /></Fl>
          </Section>
          <Section no="3" title="Billing" sub="GST, prices and credit">
            <Fl label="GSTIN, optional" full hint="Needed only if this client wants GST invoices. 15 letters and numbers.">
              <Input maxLength={15} value={f.gstin} onChange={(e) => setF((p) => ({ ...p, gstin: e.target.value.toUpperCase() }))} placeholder="15 characters" className="uppercase tracking-[0.06em]" />
            </Fl>
            <div className="sm:col-span-2">
              <span className="mb-[5px] block text-[12px] font-medium text-ink-2">Account type</span>
              <div role="radiogroup" className="grid grid-cols-2 gap-2">
                {[['B2C', 'Consumer, B2C', 'Walk-in or household customer'], ['B2B', 'Business, B2B', 'Shop, hotel, caterer or distributor']].map(([v, t, h]) => (
                  <button key={v} type="button" data-card role="radio" aria-checked={f.client_type === v} onClick={() => setF((p) => ({ ...p, client_type: v }))}
                    className={cn('m-press rounded-xl px-3 py-[11px] text-left', f.client_type === v ? 'shadow-[inset_0_0_0_2px_var(--color-ink)]' : 'shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile')}>
                    <b className="block font-tight text-[13.5px] font-semibold">{t}</b>
                    <small className="block text-[12px] text-mute">{h}</small>
                  </button>
                ))}
              </div>
            </div>
            <Fl label="Price tier">
              <select className={selCls} value={f.price_tier} onChange={set('price_tier')}>
                {TIERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Fl>
            <Fl label="Credit terms">
              <select className={selCls} value={f.credit_days} onChange={(e) => setF((p) => ({ ...p, credit_days: Number(e.target.value) }))}>
                {TERMS.map((d) => <option key={d} value={d}>{d === 0 ? 'Cash on delivery' : `Net ${d} days`}</option>)}
              </select>
            </Fl>
            <Fl label="Credit limit" hint="Leave 0 for no limit. Above this, a credit sale is refused at the till.">
              <Input type="number" min="0" step="1" inputMode="decimal" value={f.credit_limit} placeholder="0, no limit"
                onChange={(e) => setF((p) => ({ ...p, credit_limit: e.target.value === '' ? 0 : Number(e.target.value) }))} />
            </Fl>
          </Section>
        </div>

        <div className="grid gap-3 lg:sticky lg:top-6">
          <div className="rounded-[14px] border border-line bg-surface px-[18px] py-4">
            <span className="block font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute">Summary</span>
            <div className="mt-3 flex items-center gap-3">
              <ClientAvatar name={f.name || '?'} size="lg" />
              <div className="min-w-0">
                <b className="block truncate font-tight text-[15px] font-semibold">{f.name || <span className="text-mute">Client name</span>}</b>
                <small className="text-[12.5px] text-mute">{f.contact || 'Contact person'}</small>
              </div>
            </div>
            <div className="mt-3 grid gap-1 text-[13px] text-body">
              {f.phone && <span className="tabular-nums">{f.phone}</span>}
              {f.email && <span className="truncate">{f.email}</span>}
              {f.address && <span className="truncate">{f.address}</span>}
              {f.state && <span>{f.state}{f.pin_code ? ` · ${f.pin_code}` : ''}</span>}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">{chips}</div>
            <div className="my-3 border-t border-sep" />
            <div className="flex justify-between text-[13px]"><span className="text-mute">Credit limit</span><span className="font-medium tabular-nums text-ink-2">{Number(f.credit_limit) > 0 ? money(f.credit_limit) : 'No limit'}</span></div>
          </div>
          {problem && <p role="alert" className="rounded-[10px] bg-bad-soft px-3 py-2 text-[12.5px] text-bad-text">{problem}</p>}
          <WriteFailure error={failure} noun={editing ? 'change' : 'new client'}
            onReread={onReread ? async () => { await onReread(); onCancel(); } : undefined} />
          <Button type="submit" size="lg" disabled={saving || unconfirmed} className="w-full">{saving ? 'Saving…' : editing ? 'Save changes' : 'Add client'}</Button>
          <Button variant="secondary" onClick={onCancel} disabled={saving} className="w-full">Cancel</Button>
        </div>
      </div>
    </form>
  );
}
