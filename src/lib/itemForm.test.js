import { describe, it, expect } from 'vitest';
import { isServiceForm, validateItemPricing, stockFieldsFor, defaultProductType } from './itemForm';

describe('isServiceForm', () => {
  it('is true for a services tenant, whatever the item', () => {
    expect(isServiceForm({ businessType: 'SERVICES' })).toBe(true);
  });

  it('is true for a service item inside a retail tenant', () => {
    // MaazMobiles is RETAIL and bills repair labour this way.
    expect(isServiceForm({ businessType: 'RETAIL', product_type: 'SERVICE' })).toBe(true);
  });

  it('is false for ordinary retail stock', () => {
    expect(isServiceForm({ businessType: 'RETAIL', product_type: 'STANDARD' })).toBe(false);
    expect(isServiceForm({})).toBe(false);
  });
});

describe('validateItemPricing', () => {
  it('does not demand a cost price for a service', () => {
    // The regression this file exists for: the Cost Price input is not
    // rendered for a service, so demanding it made the save impossible and a
    // SERVICES tenant could not add anything at all.
    expect(validateItemPricing({
      businessType: 'SERVICES', sellingPrice: '500',
    })).toBeNull();

    expect(validateItemPricing({
      businessType: 'RETAIL', product_type: 'SERVICE', sellingPrice: '300',
    })).toBeNull();
  });

  it('still demands a cost price for stock', () => {
    expect(validateItemPricing({ businessType: 'RETAIL', sellingPrice: '100' }))
      .toMatch(/cost price/i);
  });

  it('demands a price for a service, worded as a service price', () => {
    expect(validateItemPricing({ businessType: 'SERVICES' }))
      .toMatch(/service price/i);
  });

  it('does not demand a selling price for raw material', () => {
    // RAW is bought and consumed, never sold.
    expect(validateItemPricing({ product_type: 'RAW', costPrice: '50' })).toBeNull();
  });

  it('rejects zero and negative prices, not just missing ones', () => {
    expect(validateItemPricing({ businessType: 'SERVICES', sellingPrice: '0' })).toBeTruthy();
    expect(validateItemPricing({ businessType: 'RETAIL', costPrice: '-5', sellingPrice: '10' })).toBeTruthy();
  });
});

describe('stockFieldsFor', () => {
  it('gives a service no threshold to fall below', () => {
    expect(stockFieldsFor({ businessType: 'SERVICES', stock: '7', lowStockThreshold: '10' }))
      .toEqual({ stock: 0, lowStockThreshold: null });
  });

  it('keeps stock fields for real stock', () => {
    expect(stockFieldsFor({ businessType: 'RETAIL', stock: '7', lowStockThreshold: '3' }))
      .toEqual({ stock: 7, lowStockThreshold: 3 });
  });

  it('defaults the threshold when blank', () => {
    expect(stockFieldsFor({ businessType: 'RETAIL' }))
      .toEqual({ stock: 0, lowStockThreshold: 10 });
  });
});

describe('defaultProductType', () => {
  it('starts a services tenant on SERVICE', () => {
    // The form seeded STANDARD unconditionally, so a services tenant saved
    // STANDARD rows through a form that looked like a service form — and every
    // row-level check downstream reads the stored type.
    expect(defaultProductType('SERVICES')).toBe('SERVICE');
  });

  it('starts everyone else on STANDARD', () => {
    expect(defaultProductType('RETAIL')).toBe('STANDARD');
    expect(defaultProductType('RESTAURANT')).toBe('STANDARD');
    expect(defaultProductType(undefined)).toBe('STANDARD');
  });

  it('round-trips into service mode', () => {
    const businessType = 'SERVICES';
    expect(isServiceForm({ businessType, product_type: defaultProductType(businessType) })).toBe(true);
  });
});
