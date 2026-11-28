import { describe, it, expect } from 'vitest';
import { marginOnPrice, packSizeForMargin } from './margin';

describe('marginOnPrice', () => {
  it('is (price - cost) / price, not markup on cost', () => {
    expect(marginOnPrice(100, 80)).toBe(20);   // markup would be 25
    expect(marginOnPrice(50, 50)).toBe(0);
    expect(marginOnPrice(80, 100)).toBe(-25);
    expect(marginOnPrice('120', '90')).toBe(25);
    expect(marginOnPrice(100, 0)).toBe(100);
  });
  it('is null when there is no selling price', () => {
    expect(marginOnPrice(0, 10)).toBeNull();
    expect(marginOnPrice(null, 10)).toBeNull();
    expect(marginOnPrice('', 10)).toBeNull();
  });
});

describe('packSizeForMargin', () => {
  it('gives the size whose margin on price is the one asked for', () => {
    const size = packSizeForMargin(30, 25, 40); // cost 40 per kg, sell 30, 25% margin
    expect(size).toBeCloseTo(0.5625, 10);
    expect(marginOnPrice(30, 40 * size)).toBeCloseTo(25, 10);
  });
  it('refuses inputs that cannot give a size', () => {
    expect(packSizeForMargin(0, 25, 40)).toBeNull();
    expect(packSizeForMargin(30, -1, 40)).toBeNull();
    expect(packSizeForMargin(30, 100, 40)).toBeNull();
    expect(packSizeForMargin(30, 25, 0)).toBeNull();
  });
});
