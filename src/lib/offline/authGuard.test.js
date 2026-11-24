import { describe, it, expect } from 'vitest';
import { graceDaysFor, graceInfo, isGraceValid } from './authGuard.js';

const DAY = 86400000;
const T0 = Date.UTC(2026, 0, 1);
const bs = (plan, status = 'ACTIVE') => ({ validatedAt: T0, subscription: { plan, status } });

describe('graceDaysFor', () => {
  it('gives paid plans 30 days', () => {
    for (const p of ['GROWTH', 'PRO', 'ENTERPRISE']) expect(graceDaysFor(p, 'ACTIVE')).toBe(30);
  });
  it('gives FREE 7 days, but a trial 30', () => {
    expect(graceDaysFor('FREE', 'ACTIVE')).toBe(7);
    expect(graceDaysFor('FREE', 'TRIAL')).toBe(30);
    expect(graceDaysFor('free', 'trial')).toBe(30);
  });
  it('unknown or missing plan follows the STARTER alias', () => {
    expect(graceDaysFor(null, null)).toBe(graceDaysFor('STARTER', null));
  });
});

describe('graceInfo', () => {
  it('Growth: 30 days, ceil days left', () => {
    const g = graceInfo(bs('GROWTH'), T0 + 10 * DAY + 1);
    expect(g.graceDays).toBe(30);
    expect(g.expiresAt).toBe(T0 + 30 * DAY);
    expect(g.daysLeft).toBe(20);
    expect(g.expired).toBe(false);
    expect(g.clockBack).toBe(false);
  });
  it('Free: 7 days', () => {
    const g = graceInfo(bs('FREE'), T0 + 3 * DAY);
    expect(g.graceDays).toBe(7);
    expect(g.daysLeft).toBe(4);
  });
  it('boundary: valid just before, expired exactly at expiry, daysLeft never negative', () => {
    expect(graceInfo(bs('GROWTH'), T0 + 30 * DAY - 1).expired).toBe(false);
    expect(graceInfo(bs('GROWTH'), T0 + 30 * DAY).expired).toBe(true);
    expect(graceInfo(bs('GROWTH'), T0 + 40 * DAY).daysLeft).toBe(0);
    expect(graceInfo(bs('FREE'), T0 + 8 * DAY).expired).toBe(true);
  });
  it('clockBack when now is >6h behind the max seen time', () => {
    const now = T0 + 5 * DAY;
    expect(graceInfo(bs('GROWTH'), now, now + 7 * 3600000).clockBack).toBe(true);
    expect(graceInfo(bs('GROWTH'), now, now + 5 * 3600000).clockBack).toBe(false);
  });
  it('clockBack when now is >6h before validatedAt', () => {
    expect(graceInfo(bs('GROWTH'), T0 - 7 * 3600000).clockBack).toBe(true);
    expect(graceInfo(bs('GROWTH'), T0 - 5 * 3600000).clockBack).toBe(false);
  });
});

describe('isGraceValid', () => {
  it('uses the plan grace', () => {
    expect(isGraceValid(bs('GROWTH'), T0 + 20 * DAY)).toBe(true);
    expect(isGraceValid(bs('FREE'), T0 + 20 * DAY)).toBe(false);
  });
  it('is false when the clock went back or no snapshot', () => {
    expect(isGraceValid(bs('GROWTH'), T0 + DAY, T0 + 3 * DAY)).toBe(false);
    expect(isGraceValid({}, T0)).toBe(false);
  });
});
