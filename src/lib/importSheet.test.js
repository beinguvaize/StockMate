import { describe, it, expect } from 'vitest';
import {
  mapHeaders, parseNumber, resolveHeaders,
  ITEM_COLUMNS, PARTY_COLUMNS, SUPPLIER_COLUMNS,
} from './importSheet.js';

/**
 * Importing somebody else's spreadsheet.
 * ==========================================================================
 *
 * The sheet was not written for this app. It is a competitor's export with
 * their headers, Excel's idea of a phone number, and a thousand rows nobody
 * will read before pressing Import. Two properties matter more than any
 * other, and most of these tests are about one of them:
 *
 *   1. a sheet that is nearly right must import anyway (headers, formats);
 *   2. a value that is wrong must STOP, not get coerced — an item imported at
 *      price 0 is sold for nothing until somebody notices.
 */

describe('finding the columns', () => {
  it('matches headers however they are written', () => {
    const { mapping } = mapHeaders(['ITEM NAME', ' sale_price ', 'Hsn/Sac'], ITEM_COLUMNS);
    expect(mapping.name).toBe('ITEM NAME');
    expect(mapping.sellingPrice).toBe(' sale_price ');
    expect(mapping.hsn_code).toBe('Hsn/Sac');
  });

  it('reads a competitor export without the shopkeeper editing a cell', () => {
    // These are Vyapar's own column names. If this fails, the shop has to
    // rewrite its sheet by hand, which is where most imports are abandoned.
    const vyapar = ['Item Code', 'Item Name', 'HSN', 'Sale Price', 'Purchase Price',
      'Opening Stock Quantity', 'Minimum Stock Quantity', 'Item Location', 'Tax Rate'];
    const { mapping } = mapHeaders(vyapar, ITEM_COLUMNS);
    expect(mapping.sku).toBe('Item Code');
    expect(mapping.name).toBe('Item Name');
    expect(mapping.sellingPrice).toBe('Sale Price');
    expect(mapping.costPrice).toBe('Purchase Price');
    expect(mapping.stock).toBe('Opening Stock Quantity');
    expect(mapping.lowStockThreshold).toBe('Minimum Stock Quantity');
  });

  it('reports the columns it could not place', () => {
    // Silently dropping a column is how a shop discovers months later that
    // nothing has a brand against it.
    const { ignored } = mapHeaders(['Item Name', 'Sale Price', 'Brand', 'Shelf'], ITEM_COLUMNS);
    expect(ignored).toEqual(['Brand', 'Shelf']);
  });

  it('does not let one header fill two fields', () => {
    const { mapping } = mapHeaders(['Name'], PARTY_COLUMNS);
    expect(mapping.name).toBe('Name');
    expect(Object.values(mapping).filter((h) => h === 'Name')).toHaveLength(1);
  });
});

describe('reading a number out of a cell', () => {
  it('survives the way spreadsheets write money', () => {
    expect(parseNumber('1,250.00')).toBe(1250);
    expect(parseNumber('₹1250')).toBe(1250);
    expect(parseNumber(' 5 ')).toBe(5);
    expect(parseNumber('12%')).toBe(12);
    expect(parseNumber(18)).toBe(18);
  });

  it('tells "not given" apart from "not a number"', () => {
    // The difference decides whether the row keeps a default or is rejected.
    expect(parseNumber('')).toBeUndefined();
    expect(parseNumber(null)).toBeUndefined();
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('12.5.6')).toBeNull();
  });
});

describe('resolving a real sheet', () => {
  const PRODUCT_LABELS = [
    { key: 'name', label: 'Name', required: true },
    { key: 'sellingPrice', label: 'Selling Price', required: true },
    { key: 'costPrice', label: 'Cost Price', required: true },
    { key: 'stock', label: 'Opening Stock' },
  ];

  it('still accepts a sheet downloaded from this app', () => {
    // The importer's own labels must keep working, or every existing customer
    // template breaks the day the aliases land.
    const { headerToKey, missingRequired } = resolveHeaders(
      ['Name', 'Selling Price', 'Cost Price', 'Opening Stock'], ITEM_COLUMNS, PRODUCT_LABELS,
    );
    expect(headerToKey).toMatchObject({
      Name: 'name', 'Selling Price': 'sellingPrice', 'Cost Price': 'costPrice', 'Opening Stock': 'stock',
    });
    expect(missingRequired).toEqual([]);
  });

  it('accepts a competitor export with no editing', () => {
    const { headerToKey, missingRequired } = resolveHeaders(
      ['Item Name', 'Sale Price', 'Purchase Price', 'Opening Stock Quantity'],
      ITEM_COLUMNS, PRODUCT_LABELS,
    );
    expect(headerToKey['Item Name']).toBe('name');
    expect(headerToKey['Sale Price']).toBe('sellingPrice');
    expect(headerToKey['Purchase Price']).toBe('costPrice');
    expect(headerToKey['Opening Stock Quantity']).toBe('stock');
    expect(missingRequired).toEqual([]);
  });

  it('names the required column that is genuinely absent', () => {
    const { missingRequired } = resolveHeaders(['Item Name', 'Qty'], ITEM_COLUMNS, PRODUCT_LABELS);
    expect(missingRequired).toContain('Selling Price');
  });

  it('reports the columns it will ignore', () => {
    const { ignored } = resolveHeaders(
      ['Item Name', 'Sale Price', 'Brand', 'Shelf'], ITEM_COLUMNS, PRODUCT_LABELS,
    );
    expect(ignored).toEqual(['Brand', 'Shelf']);
  });

  it('does not map two headers onto one field', () => {
    // "Price" and "Sale Price" are both aliases of sellingPrice; the second
    // must be reported as ignored rather than silently overwriting the first.
    const { headerToKey, ignored } = resolveHeaders(
      ['Item Name', 'Sale Price', 'Price'], ITEM_COLUMNS, PRODUCT_LABELS,
    );
    expect(Object.values(headerToKey).filter((f) => f === 'sellingPrice')).toHaveLength(1);
    expect(ignored).toContain('Price');
  });

  it('maps a supplier sheet too', () => {
    const { headerToKey } = resolveHeaders(
      ['Supplier Name', 'Contact Person', 'Mobile No'], SUPPLIER_COLUMNS, [],
    );
    expect(headerToKey['Supplier Name']).toBe('name');
    expect(headerToKey['Contact Person']).toBe('contact_person');
    expect(headerToKey['Mobile No']).toBe('phone');
  });
});
