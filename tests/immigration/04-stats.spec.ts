import { test, expect } from '@playwright/test';
import { createApplication, dateFromToday, readAccounts, register, uniqueEmail } from './helpers/accounts';

/**
 * The aggregate endpoints are public and shared, so these tests filter on NOC
 * codes no other spec uses rather than asserting on totals for the whole table.
 */
const NOC_GREEN = '62020';
const NOC_RED = '13100';
const NOC_EXPIRED = '75110';
const NOC_NOMINATED = '33102';

test.describe('Aggregate statistics', () => {
  test.beforeAll(async ({ playwright, baseURL }) => {
    const request = await playwright.request.newContext({ baseURL });
    const applicant = await register(request, uniqueEmail('stats-fixture'));

    await createApplication(request, applicant.token, {
      noc_code: NOC_GREEN,
      submission_date: dateFromToday(-180),
      work_permit_expiry: dateFromToday(365),
    });
    await createApplication(request, applicant.token, {
      noc_code: NOC_RED,
      submission_date: dateFromToday(-30),
      work_permit_expiry: dateFromToday(30),
    });
    await createApplication(request, applicant.token, {
      noc_code: NOC_EXPIRED,
      submission_date: dateFromToday(-400),
      work_permit_expiry: dateFromToday(-10),
    });
    await createApplication(request, applicant.token, {
      program_type: 'AIP',
      stream: 'Atlantic High-Skilled Program',
      noc_code: NOC_NOMINATED,
      submission_date: dateFromToday(-150),
      work_permit_expiry: dateFromToday(200),
      status: 'Nominated / Endorsed',
      nominated_date: dateFromToday(-15),
    });

    await request.dispose();
  });

  test('/api/stats is public and returns every section the dashboard draws', async ({ request }) => {
    const res = await request.get('/api/stats');

    expect(res.status()).toBe(200);
    const body = await res.json();

    for (const key of [
      'stats',
      'programBreakdown',
      'statusDistribution',
      'riskDistribution',
      'waitingDistribution',
      'programs',
      'nocCodes',
      'recentSuccesses',
    ]) {
      expect(body, `/api/stats should include ${key}`).toHaveProperty(key);
    }

    expect(body.stats.total_applicants).toBeGreaterThan(0);
    expect(body.stats.avg_waiting_months).toBeGreaterThanOrEqual(0);
  });

  test('filtering by NOC code narrows the statistics to that code', async ({ request }) => {
    const res = await request.get(`/api/stats?noc_code=${NOC_GREEN}`);
    const body = await res.json();

    expect(body.stats.total_applicants).toBe(1);
    // Roughly six months of waiting, computed live from the submission date.
    expect(body.stats.avg_waiting_months).toBeGreaterThan(5);
    expect(body.stats.avg_waiting_months).toBeLessThan(7);
  });

  test('filtering by program type only counts that program', async ({ request }) => {
    const res = await request.get(`/api/stats?program_type=AIP&noc_code=${NOC_NOMINATED}`);
    const body = await res.json();

    expect(body.stats.total_applicants).toBe(1);
    expect(body.programBreakdown.map((p: { program_type: string }) => p.program_type)).toEqual(['AIP']);

    const empty = await request.get(`/api/stats?program_type=NS PNP&noc_code=${NOC_NOMINATED}`);
    expect((await empty.json()).stats.total_applicants).toBe(0);
  });

  test('several NOC codes can be filtered at once', async ({ request }) => {
    const res = await request.get(`/api/stats?noc_code=${NOC_GREEN},${NOC_RED}`);

    expect((await res.json()).stats.total_applicants).toBe(2);
  });

  test('a nominated application counts towards the nomination rate', async ({ request }) => {
    const res = await request.get(`/api/stats?noc_code=${NOC_NOMINATED}`);

    expect((await res.json()).stats.pct_nominated).toBe(100);
  });

  test('recent successes list nominations without identifying anyone', async ({ request }) => {
    const body = await (await request.get('/api/stats')).json();

    expect(body.recentSuccesses.length).toBeGreaterThan(0);
    for (const row of body.recentSuccesses) {
      expect(row).not.toHaveProperty('user_id');
      expect(row).not.toHaveProperty('id');
      expect(JSON.stringify(row)).not.toContain('@');
    }
  });
});

