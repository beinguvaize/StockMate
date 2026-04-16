import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config — smoke suite only.
 *
 * Projects:
 *   1. setup   — logs in once (mocked network) and saves storageState
 *   2. chromium — 4 smoke tests; the 3 authenticated ones load the saved state
 *
 * All Supabase REST / Auth calls are intercepted via page.route() in
 * e2e/helpers/supabaseMocks.js so tests run without network access and
 * without real credentials or seeded data.
 */
export default defineConfig({
  testDir: './e2e',

  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,

  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    navigationTimeout: 15_000,
    actionTimeout: 8_000,
  },

  projects: [
    // Step 1: authenticate (runs auth.setup.js, saves .auth/user.json)
    {
      name: 'setup',
      testMatch: /auth\.setup\.js/,
    },
    // Step 2: smoke tests (depend on setup having run)
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Auth tests that call test.use({ storageState }) will load the file;
        // the login test ignores it (it has its own context without storageState)
      },
      dependencies: ['setup'],
      testMatch: /smoke\.spec\.js/,
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
