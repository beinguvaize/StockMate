import { test, expect, Page } from '@playwright/test';
import {
  applicationPayload,
  auth,
  createApplication,
  dateFromToday,
  freshApplicant,
  readAccounts,
} from './helpers/accounts';

/** Fills the add/edit modal. The stream list is rebuilt when the program changes. */
async function fillApplicationForm(
  page: Page,
  fields: {
    program: string;
    stream: string;
    noc: string;
    submitted: string;
    permitExpiry: string;
    status?: string;
    statusDate?: string;
    note?: string;
    nsGraduate?: boolean;
  }
) {
  await page.locator('#programType').selectOption(fields.program);
  await page.locator('#stream').selectOption(fields.stream);
  await page.locator('#nocCode').fill(fields.noc);
  await page.locator('#submissionDate').fill(fields.submitted);
  await page.locator('#workPermitExpiry').fill(fields.permitExpiry);

  if (fields.status) {
    await page.locator('#appStatus').selectOption(fields.status);
  }
  if (fields.statusDate) {
    await page.locator('#nominatedDate').fill(fields.statusDate);
  }
  if (fields.note !== undefined) {
    await page.locator('#statusNote').fill(fields.note);
  }
  if (fields.nsGraduate) {
    await page.locator('#nsGraduate').check();
  }
}

test.describe('Applications — through the UI', () => {
  test('an applicant can add an application and see it on their dashboard', async ({ page, request }) => {
    await freshApplicant(page, request, 'ui-create');

    await page.locator('#addAppBtn').click();
    await expect(page.locator('#appModal')).toBeVisible();
    await expect(page.locator('#modalTitle')).toHaveText('Add Application');

    await fillApplicationForm(page, {
      program: 'NS PNP',
      stream: 'Skilled Worker',
      noc: '21231',
      submitted: dateFromToday(-200),
      permitExpiry: dateFromToday(500),
      note: 'Waiting for nomination',
    });
    await page.locator('#modalSubmitBtn').click();

    await expect(page.locator('#appModal')).toBeHidden();
    const container = page.locator('#applicationsContainer');
    await expect(container).toContainText('21231');
    await expect(container).toContainText('NS PNP');
    await expect(container).not.toContainText('No Applications Yet');
  });

  test('the NOC field looks up the job title as it is typed', async ({ page, request }) => {
    await freshApplicant(page, request, 'ui-noc');

    await page.locator('#addAppBtn').click();
    await page.locator('#nocCode').fill('21231');

    await expect(page.locator('#nocLookupBadge')).toBeVisible();
    await expect(page.locator('#nocTeerBadge')).toContainText('TEER');
    await expect(page.locator('#nocJobTitle')).not.toBeEmpty();
  });

  test('an unknown NOC code is called out rather than silently accepted', async ({ page, request }) => {
    await freshApplicant(page, request, 'ui-noc-unknown');

    await page.locator('#addAppBtn').click();
    await page.locator('#nocCode').fill('99999');

    await expect(page.locator('#nocNotFoundMsg')).toBeVisible();
    await expect(page.locator('#nocLookupBadge')).toBeHidden();
  });

  test('the stream list follows the chosen program', async ({ page, request }) => {
    await freshApplicant(page, request, 'ui-streams');

    await page.locator('#addAppBtn').click();

    await page.locator('#programType').selectOption('NS PNP');
    const nsStreams = await page.locator('#stream option').allInnerTexts();
    expect(nsStreams).toContain('Skilled Worker');
    expect(nsStreams).not.toContain('Atlantic High-Skilled Program');

    await page.locator('#programType').selectOption('AIP');
    const aipStreams = await page.locator('#stream option').allInnerTexts();
    expect(aipStreams).toContain('Atlantic High-Skilled Program');
    expect(aipStreams).not.toContain('Skilled Worker');
  });

  test('a milestone status asks for the date it happened', async ({ page, request }) => {
    await freshApplicant(page, request, 'ui-milestone');

    await page.locator('#addAppBtn').click();

    // Submitted is not a milestone, so no date is asked for.
    await expect(page.locator('#nominatedDateContainer')).toBeHidden();

    await page.locator('#appStatus').selectOption('Nominated / Endorsed');
    await expect(page.locator('#nominatedDateContainer')).toBeVisible();
    await expect(page.locator('#nominatedDateLabel')).toHaveText('Nomination / Endorsement Date *');
    await expect(page.locator('#nominatedDate')).toHaveAttribute('required', /.*/);
  });

  test('an applicant can edit an application they already added', async ({ page, request }) => {
    const applicant = await freshApplicant(page, request, 'ui-edit');
    await createApplication(request, applicant.token, { noc_code: '21231' });
    await page.reload();

    await page.locator('#applicationsContainer').getByRole('button', { name: 'Edit' }).first().click();
    await expect(page.locator('#modalTitle')).toHaveText('Edit Application');
    await expect(page.locator('#nocCode')).toHaveValue('21231');

    await page.locator('#nocCode').fill('31301');
    await page.locator('#statusNote').fill('Switched to the healthcare NOC');
    await page.locator('#modalSubmitBtn').click();

    await expect(page.locator('#appModal')).toBeHidden();
    await expect(page.locator('#applicationsContainer')).toContainText('31301');
    await expect(page.locator('#applicationsContainer')).not.toContainText('21231');
  });

  test('an applicant can delete an application after confirming', async ({ page, request }) => {
    const applicant = await freshApplicant(page, request, 'ui-delete');
    await createApplication(request, applicant.token, { noc_code: '41401' });
    await page.reload();
    await expect(page.locator('#applicationsContainer')).toContainText('41401');

    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#applicationsContainer').locator('button.btn--icon').first().click();

    await expect(page.locator('#applicationsContainer .empty-state__title'))
      .toHaveText('No Applications Yet');
  });

  test('dismissing the delete confirmation keeps the application', async ({ page, request }) => {
    const applicant = await freshApplicant(page, request, 'ui-delete-cancel');
    await createApplication(request, applicant.token, { noc_code: '41401' });
    await page.reload();

    page.once('dialog', (dialog) => dialog.dismiss());
    await page.locator('#applicationsContainer').locator('button.btn--icon').first().click();

    await expect(page.locator('#applicationsContainer')).toContainText('41401');
  });

  test('cancelling the modal adds nothing', async ({ page, request }) => {
    await freshApplicant(page, request, 'ui-cancel');

    await page.locator('#addAppBtn').click();
    await fillApplicationForm(page, {
      program: 'AIP',
      stream: 'Atlantic High-Skilled Program',
      noc: '21231',
      submitted: dateFromToday(-30),
      permitExpiry: dateFromToday(300),
    });
    await page.locator('#modalCancelBtn').click();

    await expect(page.locator('#appModal')).toBeHidden();
    await expect(page.locator('#applicationsContainer .empty-state__title'))
      .toHaveText('No Applications Yet');
  });
});

