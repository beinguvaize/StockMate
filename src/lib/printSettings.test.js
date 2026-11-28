import { describe, it, expect } from 'vitest';
import {
  resolvePrintFor, resolveInvoiceTemplate, withDocTypeSaved, docTypeKeyFor, lockedOptsFor,
  DEFAULT_INVOICE_TEMPLATE, LEGACY_TEMPLATE_IDS, isInvoiceModel,
} from './printSettings';

const REGULAR = { gst_no: '29AAAAA0000A1Z5', tax_mode: 'EXCLUSIVE' };

describe('which design prints', () => {
  it('a shop that never saved one gets the default, the new Modern', () => {
    expect(DEFAULT_INVOICE_TEMPLATE).toBe('model-modern');
    expect(resolveInvoiceTemplate(undefined, REGULAR)).toBe('model-modern');
    expect(resolveInvoiceTemplate({}, REGULAR)).toBe('model-modern');
    expect(resolveInvoiceTemplate({ paper: '80' }, REGULAR)).toBe('model-modern');
  });
  it('a saved older design is kept exactly', () => {
    for (const id of LEGACY_TEMPLATE_IDS) {
      expect(resolveInvoiceTemplate({ invoiceTemplate: id }, REGULAR)).toBe(id);
      expect(isInvoiceModel(id)).toBe(false);
    }
  });
  it('a value saved for the document type wins over the flat one', () => {
    const p = { invoiceTemplate: 'classic', docTypes: { TAX_INVOICE: { invoiceTemplate: 'model-bold' } } };
    expect(resolveInvoiceTemplate(p, REGULAR)).toBe('model-bold');
    // another document type still reads the flat value
    expect(resolveInvoiceTemplate(p, { tax_mode: 'NONE' })).toBe('classic');
  });
});

describe('options and texts', () => {
  it('old flat options still apply; per-type ones win', () => {
    const r = resolvePrintFor({ invOpts: { bank: false, words: false }, docTypes: { TAX_INVOICE: { invOpts: { words: true } } } }, 'TAX_INVOICE');
    expect(r.opts.bank).toBe(false);
    expect(r.opts.words).toBe(true);
    expect(r.opts.discountCol).toBe(true);
    expect(r.opts.taxSummary).toBe('below');
  });
  it('a broken stored value reads as nothing, never throws', () => {
    expect(resolvePrintFor({ invOpts: 'x', docTypes: [] }, 'TAX_INVOICE').template).toBe('model-modern');
  });
});

describe('saving writes only the new key', () => {
  it('keeps every other key as it was', () => {
    const before = { paper: '58', receiptTemplate: 'bold', invoiceTemplate: 'classic', invOpts: { bank: false }, customFields: [{ label: 'A', value: 'B' }] };
    const after = withDocTypeSaved(before, 'TAX_INVOICE', { invoiceTemplate: 'model-compact', invAccent: '#166534', invOpts: { upiQr: false }, docTexts: { invFooter: 'Thanks' } });
    expect(after).toMatchObject({ paper: '58', receiptTemplate: 'bold', invoiceTemplate: 'classic', invOpts: { bank: false } });
    expect(after.customFields).toEqual(before.customFields);
    expect(after.docTypes.TAX_INVOICE).toEqual({ invoiceTemplate: 'model-compact', invAccent: '#166534', invOpts: { upiQr: false }, docTexts: { invFooter: 'Thanks' } });
    expect(before.docTypes).toBeUndefined();
  });
});

describe('document type and locked fields', () => {
  it('follows the shop\'s GST registration', () => {
    expect(docTypeKeyFor(REGULAR)).toBe('TAX_INVOICE');
    expect(docTypeKeyFor({ ...REGULAR, gst_registration_type: 'COMPOSITION' })).toBe('BILL_OF_SUPPLY');
    expect(docTypeKeyFor({ tax_mode: 'NONE' })).toBe('INVOICE');
  });
  it('locks GSTIN, HSN and buyer address on a tax invoice only', () => {
    expect(lockedOptsFor('TAX_INVOICE')).toEqual({ gstin: true, hsn: true, clientAddr: true });
    expect(lockedOptsFor('BILL_OF_SUPPLY')).toEqual({});
  });
});
