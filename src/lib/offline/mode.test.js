import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { decideLocalFirst } from './mode.js';

/**
 * Who bills from the local database, and who still reads the server.
 * ==========================================================================
 *
 * This is a rollout switch for the most consequential change in the plan: the
 * till stops asking the server what the catalogue is. Getting it wrong in the
 * permissive direction turns on local billing for shops nobody has tested it
 * at; getting it wrong in the restrictive direction silently stops the DESKTOP
 * app queueing sales at the counter, which is a lost bill that looks like
 * nothing happened.
 *
 * So the rule is a pure function and every branch of it is pinned here.
 */

const T = 'tenant-in-rollout';
const allow = new Set([T]);

describe('deciding local-first', () => {
  it('leaves the desktop app exactly as it was', () => {
    // No allowlist, no override, not a listed tenant: still on, because this
    // is the behaviour that has been shipping.
    expect(decideLocalFirst({ electron: true })).toBe(true);
    expect(decideLocalFirst({ electron: true, tenantId: 'anyone' })).toBe(true);
  });

  it('leaves a web tenant outside the rollout on the server path', () => {
    expect(decideLocalFirst({ electron: false, tenantId: 'someone-else', allow })).toBe(false);
  });

  it('turns on for a web tenant in the rollout', () => {
    expect(decideLocalFirst({ electron: false, tenantId: T, allow })).toBe(true);
  });

  it('can take a till out of the experiment on the spot, desktop included', () => {
    // The fallback is the behaviour that ran for a year, so 'off' must win
    // over everything — otherwise a shop having trouble has no way back
    // except a deploy.
    expect(decideLocalFirst({ electron: true, override: 'off' })).toBe(false);
    expect(decideLocalFirst({ electron: false, tenantId: T, allow, override: 'off' })).toBe(false);
  });

  it('can switch one machine on without a deploy', () => {
    expect(decideLocalFirst({ electron: false, tenantId: 'unlisted', override: 'on' })).toBe(true);
  });

  it('does not turn on for a web session with no tenant yet', () => {
    // Sign-in, tenant switch, a reload mid-auth: there is no tenant to check
    // against the allowlist, and guessing "yes" here would start caching
    // under whichever tenant resolves next.
    expect(decideLocalFirst({ electron: false, tenantId: null, allow })).toBe(false);
  });
});

describe('the cross-tab sync lock', () => {
  /**
   * A stand-in for navigator.locks that behaves the way the real one does for
   * the only option this code uses: with ifAvailable, a caller that cannot get
   * the lock is handed null immediately rather than queued.
   */
  const fakeLocks = () => {
    let held = false;
    return {
      request: async (_name, opts, fn) => {
        if (held && opts?.ifAvailable) return fn(null);
        held = true;
        try { return await fn({}); } finally { held = false; }
      },
    };
  };

  it('lets only one tab flush when Web Locks is available', async () => {
    // Two tabs share one IndexedDB and therefore one outbox. Without the lock
    // each runs its own loop over the same rows and pushes every op twice.
    const { withSyncLock } = await import('./syncEngine.js');
    const locks = fakeLocks();

    let flushes = 0;
    const work = async () => {
      flushes += 1;
      await new Promise((r) => setTimeout(r, 10));
      return 'done';
    };

    const [a, b] = await Promise.all([
      withSyncLock(work, locks),
      withSyncLock(work, locks),
    ]);

    expect(flushes, 'both tabs flushed the same outbox').toBe(1);
    // One tab did the work, the other was told to stand down. Which of the two
    // won the race is not defined, so assert the pair rather than the order.
    expect([a, b].filter((r) => r === 'done')).toHaveLength(1);
    expect([a, b].filter((r) => r === null)).toHaveLength(1);
  });

  it('runs the flush unchanged where Web Locks is missing', async () => {
    // Older Safari and some WebViews have no navigator.locks. The fallback is
    // the behaviour from before this change -- in-context single-flight only --
    // rather than a half-built mutex nobody can reason about. The flush must
    // still HAPPEN; a lock that is absent must not become a lock that is held.
    const { withSyncLock } = await import('./syncEngine.js');

    let flushes = 0;
    const work = async () => { flushes += 1; return 'done'; };

    expect(await withSyncLock(work, null)).toBe('done');
    expect(await withSyncLock(work, {})).toBe('done');      // object without .request
    expect(flushes).toBe(2);
  });

  it('releases the lock when the flush throws', async () => {
    // A tab that crashed mid-flush must not wedge every other tab. Web Locks
    // releases on page close by itself; this covers the ordinary throw.
    const { withSyncLock } = await import('./syncEngine.js');
    const locks = fakeLocks();

    await expect(withSyncLock(async () => { throw new Error('push failed'); }, locks))
      .rejects.toThrow('push failed');

    expect(await withSyncLock(async () => 'second', locks)).toBe('second');
  });
});
