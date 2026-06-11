// e-Way bill generation — NIC bulk-upload JSON (ewaybillgst.gov.in →
// e-Waybill → Generate Bulk). No GSP/API credentials needed: the user
// uploads the JSON on the portal and gets the EWB number back, which we
// store on the invoice. Portal API integration can slot in later.

import { getStateCode } from '../utils/gstReporting';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// dd/mm/yyyy as the NIC tool expects.
const nicDate = (d) => {
  const dt = d ? new Date(d) : new Date();
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
};

export const TRANSPORT_MODES = [
  { id: '1', label: 'Road' },
  { id: '2', label: 'Rail' },
  { id: '3', label: 'Air' },
  { id: '4', label: 'Ship' },
];

export const isValidVehicleNo = (v) =>
  /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/.test(String(v || '').toUpperCase().replace(/[\s-]/g, ''));

// e-Way bill mandatory above ₹50,000 consignment value.
export const EWAY_THRESHOLD = 50000;

/**
 * Build the NIC bulk JSON for one invoice.
 * transport: { mode, distanceKm, vehicleNo, transporterId, transporterName,
 *              fromPincode, toPincode, toPlace }
 */
export const buildEwayJSON = (invoice, business = {}, client = {}, transport = {}) => {
  const items = (invoice.items || []).map((it) => {
    const qty = Number(it.qty || it.quantity || 0);
    const rate = Number(it.rate || it.price || 0);
    const taxRate = Number(it.taxRate ?? it.tax_rate ?? 0);
    const taxable = qty * rate;
    const inter = !!(invoice.is_interstate || invoice.isInterstate);
    return {
      productName: it.name || 'Item',
      productDesc: it.name || 'Item',
      hsnCode: Number(String(it.hsn_code || it.hsn || '0').replace(/\D/g, '')) || 0,
      quantity: qty,
      qtyUnit: (it.unit || 'NOS').toUpperCase().slice(0, 3),
      taxableAmount: round2(taxable),
      cgstRate: inter ? 0 : taxRate / 2,
      sgstRate: inter ? 0 : taxRate / 2,
      igstRate: inter ? taxRate : 0,
      cessRate: 0,
    };
  });

  const fromState = Number(getStateCode(business.state || '')) || 0;
  const toState = Number(getStateCode(client.state || '')) ||
    Number(String(client.gstin || client.gst_no || '').slice(0, 2)) || fromState;

  const bill = {
    userGstin: business.gst_no || '',
    supplyType: 'O',
    subSupplyType: '1',
    subSupplyDesc: '',
    docType: 'INV',
    docNo: invoice.invoice_number || invoice.id,
    docDate: nicDate(invoice.invoice_date || invoice.date),

    fromGstin: business.gst_no || '',
    fromTrdName: business.name || '',
    fromAddr1: (business.address || '').slice(0, 120),
    fromPlace: (business.city || business.place || business.state || '').slice(0, 50),
    fromPincode: Number(transport.fromPincode || business.pin_code || business.pincode || 0),
    fromStateCode: fromState,
    actualFromStateCode: fromState,

    toGstin: client.gstin || client.gst_no || 'URP',
    toTrdName: client.name || 'Unregistered',
    toAddr1: (client.address || '').slice(0, 120),
    toPlace: (transport.toPlace || client.city || client.state || '').slice(0, 50),
    toPincode: Number(transport.toPincode || client.pin_code || client.pincode || 0),
    toStateCode: toState,
    actualToStateCode: toState,

    totalValue: round2(invoice.taxable_amount || 0),
    cgstValue: round2(invoice.cgst_amount || 0),
    sgstValue: round2(invoice.sgst_amount || 0),
    igstValue: round2(invoice.igst_amount || 0),
    cessValue: 0,
    cessNonAdvolValue: 0,
    otherValue: 0,
    totInvValue: round2(invoice.grand_total || invoice.amount || 0),

    transMode: String(transport.mode || '1'),
    transDistance: String(Math.max(1, Math.round(Number(transport.distanceKm || 0)))),
    transporterId: transport.transporterId || '',
    transporterName: transport.transporterName || '',
    transDocNo: '',
    transDocDate: '',
    vehicleNo: String(transport.vehicleNo || '').toUpperCase().replace(/[\s-]/g, ''),
    vehicleType: 'R',

    itemList: items,
  };

  return { version: '1.0.0421', billLists: [bill] };
};

export const downloadEwayJSON = (json, filename) => {
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
};

// Pre-upload sanity checks mirroring the portal's common rejections.
export const validateEway = (json) => {
  const b = json.billLists[0];
  const errs = [];
  if (!/^[0-9]{2}[A-Z0-9]{13}$/.test(b.userGstin)) errs.push('Business GSTIN missing/invalid (set it in Settings → Business).');
  if (!b.fromPincode || String(b.fromPincode).length !== 6) errs.push('From pincode must be 6 digits.');
  if (!b.toPincode || String(b.toPincode).length !== 6) errs.push('To pincode must be 6 digits.');
  if (b.transMode === '1' && !isValidVehicleNo(b.vehicleNo)) errs.push('Vehicle number looks invalid (e.g. KL07AB1234).');
  if (!Number(b.transDistance)) errs.push('Distance (km) required.');
  if (!b.itemList.length) errs.push('Invoice has no items.');
  return errs;
};
