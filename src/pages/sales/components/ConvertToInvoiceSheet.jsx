/**
 * ConvertToInvoiceSheet
 *
 * Collects customer info required to issue a GST tax invoice from any
 * POS sale (walk-in or named). GSTIN is mandatory at the RPC layer
 * because the resulting invoice must be GST-compliant; this sheet
 * guarantees it before we call convert_sale_to_invoice.
 *
 * Behaviour:
 *  - Pre-fills from the sale's existing client (if linked) or its
 *    walk-in customerInfo blob.
 *  - Autocompletes by name against the tenant's existing clients —
 *    picking a match wires that client_id into the convert call.
 *  - If the typed name is brand new (no match), a new clients row is
 *    auto-created on submit using the captured GSTIN / address / phone
 *    so future sales to the same customer can link directly.
 */
import React, { useMemo, useState } from 'react';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';

const Field = ({ label, required, children, hint, className = '' }) => (
  <label className={`block ${className}`}>
    <span className="block mb-1.5 font-tight text-[12.5px] font-semibold text-ink-2">
      {label}{required && <span className="text-bad-text ml-0.5">*</span>}
    </span>
    {children}
    {hint && <div className="mt-1 text-[12px] text-mute">{hint}</div>}
  </label>
);

const inputCls =
  'w-full h-9 rounded-[10px] bg-surface px-3 text-[13.5px] text-ink ' +
  'shadow-[inset_0_0_0_1px_var(--color-line)] outline-none transition-shadow duration-(--dur-press) ' +
  'placeholder:text-mute focus:shadow-[inset_0_0_0_2px_var(--color-ink)]';

const ConvertToInvoiceSheet = ({ sale, clients = [], onCancel, onSubmit, submitting }) => {
  // Prefer linked client → fall back to walk-in customerInfo blob.
  const linkedClient = useMemo(
    () => clients.find(c => c.id === (sale?.shopId || sale?.shop_id)) || null,
    [clients, sale]
  );
  const ci = sale?.customerInfo || sale?.customer_info || {};

  const [form, setForm] = useState({
    client_id:       linkedClient?.id || null,
    name:            linkedClient?.name || ci.name || sale?.customer_name || '',
    gstin:           linkedClient?.gstin || linkedClient?.gst_no || ci.gstin || '',
    address:         linkedClient?.address || ci.address || '',
    phone:           linkedClient?.phone || ci.phone || '',
    place_of_supply: linkedClient?.state || ci.placeOfSupply || '',
    // Honour each client's own credit_days when linked. Falls back to
    // 30 only for walk-ins / clients with no custom terms recorded.
    due_days:        Number(linkedClient?.credit_days ?? linkedClient?.creditDays ?? 30),
    notes:           '',
  });
  const [error, setError] = useState(null);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  // Name autocomplete — narrow against existing clients case-insensitively.
  const suggestions = useMemo(() => {
    const q = form.name.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    return clients
      .filter(c => (c.name || '').toLowerCase().includes(q))
      .slice(0, 6);
  }, [clients, form.name]);

  const pickClient = (c) => setForm(prev => ({
    ...prev,
    client_id:       c.id,
    name:            c.name,
    gstin:           c.gstin || c.gst_no || prev.gstin,
    address:         c.address || prev.address,
    phone:           c.phone || prev.phone,
    place_of_supply: c.state || prev.place_of_supply,
    // Pre-fill due days from the picked client's stored credit terms.
    due_days:        Number(c.credit_days ?? c.creditDays ?? prev.due_days),
  }));

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!form.name.trim()) {
      setError('Customer name is required');
      return;
    }
    if (!form.gstin.trim()) {
      setError('GSTIN is required to issue a GST tax invoice');
      return;
    }
    setError(null);
    // Trim whitespace from every field before handoff so downstream
    // RPC + clients insert get clean values.
    const payload = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])
    );
    try {
      await onSubmit(payload);
    } catch (err) {
      setError(err?.message || String(err));
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div role="alert" className="mb-3 rounded-xl bg-bad-soft px-3 py-2.5 text-[12.5px] font-medium text-bad-text">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Field label="Customer name" required className="sm:col-span-2">
        <div className="relative">
          <input
            className={inputCls + (form.client_id ? ' pr-28' : '')}
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="Akme Traders Pvt Ltd"
            autoFocus
          />
          {form.client_id && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2"><Badge tone="good">Saved client</Badge></span>
          )}
        </div>
        {suggestions.length > 0 && !form.client_id && (
          <div className="mt-1 rounded-xl bg-surface overflow-hidden shadow-[0_0_0_1px_var(--color-line),0_12px_32px_-16px_rgba(17,20,24,0.3)]">
            {suggestions.map(c => (
              <button
                type="button"
                key={c.id}
                onClick={() => pickClient(c)}
                className="block w-full text-left px-3 py-2 hover:bg-tile border-b border-sep last:border-0"
              >
                <div className="font-tight text-[13px] font-semibold text-ink">{c.name}</div>
                <div className="text-[11.5px] text-mute">
                  {c.gstin || c.gst_no || 'No GSTIN'} · {c.phone || '—'}
                </div>
              </button>
            ))}
          </div>
        )}
        {form.client_id && (
          <div className="mt-1 text-[12px] text-good-text">
            Linked to an existing client
            <button
              type="button"
              onClick={() => set('client_id', null)}
              className="ml-2 text-mute underline hover:text-ink"
            >Clear</button>
          </div>
        )}
        {!form.client_id && form.name.trim() && suggestions.length === 0 && (
          <div className="mt-1 text-[12px] text-amber-text">
            New customer, added to Clients on save
          </div>
        )}
      </Field>

      <Field label="GSTIN" required hint="15 letters and numbers">
        <input
          className={inputCls + ' uppercase tracking-[0.06em]'}
          value={form.gstin}
          onChange={e => set('gstin', e.target.value.toUpperCase())}
          maxLength={15}
          placeholder="29ABCDE1234F1Z5"
        />
      </Field>

        <Field label="Phone">
          <input
            className={inputCls}
            value={form.phone}
            onChange={e => set('phone', e.target.value)}
            placeholder="+91 98765 43210"
          />
        </Field>
        <Field label="Place of supply" hint="State name, e.g. Kerala">
          <input
            className={inputCls}
            value={form.place_of_supply}
            onChange={e => set('place_of_supply', e.target.value)}
          />
        </Field>

        <Field
          label="Due in, days"
          hint={form.client_id
            ? "From this client's credit terms, change it if needed"
            : 'Default 30, change it if needed'}
        >
          <input
            type="number"
            min={0}
            className={inputCls}
            value={form.due_days}
            onChange={e => set('due_days', Number(e.target.value) || 0)}
          />
        </Field>

      <Field label="Billing address" className="sm:col-span-2">
        <textarea
          className={inputCls + ' h-auto py-2 resize-none'}
          rows={2}
          value={form.address}
          onChange={e => set('address', e.target.value)}
        />
      </Field>

        <Field label="Notes, optional" className="sm:col-span-2">
          <input
            className={inputCls}
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="PO number, reference"
          />
        </Field>
      </div>

      <div className="flex gap-2 mt-5 [&>*]:flex-1">
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Converting' : 'Issue GST invoice'}
        </Button>
      </div>
    </form>
  );
};

export default ConvertToInvoiceSheet;