test.describe('Aggregate table', () => {
  test('rows are anonymised — no id, no user_id, no email', async ({ request }) => {
    const res = await request.get('/api/stats/table');

    expect(res.status()).toBe(200);
    const { rows } = await res.json();
    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      expect(row).not.toHaveProperty('id');
      expect(row).not.toHaveProperty('user_id');
      expect(row).not.toHaveProperty('email');
    }
    expect(JSON.stringify(rows)).not.toContain('@');
  });

  test('the risk filter matches how the risk levels are defined', async ({ request }) => {
    const green = await (await request.get(`/api/stats/table?noc_code=${NOC_GREEN}`)).json();
    expect(green.rows).toHaveLength(1);
    expect(green.rows[0].risk_level).toBe('green');
    expect(green.rows[0].days_remaining).toBeGreaterThan(120);

    const red = await (await request.get(`/api/stats/table?noc_code=${NOC_RED}`)).json();
    expect(red.rows[0].risk_level).toBe('red');
    expect(red.rows[0].days_remaining).toBeLessThanOrEqual(60);

    const expired = await (await request.get(`/api/stats/table?noc_code=${NOC_EXPIRED}`)).json();
    expect(expired.rows[0].risk_level).toBe('expired');
    expect(expired.rows[0].days_remaining).toBeLessThan(0);
  });

  test('filtering by risk level returns only rows at that level', async ({ request }) => {
    const res = await request.get('/api/stats/table?risk_level=expired&limit=100');
    const { rows } = await res.json();

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.risk_level).toBe('expired');
    }
  });

  test('filtering by status returns only that status', async ({ request }) => {
    const res = await request.get('/api/stats/table?status=Nominated / Endorsed&limit=100');
    const { rows } = await res.json();

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(['Nominated', 'Endorsed', 'Nominated / Endorsed']).toContain(row.status);
    }
  });

  test('pagination reports totals and hands back distinct pages', async ({ request }) => {
    const first = await (await request.get('/api/stats/table?limit=10&page=1')).json();

    expect(first.pagination.page).toBe(1);
    expect(first.pagination.limit).toBe(10);
    expect(first.pagination.total).toBeGreaterThan(0);
    expect(first.pagination.totalPages).toBe(Math.ceil(first.pagination.total / 10));

    if (first.pagination.totalPages > 1) {
      const second = await (await request.get('/api/stats/table?limit=10&page=2')).json();
      expect(second.rows).not.toEqual(first.rows);
    }
  });

  test('the page size is clamped rather than trusted', async ({ request }) => {
    const tooBig = await (await request.get('/api/stats/table?limit=100000')).json();
    expect(tooBig.pagination.limit).toBe(100);

    const tooSmall = await (await request.get('/api/stats/table?limit=1')).json();
    expect(tooSmall.pagination.limit).toBe(10);

    const negativePage = await (await request.get('/api/stats/table?page=-5')).json();
    expect(negativePage.pagination.page).toBe(1);
  });

  test('sorting is restricted to known columns', async ({ request }) => {
    const asc = await (await request.get('/api/stats/table?sort=submission_date&order=asc&limit=25')).json();
    const dates = asc.rows.map((r: { submission_date: string }) => r.submission_date);
    expect([...dates].sort()).toEqual(dates);

    // An unknown column must fall back to the default, not reach the query.
    const injected = await request.get('/api/stats/table?sort=noc_code); DROP TABLE applications;--');
    expect(injected.status()).toBe(200);

    const stillThere = await request.get('/api/stats/table');
    expect((await stillThere.json()).rows.length).toBeGreaterThan(0);
  });

  test('the activity feed and insights endpoints answer', async ({ request }) => {
    const feed = await request.get('/api/stats/activity-feed');
    expect(feed.status()).toBe(200);
    expect(Array.isArray((await feed.json()).feed)).toBe(true);

    const insights = await request.get('/api/stats/insights');
    expect(insights.status()).toBe(200);
    expect(Array.isArray((await insights.json()).batches)).toBe(true);
  });

  test('per-NOC statistics answer for a code with no applications', async ({ request }) => {
    const res = await request.get('/api/stats/noc/00000');

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.noc).toBe('00000');
    expect(body.stats.total).toBe(0);
  });
});
