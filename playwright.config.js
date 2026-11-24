import { defineConfig, devices } from '@playwright/test';
import { loadEnv } from 'vite';

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
 *
 * THE MOCKS ONLY WORK IF THIS AGREES WITH THE APP ABOUT THE SUPABASE URL.
 * page.route() matches on an absolute URL, so supabaseMocks.js builds its
 * patterns from VITE_SUPABASE_URL — but nothing here ever loaded .env, so in
 * the Playwright process that variable was undefined and the helper fell back
 * to a hardcoded default. The app, which DOES read .env through Vite, was
 * meanwhile calling a different project entirely.
 *
 * The patterns therefore never matched: every authenticated test sent
 * owner@test.com / password123 to the REAL Supabase project in .env, was told
 * "Invalid login credentials", and timed out waiting for a dashboard. The
 * whole authenticated suite has been failing, against production, since
 * whenever the two URLs diverged.
 *
 * Loading the env the same way Vite does makes them agree by construction
 * rather than by two copies staying in step.
 */
const env = loadEnv('', process.cwd(), 'VITE_');
if (env.VITE_SUPABASE_URL) {
  // Trimmed: .env carries a space after the `=`, which survives into the value
  // and would break exact-prefix URL matching.
  process.env.VITE_SUPABASE_URL = env.VITE_SUPABASE_URL.trim();
}
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
    // Step 1: authenticate (runs auth.setup.js & staff.setup.js, saves .auth/user.json & .auth/staff.json)
    {
      name: 'setup',
      testMatch: /.*\.setup\.js/,
    },
    // Step 2: smoke + new tests (depend on setup having run)
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Auth tests that call test.use({ storageState }) will load the file;
        // the login test ignores it (it has its own context without storageState)
      },
      dependencies: ['setup'],
      testMatch: /.*\.spec\.js/,
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
