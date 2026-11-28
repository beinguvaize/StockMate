import { describe, it, expect } from 'vitest';
import {
  applyAuditFilters, activeFilterCount, blankFilters, pageNumbers, pageRange, whenShort, whenLong, relativeTime,
  entityLine, actorOf, metadataLines, noMatchWords, weekStartDay, daysBackDay, dayWords, shopDayStartISO, actionMeta, eventsWord,
} from './auditView';

// Tests are pinned to Asia/Kolkata (UTC+5:30).
const NOW = Date.parse('2026-11-28T10:30:00Z'); // Sat 28 Nov 2026, 4:00 pm IST

const recorder = () => {
  const calls = [];
  const q = new Proxy({}, { get: (_, m) => (...args) => { calls.push([m, ...args]); return q; } });
  return { q, calls };
};

describe('filters (the same query as before)', () => {
  it('sends nothing extra with no filters', () => {
    const { q, calls } = recorder();
    applyAuditFilters(q, blankFilters());
    expect(calls).toEqual([]);
  });

  it('sends action, dates and the email-or-summary search', () => {
    const { q, calls } = recorder();
    applyAuditFilters(q, { action: 'SALE_REFUND', start: '2026-11-01', end: '2026-11-28', search: '  priya ' });
    expect(calls).toEqual([
      ['eq', 'action', 'SALE_REFUND'],
      ['gte', 'created_at', '2026-11-01T00:00:00'],
      ['lte', 'created_at', '2026-11-28T23:59:59'],
      ['or', 'actor_email.ilike.%priya%,summary.ilike.%priya%'],
    ]);
    expect(activeFilterCount({ action: 'SALE_REFUND', start: '2026-11-01', end: '', search: ' ' })).toBe(2);
  });

  it('pages of 25 and five page numbers around the current one', () => {
    expect(pageRange(2)).toEqual({ from: 50, to: 74 });
    expect(pageNumbers(0, 3)).toEqual([0, 1, 2]);
    expect(pageNumbers(5, 10)).toEqual([3, 4, 5, 6, 7]);
    expect(pageNumbers(9, 10)).toEqual([5, 6, 7, 8, 9]);
  });
});

describe('dates in the shop time zone', () => {
  it('short and long forms', () => {
    expect(whenShort('2026-11-28T08:44:00Z')).toBe('28 Nov, 2:14 pm');
    expect(whenLong('2026-11-20T13:42:44Z')).toEqual({ date: '20 Nov 2026', time: '7:12:44 pm' });
    expect(whenShort(null)).toBe('—');
  });

  it('relative time', () => {
    expect(relativeTime(new Date(NOW - 30e3).toISOString(), NOW)).toBe('just now');
    expect(relativeTime(new Date(NOW - 2 * 3600e3).toISOString(), NOW)).toBe('2h ago');
    expect(relativeTime(new Date(NOW - 3 * 86400e3).toISOString(), NOW)).toBe('3d ago');
  });

  it('this week starts on the shop Monday; the day starts at shop midnight', () => {
    expect(weekStartDay(NOW)).toBe('2026-11-23');
    expect(weekStartDay(Date.parse('2026-11-22T20:00:00Z'))).toBe('2026-11-23'); // Mon 1:30 am IST
    expect(daysBackDay(30, NOW)).toBe('2026-10-29');
    expect(dayWords('2026-11-23', { weekday: true })).toBe('Mon 23 Nov');
    expect(shopDayStartISO('2026-11-23')).toBe('2026-11-22T18:30:00.000Z');
  });
});

describe('rows', () => {
  it('entity and actor lines', () => {
    expect(entityLine({ entity_type: 'sale', entity_id: '6e1f09a2-aaaa' })).toBe('Sale · 6e1f09a2');
    expect(entityLine({})).toBe('');
    expect(actorOf({}, {})).toEqual({ name: 'System', sub: 'Automatic' });
    expect(actorOf({ actor_id: 'a', actor_email: 'a@x' }, { a: 'Person A' })).toEqual({ name: 'Person A', sub: 'a@x' });
    expect(actorOf({ actor_id: 'b', actor_email: 'b@x' }, {})).toEqual({ name: 'b@x', sub: '' });
  });

  it('lays metadata out by key, keeping every key and value', () => {
    const out = metadataLines({ period: '1 to 15 Nov', net_total: 32400, before: { roles: ['STAFF'] } });
    expect(out.split('\n')).toEqual([
      'period     1 to 15 Nov',
      'net total  32400',
      'before     {"roles":["STAFF"]}',
    ]);
    expect(metadataLines({})).toBe('');
    expect(metadataLines(null)).toBe('');
  });

  it('labels and no-match words', () => {
    expect(actionMeta('PAYROLL_PROCESS')).toMatchObject({ label: 'Payroll processed', tone: 'gr' });
    expect(actionMeta('SOMETHING_NEW').label).toBe('SOMETHING_NEW');
    expect(noMatchWords({ action: 'SALE_REFUND', search: 'priya', start: '2026-11-01', end: '2026-11-28' }))
      .toBe('No sale refund matching “priya” between 1 Nov and 28 Nov 2026.');
    expect(noMatchWords(blankFilters())).toBe('No event.');
    expect(eventsWord(1)).toBe('1 event');
    expect(eventsWord(8)).toBe('8 events');
  });
});
