import React, { useMemo, useState } from 'react';
import { useDialogClose } from '../../hooks/useDialogClose';
import { createPortal } from 'react-dom';
import { X, Truck, Download, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  buildEwayJSON, downloadEwayJSON, validateEway, TRANSPORT_MODES, EWAY_THRESHOLD,
} from '../../lib/ewayBill';

// e-Way bill for one invoice: collect transport details → download the NIC
// bulk-upload JSON → user uploads on ewaybillgst.gov.in → paste the EWB
// number back here. Vehicle/transport persist on the invoice for the print.

const EwayBillModal = ({ invoice, business, client, onClose, onSaved }) => {
  useDialogClose(onClose);
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

  const total = Number(invoice.grand_total || invoice.amount || 0);
  const json = useMemo(() => buildEwayJSON(invoice, business, client, t), [invoice, business, client, t]);

  const persist = async (extra = {}) => {
    await supabase.from('invoices').update({
      vehicle_no: t.vehicleNo ? String(t.vehicleNo).toUpperCase().replace(/[\s-]/g, '') : null,
      transport: { mode: t.mode, distanceKm: t.distanceKm, transporterName: t.transporterName, transporterId: t.transporterId, toPincode: t.toPincode, toPlace: t.toPlace },
      ...extra,
    }).eq('id', invoice.id);
    onSaved?.();
  };

  const handleDownload = async () => {
    const problems = validateEway(json);
    setErrs(problems);
    if (problems.length) return;
    downloadEwayJSON(json, `EWB_${invoice.invoice_number || invoice.id}.json`);
    await persist();
  };

  const handleSaveEwb = async () => {
    await persist({ eway_no: ewbNo.trim() || null });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const input = 'w-full border border-black/10 rounded-lg px-2.5 py-2 text-[13px] outline-none focus:border-accent-signature';
  const label = 'block text-[11px] font-bold text-gray-500 mb-1';

  return createPortal(
    <div className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-black/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck size={17} className="text-accent-signature" />
            <div>
              <h2 className="text-[15px] font-black text-ink-primary">e-Way Bill</h2>
              <p className="text-[11px] text-gray-400">{invoice.invoice_number} · ₹{total.toLocaleString('en-IN')}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center"><X size={15} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {total < EWAY_THRESHOLD && (
            <div className="px-3 py-2 rounded-lg bg-accent-signature/10 border border-accent-signature/25 text-[11.5px] text-accent-signature-hover font-medium">
              Below ₹50,000 — e-Way bill usually not mandatory, generate only if needed.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Transport mode</label>
              <select value={t.mode} onChange={e => setT({ ...t, mode: e.target.value })} className={input}>
                {TRANSPORT_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Distance (km)</label>
              <input type="number" value={t.distanceKm} onChange={e => setT({ ...t, distanceKm: e.target.value })} className={input} placeholder="e.g. 120" />
            </div>
            <div>
              <label className={label}>Vehicle number</label>
              <input value={t.vehicleNo} onChange={e => setT({ ...t, vehicleNo: e.target.value.toUpperCase() })} className={`${input} font-mono`} placeholder="KL07AB1234" />
            </div>
            <div>
              <label className={label}>Transporter name (optional)</label>
              <input value={t.transporterName} onChange={e => setT({ ...t, transporterName: e.target.value })} className={input} />
            </div>
            <div>
              <label className={label}>From pincode</label>
              <input value={t.fromPincode} onChange={e => setT({ ...t, fromPincode: e.target.value.replace(/\D/g, '').slice(0, 6) })} className={`${input} font-mono`} />
            </div>
            <div>
              <label className={label}>To pincode</label>
              <input value={t.toPincode} onChange={e => setT({ ...t, toPincode: e.target.value.replace(/\D/g, '').slice(0, 6) })} className={`${input} font-mono`} />
            </div>
          </div>

          {errs.length > 0 && (
            <ul className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[11.5px] text-red-600 space-y-0.5">
              {errs.map(e => <li key={e}>• {e}</li>)}
            </ul>
          )}

          <button onClick={handleDownload}
            className="w-full py-2.5 rounded-xl bg-ink-primary text-white text-[12px] font-black flex items-center justify-center gap-2 hover:opacity-90">
            <Download size={14} /> Download NIC JSON (bulk upload)
          </button>
          <p className="text-[11px] text-gray-400 -mt-2">
            Upload at ewaybillgst.gov.in → e-Waybill → Generate Bulk. Paste the EWB number below after generation.
          </p>

          <div>
            <label className={label}>e-Way bill number (after portal generation)</label>
            <div className="flex gap-2">
              <input value={ewbNo} onChange={e => setEwbNo(e.target.value)} className={`${input} font-mono flex-1`} placeholder="12-digit EWB no." />
              <button onClick={handleSaveEwb}
                className="shrink-0 px-4 rounded-lg border border-accent-signature/40 text-accent-signature text-[12px] font-black hover:bg-accent-signature/10">
                {saved ? <CheckCircle2 size={14} /> : 'Save'}
              </button>
            </div>
            <p className="text-[10.5px] text-gray-400 mt-1">Saved EWB + vehicle number print on the invoice.</p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default EwayBillModal;
