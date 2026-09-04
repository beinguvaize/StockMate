import { describe, it, expect, vi, afterEach } from 'vitest';
import { effectivePlan, trialDaysLeft, isTrialExpired, isTrialLapsed, trialNotice, TRIAL_GRACE_DAYS, PLANS, TRIAL_ENFORCEMENT_START, isModuleAvailable } from './tenancy';

/**
 * What a tenant can reach is decided here, so a wrong answer either bills a
 * customer for nothing or hands the product away. The real tenants at the time
 * of writing are named in the cases.
 */
const daysFromNow = (n) => new Date(Date.now() + n * 86400000).toISOString();

const trial = (plan, days) => ({ plan, status: 'TRIAL', trial_end_date: daysFromNow(days) });

/**
 * Grace runs from the LATER of the trial end and TRIAL_ENFORCEMENT_START, so a
 * tenant only lapses once BOTH are more than the grace window behind us.
 * Expressing it this way keeps the tests true whatever today's date is.
 *
 * This used to test the enforcement date ALONE, which silently stopped
 * matching the code once we moved more than a grace window past 20 Aug: from
 * then on a recently-ended trial anchors on its OWN end date, which is later.
 * The tests went red on 27 Aug and — because `npm run build` runs them via the
 * prebuild hook — took every Cloudflare deploy with them. Mirror the real rule
 * instead of half of it.
 */
const wouldLapse = (endDaysFromNow) => {
  const end    = Date.now() + endDaysFromNow * 86400000;
  const anchor = Math.max(end, new Date(TRIAL_ENFORCEMENT_START).getTime());
  return Date.now() > anchor + TRIAL_GRACE_DAYS * 86400000;
};

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

  it('drops to FREE once grace is used up — counted from enforcement, not retroactively', () => {
    // Aisha Store is 39 days past her trial end, but enforcement only just
    // began; she keeps ENTERPRISE until the warning window from THAT day runs
    // out. Cutting her off on deploy day is the thing this prevents.
    const expected = wouldLapse(-40) ? 'FREE' : 'ENTERPRISE';
    expect(effectivePlan(trial('ENTERPRISE', -40))).toBe(expected);
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
    // Expired means the trial date passed; lapsed means the warning window is
    // gone too. The gap between them is the only notice a shop gets.
    expect(isTrialExpired(trial('FREE', -1))).toBe(true);
    expect(isTrialLapsed(trial('FREE', -1))).toBe(false);
    // Deliberately NOT the exact grace boundary. The fixture's date is taken
    // when the file is collected and wouldLapse takes the clock again at
    // assertion time; on the boundary those two readings are milliseconds
    // apart and decide the answer between them, so the test passes or fails
    // by luck. It failed in CI at 15:58 and passed locally an hour earlier.
    // A day either side is unambiguous at any moment of any day.
    expect(isTrialLapsed(trial('FREE', -(TRIAL_GRACE_DAYS + 1))))
      .toBe(wouldLapse(-(TRIAL_GRACE_DAYS + 1)));
    expect(isTrialLapsed(trial('FREE', -(TRIAL_GRACE_DAYS - 1))))
      .toBe(wouldLapse(-(TRIAL_GRACE_DAYS - 1)));
  });

  it('describes what the banner should say', () => {
    expect(trialNotice(trial('FREE', 40)).kind).toBe('ACTIVE');
    expect(trialNotice(trial('FREE', 5)).kind).toBe('ENDING');
    expect(trialNotice(trial('FREE', -2)).kind).toBe('GRACE');
    expect(trialNotice(trial('FREE', -2)).graceLeft).toBeGreaterThan(0);
    // A day past the boundary, for the same reason as above.
    expect(trialNotice(trial('FREE', -(TRIAL_GRACE_DAYS + 1))).kind)
      .toBe(wouldLapse(-(TRIAL_GRACE_DAYS + 1)) ? 'LAPSED' : 'GRACE');
    expect(trialNotice({ plan: 'PRO', status: 'ACTIVE' })).toBeNull();
  });
});

