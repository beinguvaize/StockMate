import { defineConfig } from 'vitest/config';

// Unit tests for pure logic, kept away from Playwright.
//
// `npm test` runs Playwright against a live app, which needs a server and a
// login — useful, but it cannot run in a plain checkout and it never runs while
// writing code. Every defect that reached the screen recently passed both
// `vite build` and eslint because the logic sat inside a component where
// nothing could call it. These tests exist for that gap.
//
// Scoped to src/**/*.test.js so the two runners never try to execute each
// other's files: vitest picked up qa/tests/*.spec.ts and failed on Playwright
// imports the moment it was added.
// The shop runs in Asia/Kolkata, and several date bugs are only visible from
// east of UTC — `new Date(y, m, 1).toISOString()` returns the previous day
// there and the right day in the Americas. The monthBounds tests pass on a
// machine in Halifax with the broken implementation in place and fail in IST,
// so a suite that inherits the developer's timezone silently stops checking
// the thing it was written for. Pin it to where the users are.
process.env.TZ = 'Asia/Kolkata';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{js,jsx}'],
    environment: 'node',
    passWithNoTests: false,
  },
});
