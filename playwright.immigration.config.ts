import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';
import { loadDotEnv } from './tests/helpers/dotenv';

/**
 * End-to-end suite for ImmigrationTracker (the NS PNP / AIP tracker).
 *
 * Run it with:
 *   npx playwright test -c playwright.immigration.config.ts
 *
 * It starts the application itself, against a throwaway SQLite file that is
 * deleted and recreated on every run. It never talks to the deployed site:
 * that database holds real applicants' records, and these tests write.
 * See tests/immigration/helpers/start-server.js for the guards that enforce it.
 */
loadDotEnv();

const APP_DIR = process.env.IT_APP_DIR ||
  '/Users/uvaizeba/.gemini/antigravity/scratch/immigrationtracker';
const PORT = process.env.IT_PORT || '3399';
const BASE_URL = `http://127.0.0.1:${PORT}`;
const JWT_SECRET = process.env.IT_JWT_SECRET || 'immigration-tracker-e2e-secret';

export default defineConfig({
  testDir: './tests/immigration',

  // Applications, stats and the aggregate table are global state that several
  // specs read back after writing, so the suite runs one file at a time.
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { outputFolder: 'playwright-report-immigration' }]],
  outputDir: 'test-results-immigration',

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15000,
    navigationTimeout: 25000,
  },

  webServer: {
    command: `node ${path.join(__dirname, 'tests', 'immigration', 'helpers', 'start-server.js')}`,
    url: BASE_URL,
    // Never adopt a server someone already had running: it would be holding
    // the developer's own database open, and the suite expects an empty one.
    reuseExistingServer: false,
    timeout: 60000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      IT_APP_DIR: APP_DIR,
      IT_BASE_URL: BASE_URL,
      IT_JWT_SECRET: JWT_SECRET,
      PORT,
      DATABASE_URL: 'file:data/e2e-tracker.db',
    },
  },

  projects: [
    {
      name: 'it-setup',
      testMatch: /immigration\/setup\.ts/,
    },
    {
      name: 'it-chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/it-user.json',
      },
      dependencies: ['it-setup'],
    },
  ],
});
