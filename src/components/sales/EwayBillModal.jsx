import React, { useMemo, useState } from 'react';
import { Download, CheckCircle2, ChevronDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  buildEwayJSON, downloadEwayJSON, validateEway, TRANSPORT_MODES, EWAY_THRESHOLD,
} from '../../lib/ewayBill';
import Dialog from '../ui/Dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import WriteFailure from '../invoices/WriteFailure';

// e-Way bill for one invoice: collect transport details → download the NIC
// bulk-upload JSON → user uploads on ewaybillgst.gov.in → paste the EWB
// number back here. Vehicle/transport persist on the invoice for the print.
//
// Web redesign (approved invoices-12): same fields, same writes. A refused or
// unconfirmed save is now shown instead of passing silently.

const Lbl = ({ htmlFor, children }) => (
  <label htmlFor={htmlFor} className="mb-1.5 block font-tight text-[12.5px] font-semibold text-ink-2">{children}</label>
);

const EwayBillModal = ({ invoice, business, client, onClose, onSaved }) => {
  const [t, setT] = useState({
    mode: '1',
    distanceKm: invoice.transport?.distanceKm || '',
    vehicleNo: invoice.vehicle_no || '',
    transporterName: invoice.transport?.transporterName || '',
    transporterId: invoice.transport?.transporterId || '',
    fromPincode: business?.pin_code || business?.pincode || '',
    toPincode: client?.pin_code || client?.pincode || '',
    toPlace: client?.city || client?.state || '',
  });
  const [ewbNo, setEwbNo] = useState(invoice.eway_no || '');
  const [errs, setErrs] = useState([]);
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState(null);

  const total = Number(invoice.grand_total || invoice.amount || 0);
  const json = useMemo(() => buildEwayJSON(invoice, business, client, t), [invoice, business, client, t]);

  const persist = async (extra = {}) => {
    setFailure(null);
    const { error } = await supabase.from('invoices').update({
      vehicle_no: t.vehicleNo ? String(t.vehicleNo).toUpperCase().replace(/[\s-]/g, '') : null,
      transport: { mode: t.mode, distanceKm: t.distanceKm, transporterName: t.transporterName, transporterId: t.transporterId, toPincode: t.toPincode, toPlace: t.toPlace },
      ...extra,
    }).eq('id', invoice.id);
    if (error) { setFailure(error); onSaved?.(); return false; }
    onSaved?.();
    return true;
  };

  const handleDownload = async () => {
    const problems = validateEway(json);
    setErrs(problems);
    if (problems.length) return;
    downloadEwayJSON(json, `EWB_${invoice.invoice_number || invoice.id}.json`);
    await persist();
  };

  const handleSaveEwb = async () => {
    const ok = await persist({ eway_no: ewbNo.trim() || null });
    if (!ok) return;
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const set = (k) => (e) => setT({ ...t, [k]: e.target.value });

  return (
    <Dialog open onClose={onClose} width={520} title="e-Way Bill"
      subtitle={[invoice.invoice_number, `₹${total.toLocaleString('en-IN')}`, client?.name].filter(Boolean).join(' · ')}>
      {total < EWAY_THRESHOLD && (
        <div className="mb-3.5 rounded-[10px] bg-amber-soft px-3 py-[9px] text-[12.5px] text-amber-text">
          Below ₹50,000, an e-Way bill is usually not needed. Make one only if you need it.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Lbl htmlFor="ewb-mode">Transport mode</Lbl>
          <div className="relative">
            <select id="ewb-mode" value={t.mode} onChange={set('mode')}
              className="h-9 w-full appearance-none rounded-[10px] bg-surface px-3 pr-8 text-[13.5px] text-ink shadow-[inset_0_0_0_1px_var(--color-line)] outline-none focus:shadow-[inset_0_0_0_2px_var(--color-ink)]">
              {TRANSPORT_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-mute" />
          </div>
        </div>
        <div>
          <Lbl htmlFor="ewb-km">Distance, km</Lbl>
          <Input id="ewb-km" type="number" value={t.distanceKm} onChange={set('distanceKm')} placeholder="e.g. 120" />
        </div>
        <div>
          <Lbl htmlFor="ewb-veh">Vehicle number</Lbl>
          <Input id="ewb-veh" value={t.vehicleNo} onChange={e => setT({ ...t, vehicleNo: e.target.value.toUpperCase() })} placeholder="KL07AB1234" />
        </div>
        <div>
          <Lbl htmlFor="ewb-tr">Transporter name, optional</Lbl>
          <Input id="ewb-tr" value={t.transporterName} onChange={set('transporterName')} />
        </div>
        <div>
          <Lbl htmlFor="ewb-from">From pincode</Lbl>
          <Input id="ewb-from" value={t.fromPincode} onChange={e => setT({ ...t, fromPincode: e.target.value.replace(/\D/g, '').slice(0, 6) })} />
        </div>
        <div>
          <Lbl htmlFor="ewb-to">To pincode</Lbl>
          <Input id="ewb-to" value={t.toPincode} onChange={e => setT({ ...t, toPincode: e.target.value.replace(/\D/g, '').slice(0, 6) })} />
        </div>
      </div>

      {errs.length > 0 && (
        <ul className="mt-3 list-disc rounded-[10px] bg-bad-soft py-[9px] pl-7 pr-3 text-[12.5px] text-bad-text">
          {errs.map(e => <li key={e}>{e}</li>)}
        </ul>
      )}

      <Button variant="dark" size="lg" className="mt-4 w-full" onClick={handleDownload}>
        <Download /> Download file for the e-Way bill portal
      </Button>
      <p className="mt-1.5 text-[12px] text-mute">
        Upload it at ewaybillgst.gov.in, under e-Waybill, Generate Bulk. Then type the e-Way bill number below.
      </p>

      <div className="my-3 border-t border-sep" />
      <Lbl htmlFor="ewb-no">e-Way bill number, after the portal makes it</Lbl>
      <div className="flex gap-2">
        <Input id="ewb-no" value={ewbNo} onChange={e => setEwbNo(e.target.value)} placeholder="12 digit number" className="flex-1" />
        <Button variant="secondary" onClick={handleSaveEwb} aria-label="Save e-Way bill number">
          {saved ? <CheckCircle2 className="text-good-text" /> : 'Save'}
        </Button>
      </div>
      <span className="mt-1.5 block text-[12px] text-mute">The saved e-Way bill number and vehicle number print on the invoice.</span>
      <WriteFailure error={failure} noun="e-Way bill" onReread={onSaved} className="mt-3" />
    </Dialog>
  );
};

export default EwayBillModal;
