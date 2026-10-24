import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { seedRefreshToken } from './mock-backend';
import { mockAdminApi } from './support/mock-admin-api';
import { mockStaffAccountsApi } from './support/mock-staff-accounts-api';
import { mockAdminAppointments } from './support/admin-appointments';

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

async function staffSetup(page: Page, theme: 'light' | 'dark') {
  const api = await mockStaffAccountsApi(page);
  await seedRefreshToken(page, 'rt_1');
  await page.addInitScript((value) => localStorage.setItem('sa.theme', value), theme);
  api.seedBranch({ code: 'COL', name: 'Colombo Central' });
  api.seedBranch({ code: 'KDY', name: 'Kandy' });
  const active = api.seedStaff({ firstName: 'Nimal', lastName: 'Silva' });
  api.seedStaff({ firstName: 'Kamal', lastName: 'Perera', isActive: false });
  return { api, active };
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

    test('the appointments page with a branch chosen', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      const api = await mockAdminAppointments(page);
      await seedRefreshToken(page, 'rt_1');
      await page.addInitScript((value) => localStorage.setItem('sa.theme', value), theme);
      const branch = api.seedBranch({ code: 'COL', name: 'Colombo Central' });
      api.staff.seedCustomer('c-ann', { firstName: 'Ann', lastName: 'Silva' });
      api.staff.seedAppointment({
        branchId: branch.id,
        serviceTypeId: api.staff.state.services[0].id,
        customerId: 'c-ann',
        startUtc: '2026-03-10T09:00:00Z',
      });
      await page.goto(`/admin/appointments?branch=${branch.id}&date=2026-03-10`);
      await expect(page.getByRole('row', { name: /Ann Silva/ })).toBeVisible();
      await expectNoSeriousViolations(page);
    });

    test('the appointments page before a branch is chosen', async ({ page }) => {
      await setup(page, theme);
      await page.goto('/admin/appointments');
      await expect(page.getByText('Choose a branch to see its appointments.')).toBeVisible();
      await expectNoSeriousViolations(page);
    });

    test('the staff list', async ({ page }) => {
      await staffSetup(page, theme);
      await page.goto('/admin/staff');
      await expect(page.getByRole('row', { name: /Nimal Silva/ })).toBeVisible();
      await expect(page.getByRole('row', { name: /Kamal Perera/ })).toBeVisible();
      await expectNoSeriousViolations(page);
    });

    test('the new staff member drawer with validation errors', async ({ page }) => {
      await staffSetup(page, theme);
      await page.goto('/admin/staff/new');
      const drawer = page.getByRole('dialog', { name: 'New staff member' });
      await drawer.getByRole('button', { name: 'Create staff member' }).click();
      await expect(drawer.getByText('First name is required.')).toBeVisible();
      await expectNoSeriousViolations(page);
    });

    test('the edit staff member drawer', async ({ page }) => {
      const { active } = await staffSetup(page, theme);
      await page.goto(`/admin/staff/${active.id}`);
      const drawer = page.getByRole('dialog', { name: 'Edit staff member' });
      await expect(drawer.getByText('Nimal Silva')).toBeVisible();
      await expectNoSeriousViolations(page);
    });

    test('the deactivate confirmation', async ({ page }) => {
      await staffSetup(page, theme);
      await page.goto('/admin/staff');
      await page.getByRole('button', { name: 'Actions for Nimal Silva' }).click();
      await page.getByRole('menuitem', { name: 'Deactivate' }).click();
      await expect(page.getByRole('alertdialog')).toBeVisible();
      await expectNoSeriousViolations(page);
    });
  });
}
