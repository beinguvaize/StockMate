/** Shops and documents for the "prints as before" comparison. Made-up data. */
export const LEGACY_INVOICE = {
  id: 'inv-l1', invoice_number: 'INV-L001', invoice_date: '2026-11-24', due_date: '2026-12-09',
  created_at: '2026-11-24T04:42:00Z', client_id: 'c1', sale_id: 's1',
  items: [
    { name: 'Item alpha', hsn_code: '1101', qty: 20, rate: 250, taxRate: 5, unit: 'BAG' },
    { name: 'Item beta', hsn_code: '1512', quantity: 24, rate: 145, taxRate: 5 },
    { name: 'Item gamma', hsn_code: '3402', qty: 30, rate: 118.5, taxRate: 18 },
  ],
  taxable_amount: 11035, tax_total: 1064.75, cgst_amount: 532.38, sgst_amount: 532.37, igst_amount: 0,
  round_off: 0.25, grand_total: 12100, paid_amount: 6000, payment_status: 'PARTIAL',
  eway_no: '341055218790', vehicle_no: 'KA01AB4521',
};
export const LEGACY_CLIENT = { id: 'c1', name: 'Test Buyer Co', address: '9 Other Road, Testnagar', state: 'Karnataka', gst_no: '29BBBBB0000B1Z5', outstanding_balance: 6100 };
const BASE = { name: 'Sample Traders', address: '1 Test Street, Testpur', state: 'Karnataka', phone: '0000000000', upi_id: 'sample@upi', bank_name: 'Test Bank', account_no: 'XXXX0001', ifsc_code: 'TEST0000001' };
export const LEGACY_SHOPS = {
  registered: { ...BASE, gst_no: '29AAAAA0000A1Z5', tax_mode: 'EXCLUSIVE' },
  noGstin: { ...BASE, tax_mode: 'EXCLUSIVE' },
  taxModeNone: { ...BASE, gst_no: '29AAAAA0000A1Z5', tax_mode: 'NONE' },
  inclusiveSavedOther: { ...BASE, gst_no: '29AAAAA0000A1Z5', tax_mode: 'INCLUSIVE', print_settings: { paper: '80', invOpts: { bank: false } } },
};
export const LEGACY_SALE = { invoice_number: 'SAL-L1', id: 'SAL-L1', date: '2026-11-24', created_at: '2026-11-24T06:10:00Z', grand_total: 590, paid_amount: 590, payment_status: 'PAID', items: [{ name: 'Item one', quantity: 2, rate: 250, taxRate: 18 }] };
