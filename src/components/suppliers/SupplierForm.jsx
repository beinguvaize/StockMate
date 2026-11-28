import React, { useEffect, useRef, useState } from 'react';
import Dialog from '../ui/Dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { cn, generateUUID } from '../../lib/utils';
import { classifyWriteFailure } from '../../lib/writeOutcome';
import { gstinError } from '../../lib/supplierView';
import { Label, Msg, Hint } from './parts';

/**
 * Add Supplier / Edit Supplier (mockups 11 and 12), one dialog.
 *
 * Saves through usePeople's addSupplier / updateSupplier, as before. Fixes two
 * web bugs the old form had: Edit now sends the supplier's id (it did not, so
 * nothing was updated), and only a real success closes the dialog (any result
 * object used to count as success).
 *
 * GSTIN and Notes are columns the suppliers table already has (bulk import
 * and the phone write GSTIN; the old form already sent an empty notes). Credit
 * days is drawn in the mockup but is NOT here: the suppliers table is not known
 * to have that column, and adding it would need a migration.
 */
const EMPTY = { name: '', contact_person: '', phone: '', email: '', gstin: '', address: '', notes: '' };
const fromSupplier = (s) => ({
  name: s?.name || '', contact_person: s?.contact_person || '', phone: s?.phone || '',
  email: s?.email || '', gstin: s?.gstin || '', address: s?.address || '', notes: s?.notes || '',
});

const Area = ({ className, ...props }) => (
  <textarea {...props}
    className={cn('flex min-h-[58px] w-full resize-none rounded-[10px] bg-surface px-3 py-2 text-[13.5px] text-ink shadow-[inset_0_0_0_1px_var(--color-line)] placeholder:text-mute focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--color-ink)]', className)} />
);

export default function SupplierForm({ open, supplier = null, billCount, onClose, addSupplier, updateSupplier, onSaved }) {
  const editing = !!supplier;
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  // One id per Add, so pressing Add again after a dropped connection cannot
  // create the same supplier twice: the second insert meets the first.
  const newId = useRef(null);

  useEffect(() => {
    if (!open) return;
    setF(editing ? fromSupplier(supplier) : EMPTY);
    setBusy(false); setMsg(null);
    newId.current = editing ? null : generateUUID();
  }, [open, editing, supplier]);

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const gErr = gstinError(f.gstin);
  const canSave = f.name.trim() && !gErr && !busy;

  const save = async (e) => {
    e?.preventDefault();
    if (!canSave) return;
    setBusy(true); setMsg(null);
    const gstin = f.gstin.trim().toUpperCase() || null;
    const fields = { ...f, name: f.name.trim(), gstin };
    let res;
    try {
      res = editing
        ? await updateSupplier({ id: supplier.id, ...fields })
        : await addSupplier({ id: newId.current, ...fields });
    } catch (err) {
      res = { success: false, error: err };
    }
    setBusy(false);
    if (res?.success) { onSaved?.(editing ? 'edited' : 'added', fields, res); onClose(); return; }
    console.error('[suppliers] save failed:', res?.error);
    const c = classifyWriteFailure(res?.error || 'The server gave no reason.', { noun: editing ? 'change' : 'supplier' });
    setMsg(c.maySaved
      ? { tone: 'warn', text: `${c.title}. It may have been saved: close and check the list before trying again. (${c.detail})` }
      : { tone: 'bad', text: `${c.title}: ${c.detail}` });
  };

  return (
    <Dialog open={open} onClose={busy ? () => {} : onClose} width={600}
      title={editing ? 'Edit Supplier' : 'Add Supplier'}
      subtitle={editing ? `${supplier.name}${billCount != null ? ` · ${billCount} ${billCount === 1 ? 'bill' : 'bills'}` : ''}` : 'Only the name is needed; the rest can be added later.'}>
      <form onSubmit={save} className="grid grid-cols-2 gap-x-3 gap-y-3.5" noValidate>
        <div className="col-span-2">
          <Label htmlFor="sup-name">Supplier name <span className="text-bad-text">*</span></Label>
          <Input id="sup-name" required autoFocus value={f.name} onChange={set('name')} />
        </div>
        <div>
          <Label htmlFor="sup-contact">Contact person</Label>
          <Input id="sup-contact" value={f.contact_person} onChange={set('contact_person')} />
        </div>
        <div>
          <Label htmlFor="sup-phone">Phone</Label>
          <Input id="sup-phone" value={f.phone} onChange={set('phone')} inputMode="tel" />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <Label htmlFor="sup-gstin">GSTIN</Label>
          <Input id="sup-gstin" value={f.gstin} onChange={set('gstin')} placeholder="15 characters" maxLength={15}
            aria-invalid={!!gErr}
            className={cn('uppercase placeholder:normal-case', gErr ? 'bg-[#FEF6F6] shadow-[inset_0_0_0_1px_#F5C2C2]' : f.gstin.trim().length === 15 && 'bg-[#F3FBF6] shadow-[inset_0_0_0_1px_#A7DDB9]')} />
          <Hint className={cn('mt-1 block', gErr && 'text-bad-text')}>{gErr && f.gstin ? gErr : 'Needed to claim ITC on their bills'}</Hint>
        </div>
        <div className="col-span-2">
          <Label htmlFor="sup-email">Email</Label>
          <Input id="sup-email" type="email" value={f.email} onChange={set('email')} placeholder="orders@supplier.in" />
        </div>
        <div className="col-span-2">
          <Label htmlFor="sup-address">Address</Label>
          <Area id="sup-address" rows={2} value={f.address} onChange={set('address')} />
        </div>
        <div className="col-span-2">
          <Label htmlFor="sup-notes">Notes</Label>
          <Area id="sup-notes" rows={2} value={f.notes} onChange={set('notes')} placeholder="Payment terms, delivery days, anything useful" />
        </div>
        {msg && <div className="col-span-2 -mt-3"><Msg tone={msg.tone}>{msg.text}</Msg></div>}
        <div className="col-span-2 mt-1 flex gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy} className="shrink-0 px-[22px]">Cancel</Button>
          <Button type="submit" className="flex-1" disabled={!canSave}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Add supplier'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
