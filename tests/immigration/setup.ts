import { test as setup, expect } from '@playwright/test';
import * as fs from 'fs';
import {
  ACCOUNTS_FILE,
  AUTH_DIR,
  ADMIN_STATE,
  USER_STATE,
  register,
  uniqueEmail,
  writeStorageState,
} from './helpers/accounts';

/**
 * The database is recreated empty for every run, so the accounts the suite
 * needs are registered here rather than assumed to exist.
 */
setup('register the accounts the suite runs as', async ({ request, baseURL }) => {
  expect(baseURL, 'baseURL must be set by the config').toBeTruthy();

  // routes/auth.js promotes the very first registration to admin, so this one
  // has to happen before any other account exists.
  const usersBefore = await request.get('/api/stats');
  expect(usersBefore.ok(), 'the app should be serving /api/stats').toBeTruthy();

  const admin = await register(request, uniqueEmail('admin'));
  expect(
    admin.role,
    'the first account on an empty database should be admin — if it is not, ' +
    'the database was not empty and the suite would be running against real data'
  ).toBe('admin');

  const user = await register(request, uniqueEmail('applicant'));
  expect(user.role).toBe('user');

  const other = await register(request, uniqueEmail('other-applicant'));
  expect(other.role).toBe('user');

  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify({ admin, user, other }, null, 2));

  writeStorageState(USER_STATE, baseURL!, user);
  writeStorageState(ADMIN_STATE, baseURL!, admin);
});