test.describe('Applications — through the API', () => {
  test('a created application comes back with its computed fields', async ({ request }) => {
    const { user } = readAccounts();

    const created = await createApplication(request, user.token, {
      submission_date: dateFromToday(-91),   // three months, near enough
      work_permit_expiry: dateFromToday(365),
      noc_code: '21231',
    });

    expect(created.id).toBeGreaterThan(0);
    expect(created.status).toBe('Submitted');
    expect(created.risk_level).toBe('green');
    expect(created.days_remaining).toBeGreaterThan(300);
    expect(created.waiting_months).toBeCloseTo(3, 0);
    // Every application starts with one history entry, dated when it was filed.
    expect(created.status_history).toHaveLength(1);
    expect(created.status_history[0].status).toBe('Submitted');
  });

  test('the required fields are enforced', async ({ request }) => {
    const { user } = readAccounts();

    for (const missing of ['program_type', 'stream', 'noc_code', 'submission_date', 'work_permit_expiry']) {
      const payload: Record<string, unknown> = applicationPayload();
      delete payload[missing];

      const res = await request.post('/api/applications', { headers: auth(user.token), data: payload });
      expect(res.status(), `omitting ${missing} should be rejected`).toBe(400);
      expect((await res.json()).error).toBe('All fields are required');
    }
  });

  test('a milestone status without its date is refused', async ({ request }) => {
    const { user } = readAccounts();

    const res = await request.post('/api/applications', {
      headers: auth(user.token),
      data: applicationPayload({ status: 'Nominated / Endorsed', nominated_date: null }),
    });

    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('date is required');
  });

  test('a status change is appended to the application history', async ({ request }) => {
    const { user } = readAccounts();
    const created = await createApplication(request, user.token);

    const res = await request.put(`/api/applications/${created.id}`, {
      headers: auth(user.token),
      data: { status: 'EOI Selected', nominated_date: dateFromToday(-20) },
    });

    expect(res.status()).toBe(200);
    const updated = await res.json();
    expect(updated.status).toBe('EOI Selected');
    expect(updated.status_history.map((h: { status: string }) => h.status))
      .toEqual(['Submitted', 'EOI Selected']);
  });

  test('an update that changes nothing leaves the history alone', async ({ request }) => {
    const { user } = readAccounts();
    const created = await createApplication(request, user.token);

    const res = await request.put(`/api/applications/${created.id}`, {
      headers: auth(user.token),
      data: { status_note: 'Still waiting' },
    });

    const updated = await res.json();
    expect(updated.status_note).toBe('Still waiting');
    expect(updated.status_history).toHaveLength(1);
  });

  test('deleting an application removes it from the list', async ({ request }) => {
    const { user } = readAccounts();
    const created = await createApplication(request, user.token, { noc_code: '72400' });

    const del = await request.delete(`/api/applications/${created.id}`, { headers: auth(user.token) });
    expect(del.status()).toBe(200);

    const list = await request.get('/api/applications', { headers: auth(user.token) });
    const ids = (await list.json()).map((a: { id: number }) => a.id);
    expect(ids).not.toContain(created.id);
  });

  test('deleting an application that does not exist is a 404, not a 500', async ({ request }) => {
    const { user } = readAccounts();

    const res = await request.delete('/api/applications/99999999', { headers: auth(user.token) });
    expect(res.status()).toBe(404);
  });
});
