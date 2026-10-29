import { describe, it, expect } from 'vitest';
import { describeRecurring, recurringTemplateFor } from './recurring';

describe('describeRecurring', () => {
  it('names daily schedules the way a shop says them', () => {
    expect(describeRecurring({ frequency: 'DAILY', weekdays: null })).toBe('Every day');
    expect(describeRecurring({ frequency: 'DAILY', weekdays: [1, 2, 3, 4, 5, 6, 7] })).toBe('Every day');
    expect(describeRecurring({ frequency: 'DAILY', weekdays: [1, 2, 3, 4, 5, 6] })).toBe('Every day except Sun');
    expect(describeRecurring({ frequency: 'DAILY', weekdays: [1, 2, 3, 4, 5] })).toBe('Every day except Sat and Sun');
    expect(describeRecurring({ frequency: 'DAILY', weekdays: [5, 1, 3] })).toBe('Mon, Wed, Fri');
  });
  it('names monthly schedules by day, clamped to 28', () => {
    expect(describeRecurring({ frequency: 'MONTHLY', day_of_month: 5 })).toBe('Monthly on day 5');
    expect(describeRecurring({ frequency: 'MONTHLY', day_of_month: 31 })).toBe('Monthly on day 28');
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
