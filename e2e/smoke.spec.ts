import { expect, test } from '@playwright/test';

test('shows the landing placeholder under the application title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Smart Appointments');
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Smart Appointments' })).toBeVisible();
});

test('the dark theme persists across a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('radio', { name: 'Use dark theme' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
});

test('shows the configuration error page when config.json fails', async ({ page }) => {
  await page.route('**/config.json', (route) => route.fulfill({ status: 500 }));
  await page.goto('/');
  await expect(page).toHaveTitle('Configuration error');
  await expect(page.getByRole('button', { name: 'Try again' })).toBeEnabled();
});