describe('grace is anchored to when enforcement began', () => {
  /**
   * Three tenants were already past their trial end when enforcement shipped:
   * Aisha Store by 39 days, Shibily stores by 11, MaazMobiles by 3. Counting
   * grace from their own end dates would have cut two of them off the moment
   * the deploy landed, with no warning at all.
   *
   * These assertions describe what is true DURING the grace window, so the
   * clock is pinned inside it. Left on the real clock they quietly became
   * false when the window closed on 27 Aug — and because `npm run build` runs
   * this suite through the prebuild hook, that took every Cloudflare deploy
   * down with it for days. A test that only holds this week is a deploy
   * blocker with a delay fuse.
   */
  const DURING_GRACE = new Date('2026-08-22T10:00:00Z');   // 2 days in
  const AFTER_GRACE  = new Date('2026-09-15T10:00:00Z');   // well past it

  afterEach(() => { vi.useRealTimers(); });

  // Built inside each test so the fixture dates come from the pinned clock,
  // not from whenever the file happened to be collected.
  const longExpired = () => ({
    plan: 'ENTERPRISE', status: 'TRIAL', trial_end_date: daysFromNow(-39),
  });

  it('does not lapse a tenant whose trial ended before enforcement existed', () => {
    vi.useFakeTimers(); vi.setSystemTime(DURING_GRACE);
    // Aisha Store: 39 days past, but enforcement had only just begun.
    expect(isTrialLapsed(longExpired())).toBe(false);
    expect(effectivePlan(longExpired())).toBe('ENTERPRISE');
  });

  it('still gives them the full warning window', () => {
    vi.useFakeTimers(); vi.setSystemTime(DURING_GRACE);
    const n = trialNotice(longExpired());
    expect(n.kind).toBe('GRACE');
    expect(n.graceLeft).toBeGreaterThan(0);
    expect(n.graceLeft).toBeLessThanOrEqual(TRIAL_GRACE_DAYS);
  });

  it('lapses normally once enforcement has been running longer than grace', () => {
    vi.useFakeTimers(); vi.setSystemTime(AFTER_GRACE);
    // Well past both anchors: the warning window has been and gone.
    expect(isTrialLapsed(longExpired())).toBe(true);
    expect(trialNotice(longExpired()).kind).toBe('LAPSED');
    expect(effectivePlan(longExpired())).toBe('FREE');
  });

  it('lapses the moment the window closes, and not a moment before', () => {
    // The exact boundary, which the relative-date tests above deliberately
    // avoid: with the clock pinned there is one reading of "now", so the
    // answer is decided by the rule rather than by which line ran first.
    const endedAtGrace = () => ({
      plan: 'ENTERPRISE', status: 'TRIAL', trial_end_date: daysFromNow(-TRIAL_GRACE_DAYS),
    });

    vi.useFakeTimers(); vi.setSystemTime(AFTER_GRACE);
    // Exactly TRIAL_GRACE_DAYS past its end: the window has run out to the
    // millisecond, and `>` means it has not yet been exceeded.
    expect(isTrialLapsed(endedAtGrace())).toBe(false);

    // One millisecond later it has.
    vi.setSystemTime(new Date(AFTER_GRACE.getTime() + 1));
    const t = endedAtGrace();
    t.trial_end_date = new Date(AFTER_GRACE.getTime() - TRIAL_GRACE_DAYS * 86400000).toISOString();
    expect(isTrialLapsed(t)).toBe(true);
  });

  it('still protects a tenant whose own trial ended only just now', () => {
    // The anchor is the LATER of the two dates, so a trial ending today gets
    // its full window even long after enforcement began. This is the case the
    // old helper got wrong, by testing the enforcement date alone.
    vi.useFakeTimers(); vi.setSystemTime(AFTER_GRACE);
    const endedYesterday = {
      plan: 'ENTERPRISE', status: 'TRIAL', trial_end_date: daysFromNow(-1),
    };
    expect(isTrialLapsed(endedYesterday)).toBe(false);
    expect(trialNotice(endedYesterday).kind).toBe('GRACE');
  });
});

describe('module gating', () => {
  /**
   * What each plan can reach. Pinned because the gate had drifted in BOTH
   * directions: settings and users were Enterprise-only, so a Growth customer
   * sold "3 users" could not open the page to invite anyone; while accounts,
   * estimates, manufacturing, appointments, kds and labels had no route mapping
   * at all, so any tenant could open them by typing the URL.
   */
  const can = (plan, mod) => isModuleAvailable(plan, mod);

  it('gives every plan the Free essentials', () => {
    for (const p of ['FREE', 'GROWTH', 'PRO', 'ENTERPRISE']) {
      for (const m of ['dashboard', 'inventory', 'sales', 'clients', 'expenses', 'daybook', 'invoices']) {
        expect(can(p, m)).toBe(true);
      }
    }
  });

  it('keeps Free out of the paid modules', () => {
    for (const m of ['purchases', 'suppliers', 'reports', 'payroll', 'estimates',
                     'orders', 'vehicles', 'manufacturing', 'accounts', 'audit-log']) {
      expect(can('FREE', m)).toBe(false);
    }
  });

  it('opens Growth up to purchases, reports, payroll and estimates', () => {
    for (const m of ['purchases', 'suppliers', 'reports', 'payroll', 'estimates']) {
      expect(can('GROWTH', m)).toBe(true);
    }
    // ...but not the Pro tier above it.
    for (const m of ['orders', 'vehicles', 'manufacturing', 'accounts']) {
      expect(can('GROWTH', m)).toBe(false);
    }
  });

  it('gives Pro the ledger, orders, vehicles and manufacturing', () => {
    for (const m of ['orders', 'vehicles', 'manufacturing', 'accounts']) {
      expect(can('PRO', m)).toBe(true);
    }
    expect(can('PRO', 'audit-log')).toBe(false);
  });

  it('lets EVERY plan reach its own settings and users', () => {
    // Not premium: a shop must be able to set its GST number and invite the
    // staff its plan already pays for. The seat COUNT is enforced by maxUsers.
    for (const p of ['FREE', 'GROWTH', 'PRO', 'ENTERPRISE']) {
      expect(can(p, 'settings')).toBe(true);
      expect(can(p, 'users')).toBe(true);
    }
  });

  it('keeps the audit log on Enterprise', () => {
    expect(can('ENTERPRISE', 'audit-log')).toBe(true);
    for (const p of ['FREE', 'GROWTH', 'PRO']) expect(can(p, 'audit-log')).toBe(false);
  });

  it('gives an unknown module to nobody', () => {
    // Fail closed: a module with no tier must not be reachable by everyone,
    // which is exactly how accounts and manufacturing came to be open.
    for (const p of ['FREE', 'GROWTH', 'PRO', 'ENTERPRISE']) {
      expect(can(p, 'some-future-module')).toBe(false);
    }
  });
});
