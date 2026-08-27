import { test, expect } from '@playwright/test';
import {
  ADMIN_STATE,
  applicationPayload,
  auth,
  createApplication,
  dateFromToday,
  readAccounts,
  register,
  uniqueEmail,
} from './helpers/accounts';

const ADMIN_ENDPOINTS = [
  '/api/admin/dashboard',
  '/api/admin/users',
  '/api/admin/applications',
  '/api/admin/announcements',
  '/api/admin/analytics/noc-leaderboard',
  '/api/admin/analytics/monthly-trends',
  '/api/admin/analytics/user-growth',
  '/api/admin/analytics/user-summary',
  '/api/admin/analytics/risk-breakdown',
];

test.describe('Admin access control', () => {
  test('every admin endpoint refuses an unauthenticated request', async ({ request }) => {
    for (const endpoint of ADMIN_ENDPOINTS) {
      const res = await request.get(endpoint);
      expect(res.status(), `${endpoint} without a token`).toBe(401);
    }
  });

  test('every admin endpoint refuses a signed-in applicant', async ({ request }) => {
    const { user } = readAccounts();

    for (const endpoint of ADMIN_ENDPOINTS) {
      const res = await request.get(endpoint, { headers: auth(user.token) });
      expect(res.status(), `${endpoint} as a regular user`).toBe(403);
      expect((await res.json()).error).toBe('Admin access required');
    }
  });

  test('the admin write endpoints are closed to a regular applicant too', async ({ request }) => {
    const { user, other } = readAccounts();

    const role = await request.put(`/api/admin/users/${other.id}/role`, {
      headers: auth(user.token),
      data: { role: 'admin' },
    });
    expect(role.status()).toBe(403);

    const password = await request.put(`/api/admin/users/${other.id}/password`, {
      headers: auth(user.token),
      data: { password: 'hijacked-password' },
    });
    expect(password.status()).toBe(403);

    const remove = await request.delete(`/api/admin/users/${other.id}`, { headers: auth(user.token) });
    expect(remove.status()).toBe(403);

    // And the account it tried to take over still works as it did.
    const login = await request.post('/api/auth/login', {
      data: { email: other.email, password: other.password },
    });
    expect(login.status()).toBe(200);
    expect((await login.json()).user.role).toBe('user');
  });
});

