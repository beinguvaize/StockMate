import { defineConfig, devices } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Load .env, if there is one.
 *
 * .env.example tells you to copy it to .env, but nothing read the file --
 * Playwright does not load one by default -- so following that instruction
 * still failed with "E2E_EMAIL is not set". Done here rather than by adding
 * dotenv: it is a few lines and avoids a dependency for it.
 *
 * Existing environment variables always win, so CI secrets are never
 * overridden by a stray .env left on a runner.
 */
function loadDotEnv(file = path.join(__dirname, '.env')) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    // Tolerate quoted values, which is how most people write a password.
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = val;
  }
}
loadDotEnv();

export default defineConfig({
  testDir: './tests',
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
