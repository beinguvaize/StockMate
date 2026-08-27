import { test, expect } from '@playwright/test';
import { PASSWORD, uniqueEmail, readAccounts } from './helpers/accounts';

// Signing in is what these tests exercise, so they start signed out.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Authentication', () => {
  test('an unauthenticated visitor lands on the sign-in card', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('#authScreen')).toBeVisible();
    await expect(page.locator('#appLayout')).toBeHidden();
    await expect(page.locator('#authTitle')).toHaveText('Welcome Back');
    await expect(page.locator('#authSubmitBtn')).toHaveText('Sign In');
    // Registration asks for the password twice; signing in does not.
    await expect(page.locator('#confirmPasswordGroup')).toBeHidden();
  });

  test('a new applicant can register and lands on the dashboard', async ({ page }) => {
    const email = uniqueEmail('ui-register');

    await page.goto('/');
    await page.locator('#authToggleLink').click();

    await expect(page.locator('#authTitle')).toHaveText('Create Account');
    await expect(page.locator('#confirmPasswordGroup')).toBeVisible();

    await page.locator('#authEmail').fill(email);
    await page.locator('#authPassword').fill(PASSWORD);
    await page.locator('#authConfirmPassword').fill(PASSWORD);
    await page.locator('#authSubmitBtn').click();

    await expect(page.locator('#appLayout')).toBeVisible();
    await expect(page.locator('#navUserEmailSpan')).toHaveText(email);
  });

  test('registration refuses two passwords that do not match', async ({ page }) => {
    await page.goto('/');
    await page.locator('#authToggleLink').click();

    await page.locator('#authEmail').fill(uniqueEmail('ui-mismatch'));
    await page.locator('#authPassword').fill(PASSWORD);
    await page.locator('#authConfirmPassword').fill(`${PASSWORD}-typo`);
    await page.locator('#authSubmitBtn').click();

    await expect(page.locator('#authError')).toHaveText('Passwords do not match.');
    await expect(page.locator('#appLayout')).toBeHidden();
  });

  test('an existing applicant can sign in and the session survives a reload', async ({ page }) => {
    const { user } = readAccounts();

    await page.goto('/');
    await page.locator('#authEmail').fill(user.email);
    await page.locator('#authPassword').fill(user.password);
    await page.locator('#authSubmitBtn').click();

    await expect(page.locator('#appLayout')).toBeVisible();

    await page.reload();
    await expect(page.locator('#appLayout')).toBeVisible();
    await expect(page.locator('#authScreen')).toBeHidden();
  });

  test('a wrong password is rejected without saying whether the email exists', async ({ page }) => {
    const { user } = readAccounts();

    await page.goto('/');
    await page.locator('#authEmail').fill(user.email);
    await page.locator('#authPassword').fill('not-the-password');
    await page.locator('#authSubmitBtn').click();

    await expect(page.locator('#authError')).toHaveText('Invalid credentials');
    await expect(page.locator('#appLayout')).toBeHidden();

    // An unknown address must fail identically, or the form becomes a way to
    // find out who has an account.
    await page.locator('#authEmail').fill(uniqueEmail('nobody'));
    await page.locator('#authPassword').fill('not-the-password');
    await page.locator('#authSubmitBtn').click();
    await expect(page.locator('#authError')).toHaveText('Invalid credentials');
  });

  test('logging out clears the session', async ({ page }) => {
    const { user } = readAccounts();

    await page.goto('/');
    await page.locator('#authEmail').fill(user.email);
    await page.locator('#authPassword').fill(user.password);
    await page.locator('#authSubmitBtn').click();
    await expect(page.locator('#appLayout')).toBeVisible();

    await page.locator('#logoutBtn').click();

    await expect(page.locator('#authScreen')).toBeVisible();
    await expect(page.locator('#appLayout')).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull();
  });

  test('the forgot-password form reports success for any address', async ({ page }) => {
    const { user } = readAccounts();

    await page.goto('/');
    await page.locator('#forgotPasswordBtn').click();
    await expect(page.locator('#authTitle')).toHaveText('Reset Password');

    await page.locator('#forgotEmail').fill(user.email);
    await page.locator('#forgotSubmitBtn').click();
    await expect(page.locator('#forgotSuccessMsg')).toBeVisible();
  });
});

test.describe('Authentication API', () => {
  test('registration rejects a password under six characters', async ({ request }) => {
    const res = await request.post('/api/auth/register', {
      data: { email: uniqueEmail('short-pw'), password: '12345' },
    });

    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('Password must be at least 6 characters');
  });

  test('registration rejects a missing email or password', async ({ request }) => {
    const noEmail = await request.post('/api/auth/register', { data: { password: PASSWORD } });
    expect(noEmail.status()).toBe(400);

    const noPassword = await request.post('/api/auth/register', { data: { email: uniqueEmail('no-pw') } });
    expect(noPassword.status()).toBe(400);
  });

  test('an email can only be registered once', async ({ request }) => {
    const email = uniqueEmail('duplicate');

    const first = await request.post('/api/auth/register', { data: { email, password: PASSWORD } });
    expect(first.status()).toBe(201);

    const second = await request.post('/api/auth/register', { data: { email, password: PASSWORD } });
    expect(second.status()).toBe(409);
    expect((await second.json()).error).toBe('Email already registered');
  });

  test('registration never returns the password hash', async ({ request }) => {
    const res = await request.post('/api/auth/register', {
      data: { email: uniqueEmail('no-hash'), password: PASSWORD },
    });

    const body = await res.json();
    expect(body.user).not.toHaveProperty('password_hash');
    expect(JSON.stringify(body)).not.toContain(PASSWORD);
  });

  test('forgot-password answers the same for a known and an unknown address', async ({ request }) => {
    const { user } = readAccounts();

    const known = await request.post('/api/auth/forgot-password', { data: { email: user.email } });
    const unknown = await request.post('/api/auth/forgot-password', {
      data: { email: uniqueEmail('never-registered') },
    });

    expect(known.status()).toBe(200);
    expect(unknown.status()).toBe(200);
    // Identical bodies, so the endpoint cannot be used to enumerate accounts.
    expect(await known.json()).toEqual(await unknown.json());
  });

  test('a made-up reset token is refused', async ({ request }) => {
    const res = await request.post('/api/auth/reset-password', {
      data: { token: 'a'.repeat(64), password: 'brand-new-password' },
    });

    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('Invalid or expired');
  });
});
