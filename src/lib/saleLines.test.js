import { describe, it, expect } from 'vitest';
import { rowToLine, hydrateSale, hydrateSales, hydrateInvoicesFromSales } from './saleLines';

const row = (o = {}) => ({
  line_no: 1, product_id: 'P1', product_name: 'Widget',
  hsn_code: '39231090', quantity: '2', rate: '50',
  tax_rate: '18', cess_rate: '0', discount: '0',
  unit: null, sell_unit_name: null, sell_qty: null, sell_unit_price: null,
  ...o,
});

describe('rowToLine', () => {
  it('maps to the blob key names the readers already use', () => {
    expect(rowToLine(row())).toMatchObject({
      id: 'P1', productId: 'P1', name: 'Widget',
      quantity: 2, rate: 50, taxRate: 18, hsn: '39231090',
    });
  });

  it('returns numbers, not the strings PostgREST sends for numeric', () => {
    const l = rowToLine(row({ quantity: '2.5', rate: '11.50' }));
    expect(l.quantity).toBe(2.5);
    expect(l.rate).toBe(11.5);
    expect(typeof l.taxRate).toBe('number');
  });

  it('carries discount and uqc, which feed the GSTR-1 taxable value and HSN summary', () => {
    const l = rowToLine(row({ discount: '25', unit: 'PCS' }));
    expect(l.discount).toBe(25);
    expect(l.uqc).toBe('PCS');
    expect(l.unit).toBe('PCS');
  });

  it('omits the alt-unit keys entirely when the line has none', () => {
    expect('sellUnitName' in rowToLine(row())).toBe(false);
  });

  it('carries the alt-unit snapshot when present', () => {
    expect(rowToLine(row({ sell_unit_name: 'Packet', sell_qty: '4', sell_unit_price: '40' })))
      .toMatchObject({ sellUnitName: 'Packet', sellQty: 4, sellUnitPrice: 40 });
  });

  it('flattens embedded serials to the imeis array the receipt prints', () => {
    expect(rowToLine(row({ sale_item_serials: [{ serial: 'SN-1' }, { serial: 'SN-2' }] })).imeis)
      .toEqual(['SN-1', 'SN-2']);
  });

  it('omits imeis rather than sending an empty array', () => {
    expect('imeis' in rowToLine(row({ sale_item_serials: [] }))).toBe(false);
  });

  it('survives an orphaned product, which the FK deliberately allows', () => {
    expect(rowToLine(row({ product_id: null })).id).toBeNull();
  });
});

describe('hydrateSale', () => {
  it('replaces items with the table rows, in line order', () => {
    const out = hydrateSale({
      id: 'S1',
      items: [{ id: 'STALE', name: 'stale', quantity: 99, rate: 1 }],
      sale_items: [row({ line_no: 2, product_name: 'Second' }),
                   row({ line_no: 1, product_name: 'First' })],
    });
    expect(out.items.map(i => i.name)).toEqual(['First', 'Second']);
  });

  it('drops the embedded collection so it is never cached or exported as a field', () => {
    expect('sale_items' in hydrateSale({ id: 'S1', items: [], sale_items: [row()] })).toBe(false);
  });

  it('KEEPS the blob when the table holds nothing for this sale', () => {
    // The trigger skips a line it cannot represent rather than aborting the
    // bill. Emptying items here would make that sale look like it sold
    // nothing, which is worse than reading the older copy.
    const blob = [{ id: 'P1', name: 'Widget', quantity: 2, rate: 50 }];
    expect(hydrateSale({ id: 'S1', items: blob, sale_items: [] }).items).toBe(blob);
    expect(hydrateSale({ id: 'S1', items: blob }).items).toBe(blob);
  });

  it('leaves totals and every other column untouched', () => {
    expect(hydrateSale({
      id: 'S1', totalAmount: 180, totalCogs: 40, paymentStatus: 'PAID',
      items: [], sale_items: [row()],
    })).toMatchObject({ totalAmount: 180, totalCogs: 40, paymentStatus: 'PAID' });
  });

  it('passes non-objects through rather than throwing', () => {
    expect(hydrateSale(null)).toBeNull();
    expect(hydrateSales(null)).toBeNull();
  });

  it('hydrates a list', () => {
    const out = hydrateSales([
      { id: 'A', items: [], sale_items: [row({ product_name: 'A1' })] },
      { id: 'B', items: [{ name: 'kept' }] },
    ]);
    expect(out[0].items[0].name).toBe('A1');
    expect(out[1].items[0].name).toBe('kept');
  });
});

describe('hydrateInvoicesFromSales', () => {
  const sale = { id: 'S1', items: [{ id: 'P1', name: 'Widget', quantity: 2, rate: 50 }] };

  it('gives a linked invoice the lines of its sale', () => {
    const [out] = hydrateInvoicesFromSales(
      [{ id: 'I1', sale_id: 'S1', items: [{ name: 'stale copy', quantity: 9, rate: 1 }] }],
      [sale],
    );
    expect(out.items).toEqual(sale.items);
  });

  it('KEEPS a standalone invoice with no sale_id', () => {
    const own = [{ name: 'standalone', quantity: 1, rate: 10 }];
    const [out] = hydrateInvoicesFromSales([{ id: 'I2', sale_id: null, items: own }], [sale]);
    expect(out.items).toBe(own);
  });

  it('KEEPS the copy when the sale is outside the fetched window', () => {
    // An invoice is a document a customer has been sent. Showing it with no
    // lines because a lookup missed is worse than showing the copy it carries.
    const own = [{ name: 'kept', quantity: 1, rate: 10 }];
    const [out] = hydrateInvoicesFromSales([{ id: 'I3', sale_id: 'MISSING', items: own }], [sale]);
    expect(out.items).toBe(own);
  });

  it('KEEPS the copy when the sale has no usable lines', () => {
    const own = [{ name: 'kept', quantity: 1, rate: 10 }];
    const [out] = hydrateInvoicesFromSales(
      [{ id: 'I4', sale_id: 'S2', items: own }],
      [{ id: 'S2', items: [] }],
    );
    expect(out.items).toBe(own);
  });

  it('leaves every other invoice column untouched', () => {
    const [out] = hydrateInvoicesFromSales(
      [{ id: 'I5', sale_id: 'S1', invoice_number: 'INV-1', grand_total: 118, items: [] }],
      [sale],
    );
    expect(out).toMatchObject({ invoice_number: 'INV-1', grand_total: 118 });
  });

  it('passes through when there are no sales to derive from', () => {
    const invs = [{ id: 'I6', sale_id: 'S1', items: [] }];
    expect(hydrateInvoicesFromSales(invs, [])).toBe(invs);
    expect(hydrateInvoicesFromSales(null, [sale])).toBeNull();
  });
});
