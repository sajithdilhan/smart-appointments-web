import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { BRANCH_IDS, SERVICE_IDS } from '../src/testing/booking-backend';
import { heading, reviewUrl, setup } from './book-helpers';

type Theme = 'light' | 'dark';
const THEMES: Theme[] = ['light', 'dark'];

/** The five steps, each reached by a deep link (Success by booking through the UI). */
async function openStep(
  page: Page,
  backend: Awaited<ReturnType<typeof setup>>['backend'],
  step: string,
) {
  const { slot, url } = reviewUrl(backend);
  const base = `/book?branch=${BRANCH_IDS.london}&service=${SERVICE_IDS.checkup}&date=${slot.date}`;
  switch (step) {
    case 'branch':
      await page.goto('/book');
      await expect(heading(page, 'Choose a branch')).toBeVisible();
      await expect(page.getByRole('radio', { name: 'London' })).toBeVisible();
      break;
    case 'service':
      await page.goto(`/book?branch=${BRANCH_IDS.london}`);
      await expect(page.getByRole('radio', { name: 'Check-up' })).toBeVisible();
      break;
    case 'datetime':
      await page.goto(base);
      await expect(page.getByRole('radiogroup', { name: 'Available times' })).toBeVisible();
      break;
    case 'review':
      await page.goto(url);
      await expect(page.getByRole('button', { name: 'Confirm booking' })).toBeEnabled();
      break;
    case 'success':
      await page.goto(url);
      await expect(page.getByRole('button', { name: 'Confirm booking' })).toBeEnabled();
      await page.getByRole('button', { name: 'Confirm booking' }).click();
      await expect(heading(page, "You're booked")).toBeVisible();
      break;
  }
}

const STEPS = ['branch', 'service', 'datetime', 'review', 'success'];

for (const theme of THEMES) {
  for (const step of STEPS) {
    test(`axe: ${step} step has no serious or critical violations (${theme})`, async ({ page }) => {
      const { backend } = await setup(page);
      await page.addInitScript((t) => localStorage.setItem('sa.theme', t), theme);
      await openStep(page, backend, step);
      await page.evaluate(() => document.fonts.ready);
      const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      expect(dark).toBe(theme === 'dark');
      const results = await new AxeBuilder({ page }).analyze();
      const blocking = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      );
      expect(
        blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
      ).toEqual([]);
    });
  }
}

test.describe('reflow at 320 px', () => {
  test.use({ viewport: { width: 320, height: 640 } });
  for (const step of STEPS) {
    test(`${step} step has no horizontal page scroll`, async ({ page }) => {
      const { backend } = await setup(page);
      await openStep(page, backend, step);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});

test('reduced motion: no confetti on the success step', async ({ page }) => {
  const { backend } = await setup(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openStep(page, backend, 'success');
  await page.waitForTimeout(500);
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('with motion allowed the confetti runs and is hidden from assistive technology', async ({
  page,
}) => {
  const { backend } = await setup(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openStep(page, backend, 'success');
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('aria-hidden', 'true');
  await expect(canvas).toHaveCount(0, { timeout: 5000 }); // removed after about 2 s
});
