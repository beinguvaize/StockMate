import { describe, it, expect } from 'vitest';
import {
  ticketStatus, ageMinutes, isLate, ticketNo, tableLine, stationGroups, foodMark, statusCounts, byColumn,
  agoWords, liveLine, activeLine, servedTitle, wallClock, LATE_MIN, COLUMNS,
} from './kitchenView';

describe('ticket status (today\'s flow)', () => {
  it('NEW → PREPARING → READY → SERVED, one tap each', () => {
    expect(ticketStatus({ status: 'NEW' })).toMatchObject({ next: 'PREPARING', action: 'Start' });
    expect(ticketStatus({ status: 'PREPARING' })).toMatchObject({ next: 'READY', action: 'Ready' });
    expect(ticketStatus({ status: 'READY' })).toMatchObject({ next: 'SERVED', action: 'Served' });
  });
  it('unknown reads New', () => {
    expect(ticketStatus({}).key).toBe('NEW');
    expect(ticketStatus({ status: 'x' }).key).toBe('NEW');
  });
  it('columns in drawn order', () => {
    expect(COLUMNS.map((c) => c.label)).toEqual(['New', 'Preparing', 'Ready']);
  });
});

describe('age and lateness', () => {
  const now = Date.parse('2026-11-26T14:00:00Z');
  it('whole minutes, never negative', () => {
    expect(ageMinutes('2026-11-26T13:42:00Z', now)).toBe(18);
    expect(ageMinutes('2026-11-26T14:05:00Z', now)).toBe(0);
    expect(ageMinutes(null, now)).toBe(0);
  });
  it('red from 15 minutes, as today', () => {
    expect(LATE_MIN).toBe(15);
    expect(isLate(14)).toBe(false);
    expect(isLate(15)).toBe(true);
  });
});

describe('ticket words', () => {
  it('number and table', () => {
    expect(ticketNo({ ticket_no: 36 })).toBe('#36');
    expect(tableLine({ table_label: '2' })).toBe('· T2');
    expect(tableLine({})).toBe('');
    expect(servedTitle({ ticket_no: 38, table_label: '1' })).toBe('#38 served · T1');
    expect(servedTitle({ ticket_no: 39 })).toBe('#39 served');
  });
  it('items by station, first seen first, no station = Kitchen', () => {
    const g = stationGroups([{ name: 'a' }, { name: 'b', station: 'Beverages' }, { name: 'c', station: 'Kitchen' }]);
    expect(g.map((x) => x.station)).toEqual(['Kitchen', 'Beverages']);
    expect(g[0].items.map((i) => i.name)).toEqual(['a', 'c']);
    expect(stationGroups(null)).toEqual([]);
  });
  it('food marks', () => {
    expect(foodMark('VEG')).toBe('v');
    expect(foodMark('NONVEG')).toBe('nv');
    expect(foodMark('EGG')).toBe('e');
    expect(foodMark(undefined)).toBe(null);
  });
  it('counts and columns', () => {
    const t = [{ id: 1, status: 'NEW' }, { id: 2, status: 'PREPARING' }, { id: 3 }, { id: 4, status: 'READY' }];
    expect(statusCounts(t)).toEqual({ NEW: 2, PREPARING: 1, READY: 1 });
    expect(byColumn(t).NEW.map((x) => x.id)).toEqual([1, 3]);
    expect(activeLine(6)).toBe('6 active tickets');
    expect(activeLine(1)).toBe('1 active ticket');
  });
});

describe('live chip', () => {
  const now = 1_000_000;
  it('online says when it last updated', () => {
    expect(agoWords(3000)).toBe('3 s');
    expect(agoWords(125000)).toBe('2 min');
    expect(liveLine({ lastOkAt: now - 3000, failing: false, now })).toEqual({ off: false, text: 'Updated 3 s ago' });
    expect(liveLine({ lastOkAt: now - 3000, failing: false, now, wall: true }).text).toBe('Live · updated 3 s ago');
  });
  it('offline says so, and how old the board is', () => {
    expect(liveLine({ lastOkAt: now - 120000, failing: true, now })).toEqual({ off: true, text: 'Offline · last update 2 min ago' });
    expect(liveLine({ lastOkAt: null, failing: true, now })).toEqual({ off: true, text: 'Offline' });
  });
  it('wall clock in the shop timezone', () => {
    expect(wallClock(new Date('2026-11-26T14:12:00Z'), 'Asia/Kolkata')).toBe('7:42 pm');
  });
});
