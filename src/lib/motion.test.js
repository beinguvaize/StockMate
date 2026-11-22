import { describe, it, expect } from 'vitest';
import { digitDiff, isFirstOpenToday, shouldDismiss, stackToasts, holdProgress, localDay } from './motion';

const mem = () => { const m = {}; return { getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = v; } }; };

describe('digitDiff', () => {
  it('flags only changed digits', () => {
    expect(digitDiff('₹1,250', '₹1,290').map(d => d.changed)).toEqual([false, false, false, false, true, false]);
  });
  it('aligns from the right when length grows', () => {
    const d = digitDiff('99', '100');
    expect(d.every(x => x.changed)).toBe(true);
  });
  it('nothing changed', () => {
    expect(digitDiff('12', '12').some(d => d.changed)).toBe(false);
  });
  it('first render rolls everything', () => {
    expect(digitDiff('', '5')[0].changed).toBe(true);
  });
});

describe('isFirstOpenToday', () => {
  it('true once per day, then false, true next day', () => {
    const s = mem();
    const d1 = new Date(2026, 0, 5, 9);
    expect(isFirstOpenToday('dash', s, d1)).toBe(true);
    expect(isFirstOpenToday('dash', s, d1)).toBe(false);
    expect(isFirstOpenToday('dash', s, new Date(2026, 0, 6))).toBe(true);
  });
  it('storage that throws means no motion', () => {
    const bad = { getItem() { throw new Error('x'); }, setItem() {} };
    expect(isFirstOpenToday('dash', bad)).toBe(false);
  });
  it('formats local day', () => { expect(localDay(new Date(2026, 2, 4))).toBe('2026-03-04'); });
});

describe('shouldDismiss', () => {
  it('fast flick dismisses', () => { expect(shouldDismiss(30, 100)).toBe(true); });
  it('slow short drag does not', () => { expect(shouldDismiss(30, 1000)).toBe(false); });
  it('slow long drag does', () => { expect(shouldDismiss(200, 5000)).toBe(true); });
});

describe('stackToasts', () => {
  it('caps at 3 and numbers depth newest=0', () => {
    const r = stackToasts([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
    expect(r.map(x => [x.id, x.depth])).toEqual([[2, 2], [3, 1], [4, 0]]);
  });
});

describe('holdProgress', () => {
  it('clamps', () => {
    expect(holdProgress(-5)).toBe(0);
    expect(holdProgress(750)).toBe(0.5);
    expect(holdProgress(9000)).toBe(1);
  });
});
