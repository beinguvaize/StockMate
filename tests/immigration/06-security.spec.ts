import { test, expect } from '@playwright/test';
import {
  applicationPayload,
  auth,
  createApplication,
  freshApplicant,
  readAccounts,
  register,
  uniqueEmail,
} from './helpers/accounts';

test.describe('Token handling', () => {
  const PROTECTED = [
    { method: 'get' as const, path: '/api/applications' },
    { method: 'post' as const, path: '/api/applications' },
    { method: 'put' as const, path: '/api/applications/1' },
    { method: 'delete' as const, path: '/api/applications/1' },
  ];

  test('a request with no token is refused', async ({ request }) => {
    for (const { method, path } of PROTECTED) {
      const res = await request[method](path, { data: applicationPayload() });
      expect(res.status(), `${method.toUpperCase()} ${path}`).toBe(401);
      expect((await res.json()).error).toBe('Access token required');
    }
  });

  test('a forged or corrupted token is refused', async ({ request }) => {
    const { user } = readAccounts();
    const tampered = `${user.token.slice(0, -4)}beef`;

    for (const token of ['not-a-token', tampered, `${user.token}.extra`]) {
      const res = await request.get('/api/applications', { headers: auth(token) });
      expect(res.status()).toBe(403);
      expect((await res.json()).error).toBe('Invalid or expired token');
    }
  });

  test('a token signed with the wrong secret is refused', async ({ request }) => {
    // Header and payload of a valid-looking token, signed with something else.
    const forged = [
      Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
      Buffer.from(JSON.stringify({ id: 1, email: 'attacker@e2e.invalid', role: 'admin' })).toString('base64url'),
      'this-is-not-a-valid-signature',
    ].join('.');

    const res = await request.get('/api/admin/dashboard', { headers: auth(forged) });
    expect(res.status()).toBe(403);
  });

  test('the alg=none trick does not get past verification', async ({ request }) => {
    const none = [
      Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
      Buffer.from(JSON.stringify({ id: 1, email: 'attacker@e2e.invalid', role: 'admin' })).toString('base64url'),
      '',
    ].join('.');

    const res = await request.get('/api/admin/dashboard', { headers: auth(none) });
    expect(res.status()).toBe(403);
  });
});

test.describe('One applicant cannot reach another\'s data', () => {
  test('applications are scoped to the signed-in applicant', async ({ request }) => {
    const { user, other } = readAccounts();
    const mine = await createApplication(request, user.token, { noc_code: '21231' });

    const theirs = await request.get('/api/applications', { headers: auth(other.token) });
    const theirIds = (await theirs.json()).map((a: { id: number }) => a.id);

    expect(theirIds).not.toContain(mine.id);
  });

  test('another applicant cannot edit or delete an application', async ({ request }) => {
    const { user, other } = readAccounts();
    const mine = await createApplication(request, user.token, { noc_code: '21231', status_note: 'mine' });

    const edit = await request.put(`/api/applications/${mine.id}`, {
      headers: auth(other.token),
      data: { status_note: 'tampered with' },
    });
    expect(edit.status()).toBe(404);

    const remove = await request.delete(`/api/applications/${mine.id}`, { headers: auth(other.token) });
    expect(remove.status()).toBe(404);

    // Still intact and still mine.
    const list = await request.get('/api/applications', { headers: auth(user.token) });
    const still = (await list.json()).find((a: { id: number }) => a.id === mine.id);
    expect(still.status_note).toBe('mine');
  });

  test('an application cannot be filed on someone else\'s behalf', async ({ request }) => {
    const { user, other } = readAccounts();

    const res = await request.post('/api/applications', {
      headers: auth(user.token),
      // user_id in the body must be ignored — ownership comes from the token.
      data: { ...applicationPayload({ noc_code: '73200' }), user_id: other.id },
    });
    expect(res.status()).toBe(201);
    const created = await res.json();
    expect(created.user_id).toBe(user.id);

    const theirs = await request.get('/api/applications', { headers: auth(other.token) });
    expect((await theirs.json()).map((a: { id: number }) => a.id)).not.toContain(created.id);
  });

  test('registering does not hand out an admin role', async ({ request }) => {
    const res = await request.post('/api/auth/register', {
      data: { email: uniqueEmail('self-promoted'), password: 'e2e-passw0rd', role: 'admin' },
    });

    expect((await res.json()).user.role).toBe('user');
  });
});

