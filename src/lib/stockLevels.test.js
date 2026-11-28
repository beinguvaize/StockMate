import { describe, it, expect } from 'vitest';
import {
  DEFAULT_REORDER_LEVEL, ownReorderLevel, reorderLevel, isOutOfStock, isLowStock, needsRestock, stockState,
} from './stockLevels';

describe('reorder level', () => {
  it('is the product\'s own, from any of its column names', () => {
    expect(reorderLevel({ lowStockThreshold: '8' })).toBe(8);
    expect(reorderLevel({ low_stock_threshold: 4 })).toBe(4);
    expect(reorderLevel({ reorder_level: 25 })).toBe(25);
    expect(reorderLevel({ lowStockThreshold: 0 })).toBe(0);
  });
  it('is 10 when the product has none', () => {
    expect(DEFAULT_REORDER_LEVEL).toBe(10);
    expect(ownReorderLevel({})).toBeNull();
    expect(ownReorderLevel({ lowStockThreshold: null })).toBeNull();
    expect(reorderLevel({})).toBe(10);
    expect(reorderLevel({ lowStockThreshold: '' })).toBe(10);
  });
});

describe('low / out / needs restock', () => {
  const p = { lowStockThreshold: 20 };
  it('low is above 0 and at or below the product\'s own level (not a fixed 5, not under 50)', () => {
    expect(isLowStock(p, 20)).toBe(true);
    expect(isLowStock(p, 12)).toBe(true);
    expect(isLowStock(p, 21)).toBe(false);
    expect(isLowStock(p, 0)).toBe(false);
    expect(isLowStock({ lowStockThreshold: 3 }, 4)).toBe(false);
    expect(isLowStock({ lowStockThreshold: 3 }, 30)).toBe(false);
  });
  it('out is 0 or below', () => {
    expect(isOutOfStock(0)).toBe(true);
    expect(isOutOfStock(-1)).toBe(true);
    expect(isOutOfStock(0.5)).toBe(false);
  });
  it('needs restock is low or out', () => {
    expect(needsRestock(p, 0)).toBe(true);
    expect(needsRestock(p, 20)).toBe(true);
    expect(needsRestock(p, 20.5)).toBe(false);
    expect(stockState(p, -3)).toBe('out');
    expect(stockState(p, 5)).toBe('low');
    expect(stockState(p, 50)).toBe('ok');
  });
  it('a service or raw material is never low or out', () => {
    expect(needsRestock({ product_type: 'SERVICE' }, 0)).toBe(false);
    expect(isLowStock({ product_type: 'SERVICE' }, 1)).toBe(false);
    expect(stockState({ product_type: 'SERVICE' }, 0)).toBe('ok');
    expect(needsRestock({ product_type: 'RAW' }, 0)).toBe(false);
  });
});
