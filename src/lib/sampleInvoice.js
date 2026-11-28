/**
 * The made-up invoice the Customise page previews and prints as a test page.
 * Built through calculateGST, the same computation a saved invoice uses, so
 * the preview's figures add up the way a real invoice's do. Names and figures
 * are samples, not anyone's data.
 */
import { calculateGST } from './gstEngine';
import { todayISOInAppTZ } from './utils';
import { addDays } from './dashboardFigures';

const LINES = [
  { name: 'Sample item one', hsn_code: '1006', qty: 2, rate: 480, taxRate: 5, unit: 'BAG', description: 'Item note, when switched on' },
  { name: 'Sample item two', hsn_code: '1512', qty: 6, rate: 145, taxRate: 5, unit: 'PCS', discountPercent: 2 },
  { name: 'Sample item three', hsn_code: '3402', qty: 4, rate: 118.5, taxRate: 18, unit: 'PCS' },
];

export const SAMPLE_CLIENT = { name: 'Sample Client', address: '12 Sample Road, Sample Town 560001', state: 'Karnataka', contact: '00000 00000', gst_no: '29ABCDE0000F1Z5', outstanding_balance: 2500 };

export function sampleInvoice({ taxed = true, sellerState = 'Karnataka' } = {}) {
  const gst = calculateGST(LINES, sellerState, SAMPLE_CLIENT.state, { taxMode: taxed ? 'EXCLUSIVE' : 'NONE' });
  const today = todayISOInAppTZ();
  return {
    id: 'sample', invoice_number: 'INV-0001', invoice_date: today,
    due_date: addDays(today, 15), items: gst.items, is_interstate: gst.isInterstate,
    taxable_amount: gst.taxable, tax_total: gst.totalTax, cgst_amount: gst.cgst, sgst_amount: gst.sgst, igst_amount: gst.igst,
    round_off: gst.roundOff, grand_total: gst.grandTotal, paid_amount: 1000, payment_status: 'PARTIAL',
    place_of_supply: SAMPLE_CLIENT.state,
  };
}
