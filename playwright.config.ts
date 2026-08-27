import { defineConfig, devices } from '@playwright/test';
import { loadDotEnv } from './tests/helpers/dotenv';

loadDotEnv();

export default defineConfig({
  testDir: './tests',
  // The ImmigrationTracker suite is a different application with its own
  // server, database and base URL. It runs from playwright.immigration.config.ts.
  testIgnore: '**/immigration/**',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 3,
  reporter: 'html',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15000,
    navigationTimeout: 25000,
  },

  projects: [
    // Runs once to create auth session file
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
    },
    // All real tests reuse the saved session
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],
});
