import { describe, it, expect } from 'vitest';
import { effectivePlan, trialDaysLeft, isTrialExpired, isTrialLapsed,
         trialNotice, TRIAL_GRACE_DAYS, PLANS } from './tenancy';

/**
 * What a tenant can reach is decided here, so a wrong answer either bills a
 * customer for nothing or hands the product away. The real tenants at the time
 * of writing are named in the cases.
 */
const daysFromNow = (n) => new Date(Date.now() + n * 86400000).toISOString();

const trial = (plan, days) => ({ plan, status: 'TRIAL', trial_end_date: daysFromNow(days) });

describe('effectivePlan', () => {
  it('leaves a paying customer entirely alone', () => {
    // FUTURE DISPO: ACTIVE, ENTERPRISE. None of the trial logic may touch them.
    expect(effectivePlan({ plan: 'ENTERPRISE', status: 'ACTIVE' })).toBe('ENTERPRISE');
    expect(effectivePlan({ plan: 'GROWTH', status: 'ACTIVE', trial_end_date: daysFromNow(-99) }))
      .toBe('GROWTH');
  });

  it('grants a running FREE trial the trial plan', () => {
    // SKYTECH, Barkat, R.S group, S J Enterprises are all FREE-on-trial today
    // and were getting the Free tier despite "Start free trial".
    expect(effectivePlan(trial('FREE', 60))).toBe('PRO');
    expect(effectivePlan(trial('FREE', 1))).toBe('PRO');
  });

  it('never resolves an existing tenant DOWN', () => {
    // Shibily and MaazMobiles were written straight to ENTERPRISE. Resolving
    // them to PRO would take away access they already have.
    expect(effectivePlan(trial('ENTERPRISE', 30))).toBe('ENTERPRISE');
    expect(effectivePlan(trial('GROWTH', 30))).toBe('PRO');   // PRO is better
  });

  it('keeps access through the grace period', () => {
    expect(effectivePlan(trial('FREE', 0))).toBe('PRO');
    expect(effectivePlan(trial('FREE', -(TRIAL_GRACE_DAYS - 1)))).toBe('PRO');
  });

  it('drops to FREE once grace is used up', () => {
    expect(effectivePlan(trial('FREE', -TRIAL_GRACE_DAYS))).toBe('FREE');
    expect(effectivePlan(trial('ENTERPRISE', -40))).toBe('FREE');   // Aisha Store
  });

  it('falls back to FREE for a plan name it does not know', () => {
    expect(effectivePlan({ plan: 'LEGACY_GOLD', status: 'ACTIVE' })).toBe('FREE');
  });

  it('treats a trial with no end date as its stored plan', () => {
    // Not a trial in any meaningful sense; do not invent an expiry for it.
    expect(effectivePlan({ plan: 'GROWTH', status: 'TRIAL' })).toBe('GROWTH');
  });

  it('always resolves to a plan that exists', () => {
    for (const t of [trial('FREE', 5), trial('ENTERPRISE', -99), { plan: 'PRO', status: 'ACTIVE' }]) {
      expect(PLANS[effectivePlan(t)]).toBeTruthy();
    }
  });
});

describe('trial state', () => {
  it('counts days left, and goes negative after', () => {
    expect(trialDaysLeft(trial('FREE', 10))).toBe(10);
    expect(trialDaysLeft(trial('FREE', -3))).toBe(-3);
    expect(trialDaysLeft({ plan: 'PRO', status: 'ACTIVE' })).toBeNull();
  });

  it('separates expired from lapsed', () => {
    // Expired means the date passed; lapsed means grace is gone too. The gap
    // between them is the only warning a shop gets.
    expect(isTrialExpired(trial('FREE', -1))).toBe(true);
    expect(isTrialLapsed(trial('FREE', -1))).toBe(false);
    expect(isTrialLapsed(trial('FREE', -TRIAL_GRACE_DAYS))).toBe(true);
  });

  it('describes what the banner should say', () => {
    expect(trialNotice(trial('FREE', 40)).kind).toBe('ACTIVE');
    expect(trialNotice(trial('FREE', 5)).kind).toBe('ENDING');
    expect(trialNotice(trial('FREE', -2)).kind).toBe('GRACE');
    expect(trialNotice(trial('FREE', -2)).graceLeft).toBe(TRIAL_GRACE_DAYS - 2);
    expect(trialNotice(trial('FREE', -TRIAL_GRACE_DAYS)).kind).toBe('LAPSED');
    expect(trialNotice({ plan: 'PRO', status: 'ACTIVE' })).toBeNull();
  });
});
