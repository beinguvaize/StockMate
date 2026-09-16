import { describe, it, expect } from 'vitest';
import { isRaw, isService, isStocked } from './productTypes';

describe('productTypes', () => {
  it('treats a missing type as ordinary stock', () => {
    // Most rows predate product_type and carry null.
    expect(isStocked({})).toBe(true);
    expect(isStocked({ product_type: null })).toBe(true);
    expect(isStocked({ product_type: 'STANDARD' })).toBe(true);
  });

  it('identifies raw and service regardless of case', () => {
    expect(isRaw({ product_type: 'raw' })).toBe(true);
    expect(isService({ product_type: 'service' })).toBe(true);
    expect(isService({ product_type: 'SERVICE' })).toBe(true);
  });

  it('excludes services from stocked items', () => {
    // The whole point: a service sits at stock 0 forever because it has no
    // stock, so every low-stock threshold test matched it.
    expect(isStocked({ product_type: 'SERVICE' })).toBe(false);
    expect(isStocked({ product_type: 'RAW' })).toBe(false);
    expect(isStocked({ product_type: 'FINISHED' })).toBe(true);
  });

  it('survives a null product', () => {
    expect(isService(null)).toBe(false);
    expect(isStocked(null)).toBe(true);
  });
});