test.describe('Untrusted input', () => {
  test('SQL in a filter is treated as a value, not as SQL', async ({ request }) => {
    const attacks = [
      "' OR '1'='1",
      "'; DROP TABLE applications;--",
      "1' UNION SELECT email, password_hash FROM users--",
    ];

    for (const attack of attacks) {
      const res = await request.get(`/api/stats/table?noc_code=${encodeURIComponent(attack)}`);
      expect(res.status(), attack).toBe(200);
      // A filter that matches nothing must return nothing, not everything.
      expect((await res.json()).rows, attack).toHaveLength(0);
    }

    // The table is still there afterwards.
    const after = await request.get('/api/stats/table');
    expect((await after.json()).rows.length).toBeGreaterThan(0);
  });

  test('SQL in a login email does not sign anyone in', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      data: { email: "' OR 1=1--", password: 'anything' },
    });

    expect(res.status()).toBe(401);
  });

  test('a script tag in a status note is rendered as text, not executed', async ({ page, request }) => {    const applicant = await freshApplicant(page, request, 'xss');
    const payload = '<img src=x onerror="window.__xss = true">';

    await createApplication(request, applicant.token, {
      noc_code: '21231',
      status_note: payload,
    });

    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.reload();
    await expect(page.locator('#applicationsContainer')).toContainText('21231');

    expect(await page.evaluate(() => (window as unknown as { __xss?: boolean }).__xss)).toBeUndefined();
    // Vercel serves /_vercel/insights/script.js; running locally the SPA
    // fallback answers that request with index.html, which the browser then
    // fails to parse. That one is the harness, not the page.
    expect(errors.filter((e) => !e.includes("Unexpected token '<'"))).toEqual([]);

    // The note is still shown -- escaped, not stripped.
    await expect(page.locator('#applicationsContainer')).toContainText('onerror');
  });

  test('a very long note does not take the server down', async ({ request }) => {
    const { user } = readAccounts();

    const res = await request.post('/api/applications', {
      headers: auth(user.token),
      data: applicationPayload({ noc_code: '21231', status_note: 'x'.repeat(50_000) }),
    });

    expect([201, 400, 413]).toContain(res.status());

    const stillUp = await request.get('/api/stats');
    expect(stillUp.status()).toBe(200);
  });

  test('a malformed date is not written back as a valid application', async ({ request, playwright, baseURL }) => {    const context = await playwright.request.newContext({ baseURL });
    const applicant = await register(context, uniqueEmail('bad-date'));

    const res = await context.post('/api/applications', {
      headers: auth(applicant.token),
      data: applicationPayload({ submission_date: 'not-a-date', work_permit_expiry: 'also-not-a-date' }),
    });

    if (res.status() === 201) {
      const created = await res.json();
      // If the app accepts it, the computed fields must not be NaN — that is
      // what leaks "NaN months" into everyone's aggregate charts.
      expect(Number.isNaN(created.waiting_months)).toBe(false);
      expect(Number.isNaN(created.days_remaining)).toBe(false);
    } else {
      expect(res.status()).toBe(400);
    }

    await context.dispose();
  });
});

test.describe('Only known values reach the shared dataset', () => {
  // program_type, stream, noc_code and status are read straight back out into
  // the charts, the NOC filter and the table every applicant sees, and anyone
  // can register. They have to be values the app knows.
  const cases = [
    { label: 'an invented program', overrides: { program_type: 'TOTALLY MADE UP' }, expect: 'Unknown program' },
    { label: 'a stream from the other program', overrides: { program_type: 'AIP', stream: 'Skilled Worker' }, expect: 'Unknown stream' },
    { label: 'an invented stream', overrides: { stream: 'Fast Track Deluxe' }, expect: 'Unknown stream' },
    { label: 'a NOC code that is not five digits', overrides: { noc_code: 'not-a-noc' }, expect: 'not a NOC code' },
    { label: 'an invented status', overrides: { status: 'APPROVED BY ME' }, expect: 'Unknown status' },
  ];

  for (const { label, overrides, expect: message } of cases) {
    test(`creating an application with ${label} is refused`, async ({ request }) => {
      const { user } = readAccounts();

      const res = await request.post('/api/applications', {
        headers: auth(user.token),
        data: applicationPayload(overrides),
      });

      expect(res.status()).toBe(400);
      expect((await res.json()).error).toContain(message);
    });

    test(`updating an application to ${label} is refused`, async ({ request }) => {
      const { user } = readAccounts();
      const app = await createApplication(request, user.token, { noc_code: '21231' });

      const res = await request.put(`/api/applications/${app.id}`, {
        headers: auth(user.token),
        data: overrides,
      });

      expect(res.status()).toBe(400);
      expect((await res.json()).error).toContain(message);
    });
  }

  test('the admin route enforces the same values', async ({ request }) => {
    const { admin, other } = readAccounts();
    const app = await createApplication(request, other.token, { noc_code: '21231' });

    const res = await request.put(`/api/admin/applications/${app.id}`, {
      headers: auth(admin.token),
      data: { ...applicationPayload({ noc_code: '21231' }), status: 'APPROVED BY ME' },
    });

    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('Unknown status');
  });

  test('nothing invented ever reaches the public aggregate', async ({ request }) => {
    const body = await (await request.get('/api/stats')).text();

    for (const junk of ['TOTALLY MADE UP', 'APPROVED BY ME', 'not-a-noc', 'Fast Track Deluxe']) {
      expect(body, `${junk} should never have been stored`).not.toContain(junk);
    }
  });

  test('every real program and stream pairing is still accepted', async ({ request }) => {
    const { user } = readAccounts();
    const pairings = [
      ['NS PNP', 'Skilled Worker'],
      ['NS PNP', 'Express Entry'],
      ['NS PNP', 'Occupations in Demand'],
      ['AIP', 'Atlantic High-Skilled Program'],
      ['AIP', 'Atlantic Intermediate-Skilled Program'],
    ];

    for (const [program_type, stream] of pairings) {
      const res = await request.post('/api/applications', {
        headers: auth(user.token),
        data: applicationPayload({ program_type, stream, noc_code: '21231' }),
      });
      expect(res.status(), `${program_type} / ${stream}`).toBe(201);
    }
  });
});

test.describe('Public surface', () => {
  test('the aggregate endpoints never expose an email address', async ({ request }) => {
    for (const endpoint of ['/api/stats', '/api/stats/table?limit=100', '/api/stats/activity-feed']) {
      const body = await (await request.get(endpoint)).text();
      expect(body, endpoint).not.toContain('@e2e.invalid');
      expect(body, endpoint).not.toContain('password_hash');
    }
  });

  test('an unknown path falls back to the app rather than an error', async ({ request }) => {
    const res = await request.get('/no-such-page');

    expect(res.status()).toBe(200);
    expect(await res.text()).toContain('<!DOCTYPE html>');
  });
});
