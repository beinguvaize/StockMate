import { describe, it, expect } from 'vitest';
import { formatTime } from './utils';

/**
 * formatTime prints on customer-facing documents — the thermal receipt and the
 * GST invoice — so a wrong or invented value goes out of the shop on paper.
 *
 * Defaults are Asia/Kolkata / en-IN (utils.js:36), which is what these assume.
 */

describe('formatTime', () => {
  it('renders a timestamp in the app timezone, not the machine one', () => {
    // 09:27 UTC is 14:57 IST. A machine in another zone must not shift it.
    expect(formatTime('2026-08-10T09:27:03.262072Z')).toBe('2:57 pm');
  });

  it('returns nothing for a date-only value rather than inventing midnight', () => {
    // invoice_date is a plain YYYY-MM-DD and carries no time at all. Parsing it
    // would print "12:00 am" on every bill, which is worse than a blank.
    expect(formatTime('2026-08-10')).toBe('');
  });

  it('returns nothing when there is no value', () => {
    // A receipt should print an empty space, not the word N/A that formatDate
    // uses — the caller joins on ' · ' and filters empties.
    for (const v of [null, undefined, '']) expect(formatTime(v)).toBe('');
  });

  it('returns nothing for something unparseable', () => {
    expect(formatTime('not a date')).toBe('');
    expect(formatTime('2026-13-45T99:99:99Z')).toBe('');
  });

  it('accepts a Date as well as a string', () => {
    expect(formatTime(new Date('2026-08-10T09:27:03Z'))).toBe('2:57 pm');
  });

  it('pads the minute, so 09:05 never reads as 9:5', () => {
    expect(formatTime('2026-08-10T03:35:00Z')).toBe('9:05 am');
  });
});
