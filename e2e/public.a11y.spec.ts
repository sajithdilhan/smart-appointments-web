import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockBackend } from './mock-backend';

// `bypassCSP` only lets axe inject its script; the served build sends no CSP header anyway.
// Reduced motion keeps the hero entrance from sampling half-transparent text for contrast.
test.use({ bypassCSP: true, reducedMotion: 'reduce' });

const PAGES = [
  ['/', 'Book your next appointment in just a few clicks.'],
  ['/login', 'Welcome back'],
  ['/register', 'Create your account'],
] as const;

for (const [path, heading] of PAGES) {
  for (const theme of ['light', 'dark'] as const) {
    test(`${path} has no serious or critical axe violations in the ${theme} theme`, async ({
      page,
    }) => {
      await mockBackend(page);
      await page.goto(path);
      await page.getByRole('radio', { name: `Use ${theme} theme` }).click();
      await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*dark)/);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();

      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(
        blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
      ).toEqual([]);
    });
  }
}

test.describe('reflow at 320 px', () => {
  test.use({ viewport: { width: 320, height: 700 }, reducedMotion: 'no-preference' });

  for (const [path, heading] of PAGES) {
    test(`${path} has no horizontal scroll`, async ({ page }) => {
      await mockBackend(page);
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      const overflow = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);
    });
  }
});
