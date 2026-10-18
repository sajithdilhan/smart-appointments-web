import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { seedRefreshToken } from './mock-backend';
import { mockAdminApi } from './support/mock-admin-api';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((dayOfWeek) => ({
  dayOfWeek,
  opensAt: '09:00',
  closesAt: '17:00',
}));

async function setup(page: Page, theme: 'light' | 'dark') {
  const api = await mockAdminApi(page);
  await seedRefreshToken(page, 'rt_1');
  await page.addInitScript((value) => localStorage.setItem('sa.theme', value), theme);
  const branch = api.seedBranch({
    code: 'COL',
    name: 'Colombo Central',
    timeZoneId: 'Asia/Colombo',
    workingHours: WEEKDAYS,
  });
  api.seedBranch({ code: 'KDY', name: 'Kandy' });
  api.seedService({ code: 'CUT', name: 'Haircut', durationMinutes: 60 });
  return { api, branch };
}

/** Fails on any serious or critical violation, listing them. */
async function expectNoSeriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
  ).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`axe, ${theme} theme`, () => {
    test('the dashboard', async ({ page }) => {
      await setup(page, theme);
      await page.goto('/admin');
      await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
      await expect(page.getByRole('link', { name: /Active branches/ })).toBeVisible();
      await expectNoSeriousViolations(page);
    });

    test('the branches list with the drawer open', async ({ page }) => {
      const { branch } = await setup(page, theme);
      await page.goto(`/admin/branches/${branch.id}`);
      const drawer = page.getByRole('dialog', { name: 'Edit branch' });
      await expect(drawer.getByRole('textbox', { name: /^Name/ })).toHaveValue('Colombo Central');
      await expectNoSeriousViolations(page);
    });

    test('the new-branch drawer with validation errors', async ({ page }) => {
      await setup(page, theme);
      await page.goto('/admin/branches/new');
      const drawer = page.getByRole('dialog', { name: 'New branch' });
      await drawer.getByRole('button', { name: 'Create branch' }).click();
      await expect(drawer.getByText('Name is required.')).toBeVisible();
      await expectNoSeriousViolations(page);
    });

    test('the schedule page', async ({ page }) => {
      const { branch } = await setup(page, theme);
      await page.goto(`/admin/branches/${branch.id}/schedule`);
      await expect(page.getByLabel('Monday opens')).toHaveValue('09:00');
      await expectNoSeriousViolations(page);
    });

    test('the services list', async ({ page }) => {
      await setup(page, theme);
      await page.goto('/admin/services');
      await expect(page.getByRole('row', { name: /Haircut/ })).toBeVisible();
      await expectNoSeriousViolations(page);
    });

    test('the slot generation page', async ({ page }) => {
      await setup(page, theme);
      await page.goto('/admin/slots');
      await page.getByLabel('Branch').selectOption({ label: 'Colombo Central (COL)' });
      await page.getByLabel('Service').selectOption({ label: 'Haircut (CUT)' });
      await page.getByRole('button', { name: 'Next 7 days' }).click();
      await expect(page.getByTestId('preview')).toContainText('about');
      await expectNoSeriousViolations(page);
    });

    test('the open command palette', async ({ page }) => {
      await setup(page, theme);
      await page.goto('/admin');
      await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
      await page.keyboard.press('Control+k');
      await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
      await expectNoSeriousViolations(page);
    });
  });
}
