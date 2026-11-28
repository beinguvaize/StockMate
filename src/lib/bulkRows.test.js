import { describe, it, expect } from 'vitest';
import { maskGstin, plainLabel, rowErrors, rowOutcome, summarize, needsLook } from './bulkRows';
import { defaultMapping, applyMapping, mappingProblems } from './importMapping';
import { isTransportFailure } from './writeOutcome';

describe('bulk add rows', () => {
  it('part-hides a GSTIN for the screen only', () => {
    expect(maskGstin('29ABCDE1234F1Z5')).toBe('29••••••••••1Z5');
    expect(maskGstin('')).toBe('');
    expect(maskGstin('29AB')).toBe('29AB');
  });

  it('writes column names in sentence case, without the star', () => {
    expect(plainLabel('Cost price*')).toBe('Cost price');
    expect(plainLabel('Selling Price*')).toBe('Selling price');
    expect(plainLabel('GST %')).toBe('GST %');
  });

  it('keeps the same checks, in plain words', () => {
    const cols = [
      { key: 'name', label: 'Product name*', required: true },
      { key: 'costPrice', label: 'Cost price*', num: true, required: true, validate: (v) => Number(v) > 0 || 'Cost price must be more than 0' },
      { key: 'stock', label: 'Opening stock', num: true },
    ];
    expect(rowErrors({ name: '', costPrice: '0', stock: 'twenty' }, cols)).toEqual({
      name: 'Product name is required',
      costPrice: 'Cost price must be more than 0',
      stock: 'Opening stock must be a number',
    });
    expect(rowErrors({ name: 'Item', costPrice: '5', stock: '' }, cols)).toEqual({});
  });

  it('tells a refusal from a lost answer', () => {
    const opts = { isTransport: isTransportFailure };
    expect(rowOutcome(null, opts)).toEqual({ state: 'saved' });
    expect(rowOutcome({ message: 'duplicate key value violates unique constraint "products_barcode_key"' }, opts).state).toBe('failed');
    expect(rowOutcome(new TypeError('Failed to fetch'), opts).state).toBe('unsure');
    // The chunk's answer was lost and the row's own id is already there.
    expect(rowOutcome({ code: '23505', message: 'duplicate key value violates unique constraint "products_pkey"' }, { ...opts, firstTryDropped: true }).state).toBe('unsure');
    expect(rowOutcome({ code: '23505', message: 'duplicate key value violates unique constraint "products_pkey"' }, opts).state).toBe('failed');
    expect(rowOutcome({ message: '' }, opts).reason).toBe('The shop refused it and gave no reason.');
  });

  it('counts the summary tiles from row statuses', () => {
    const st = [
      { state: 'saved' }, { state: 'saved', note: 'HSN left blank' }, { state: 'failed', reason: 'x' },
      { state: 'unsure', reason: 'y' }, { state: 'skipped' }, undefined,
    ];
    expect(summarize(st)).toEqual({ sent: 4, saved: 2, noted: 1, failed: 1, unsure: 1 });
    expect(st.filter(needsLook)).toHaveLength(3);
  });
});

describe('import column matching', () => {
  const cols = [
    { key: 'name', label: 'Name', required: true },
    { key: 'sellingPrice', label: 'Selling Price', required: true },
    { key: 'hsn', label: 'HSN Code' },
  ];
  const headers = ['Item Name', 'Sale Price', 'HSN/SAC', 'MRP'];
  // What resolveHeaders gives for these headers: hsn_code is a field the
  // importer never read, so it must start as "Do not import".
  const headerToKey = { 'Item Name': 'name', 'Sale Price': 'sellingPrice', 'HSN/SAC': 'hsn_code' };

  it('starts from the automatic matches, limited to fields the importer reads', () => {
    expect(defaultMapping(headers, headerToKey, cols)).toEqual({ 'Item Name': 'name', 'Sale Price': 'sellingPrice', 'HSN/SAC': '', MRP: '' });
  });

  it('reads only mapped columns, exactly as the importer did', () => {
    const m = defaultMapping(headers, headerToKey, cols);
    expect(applyMapping([{ 'Item Name': 'Item', 'Sale Price': 10, 'HSN/SAC': '1006', MRP: 12 }], m)).toEqual([{ name: 'Item', sellingPrice: 10 }]);
    expect(applyMapping([{ 'HSN/SAC': '1006' }], { ...m, 'HSN/SAC': 'hsn' })).toEqual([{ hsn: '1006' }]);
  });

  it('names required fields left without a column', () => {
    expect(mappingProblems({ 'Item Name': 'name', 'Sale Price': '' }, cols)).toEqual(['Selling Price']);
    expect(mappingProblems({ 'Item Name': 'name', 'Sale Price': 'sellingPrice' }, cols)).toEqual([]);
  });
});
