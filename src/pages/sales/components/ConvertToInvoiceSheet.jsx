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

const Field = ({ label, required, children, hint }) => (
  <label className="block">
    <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </span>
    {children}
    {hint && <div className="text-[10px] text-gray-400 mt-0.5">{hint}</div>}
  </label>
);

const inputCls =
  'mt-1 w-full px-3 py-2 rounded-lg bg-white border border-black/10 ' +
  'focus:outline-none focus:ring-2 focus:ring-accent-signature/30 text-sm';

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
    due_days:        30,
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
    <form onSubmit={handleSubmit} className="space-y-4 p-1">
      {error && (
        <div className="text-[12px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <Field label="Customer Name" required>
        <input
          className={inputCls}
          value={form.name}
          onChange={e => set('name', e.target.value)}
          placeholder="Akme Traders Pvt Ltd"
          autoFocus
        />
        {suggestions.length > 0 && !form.client_id && (
          <div className="mt-1 border border-black/10 rounded-lg overflow-hidden bg-white shadow-sm">
            {suggestions.map(c => (
              <button
                type="button"
                key={c.id}
                onClick={() => pickClient(c)}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-accent-signature/10 border-b border-black/5 last:border-0"
              >
                <div className="font-semibold text-ink-primary">{c.name}</div>
                <div className="text-[10px] text-gray-500">
                  {c.gstin || c.gst_no || 'No GSTIN'} · {c.phone || '—'}
                </div>
              </button>
            ))}
          </div>
        )}
        {form.client_id && (
          <div className="text-[10px] text-emerald-600 mt-0.5">
            ✓ Linked to existing client
            <button
              type="button"
              onClick={() => set('client_id', null)}
              className="ml-2 text-gray-400 underline"
            >clear</button>
          </div>
        )}
        {!form.client_id && form.name.trim() && suggestions.length === 0 && (
          <div className="text-[10px] text-amber-600 mt-0.5">
            New customer — will be added to Clients on save
          </div>
        )}
      </Field>

      <Field label="GSTIN" required hint="15-char alphanumeric GST identification number">
        <input
          className={inputCls + ' uppercase tracking-widest'}
          value={form.gstin}
          onChange={e => set('gstin', e.target.value.toUpperCase())}
          maxLength={15}
          placeholder="29ABCDE1234F1Z5"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone">
          <input
            className={inputCls}
            value={form.phone}
            onChange={e => set('phone', e.target.value)}
            placeholder="+91 98765 43210"
          />
        </Field>
        <Field label="Place of Supply" hint="State name, e.g. Kerala">
          <input
            className={inputCls}
            value={form.place_of_supply}
            onChange={e => set('place_of_supply', e.target.value)}
          />
        </Field>
      </div>

      <Field label="Billing Address">
        <textarea
          className={inputCls + ' resize-none'}
          rows={2}
          value={form.address}
          onChange={e => set('address', e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Due in (days)">
          <input
            type="number"
            min={0}
            className={inputCls}
            value={form.due_days}
            onChange={e => set('due_days', Number(e.target.value) || 0)}
          />
        </Field>
        <Field label="Notes (optional)">
          <input
            className={inputCls}
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="PO #, ref, etc."
          />
        </Field>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="flex-1 px-4 py-2.5 rounded-xl bg-black/5 hover:bg-black/10 text-sm font-semibold text-ink-primary disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 px-4 py-2.5 rounded-xl bg-accent-signature text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? 'Converting…' : 'Issue GST Invoice'}
        </button>
      </div>
    </form>
  );
};

export default ConvertToInvoiceSheet;
