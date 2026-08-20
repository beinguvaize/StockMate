import { describe, it, expect } from 'vitest';
import { lopDays, periodDays, salariedBasePay, cycleDays } from './monthlyPay';

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

describe('salariedBasePay', () => {
  it('pays the full salary when nothing is marked', () => {
    // Nobody ticks the manager in each morning. An empty grid must not be
    // read as a month of absence.
    const r = salariedBasePay({ salary: 31000, ...AUG, days: {} });
    expect(r.basePay).toBe(31000);
    expect(r.lopDays).toBe(0);
    expect(r.lopAmount).toBe(0);
  });

  it('deducts a marked absence at the calendar day rate', () => {
    const r = salariedBasePay({ salary: 31000, ...AUG, days: { '2026-08-03': { status: 'ABSENT' } } });
    expect(r.perDay).toBe(1000);          // 31000 / 31
    expect(r.lopAmount).toBe(1000);
    expect(r.basePay).toBe(30000);
  });

  it('halves a half day', () => {
    const r = salariedBasePay({ salary: 31000, ...AUG, days: { '2026-08-03': { status: 'HALF_DAY' } } });
    expect(r.lopDays).toBe(0.5);
    expect(r.lopAmount).toBe(500);
    expect(r.basePay).toBe(30500);
  });

  it('a full month of marked absence comes to exactly the salary, not more', () => {
    // This is why the divisor is calendar days rather than working days.
    const days = {};
    for (let d = 1; d <= 31; d++) days[`2026-08-${String(d).padStart(2, '0')}`] = { status: 'ABSENT' };
    const r = salariedBasePay({ salary: 31000, ...AUG, days });
    expect(r.lopAmount).toBe(31000);
    expect(r.basePay).toBe(0);
  });

  it('never pays below zero, and never charges more absence than the period holds', () => {
    // Every day of August marked absent, but the run covers only 1-10 Aug. The
    // most that can be lost is ten days' pay, not a whole month's.
    const days = {};
    for (let d = 1; d <= 31; d++) days[`2026-08-${String(d).padStart(2, '0')}`] = { status: 'ABSENT' };
    const r = salariedBasePay({ salary: 10000, from: '2026-08-01', to: '2026-08-10', days });
    expect(r.basePay).toBe(0);
    expect(r.lopAmount).toBe(Math.round(10000 / 31 * 10));
  });

  it('pro-rates a monthly salary over a short period', () => {
    // A monthly salary buys a MONTH. Running one week of it used to hand over
    // the entire month's pay, because salary was treated as covering whatever
    // window was selected.
    const r = salariedBasePay({ salary: 31000, from: '2026-08-01', to: '2026-08-07' });
    expect(r.cycleDays).toBe(31);
    expect(r.perDay).toBe(1000);
    expect(r.basePay).toBe(7000);      // 7 days of a 31-day month, not 31,000
  });

  it('returns zero pay for a zero salary rather than NaN', () => {
    const r = salariedBasePay({ salary: 0, ...AUG, days: {} });
    expect(r.basePay).toBe(0);
    expect(Number.isFinite(r.perDay)).toBe(true);
  });
});

describe('WEEKLY pay', () => {
  /**
   * The bug: `salary` on a WEEKLY employee holds ONE WEEK's pay, but it was
   * paid flat for whatever period was run. A weekly employee processed over
   * August was handed a single week's wage for the whole month.
   */
  const weekly = (from, to, days) =>
    salariedBasePay({ salary: 7000, payType: 'WEEKLY', from, to, days });

  it('a week of a weekly wage is exactly the weekly amount', () => {
    const r = weekly('2026-08-01', '2026-08-07');
    expect(r.cycleDays).toBe(7);
    expect(r.perDay).toBe(1000);
    expect(r.basePay).toBe(7000);
  });

  it('a MONTH of a weekly wage is about four and a half weeks, not one', () => {
    // The whole point. 31 days at 1,000 a day = 31,000, where the old code paid
    // 7,000 for the same month.
    const r = weekly('2026-08-01', '2026-08-31');
    expect(r.basePay).toBe(31000);
    expect(r.basePay).not.toBe(7000);
  });

  it('charges absence at the weekly day rate', () => {
    const r = weekly('2026-08-01', '2026-08-07', { '2026-08-03': { status: 'ABSENT' } });
    expect(r.lopDays).toBe(1);
    expect(r.lopAmount).toBe(1000);
    expect(r.basePay).toBe(6000);
  });

  it('is not affected by how long the calendar month is', () => {
    // A monthly salary is worth more per day in February; a weekly one is not.
    const feb = salariedBasePay({ salary: 7000, payType: 'WEEKLY', from: '2026-02-01', to: '2026-02-07' });
    expect(feb.perDay).toBe(1000);
  });

  it('a monthly salary IS affected by month length', () => {
    const feb = salariedBasePay({ salary: 28000, payType: 'MONTHLY', from: '2026-02-01', to: '2026-02-28' });
    expect(feb.cycleDays).toBe(28);
    expect(feb.basePay).toBe(28000);
  });

  it('defaults to MONTHLY when no pay type is given', () => {
    // Every existing caller omitted it; they must keep their old meaning.
    const r = salariedBasePay({ salary: 31000, from: '2026-08-01', to: '2026-08-31' });
    expect(r.cycleDays).toBe(31);
    expect(r.basePay).toBe(31000);
  });
});