test.describe('Admin portal', () => {
  test.use({ storageState: ADMIN_STATE });

  test('the admin link is shown to an admin and /admin is served', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#appLayout')).toBeVisible();
    await expect(page.locator('#adminLink')).toBeVisible();

    await page.goto('/admin');
    expect(page.url()).toContain('/admin');
    await expect(page).toHaveTitle(/admin/i);
  });

  test('the admin dashboard counts users and applications', async ({ request }) => {
    const { admin } = readAccounts();

    const res = await request.get('/api/admin/dashboard', { headers: auth(admin.token) });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.totalUsers).toBeGreaterThanOrEqual(3);
    expect(body.totalApplications).toBeGreaterThan(0);
    expect(Array.isArray(body.recentUsers)).toBe(true);
    expect(Array.isArray(body.programDistribution)).toBe(true);
  });

  test('the user list never carries password hashes', async ({ request }) => {
    const { admin } = readAccounts();

    const res = await request.get('/api/admin/users', { headers: auth(admin.token) });
    const { users, pagination } = await res.json();

    expect(users.length).toBeGreaterThan(0);
    expect(pagination.total).toBeGreaterThanOrEqual(users.length);
    for (const user of users) {
      expect(user).not.toHaveProperty('password_hash');
    }
  });

  test('the user list can be searched and filtered by role', async ({ request }) => {
    const { admin } = readAccounts();

    const byRole = await request.get('/api/admin/users?role=admin&limit=100', { headers: auth(admin.token) });
    const admins = (await byRole.json()).users;
    expect(admins.length).toBeGreaterThan(0);
    for (const user of admins) {
      expect(user.role).toBe('admin');
    }

    const bySearch = await request.get(
      `/api/admin/users?search=${encodeURIComponent(admin.email)}`,
      { headers: auth(admin.token) }
    );
    const found = (await bySearch.json()).users;
    expect(found).toHaveLength(1);
    expect(found[0].email).toBe(admin.email);
  });

  test('an admin cannot demote or delete themselves', async ({ request }) => {
    const { admin } = readAccounts();

    const demote = await request.put(`/api/admin/users/${admin.id}/role`, {
      headers: auth(admin.token),
      data: { role: 'user' },
    });
    expect(demote.status()).toBe(400);
    expect((await demote.json()).error).toBe('Cannot demote yourself');

    const remove = await request.delete(`/api/admin/users/${admin.id}`, { headers: auth(admin.token) });
    expect(remove.status()).toBe(400);
    expect((await remove.json()).error).toBe('Cannot delete yourself');
  });

  test('an invalid role is rejected', async ({ request }) => {
    const { admin, other } = readAccounts();

    const res = await request.put(`/api/admin/users/${other.id}/role`, {
      headers: auth(admin.token),
      data: { role: 'superuser' },
    });

    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('Invalid role');
  });

  test('deleting a user takes their applications with them', async ({ request, playwright, baseURL }) => {
    const { admin } = readAccounts();

    const context = await playwright.request.newContext({ baseURL });
    const doomed = await register(context, uniqueEmail('to-be-deleted'));
    const app = await createApplication(context, doomed.token, { noc_code: '65100' });
    await context.dispose();

    const before = await request.get(`/api/stats/table?noc_code=65100`);
    expect((await before.json()).rows.length).toBe(1);

    const res = await request.delete(`/api/admin/users/${doomed.id}`, { headers: auth(admin.token) });
    expect(res.status()).toBe(200);

    const after = await request.get(`/api/stats/table?noc_code=65100`);
    expect((await after.json()).rows).toHaveLength(0);

    // And the deleted account's token no longer reaches anything.
    const orphaned = await request.get(`/api/applications`, { headers: auth(doomed.token) });
    expect((await orphaned.json())).toEqual([]);
    expect(app.id).toBeGreaterThan(0);
  });

  test('an admin can edit any applicant\'s application', async ({ request }) => {
    const { admin, other } = readAccounts();
    const app = await createApplication(request, other.token, { noc_code: '13110' });

    const res = await request.put(`/api/admin/applications/${app.id}`, {
      headers: auth(admin.token),
      data: { ...applicationPayload({ noc_code: '13110' }), status: 'Refused' },
    });
    expect(res.status()).toBe(200);

    const list = await request.get('/api/applications', { headers: auth(other.token) });
    const updated = (await list.json()).find((a: { id: number }) => a.id === app.id);
    expect(updated.status).toBe('Refused');
  });

  test('an admin can change one field without resending the whole application', async ({ request }) => {    const { admin, other } = readAccounts();
    const app = await createApplication(request, other.token, { noc_code: '13110' });

    const res = await request.put(`/api/admin/applications/${app.id}`, {
      headers: auth(admin.token),
      data: { status: 'Refused' },
    });

    expect(res.status()).toBe(200);
  });

  test('an admin edit does not wipe an existing nomination date', async ({ request }) => {    const { admin, other } = readAccounts();
    const nominatedOn = dateFromToday(-40);
    const app = await createApplication(request, other.token, {
      noc_code: '13110',
      status: 'Nominated / Endorsed',
      nominated_date: nominatedOn,
    });

    await request.put(`/api/admin/applications/${app.id}`, {
      headers: auth(admin.token),
      data: {
        ...applicationPayload({ noc_code: '13110' }),
        status: 'Nominated / Endorsed',
        status_note: 'Checked the file',
      },
    });

    const list = await request.get('/api/applications', { headers: auth(other.token) });
    const updated = (await list.json()).find((a: { id: number }) => a.id === app.id);
    expect(updated.nominated_date).toBe(nominatedOn);
  });

  test('bulk status updates reject an unknown status and an empty selection', async ({ request }) => {    const { admin, other } = readAccounts();
    const app = await createApplication(request, other.token, { noc_code: '13110' });

    const empty = await request.put('/api/admin/applications/bulk-status', {
      headers: auth(admin.token),
      data: { appIds: [], status: 'Refused' },
    });
    expect(empty.status()).toBe(400);

    const bogus = await request.put('/api/admin/applications/bulk-status', {
      headers: auth(admin.token),
      data: { appIds: [app.id], status: 'Approved By Vibes' },
    });
    expect(bogus.status()).toBe(400);

    const good = await request.put('/api/admin/applications/bulk-status', {
      headers: auth(admin.token),
      data: { appIds: [app.id], status: 'Nominated / Endorsed' },
    });
    expect(good.status()).toBe(200);
  });

  test('an announcement can be created, listed, published and removed', async ({ request }) => {
    const { admin } = readAccounts();
    const message = `E2E announcement ${Date.now()}`;

    const create = await request.post('/api/admin/announcements', {
      headers: auth(admin.token),
      data: { message, active: 1, priority: 'urgent', target_program: 'All' },
    });
    expect(create.status()).toBe(200);

    const list = await request.get('/api/admin/announcements', { headers: auth(admin.token) });
    const announcements = (await list.json()).announcements;
    const created = announcements.find((a: { message: string }) => a.message === message);
    expect(created).toBeTruthy();

    // Active announcements are public, which is the point of them.
    const active = await request.get('/api/stats/announcements/active');
    expect((await active.json()).announcements.map((a: { message: string }) => a.message))
      .toContain(message);

    const del = await request.delete(`/api/admin/announcements/${created.id}`, { headers: auth(admin.token) });
    expect(del.status()).toBe(200);

    const afterDelete = await request.get('/api/stats/announcements/active');
    expect((await afterDelete.json()).announcements.map((a: { message: string }) => a.message))
      .not.toContain(message);
  });

  test('an expired announcement is not published', async ({ request }) => {
    const { admin } = readAccounts();
    const message = `E2E expired announcement ${Date.now()}`;

    await request.post('/api/admin/announcements', {
      headers: auth(admin.token),
      data: {
        message,
        active: 1,
        expires_at: `${dateFromToday(-1)}T00:00:00.000Z`,
      },
    });

    const active = await request.get('/api/stats/announcements/active');
    expect((await active.json()).announcements.map((a: { message: string }) => a.message))
      .not.toContain(message);
  });

  test('an admin password reset is refused if the password is too short', async ({ request }) => {
    const { admin, other } = readAccounts();

    const res = await request.put(`/api/admin/users/${other.id}/password`, {
      headers: auth(admin.token),
      data: { password: '12345' },
    });

    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('Password must be at least 6 characters');
  });
});
