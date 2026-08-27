import { test, expect } from '@playwright/test';
import { auth, createApplication, dateFromToday, readAccounts } from './helpers/accounts';

/**
 * Waiting time and work-permit risk are what the whole tracker exists to show,
 * and they are computed in three places (on write, on read, and again in SQL
 * for the aggregate views). These tests pin the boundaries.
 */
test.describe('Work permit risk levels', () => {
  const cases = [
    { label: 'more than 120 days left', days: 200, risk: 'green' },
    { label: 'exactly at the 120 day edge', days: 120, risk: 'yellow' },
    { label: 'between 60 and 120 days', days: 90, risk: 'yellow' },
    { label: 'exactly at the 60 day edge', days: 60, risk: 'red' },
    { label: 'under 60 days', days: 15, risk: 'red' },
    { label: 'already past', days: -5, risk: 'expired' },
  ];

  for (const { label, days, risk } of cases) {
    test(`a permit with ${label} is ${risk}`, async ({ request }) => {
      const { user } = readAccounts();

      const created = await createApplication(request, user.token, {
        noc_code: '21231',
        work_permit_expiry: dateFromToday(days),
      });

      expect(created.risk_level).toBe(risk);
    });
  }
});

test.describe('Waiting time', () => {
  test('a pending application keeps counting from the submission date', async ({ request }) => {
    const { user } = readAccounts();

    const created = await createApplication(request, user.token, {
      submission_date: dateFromToday(-365),
      status: 'Submitted',
    });

    // 365 days / 30.44 ≈ 12.0 months.
    expect(created.waiting_months).toBeGreaterThan(11.8);
    expect(created.waiting_months).toBeLessThan(12.2);
  });

  test('a refused application stops counting at the decision date', async ({ request }) => {    const { user } = readAccounts();

    const created = await createApplication(request, user.token, {
      submission_date: dateFromToday(-365),
      work_permit_expiry: dateFromToday(300),
      status: 'Refused',
      nominated_date: dateFromToday(-180),
    });

    // Six months to the refusal, not twelve months to today.
    expect(created.waiting_months).toBeGreaterThan(5.8);
    expect(created.waiting_months).toBeLessThan(6.2);
  });

  test('a nominated application stops counting at the nomination date', async ({ request }) => {
    // KNOWN FAILURE — not fixed, because fixing it moves the headline number
    // and that is a product call.
    //
    // services/calculator.js stops the clock for 'Nominated', 'Endorsed' and
    // 'Selected for EOI', but not for 'Nominated / Endorsed' -- the status the
    // form actually sets. So a nominated applicant's waiting time keeps
    // growing after the nomination, in their own card and in the aggregate
    // table. The SQL in routes/stats.js takes the other view --
    // COALESCE(nominated_date, 'now') -- so the KPI average and the table
    // below it disagree about the same application.
    //
    // Whichever way it is settled, one list should decide it for all three.
    test.fail();

    const { user } = readAccounts();

    const created = await createApplication(request, user.token, {
      submission_date: dateFromToday(-540),
      work_permit_expiry: dateFromToday(300),
      status: 'Nominated / Endorsed',
      nominated_date: dateFromToday(-180),
    });

    // Twelve months to the nomination, not eighteen months to today.
    expect(created.waiting_months).toBeGreaterThan(11.5);
    expect(created.waiting_months).toBeLessThan(12.5);
  });

  test('a submission date in the future does not produce a negative wait', async ({ request }) => {
    const { user } = readAccounts();

    const created = await createApplication(request, user.token, {
      submission_date: dateFromToday(30),
      work_permit_expiry: dateFromToday(400),
    });

    expect(created.waiting_months).toBe(0);
  });

  test('the read path recomputes rather than trusting the stored value', async ({ request }) => {
    const { user } = readAccounts();
    const created = await createApplication(request, user.token, {
      submission_date: dateFromToday(-90),
      work_permit_expiry: dateFromToday(45),
    });

    const list = await request.get('/api/applications', { headers: auth(user.token) });
    const fetched = (await list.json()).find((a: { id: number }) => a.id === created.id);

    expect(fetched.risk_level).toBe('red');
    expect(fetched.waiting_months).toBeCloseTo(created.waiting_months, 1);
  });

  test('the aggregate table agrees with the single-application view', async ({ request }) => {
    const { user } = readAccounts();
    const noc = '92100';

    const created = await createApplication(request, user.token, {
      noc_code: noc,
      submission_date: dateFromToday(-200),
      work_permit_expiry: dateFromToday(75),
    });

    const table = await request.get(`/api/stats/table?noc_code=${noc}`);
    const row = (await table.json()).rows[0];

    expect(row.risk_level).toBe(created.risk_level);
    expect(row.waiting_months).toBeCloseTo(created.waiting_months, 1);
    expect(row.days_remaining).toBeCloseTo(created.days_remaining, 0);
  });
});
