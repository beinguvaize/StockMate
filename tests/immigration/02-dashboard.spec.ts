import { test, expect } from '@playwright/test';
import { createApplication, dateFromToday, freshApplicant, readAccounts } from './helpers/accounts';

test.describe('Dashboard', () => {
  test('a signed-in applicant sees their own identity and the dashboard panels', async ({ page }) => {
    const { user } = readAccounts();

    await page.goto('/');

    await expect(page.locator('#appLayout')).toBeVisible();
    await expect(page.locator('#authScreen')).toBeHidden();
    await expect(page.locator('#navUserEmailSpan')).toHaveText(user.email);
    await expect(page.locator('#navUserName')).toHaveText(user.email.split('@')[0]);

    await expect(page.locator('#applicationsSection')).toBeVisible();
    await expect(page.locator('#aggregateSection')).toBeVisible();
    await expect(page.locator('#activitySection')).toBeVisible();
  });

  test('the admin link is hidden from a regular applicant', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#appLayout')).toBeVisible();

    await expect(page.locator('#adminLink')).toBeHidden();
  });

  test('an applicant with no applications sees the empty state', async ({ page, request }) => {
    // An applicant of its own, so an application added by another spec cannot
    // make this pass or fail by accident.
    await freshApplicant(page, request, 'empty-state');

    await expect(page.locator('#applicationsContainer .empty-state__title'))
      .toHaveText('No Applications Yet');
  });

  test('the charts and stat cards render once stats have loaded', async ({ page }) => {
    const { user } = readAccounts();
    await createApplication(page.request, user.token, { noc_code: '31301' });

    await page.goto('/');
    await expect(page.locator('#appLayout')).toBeVisible();

    await expect(page.locator('#waitingChart')).toBeVisible();
    await expect(page.locator('#statusChart')).toBeVisible();
    await expect(page.locator('#riskChart')).toBeVisible();
    await expect(page.locator('#aggregateStatCards')).not.toBeEmpty();
  });

  test('the aggregate table lists rows and never leaks a user identity', async ({ page }) => {
    const { user } = readAccounts();
    await createApplication(page.request, user.token, {
      noc_code: '41401',
      submission_date: dateFromToday(-45),
    });

    await page.goto('/');
    await expect(page.locator('#appLayout')).toBeVisible();

    const rows = page.locator('#tableBody tr');
    await expect(rows.first()).toBeVisible();

    // The table is the public, anonymised view of everyone's applications.
    const tableText = await page.locator('#applicantTable').innerText();
    expect(tableText).not.toContain('@');
    expect(tableText).not.toContain(user.email);
  });

  test('the community activity feed loads', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#appLayout')).toBeVisible();

    await expect(page.locator('#activityFeedContainer')).not.toBeEmpty();
  });
});
