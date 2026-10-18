import { expect, test } from '@playwright/test';
import { mockBackend, seedRefreshToken } from './mock-backend';

test.beforeEach(async ({ page }) => {
  await mockBackend(page, { role: 'Customer' });
  await seedRefreshToken(page, 'rt_1');
});

test('shows the account details read-only', async ({ page }) => {
  await page.goto('/profile');
  await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();
  await expect(page.locator('dd', { hasText: 'Ann Example' })).toBeVisible();
  await expect(page.getByText('ann@example.com').first()).toBeVisible();
  await expect(page.getByText('Not provided')).toBeVisible();
});

test('a theme change survives a reload', async ({ page }) => {
  await page.goto('/profile');
  await page.locator('#main-content').getByText('Dark', { exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
});

test('Sign out lands on /login', async ({ page }) => {
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible();
});
