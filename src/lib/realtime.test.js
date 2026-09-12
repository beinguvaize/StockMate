import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// isElectron reads navigator.userAgent, so the desktop half of the policy can
// only be tested by faking it. Mock the module rather than the global: the
// real isElectron is offline-first plumbing and not what this file is about.
vi.mock('./offline/hookAdapter', () => ({ isElectron: vi.fn(() => false) }));

import { isElectron } from './offline/hookAdapter';
import { realtimeEnabled, LIVE_SURFACES } from './realtime';

const ALL = [
  'sales', 'orders', 'vehicles',
  'inventory', 'purchases', 'operations', 'dashboard', 'reports', 'auth', 'admin',
];

describe('realtime policy', () => {
  beforeEach(() => { isElectron.mockReturnValue(false); });
  afterEach(() => { vi.clearAllMocks(); });

  it('subscribes on web only for the three live surfaces', () => {
    const live = ALL.filter(realtimeEnabled);
    expect(live).toEqual(['sales', 'orders', 'vehicles']);
  });

  it('subscribes to nothing at all on desktop', () => {
    isElectron.mockReturnValue(true);
    // Including the live ones: desktop syncs on a timer and on focus instead.
    expect(ALL.some(realtimeEnabled)).toBe(false);
  });

  it('refuses an unknown surface rather than defaulting it on', () => {
    // A typo in a guard must cost a subscription, never grant one.
    expect(realtimeEnabled('sale')).toBe(false);
    expect(realtimeEnabled(undefined)).toBe(false);
    expect(realtimeEnabled('')).toBe(false);
  });

  it('keeps LIVE_SURFACES immutable so a caller cannot widen the policy', () => {
    expect(Object.isFrozen(LIVE_SURFACES)).toBe(true);
  });
});
