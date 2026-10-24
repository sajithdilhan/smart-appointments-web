import { expect, test, type Page } from '@playwright/test';
import { seedRefreshToken } from './mock-backend';
import { mockStaffApi, type MockStaffApi } from './support/mock-staff-api';

const DESKTOP = { width: 1280, height: 800 };
/** A fixed past day in Europe/London (GMT), so every start has passed on the SPA's clock. */
const DAY = '2026-03-10';

async function setup(page: Page, options: Parameters<typeof mockStaffApi>[1] = {}) {
  await page.setViewportSize(DESKTOP);
  const api = await mockStaffApi(page, options);
  await seedRefreshToken(page, 'rt_1');
  api.seedBranch({ code: 'COL', name: 'Colombo Central', timeZoneId: 'Europe/London' });
  api.seedService({ name: 'Haircut' });
  return api;
}

function seedDay(api: MockStaffApi) {
  api.seedCustomer('c-ann', { firstName: 'Ann', lastName: 'Silva' });
  api.seedCustomer('c-bob', { firstName: 'Bob', lastName: 'Perera', phoneNumber: '+94770000002' });
  const ann = api.seedAppointment({ customerId: 'c-ann', startUtc: `${DAY}T09:00:00Z` });
  const bob = api.seedAppointment({ customerId: 'c-bob', startUtc: `${DAY}T10:00:00Z` });
  return { ann, bob };
}

test('the day list shows the branch in the header and the rows of the day', async ({ page }) => {
  const api = await setup(page);
  seedDay(api);
  await page.goto(`/staff?date=${DAY}`);
  await expect(page.getByRole('banner').getByText('Colombo Central (COL)')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Appointments' })).toBeVisible();
  await expect(page.getByRole('row', { name: /Ann Silva/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /Bob Perera/ })).toBeVisible();
  await expect(page.getByText('2 appointments')).toBeVisible();
});

test('Complete needs no dialog and updates the row', async ({ page }) => {
  const api = await setup(page);
  const { ann } = seedDay(api);
  await page.goto(`/staff?date=${DAY}`);
  await page.getByRole('button', { name: 'Complete Ann Silva at 09:00' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.getByText('Ann Silva marked as completed.').first()).toBeVisible();
  await expect(page.getByRole('row', { name: /Ann Silva/ })).toContainText('Completed');
  expect(api.state.marks).toEqual([{ id: ann.id, kind: 'complete' }]);
});

test('No-show asks first: Keep sends nothing, Mark records it', async ({ page }) => {
  const api = await setup(page);
  const { bob } = seedDay(api);
  await page.goto(`/staff?date=${DAY}`);
  await page.getByRole('button', { name: 'No-show Bob Perera at 10:00' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Mark as no-show?');
  await expect(dialog).toContainText('Bob Perera at 10:00.');
  await expect(dialog.getByRole('button', { name: 'Keep as booked' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Keep as booked' }).click();
  await expect(dialog).toHaveCount(0);
  expect(api.state.marks).toEqual([]);

  await page.getByRole('button', { name: 'No-show Bob Perera at 10:00' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Mark as no-show' }).click();
  await expect(page.getByText('Bob Perera marked as no-show.').first()).toBeVisible();
  await expect(page.getByRole('row', { name: /Bob Perera/ })).toContainText('No-show');
  expect(api.state.marks).toEqual([{ id: bob.id, kind: 'no-show' }]);
});

test('Previous day and the browser Back button move through the days', async ({ page }) => {
  const api = await setup(page);
  seedDay(api);
  api.seedAppointment({
    customerId: 'c-ann',
    startUtc: '2026-03-09T11:00:00Z',
  });
  await page.goto(`/staff?date=${DAY}`);
  await expect(page.getByRole('row', { name: /Bob Perera/ })).toBeVisible();
  await page.getByRole('button', { name: 'Previous day' }).click();
  await expect(page).toHaveURL(/date=2026-03-09/);
  await expect(page.getByRole('row', { name: /11:00 to 11:30/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /Bob Perera/ })).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/date=2026-03-10/);
  await expect(page.getByRole('row', { name: /Bob Perera/ })).toBeVisible();
});

test('a 409 shows the server text and reloads the row', async ({ page }) => {
  const api = await setup(page);
  seedDay(api);
  // The server thinks the first appointment has not started although the SPA's clock says so.
  api.state.nowMs = Date.parse(`${DAY}T08:00:00Z`);
  await page.goto(`/staff?date=${DAY}`);
  await page.getByRole('button', { name: 'Complete Ann Silva at 09:00' }).click();
  await expect(page.getByText('The appointment has not started yet.').first()).toBeVisible();
  await expect(page.getByRole('row', { name: /Ann Silva/ })).toContainText('Booked');
});

test('a Staff token without a branch shows the not-linked state', async ({ page }) => {
  await setup(page, { branchId: null });
  await page.goto('/staff');
  await expect(page.getByRole('heading', { level: 1, name: 'No branch linked' })).toBeVisible();
  await expect(page.getByText('Your account is not linked to an active branch.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' }).first()).toBeVisible();
});
