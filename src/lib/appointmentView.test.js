import { describe, it, expect } from 'vitest';
import {
  statusOf, appointmentActions, isDim, shopDay, shopTime, shopInstant, groupByShopDay, sortedDays,
  longDay, shortDay, monthLabel, cursorOf, shiftCursor, countLine, dayCountLine, dayDots, whoLine,
  dialogSub, clashLine, bookingPayload, LEGEND,
} from './appointmentView';

const IST = 'Asia/Kolkata';
const NY = 'America/New_York';

describe('statuses and actions (today\'s rules)', () => {
  it('unknown or missing status reads Booked', () => {
    expect(statusOf({}).key).toBe('BOOKED');
    expect(statusOf({ status: 'weird' }).key).toBe('BOOKED');
    expect(statusOf({ status: 'noshow' }).label).toBe('No-show');
  });
  it('only a booked row can be completed, no-showed or cancelled; delete always', () => {
    expect(appointmentActions({ status: 'BOOKED' })).toMatchObject({ complete: true, noShow: true, cancel: true, remove: true });
    for (const s of ['COMPLETED', 'CANCELLED', 'NOSHOW']) {
      expect(appointmentActions({ status: s })).toMatchObject({ complete: false, noShow: false, cancel: false, remove: true });
    }
  });
  it('cancelled and no-show are dimmed', () => {
    expect(isDim({ status: 'CANCELLED' })).toBe(true);
    expect(isDim({ status: 'NOSHOW' })).toBe(true);
    expect(isDim({ status: 'COMPLETED' })).toBe(false);
  });
  it('legend is in the drawn order', () => {
    expect(LEGEND.map((s) => s.label)).toEqual(['Booked', 'Completed', 'No-show', 'Cancelled']);
  });
});

describe('shop timezone day and time', () => {
  it('a booking late in the shop evening stays on that shop day, not the UTC day', () => {
    // 23:30 IST on 26 Nov is 18:00 UTC the same day; 00:30 IST on 27 Nov is 19:00 UTC on the 26th.
    expect(shopDay('2026-11-26T19:00:00Z', IST)).toBe('2026-11-27');
    expect(shopTime('2026-11-26T19:00:00Z', IST)).toBe('00:30');
    expect(shopDay('2026-11-26T19:00:00Z', NY)).toBe('2026-11-26');
    expect(shopTime('2026-11-26T19:00:00Z', NY)).toBe('14:00');
  });
  it('nothing or garbage is empty, never 1970', () => {
    expect(shopDay(null, IST)).toBe('');
    expect(shopDay('', IST)).toBe('');
    expect(shopTime('nope', IST)).toBe('');
  });
  it('a time typed in the form is the shop clock', () => {
    expect(shopInstant('2026-11-27', '16:00', IST).toISOString()).toBe('2026-11-27T10:30:00.000Z');
    expect(shopInstant('2026-11-27', '16:00', NY).toISOString()).toBe('2026-11-27T21:00:00.000Z');
    // Across a daylight-saving change (New York, summer)
    expect(shopInstant('2026-07-01', '09:00', NY).toISOString()).toBe('2026-07-01T13:00:00.000Z');
  });
  it('round trips', () => {
    const d = shopInstant('2026-03-08', '10:15', NY);
    expect(shopDay(d, NY)).toBe('2026-03-08');
    expect(shopTime(d, NY)).toBe('10:15');
  });
  it('unreadable form input is an invalid date', () => {
    expect(Number.isNaN(shopInstant('', '10:00', IST).getTime())).toBe(true);
    expect(Number.isNaN(shopInstant('2026-11-27', '', IST).getTime())).toBe(true);
  });
  it('groups by shop day, sorted by time, skipping rows with no start', () => {
    const list = [
      { id: 'b', start_at: '2026-11-26T08:00:00Z' },
      { id: 'a', start_at: '2026-11-26T04:30:00Z' },
      { id: 'c', start_at: '2026-11-26T19:00:00Z' },
      { id: 'x', start_at: null },
    ];
    const g = groupByShopDay(list, IST);
    expect(Object.keys(g).sort()).toEqual(['2026-11-26', '2026-11-27']);
    expect(g['2026-11-26'].map((a) => a.id)).toEqual(['a', 'b']);
    expect(sortedDays(g)).toEqual(['2026-11-26', '2026-11-27']);
  });
});

