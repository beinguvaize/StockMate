import { describe, it, expect } from 'vitest';
import { describeRecurring, recurringTemplateFor, nextRun, scheduleLine } from './recurring';

describe('describeRecurring', () => {
  it('names daily schedules the way a shop says them', () => {
    expect(describeRecurring({ frequency: 'DAILY', weekdays: null })).toBe('Every day');
    expect(describeRecurring({ frequency: 'DAILY', weekdays: [1, 2, 3, 4, 5, 6, 7] })).toBe('Every day');
    expect(describeRecurring({ frequency: 'DAILY', weekdays: [1, 2, 3, 4, 5, 6] })).toBe('Every day except Sun');
    expect(describeRecurring({ frequency: 'DAILY', weekdays: [1, 2, 3, 4, 5] })).toBe('Every day except Sat and Sun');
    expect(describeRecurring({ frequency: 'DAILY', weekdays: [5, 1, 3] })).toBe('Mon, Wed, Fri');
  });
  it('names monthly schedules by day, clamped to 28', () => {
    expect(describeRecurring({ frequency: 'MONTHLY', day_of_month: 5 })).toBe('Monthly on the 5th');
    expect(describeRecurring({ frequency: 'MONTHLY', day_of_month: 31 })).toBe('Monthly on the 28th');
    expect(describeRecurring({ frequency: 'MONTHLY', day_of_month: 22 })).toBe('Monthly on the 22nd');
  });
});

describe('recurringTemplateFor', () => {
  const today = '2026-10-28';
  it('starts the day after the expense just logged', () => {
    expect(recurringTemplateFor({ frequency: 'DAILY', weekdays: [1, 2, 3, 4, 5, 6], date: today, today }))
      .toEqual({ frequency: 'DAILY', weekdays: [1, 2, 3, 4, 5, 6], day_of_month: 28, start_date: today, last_generated: today });
  });
  it('never back-fills from a back-dated expense', () => {
    expect(recurringTemplateFor({ frequency: 'DAILY', date: '2026-10-10', today }).last_generated).toBe(today);
  });
  it('stores "every day" as no weekday list, and monthly with none', () => {
    expect(recurringTemplateFor({ frequency: 'DAILY', weekdays: [1, 2, 3, 4, 5, 6, 7], date: today, today }).weekdays).toBeNull();
    expect(recurringTemplateFor({ frequency: 'MONTHLY', weekdays: [1], date: '2026-10-05', today })).toMatchObject({ frequency: 'MONTHLY', weekdays: null, day_of_month: 5 });
  });
});

describe('nextRun / scheduleLine', () => {
  // 2026-10-28 is a Wednesday.
  const base = { last_generated: '2026-10-28' };
  it('daily resumes tomorrow, skipping off days', () => {
    expect(nextRun({ ...base, frequency: 'DAILY' })).toBe('2026-10-29');
    expect(nextRun({ frequency: 'DAILY', weekdays: [1, 2, 3, 4, 5, 6], last_generated: '2026-10-31' })).toBe('2026-11-02'); // Sat -> skips Sun
  });
  it('monthly lands on its day next month, clamped to 28', () => {
    expect(nextRun({ frequency: 'MONTHLY', day_of_month: 28, last_generated: '2026-10-28' })).toBe('2026-11-28');
    expect(nextRun({ frequency: 'MONTHLY', day_of_month: 31, last_generated: '2026-10-29' })).toBe('2026-11-28');
    expect(nextRun({ frequency: 'MONTHLY', day_of_month: 5, last_generated: '2026-10-28' })).toBe('2026-11-05');
  });
  it('a future-dated expense resumes after its own date', () => {
    const t = recurringTemplateFor({ frequency: 'DAILY', date: '2026-11-03', today: '2026-10-28' });
    expect(nextRun(t)).toBe('2026-11-04');
  });
  it('says what will happen, in words', () => {
    expect(scheduleLine({ frequency: 'DAILY', weekdays: [1, 2, 3, 4, 5, 6], last_generated: '2026-10-29' })).toBe('Every day except Sun · next Fri 30 Oct');
    expect(scheduleLine({ frequency: 'MONTHLY', day_of_month: 28, asked_day: 29, last_generated: '2026-10-29' }))
      .toBe("Monthly on the 28th (29th–31st aren't in every month) · next Sat 28 Nov");
  });
});
