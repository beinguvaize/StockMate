import { describe, it, expect } from 'vitest';
import { readHidden, writeHidden, maskedMoney, MASK, HIDE_AMOUNTS_KEY } from './hideAmounts';
import { profilePage } from './payrollView';

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), m }; };
const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };

describe('hide amounts', () => {
  it('is remembered on the device', () => {
    const s = mem();
    expect(readHidden(s)).toBe(false);
    expect(writeHidden(true, s)).toBe(true);
    expect(s.m.get(HIDE_AMOUNTS_KEY)).toBe('1');
    expect(readHidden(s)).toBe(true);
    writeHidden(false, s);
    expect(readHidden(s)).toBe(false);
  });
  it('starts off, and does not throw, when storage is blocked or missing', () => {
    expect(readHidden(broken)).toBe(false);
    expect(writeHidden(true, broken)).toBe(false);
    expect(readHidden(undefined)).toBe(false);
  });
  it('masks money but keeps "not known" as a dash', () => {
    const fmt = (n) => (n == null ? '—' : `₹${n}`);
    expect(maskedMoney(true, fmt)(500)).toBe(MASK);
    expect(maskedMoney(true, fmt)(0)).toBe(MASK);
    expect(maskedMoney(true, fmt)(null)).toBe('—');
    expect(maskedMoney(false, fmt)(500)).toBe('₹500');
  });
});

describe('profile page from the URL', () => {
  it('maps the old tab keys and the new pages', () => {
    expect(profilePage('STATEMENT')).toBe('statement');
    expect(profilePage('Payslips')).toBe('payslips');
    expect(profilePage('ATTENDANCE')).toBe('attendance');
    expect(profilePage('DETAILS')).toBe('details');
    expect(profilePage('OVERVIEW')).toBe('overview');
    expect(profilePage('pay')).toBe('pay');
    expect(profilePage('salary-statement')).toBe('statement');
    expect(profilePage(null)).toBe('overview');
    expect(profilePage('advances')).toBe('advances');   // the page falls back to the overview when advances are off
    expect(profilePage('leave')).toBe('overview');
  });
});