describe('words', () => {
  it('long day, with today marked', () => {
    expect(longDay('2026-11-26')).toBe('Thursday, 26 November');
    expect(longDay('2026-11-26', '2026-11-26')).toBe('Thursday, 26 November · today');
    expect(longDay('2026-11-25', '2026-11-26')).toBe('Wednesday, 25 November');
    expect(longDay('')).toBe('');
  });
  it('short day and month', () => {
    expect(shortDay('2026-11-27')).toBe('27 Nov 2026');
    expect(monthLabel({ y: 2026, m: 10 })).toBe('November 2026');
  });
  it('month cursor moves across the year', () => {
    expect(cursorOf('2026-11-26')).toEqual({ y: 2026, m: 10 });
    expect(shiftCursor({ y: 2026, m: 11 }, 1)).toEqual({ y: 2027, m: 0 });
    expect(shiftCursor({ y: 2026, m: 0 }, -1)).toEqual({ y: 2025, m: 11 });
  });
  it('counts', () => {
    expect(countLine(37)).toBe('37 appointments in all');
    expect(countLine(1)).toBe('1 appointment in all');
    expect(countLine(0)).toBe('0 appointments');
    expect(dayCountLine(5)).toBe('5 bookings');
    expect(dayCountLine(1)).toBe('1 booking');
    expect(dayCountLine(0)).toBe('no bookings');
  });
  it('four dots then +N', () => {
    const r = dayDots([{}, { status: 'COMPLETED' }, {}, { status: 'NOSHOW' }, {}]);
    expect(r.dots.map((s) => s.key)).toEqual(['BOOKED', 'COMPLETED', 'BOOKED', 'NOSHOW']);
    expect(r.more).toBe(1);
    expect(dayDots(undefined)).toEqual({ dots: [], more: 0 });
  });
  it('who line', () => {
    const names = { s1: 'Staff One' };
    const sn = (id) => names[id] || '';
    expect(whoLine({ client_name: 'Client A', staff_id: 's1' }, sn)).toBe('Client A · Staff One');
    expect(whoLine({ staff_id: 's1' }, sn)).toBe('Walk-in · Staff One');
    expect(whoLine({ client_name: 'Client A', staff_id: 'gone' }, sn)).toBe('Client A');
  });
  it('dialog line and clash line use the shop clock', () => {
    const a = { service_name: 'Service A', client_name: 'Client A', start_at: '2026-11-26T04:30:00Z' };
    expect(dialogSub(a, IST)).toBe('Service A · Client A · 10:00');
    expect(clashLine('Staff One', [{ start_at: '2026-11-26T08:30:00Z' }], IST)).toBe('Staff One already has a booking then (14:00). You can still save.');
    expect(clashLine('', [{ start_at: '2026-11-26T08:30:00Z' }, { start_at: '2026-11-26T09:00:00Z' }], IST))
      .toBe('That staff member already has 2 bookings then (14:00, 14:30). You can still save.');
    expect(clashLine('X', [], IST)).toBe('');
  });
});

describe('bookingPayload: today\'s two save shapes', () => {
  it('builds the book payload and the update patch', () => {
    const p = bookingPayload({
      serviceId: 'p1', serviceName: 'Service A', clientId: '', clientName: null, staffId: '',
      startAt: '2026-11-27T10:30:00.000Z', duration: 60, price: 250, notes: '',
    });
    expect(p).toMatchObject({ serviceId: 'p1', serviceName: 'Service A', durationMin: 60, price: 250, startAt: '2026-11-27T10:30:00.000Z' });
    expect(p.patch).toEqual({
      service_id: 'p1', service_name: 'Service A', client_id: null, client_name: null, staff_id: null,
      start_at: '2026-11-27T10:30:00.000Z', duration_min: 60, price: 250, notes: null,
    });
  });
});
