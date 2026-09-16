// Vitest setup for the time-travel run: pin the whole suite at WARP_TO.
//
// A test that only holds *this week* is a deploy blocker with a delay fuse —
// `npm run build` runs the suite through the prebuild hook, so the day it goes
// red is the day Cloudflare stops shipping, silently. See scripts/test-future.sh.
import { beforeAll, vi } from 'vitest';

beforeAll(() => {
  const target = process.env.WARP_TO;
  if (!target) return;
  // shouldAdvanceTime so anything awaiting a real timer still progresses.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(target));
});
