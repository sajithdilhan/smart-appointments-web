import { expect, test } from '@playwright/test';
import { mockBackend, REFRESH_KEY, seedRefreshToken } from './mock-backend';

test('an anonymous visit to /book redirects to /login with the return URL', async ({ page }) => {
  const backend = await mockBackend(page);
  await page.goto('/book');
  await expect(page).toHaveURL(/\/login\?returnUrl=%2Fbook$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  expect(backend.refreshCalls()).toBe(0);
});

test('a stored refresh token restores the session on load and on reload', async ({ page }) => {
  const backend = await mockBackend(page, { role: 'Customer' });
  await seedRefreshToken(page, 'rt_1');

  // A signed-in customer is sent from /login to their landing page.
  await page.goto('/login');
  await expect(page).toHaveURL(/\/book$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Book an appointment' })).toBeVisible();
  expect(backend.refreshCalls()).toBe(1);
  expect(await page.evaluate((key) => localStorage.getItem(key), REFRESH_KEY)).toBe('rt_2');

  // The access token lives in memory only, so a reload refreshes once more and stays signed in.
  await page.reload();
  await expect(page).toHaveURL(/\/book$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Book an appointment' })).toBeVisible();
  expect(backend.refreshCalls()).toBe(2);
});

test('a stored admin token lands on the admin dashboard', async ({ page }) => {
  await mockBackend(page, { role: 'Admin' });
  await seedRefreshToken(page, 'rt_1');
  await page.goto('/login');
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
});

test('a 401 from the refresh endpoint clears the session and shows the login route', async ({
  page,
}) => {
  const backend = await mockBackend(page, { refreshStatus: 401 });
  await seedRefreshToken(page, 'rt_stale');
  await page.goto('/book');
  await expect(page).toHaveURL(/\/login\?returnUrl=%2Fbook$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  expect(backend.refreshCalls()).toBe(1);
  expect(await page.evaluate((key) => localStorage.getItem(key), REFRESH_KEY)).toBeNull();
});
