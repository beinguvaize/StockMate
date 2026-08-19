import { describe, it, expect } from 'vitest';
import { monthlyBasePay, lopDays, periodDays } from './monthlyPay';

const AUG = { from: '2026-08-01', to: '2026-08-31' };

describe('periodDays', () => {
  it('counts both ends', () => {
    expect(periodDays('2026-08-01', '2026-08-31')).toBe(31);
    expect(periodDays('2026-02-01', '2026-02-28')).toBe(28);
    expect(periodDays('2024-02-01', '2024-02-29')).toBe(29);
    expect(periodDays('2026-08-17', '2026-08-17')).toBe(1);
  });

  it('does not drift across a DST-free zone boundary or a month end', () => {
    expect(periodDays('2026-07-31', '2026-08-01')).toBe(2);
  });

  it('is zero for nonsense rather than negative', () => {
    expect(periodDays('2026-08-31', '2026-08-01')).toBe(0);
    expect(periodDays('', '')).toBe(0);
  });
});

describe('lopDays', () => {
  it('counts only asserted absence', () => {
    const days = {
      '2026-08-03': { status: 'ABSENT' },
      '2026-08-04': { status: 'HALF_DAY' },
      '2026-08-05': { status: 'PRESENT' },
      '2026-08-06': { status: 'OT' },
    };
    expect(lopDays(days, AUG.from, AUG.to)).toBe(1.5);
  });

  it('ignores days outside the period', () => {
    const days = { '2026-07-20': { status: 'ABSENT' }, '2026-09-02': { status: 'ABSENT' } };
    expect(lopDays(days, AUG.from, AUG.to)).toBe(0);
  });

  it('treats an empty grid as no absence at all', () => {
    // The one that matters: salaried staff are usually not on the grid.
    expect(lopDays({}, AUG.from, AUG.to)).toBe(0);
    expect(lopDays(undefined, AUG.from, AUG.to)).toBe(0);
  });
});

describe('monthlyBasePay', () => {
  it('pays the full salary when nothing is marked', () => {
    // Nobody ticks the manager in each morning. An empty grid must not be
    // read as a month of absence.
    const r = monthlyBasePay({ salary: 31000, ...AUG, days: {} });
    expect(r.basePay).toBe(31000);
    expect(r.lopDays).toBe(0);
    expect(r.lopAmount).toBe(0);
  });

  it('deducts a marked absence at the calendar day rate', () => {
    const r = monthlyBasePay({ salary: 31000, ...AUG, days: { '2026-08-03': { status: 'ABSENT' } } });
    expect(r.perDay).toBe(1000);          // 31000 / 31
    expect(r.lopAmount).toBe(1000);
    expect(r.basePay).toBe(30000);
  });

  it('halves a half day', () => {
    const r = monthlyBasePay({ salary: 31000, ...AUG, days: { '2026-08-03': { status: 'HALF_DAY' } } });
    expect(r.lopDays).toBe(0.5);
    expect(r.lopAmount).toBe(500);
    expect(r.basePay).toBe(30500);
  });

  it('a full month of marked absence comes to exactly the salary, not more', () => {
    // This is why the divisor is calendar days rather than working days.
    const days = {};
    for (let d = 1; d <= 31; d++) days[`2026-08-${String(d).padStart(2, '0')}`] = { status: 'ABSENT' };
    const r = monthlyBasePay({ salary: 31000, ...AUG, days });
    expect(r.lopAmount).toBe(31000);
    expect(r.basePay).toBe(0);
  });

  it('never lets loss of pay exceed the salary', () => {
    // A period can be shortened after days were marked.
    const days = {};
    for (let d = 1; d <= 31; d++) days[`2026-08-${String(d).padStart(2, '0')}`] = { status: 'ABSENT' };
    const r = monthlyBasePay({ salary: 10000, from: '2026-08-01', to: '2026-08-10', days });
    expect(r.basePay).toBe(0);
    expect(r.lopAmount).toBe(10000);
  });

  it('works on a short period, not only whole months', () => {
    const r = monthlyBasePay({ salary: 7000, from: '2026-08-01', to: '2026-08-07',
                               days: { '2026-08-02': { status: 'ABSENT' } } });
    expect(r.periodDays).toBe(7);
    expect(r.perDay).toBe(1000);
    expect(r.basePay).toBe(6000);
  });

  it('returns zero pay for a zero salary rather than NaN', () => {
    const r = monthlyBasePay({ salary: 0, ...AUG, days: {} });
    expect(r.basePay).toBe(0);
    expect(Number.isFinite(r.perDay)).toBe(true);
  });
});
