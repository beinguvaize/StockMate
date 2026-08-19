import { describe, it, expect } from 'vitest';
import { parsePeriod, overlaps, findOverlapping, describePeriod, monthIsPaid, runsPaidInMonth, paidByEmployeeInMonth, monthToDate } from './payrollPeriods';

/**
 * The defect these pin: the same window could be paid twice. FUTURE DISPO's
 * 2026-08-01/2026-08-08 run had already posted ₹7,200 of Salary expenses while
 * the screen still offered to process August.
 */

const run = (o) => ({ id: 'p1', period: '2026-08-01/2026-08-08', total_net: 7200, deleted_at: null, ...o });

describe('parsePeriod — the two shapes a period is stored in', () => {
  it('reads a date range', () => {
    expect(parsePeriod('2026-08-01/2026-08-08'))
      .toEqual({ from: '2026-08-01', to: '2026-08-08' });
  });

  it('expands a month to its real last day', () => {
    expect(parsePeriod('2026-08')).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(parsePeriod('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(parsePeriod('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('straightens a reversed range instead of reporting no overlap', () => {
    expect(parsePeriod('2026-08-08/2026-08-01'))
      .toEqual({ from: '2026-08-01', to: '2026-08-08' });
  });

  it('returns null for anything it cannot read, never a guess', () => {
    // null must mean "unknown" at the call site, not "safe to pay again".
    for (const bad of ['', null, undefined, 'August', '2026-13', '2026-08-01/']) {
      expect(parsePeriod(bad)).toBeNull();
    }
  });
});

describe('overlaps', () => {
  const aug1to8 = { from: '2026-08-01', to: '2026-08-08' };

  it('catches a month against a range inside it — no shared string prefix', () => {
    // '2026-08' vs '2026-08-01/2026-08-08': a string compare sees nothing.
    expect(overlaps(parsePeriod('2026-08'), aug1to8)).toBe(true);
  });

  it('is inclusive at the boundary — one shared day is an overlap', () => {
    expect(overlaps(aug1to8, parsePeriod('2026-07-25/2026-08-01'))).toBe(true);
    expect(overlaps(aug1to8, parsePeriod('2026-08-08/2026-08-15'))).toBe(true);
  });

  it('does not fire on periods that merely touch end to end', () => {
    expect(overlaps(aug1to8, parsePeriod('2026-07-24/2026-07-31'))).toBe(false);
    expect(overlaps(aug1to8, parsePeriod('2026-08-09/2026-08-16'))).toBe(false);
  });

  it('catches a range wholly inside another', () => {
    expect(overlaps(aug1to8, parsePeriod('2026-08-03/2026-08-05'))).toBe(true);
  });

  it('is false when either side is unknown', () => {
    expect(overlaps(null, aug1to8)).toBe(false);
    expect(overlaps(aug1to8, null)).toBe(false);
  });
});

describe('findOverlapping', () => {
  it('finds the run that already paid these dates', () => {
    const hits = findOverlapping('2026-08-01/2026-08-08', [run()]);
    expect(hits).toHaveLength(1);
    expect(hits[0].total_net).toBe(7200);
  });

  it('catches processing the whole month after a week of it was paid', () => {
    // The live case: August is offered as a fresh run after 1-8 Aug was paid.
    expect(findOverlapping('2026-08', [run()])).toHaveLength(1);
  });

  it('ignores a reversed run — a deleted payout is not a reason to block', () => {
    expect(findOverlapping('2026-08', [run({ deleted_at: '2026-08-09T00:00:00Z' })])).toEqual([]);
  });

  it('lets a genuinely later period through', () => {
    expect(findOverlapping('2026-09', [run()])).toEqual([]);
  });

  it('excludes the run being edited', () => {
    expect(findOverlapping('2026-08', [run()], { excludeId: 'p1' })).toEqual([]);
  });

  it('treats an unreadable stored period as overlapping, not as clear', () => {
    // Better to ask about an unrelated payout than to pay one twice.
    expect(findOverlapping('2026-08', [run({ period: 'August 2026' })])).toHaveLength(1);
  });

  it('returns nothing when the requested period is itself unreadable', () => {
    expect(findOverlapping('', [run()])).toEqual([]);
  });
});

describe('monthIsPaid — whether the grid should show a processed state', () => {
  it('is not paid when only part of the month was run', () => {
    // 1-8 Aug does not cover August, so the CTA must still offer to process.
    expect(monthIsPaid(2026, 8, [run()])).toBeNull();
  });

  it('is paid when a run covers the whole month', () => {
    expect(monthIsPaid(2026, 8, [run({ period: '2026-08' })])).toBeTruthy();
    expect(monthIsPaid(2026, 8, [run({ period: '2026-07-15/2026-09-15' })])).toBeTruthy();
  });

  it('ignores a reversed run', () => {
    expect(monthIsPaid(2026, 8, [run({ period: '2026-08', deleted_at: 'x' })])).toBeNull();
  });
});

describe('paidByEmployeeInMonth — what the grid shows as already paid', () => {
  // The live FUTURE DISPO run, item shape included.
  const AKBAR = 'f221935c-738d-4130-b2b9-7975ba3ca301';
  const NADIRSHA = '424170c2-4395-465e-8df0-66e337b2a455';
  const PARTHIPAN = 'e934daf8-cc0c-4025-a468-463eb9429a2e';
  const august = [{
    id: '2f16ed07', period: '2026-08-01/2026-08-08', total_net: 7200,
    processed_at: '2026-08-08T11:55:20.063Z', deleted_at: null,
    items: [
      { employeeId: AKBAR, employeeName: 'Akbar', netPay: 3600, daysWorked: 4 },
      { employeeId: NADIRSHA, employeeName: 'Nadirsha', netPay: 3600, daysWorked: 4 },
      { employeeId: PARTHIPAN, employeeName: 'Parthipan', netPay: 0, daysWorked: 0 },
    ],
  }];

  it('reports what each employee was actually paid', () => {
    const paid = paidByEmployeeInMonth(2026, 8, august);
    expect(paid.get(AKBAR).amount).toBe(3600);
    expect(paid.get(NADIRSHA).amount).toBe(3600);
  });

  it('does not count a zero item as a payment', () => {
    // Parthipan was in the run and received nothing; showing him as paid would
    // hide a real debt.
    expect(paidByEmployeeInMonth(2026, 8, august).has(PARTHIPAN)).toBe(false);
  });

  it('carries the window so the grid can shade the days it covered', () => {
    const [run] = paidByEmployeeInMonth(2026, 8, august).get(AKBAR).runs;
    expect(run.window).toEqual({ from: '2026-08-01', to: '2026-08-08' });
  });

  it('ignores a reversed run', () => {
    const deleted = [{ ...august[0], deleted_at: '2026-08-09T00:00:00Z' }];
    expect(paidByEmployeeInMonth(2026, 8, deleted).size).toBe(0);
  });

  it('reports nothing for a month with no runs', () => {
    expect(paidByEmployeeInMonth(2026, 9, august).size).toBe(0);
  });

  it('attributes a run spanning two months to the one it was paid in, once', () => {
    // Matched to where processPayroll dates the salary expense — the period's
    // end. Counting any overlap would show the same money in both months.
    const spanning = [{ ...august[0], period: '2026-07-28/2026-08-03' }];
    expect(runsPaidInMonth(2026, 7, spanning)).toHaveLength(0);
    expect(runsPaidInMonth(2026, 8, spanning)).toHaveLength(1);
  });

  it('sums two runs in the same month', () => {
    const second = { ...august[0], id: 'r2', period: '2026-08-09/2026-08-15',
      items: [{ employeeId: AKBAR, employeeName: 'Akbar', netPay: 1800, daysWorked: 2 }] };
    expect(paidByEmployeeInMonth(2026, 8, [...august, second]).get(AKBAR).amount).toBe(5400);
  });
});

describe('describePeriod', () => {
  it('names a range the way the warning reads it out', () => {
    expect(describePeriod('2026-08-01/2026-08-08')).toBe('1 Aug – 8 Aug');
  });

  it('names a month', () => {
    expect(describePeriod('2026-08')).toBe('August 2026');
  });

  it('collapses a single-day range', () => {
    expect(describePeriod('2026-08-08/2026-08-08')).toBe('8 Aug');
  });

  it('returns unreadable input unchanged rather than printing NaN', () => {
    expect(describePeriod('whenever')).toBe('whenever');
  });
});

describe('monthToDate', () => {
  /**
   * The real August 2026 runs for FUTURE DISPO, verbatim. Daily wages are paid
   * in many small runs here, so a one-day slip needs the month around it.
   * Note the TWO runs processed on 15 Aug — the case a date-only sort breaks.
   */
  const AK = 'akbar';
  const runs = [
    { id: 'r1', period: '2026-08-01/2026-08-08', processed_at: '2026-08-08T11:55:00Z',
      items: [{ employeeId: AK, netPay: 3600, daysWorked: 4 }] },
    { id: 'r2', period: '2026-08-10/2026-08-10', processed_at: '2026-08-11T09:00:00Z',
      items: [{ employeeId: AK, netPay: 900, daysWorked: 1 }] },
    { id: 'r3', period: '2026-08-13/2026-08-13', processed_at: '2026-08-15T09:00:00Z',
      items: [{ employeeId: AK, netPay: 900, daysWorked: 1 }] },
    { id: 'r4', period: '2026-08-15/2026-08-15', processed_at: '2026-08-15T09:00:00Z',
      items: [{ employeeId: AK, netPay: 900, daysWorked: 1 }] },
    { id: 'r5', period: '2026-08-17/2026-08-17', processed_at: '2026-08-17T10:00:00Z',
      items: [{ employeeId: AK, netPay: 900, daysWorked: 1 }] },
  ];
  const byId = (id) => runs.find(r => r.id === id);

  it('gives the real month-to-date on the last slip of the month', () => {
    const m = monthToDate({ run: byId('r5'), records: runs, employeeId: AK });
    expect(m.priorAmount).toBe(6300);   // 3600 + 900 + 900 + 900
    expect(m.thisAmount).toBe(900);
    expect(m.totalAmount).toBe(7200);
    expect(m.totalDays).toBe(8);
    expect(m.priorRuns).toBe(4);
  });

  it('shows nothing prior on the first run of the month', () => {
    const m = monthToDate({ run: byId('r1'), records: runs, employeeId: AK });
    expect(m.priorAmount).toBe(0);
    expect(m.priorRuns).toBe(0);
    expect(m.thisAmount).toBe(3600);
    expect(m.totalAmount).toBe(3600);
  });

  it('separates two runs processed on the SAME day by id', () => {
    // r3 and r4 both processed 15 Aug. Each must see the other correctly:
    // r3 (earlier id) has r1+r2 before it; r4 has r1+r2+r3.
    expect(monthToDate({ run: byId('r3'), records: runs, employeeId: AK }).priorAmount).toBe(4500);
    expect(monthToDate({ run: byId('r4'), records: runs, employeeId: AK }).priorAmount).toBe(5400);
  });

  it('never counts the run itself as prior', () => {
    for (const r of runs) {
      const m = monthToDate({ run: r, records: runs, employeeId: AK });
      expect(m.priorAmount + m.thisAmount).toBe(m.totalAmount);
      expect(m.totalAmount).toBeLessThanOrEqual(7200);
    }
  });

  it('ignores other employees', () => {
    const mixed = runs.map(r => ({ ...r,
      items: [...r.items, { employeeId: 'other', netPay: 5000, daysWorked: 3 }] }));
    expect(monthToDate({ run: byId('r5'), records: mixed, employeeId: AK }).totalAmount).toBe(7200);
  });

  it('does not reach into a neighbouring month', () => {
    const withJuly = [...runs,
      { id: 'j1', period: '2026-07-28/2026-07-31', processed_at: '2026-07-31T10:00:00Z',
        items: [{ employeeId: AK, netPay: 2700, daysWorked: 3 }] }];
    expect(monthToDate({ run: byId('r5'), records: withJuly, employeeId: AK }).totalAmount).toBe(7200);
  });

  it('counts a nil employee as zero without crediting a run', () => {
    const nil = runs.map(r => ({ ...r, items: [{ employeeId: 'p', netPay: 0, daysWorked: 0 }] }));
    const m = monthToDate({ run: byId('r5'), records: nil, employeeId: 'p' });
    expect(m.totalAmount).toBe(0);
    expect(m.priorRuns).toBe(0);   // a zero item is not a payment
  });

  it('returns null rather than guessing when there is no run', () => {
    expect(monthToDate({ run: null, records: runs, employeeId: AK })).toBeNull();
    expect(monthToDate({ run: byId('r5'), records: runs, employeeId: null })).toBeNull();
  });
});

describe('monthToDate — the prior payments themselves', () => {
  const AK = 'akbar';
  const runs = [
    { id: 'r1', period: '2026-08-01/2026-08-08', processed_at: '2026-08-08T11:55:00Z',
      items: [{ employeeId: AK, netPay: 3600, daysWorked: 4 }] },
    { id: 'r2', period: '2026-08-10/2026-08-10', processed_at: '2026-08-11T09:00:00Z',
      items: [{ employeeId: AK, netPay: 900, daysWorked: 1 }] },
    { id: 'r3', period: '2026-08-13/2026-08-13', processed_at: '2026-08-15T09:00:00Z',
      items: [{ employeeId: AK, netPay: 900, daysWorked: 1 }] },
    { id: 'r4', period: '2026-08-15/2026-08-15', processed_at: '2026-08-15T09:00:00Z',
      items: [{ employeeId: AK, netPay: 900, daysWorked: 1 }] },
    { id: 'r5', period: '2026-08-17/2026-08-17', processed_at: '2026-08-17T10:00:00Z',
      items: [{ employeeId: AK, netPay: 900, daysWorked: 1 }] },
  ];
  const m = monthToDate({ run: runs[4], records: runs, employeeId: AK });

  it('lists every earlier payment of the month', () => {
    expect(m.payments).toHaveLength(4);
    expect(m.payments.map(p => p.amount)).toEqual([3600, 900, 900, 900]);
  });

  it('labels each by the period worked, not the day it was keyed in', () => {
    // Two of these were processed on 15 Aug; the period is what distinguishes
    // them to the person reading the slip.
    expect(m.payments.map(p => p.label)).toEqual(['1 Aug – 8 Aug', '10 Aug', '13 Aug', '15 Aug']);
  });

  it('reads oldest first, down the month', () => {
    const dates = m.payments.map(p => p.paidOn);
    expect([...dates].sort()).toEqual(dates);
  });

  it('the listed payments sum to priorAmount', () => {
    // If the list and the total ever disagreed, the slip would contradict itself.
    expect(m.payments.reduce((t, p) => t + p.amount, 0)).toBe(m.priorAmount);
  });

  it('omits nil runs from the list', () => {
    const nil = runs.map(r => ({ ...r, items: [{ employeeId: 'p', netPay: 0, daysWorked: 0 }] }));
    const z = monthToDate({ run: nil[4], records: nil, employeeId: 'p' });
    expect(z.payments).toHaveLength(0);
  });

  it('is empty on the first run of the month', () => {
    expect(monthToDate({ run: runs[0], records: runs, employeeId: AK }).payments).toHaveLength(0);
  });
});
