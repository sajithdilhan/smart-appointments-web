import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { seedRefreshToken } from './mock-backend';
import { mockStaffApi } from './support/mock-staff-api';

const DAY = '2026-03-10';

/** Serious and critical axe violations, with the CDK modal false positive optionally ignored. */
async function violations(page: Page, ignore: string[] = []) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .disableRules(ignore)
    .analyze();
  return result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}

async function setup(page: Page, theme: 'light' | 'dark', width = 1280) {
  await page.setViewportSize({ width, height: 800 });
  const api = await mockStaffApi(page);
  await seedRefreshToken(page, 'rt_1');
  await page.addInitScript((value) => localStorage.setItem('sa.theme', value), theme);
  api.seedBranch({ code: 'COL', name: 'Colombo Central', timeZoneId: 'Europe/London' });
  api.seedService({ name: 'Haircut' });
  api.seedCustomer('c-ann', { firstName: 'Ann', lastName: 'Silva' });
  api.seedCustomer('c-bob', { firstName: 'Bob', lastName: 'Perera' });
  api.seedAppointment({ customerId: 'c-ann', startUtc: `${DAY}T09:00:00Z` });
  api.seedAppointment({ customerId: 'c-bob', startUtc: `${DAY}T10:00:00Z`, status: 'Cancelled' });
  api.seedAppointment({
    customerId: 'c-ann',
    startUtc: `${DAY}T11:00:00Z`,
    status: 'Completed',
    completedAtUtc: `${DAY}T11:40:00Z`,
  });
  api.seedAppointment({
    customerId: 'c-bob',
    startUtc: `${DAY}T12:00:00Z`,
    status: 'NoShow',
    noShowAtUtc: `${DAY}T12:40:00Z`,
  });
  return api;
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`staff axe, ${theme} theme`, () => {
    test('the day list', async ({ page }) => {
      await setup(page, theme);
      await page.goto(`/staff?date=${DAY}`);
      await expect(page.getByRole('row', { name: /Ann Silva/ }).first()).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test('the not-linked state', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await mockStaffApi(page, { branchId: null });
      await seedRefreshToken(page, 'rt_1');
      await page.addInitScript((value) => localStorage.setItem('sa.theme', value), theme);
      await page.goto('/staff');
      await expect(page.getByRole('heading', { level: 1, name: 'No branch linked' })).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test('the appointment sheet', async ({ page }) => {
      await setup(page, theme);
      await page.goto(`/staff?date=${DAY}`);
      await page.getByRole('button', { name: 'Ann Silva' }).first().click();
      await expect(page.getByRole('heading', { name: 'Appointment details' })).toBeVisible();
      // The CDK focus-trap anchors are tabbable but aria-hidden while the app root is hidden.
      expect(await violations(page, ['aria-hidden-focus'])).toEqual([]);
    });

    test('the no-show dialog', async ({ page }) => {
      await setup(page, theme);
      await page.goto(`/staff?date=${DAY}`);
      await page.getByRole('button', { name: 'No-show Ann Silva at 09:00' }).click();
      await expect(page.getByRole('alertdialog')).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test('320 px: no horizontal scroll and no violations', async ({ page }) => {
      await setup(page, theme, 320);
      await page.goto(`/staff?date=${DAY}`);
      await expect(page.getByRole('button', { name: 'Ann Silva' }).first()).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      expect(await violations(page)).toEqual([]);
    });
  });
}
