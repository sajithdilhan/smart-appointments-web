import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockAppointments } from './appointments-mock';
import { mockBackend, seedRefreshToken } from './mock-backend';

/**
 * Serious and critical axe violations. `ignore` names rules known to be false positives of the
 * CDK modal machinery (see the design's implementation deviations).
 */
async function violations(page: Page, ignore: string[] = []) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .disableRules(ignore)
    .analyze();
  return result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await mockBackend(page, { role: 'Customer' });
      await mockAppointments(page);
      await seedRefreshToken(page, 'rt_1');
      await page.addInitScript((value) => localStorage.setItem('sa.theme', value), theme);
    });

    test('/appointments has no serious or critical violations', async ({ page }) => {
      await page.goto('/appointments');
      await expect(page.getByRole('link', { name: /Health check/ }).first()).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test('the open sheet has none', async ({ page }) => {
      await page.goto('/appointments');
      await page
        .getByRole('link', { name: /Health check/ })
        .first()
        .click();
      await expect(page.getByRole('heading', { name: 'Appointment details' })).toBeVisible();
      await expect(page.getByText('London Central').first()).toBeVisible();
      // The CDK focus-trap anchors are tabbable but aria-hidden while the app root is hidden.
      expect(await violations(page, ['aria-hidden-focus'])).toEqual([]);
    });

    test('the cancel dialog has none', async ({ page }) => {
      await page.goto('/appointments');
      await page
        .getByRole('link', { name: /Health check/ })
        .first()
        .click();
      await page.getByRole('button', { name: 'Cancel appointment' }).click();
      await expect(page.getByRole('alertdialog')).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test('the Past tab with Completed and No-show badges has none', async ({ page }) => {
      await mockAppointments(page, {
        upcoming: 1,
        pastStatuses: ['Completed', 'NoShow', 'Cancelled', 'Booked'],
      });
      await page.goto('/appointments?tab=past');
      await expect(page.getByRole('link', { name: /Health check.*No-show/ })).toBeVisible();
      await expect(page.getByRole('link', { name: /Health check.*Completed/ })).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test('/profile has none', async ({ page }) => {
      await page.goto('/profile');
      await expect(page.locator('dd', { hasText: 'Ann Example' })).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });
  });
}
