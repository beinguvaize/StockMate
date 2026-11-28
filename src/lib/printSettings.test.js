import { describe, it, expect } from 'vitest';
import {
  resolvePrintFor, resolveInvoiceTemplate, withDocTypeSaved, docTypeKeyFor, lockedOptsFor,
  DEFAULT_INVOICE_TEMPLATE, LEGACY_INVOICE_TEMPLATE, LEGACY_TEMPLATE_IDS, isInvoiceModel, formValuesFor, defaultFormValues, countChanges,
} from './printSettings';

const REGULAR = { gst_no: '29AAAAA0000A1Z5', tax_mode: 'EXCLUSIVE' };

describe('which design prints', () => {
  it('a shop that never saved one keeps the old Classic it prints today', () => {
    expect(LEGACY_INVOICE_TEMPLATE).toBe('classic');
    expect(DEFAULT_INVOICE_TEMPLATE).toBe('model-modern');
    for (const biz of [REGULAR, { tax_mode: 'NONE' }, { tax_mode: 'EXCLUSIVE' }, {}]) {
      expect(resolveInvoiceTemplate(undefined, biz)).toBe('classic');
      expect(resolveInvoiceTemplate({}, biz)).toBe('classic');
      expect(resolveInvoiceTemplate({ paper: '80', invOpts: { bank: false } }, biz)).toBe('classic');
    }
  });
  it('the Customise form shows that Classic as selected, so saving it changes nothing', () => {
    expect(formValuesFor({}, 'TAX_INVOICE').invoiceTemplate).toBe('classic');
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
    expect(resolvePrintFor({ invOpts: 'x', docTypes: [] }, 'TAX_INVOICE').template).toBe('classic');
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

describe('the Customise form', () => {
  it('starts from what is stored, old flat keys included', () => {
    const f = formValuesFor({ invoiceTemplate: 'compact', invAccent: '#166534', invOpts: { bank: false } }, 'TAX_INVOICE');
    expect(f.invoiceTemplate).toBe('compact');
    expect(f.invAccent).toBe('#166534');
    expect(f.invOpts.bank).toBe(false);
  });
  it('reset is the new Modern with every default', () => {
    const d = defaultFormValues();
    expect(d.invoiceTemplate).toBe('model-modern');
    expect(d.invOpts.taxSummary).toBe('below');
    expect(d.docTexts.signLabel).toBe('Authorised signatory');
  });
  it('counts what differs, setting by setting', () => {
    const a = defaultFormValues();
    expect(countChanges(a, defaultFormValues())).toBe(0);
    const b = { ...a, invoiceTemplate: 'model-bold', invAccent: '#166534', invOpts: { ...a.invOpts, discountCol: false, upiQr: false } };
    expect(countChanges(b, a)).toBe(4);
  });
});
