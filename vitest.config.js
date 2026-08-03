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
export default defineConfig({
  test: {
    include: ['src/**/*.test.{js,jsx}'],
    environment: 'node',
    passWithNoTests: false,
  },
});
