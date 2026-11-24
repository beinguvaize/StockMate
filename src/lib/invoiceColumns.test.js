import { describe, it, expect } from 'vitest';
import {
  COLUMN_DEFS, GST_INVOICE_COLUMNS, SIMPLE_INVOICE_COLUMNS,
  resolveColumns, spanOf, columnCount, isInterstate,
} from './invoiceColumns';

const withHsn    = { invoice: {}, opts: { hsn: true } };
const noHsn      = { invoice: {}, opts: { hsn: false } };
const interstate = { invoice: { is_interstate: true }, opts: { hsn: true } };

describe('the registry is well formed', () => {
  it('every named column exists and can print a value', () => {
    for (const id of [...GST_INVOICE_COLUMNS, ...SIMPLE_INVOICE_COLUMNS]) {
      const def = COLUMN_DEFS[id];
      expect(def, `no column def for "${id}"`).toBeTruthy();
      expect(def.header, `${id}.header`).toBeTruthy();
      expect(typeof def.value, `${id}.value`).toBe('function');
    }
  });
});

describe('isInterstate', () => {
  it('accepts both spellings that exist in the data', () => {
    expect(isInterstate({ is_interstate: true })).toBe(true);
    expect(isInterstate({ isInterstate: true })).toBe(true);
    expect(isInterstate({})).toBe(false);
    expect(isInterstate()).toBe(false);
  });
});

describe('resolveColumns', () => {
  it('drops HSN when the print option is off', () => {
    expect(resolveColumns(GST_INVOICE_COLUMNS, withHsn).map(c => c.id)).toContain('hsn');
    expect(resolveColumns(GST_INVOICE_COLUMNS, noHsn).map(c => c.id)).not.toContain('hsn');
  });

  it('shows IGST alone on an interstate bill', () => {
    const ids = resolveColumns(GST_INVOICE_COLUMNS, interstate).map(c => c.id);
    expect(ids).toContain('igst');
    expect(ids).not.toContain('cgst');
    expect(ids).not.toContain('sgst');
  });

  it('shows CGST and SGST on an intrastate bill, and never IGST too', () => {
    const ids = resolveColumns(GST_INVOICE_COLUMNS, withHsn).map(c => c.id);
    expect(ids).toEqual(expect.arrayContaining(['cgst', 'sgst']));
    expect(ids).not.toContain('igst');
  });

  it('keeps the declared order', () => {
    const ids = resolveColumns(GST_INVOICE_COLUMNS, withHsn).map(c => c.id);
    expect(ids).toEqual(['index', 'name', 'hsn', 'qty', 'rate', 'taxable', 'gstPct', 'cgst', 'sgst', 'amount']);
  });

  it('ignores an id the registry does not define', () => {
    expect(resolveColumns(['index', 'nope'], withHsn).map(c => c.id)).toEqual(['index']);
  });
});

describe('spanOf — the arithmetic that used to be written by hand', () => {
  // The classic table had colSpan={invOpts.hsn ? 5 : 4} for the TOTAL label,
  // and colSpan={(interstate ? 8 : 9) - (hsn ? 0 : 1)} for the spacer. Both
  // were literals somebody had to re-derive when a column moved.
  it('matches the old hand-computed TOTAL span', () => {
    expect(spanOf(GST_INVOICE_COLUMNS, withHsn, 'taxable')).toBe(5);
    expect(spanOf(GST_INVOICE_COLUMNS, noHsn,   'taxable')).toBe(4);
  });

  it('counts the columns after the first, which the spacer row spans', () => {
    expect(columnCount(GST_INVOICE_COLUMNS, withHsn) - 1).toBe(9);
    expect(columnCount(GST_INVOICE_COLUMNS, noHsn) - 1).toBe(8);
    expect(columnCount(GST_INVOICE_COLUMNS, interstate) - 1).toBe(8);
  });

  it('returns the full count for an id that is not shown', () => {
    // Asking where a hidden column sits must not silently return 0 and merge
    // the whole totals row into one cell.
    expect(spanOf(GST_INVOICE_COLUMNS, noHsn, 'hsn')).toBe(columnCount(GST_INVOICE_COLUMNS, noHsn));
  });

  it('still adds up when a NEW column is introduced', () => {
    // The whole point. A sector column lands in the list and the spans move
    // on their own; nobody edits a literal.
    const withPart = ['index', 'name', 'partNo', 'hsn', 'qty', 'rate', 'taxable', 'gstPct', 'cgst', 'sgst', 'amount'];
    COLUMN_DEFS.partNo = { id: 'partNo', header: 'Part no', align: 'left', value: (it) => it.part_no || '' };
    expect(spanOf(withPart, withHsn, 'taxable')).toBe(6);
    delete COLUMN_DEFS.partNo;
  });
});

describe('values', () => {
  const line = { name: 'Widget', hsn_code: '8479', qty: 2, rate: 100, taxAmount: 36, total: 236, taxRate: 18 };

  it('prints money to two places', () => {
    expect(COLUMN_DEFS.rate.value(line)).toBe('100.00');
    expect(COLUMN_DEFS.amount.value(line)).toBe('236.00');
  });

  it('derives taxable from qty x rate when the line has none', () => {
    expect(COLUMN_DEFS.taxable.value(line)).toBe('200.00');
  });

  it('prefers the line’s own taxable when it carries one', () => {
    expect(COLUMN_DEFS.taxable.value({ ...line, taxable: 190 })).toBe('190.00');
  });

  it('halves the tax for CGST and SGST, and does not for IGST', () => {
    expect(COLUMN_DEFS.cgst.value(line)).toBe('18.00');
    expect(COLUMN_DEFS.sgst.value(line)).toBe('18.00');
    expect(COLUMN_DEFS.igst.value(line)).toBe('36.00');
  });

  it('shows an em dash for a missing HSN rather than an empty cell', () => {
    expect(COLUMN_DEFS.hsn.value({})).toBe('—');
  });

  it('is safe on an empty line', () => {
    for (const id of GST_INVOICE_COLUMNS) {
      expect(() => COLUMN_DEFS[id].value({}, {}, 0)).not.toThrow();
    }
  });
});
