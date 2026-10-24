import { expect, test, type Page } from '@playwright/test';
import { mockAppointments, type AppointmentsOptions } from './appointments-mock';
import { mockBackend, seedRefreshToken } from './mock-backend';

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 800 };

async function setup(page: Page, options: AppointmentsOptions = {}) {
  await mockBackend(page, { role: 'Customer' });
  const mock = await mockAppointments(page, options);
  await seedRefreshToken(page, 'rt_1');
  return mock;
}

const cards = (page: Page) => page.getByRole('link', { name: /Health check/ });

async function confirmCancel(page: Page) {
  await page.getByRole('button', { name: 'Cancel appointment' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel appointment' }).click();
}

test('reaches My appointments from the shell and shows Upcoming', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await setup(page);
  await page.goto('/book');
  await page.getByRole('link', { name: 'My appointments' }).first().click();
  await expect(page).toHaveURL(/\/appointments$/);
  await expect(page.getByRole('heading', { level: 1, name: 'My appointments' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Upcoming' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(cards(page)).toHaveCount(2);
});

test('switches to Past and Back leaves the page', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await setup(page);
  await page.goto('/book');
  await page.getByRole('link', { name: 'My appointments' }).first().click();
  await expect(cards(page)).toHaveCount(2);
  await page.getByRole('tab', { name: 'Past' }).click();
  await expect(page).toHaveURL(/tab=past/);
  await expect(cards(page)).toHaveCount(1);
  await page.goBack();
  await expect(page).toHaveURL(/\/book$/);
});

test('the Past tab shows Completed and No-show badges and filters by status', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await setup(page, { upcoming: 1, pastStatuses: ['Completed', 'NoShow', 'Cancelled'] });
  await page.goto('/appointments?tab=past');
  await expect(cards(page)).toHaveCount(3);
  await expect(cards(page).filter({ hasText: 'Completed' })).toHaveCount(1);
  await expect(cards(page).filter({ hasText: 'No-show' })).toHaveCount(1);
  await expect(cards(page).filter({ hasText: 'Cancelled' })).toHaveCount(1);

  await page.getByLabel('Status').selectOption({ label: 'No-show' });
  await expect(page).toHaveURL(/pstatus=NoShow/);
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText('No-show');

  // The filter belongs to the Past tab: Upcoming has none and drops it from the URL.
  await page.getByRole('tab', { name: 'Upcoming' }).click();
  await expect(page).not.toHaveURL(/pstatus/);
  await expect(page.getByLabel('Status')).toHaveCount(0);
});

test('Load more appends the second page', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await setup(page, { upcoming: 25, past: 0 });
  await page.goto('/appointments');
  await expect(cards(page)).toHaveCount(20);
  await page.getByRole('button', { name: /Load more/ }).click();
  await expect(cards(page)).toHaveCount(25);
  await expect(page.getByRole('button', { name: /Load more/ })).toHaveCount(0);
});

test('a card opens a sheet on desktop', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await setup(page);
  await page.goto('/appointments');
  await cards(page).first().click();
  // The dialog container itself has no box; its content is what is visible.
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Appointment details' })).toBeVisible();
  await expect(sheet.getByText('London Central').first()).toBeVisible();
  // The list stays mounted (and aria-hidden) behind the sheet.
  await expect(
    page.getByRole('heading', { level: 1, name: 'My appointments', includeHidden: true }),
  ).toBeAttached();
});

test('a card opens a page on mobile and the deep link survives a reload', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await setup(page);
  await page.goto('/appointments');
  await cards(page).first().click();
  await expect(page).toHaveURL(/\/appointments\/[0-9a-f-]{36}/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Back to my appointments' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: 'Back to my appointments' })).toBeVisible();
  await expect(page.getByText('London Central').first()).toBeVisible();
});

test('cancelling shows a toast and the card leaves Upcoming', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  const mock = await setup(page);
  await page.goto('/appointments');
  await cards(page).first().click();
  await confirmCancel(page);
  await expect(page.getByText('Appointment cancelled.').first()).toBeVisible();
  expect(mock.cancelCalls()).toBe(1);
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(cards(page)).toHaveCount(1);
});

test('a 409 is explained inline', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await setup(page, { cancel: 'conflict' });
  await page.goto('/appointments');
  await cards(page).first().click();
  await confirmCancel(page);
  await expect(page.getByRole('alert')).toContainText('already started');
});

test('a 503 where nothing changed offers Try again', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  const mock = await setup(page, { cancel: 'unavailable-booked' });
  await page.goto('/appointments');
  await cards(page).first().click();
  await confirmCancel(page);
  await expect(page.getByText(/Nothing was changed/)).toBeVisible();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('Appointment cancelled.').first()).toBeVisible();
  expect(mock.cancelCalls()).toBe(2);
});

test('the empty state links to /book', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await setup(page, { upcoming: 0, past: 0 });
  await page.goto('/appointments');
  await expect(page.getByRole('heading', { name: 'No upcoming appointments' })).toBeVisible();
  await page.getByRole('link', { name: 'Book an appointment' }).last().click();
  await expect(page).toHaveURL(/\/book$/);
});

test('the cancel flow completes with the keyboard alone', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  const mock = await setup(page);
  await page.goto('/appointments');
  await cards(page).first().focus();
  await page.keyboard.press('Enter');
  const cancel = page.getByRole('button', { name: 'Cancel appointment' });
  await expect(cancel).toBeVisible();
  await cancel.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByRole('button', { name: 'Keep appointment' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Cancel appointment' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Appointment cancelled.').first()).toBeVisible();
  expect(mock.cancelCalls()).toBe(1);
});
