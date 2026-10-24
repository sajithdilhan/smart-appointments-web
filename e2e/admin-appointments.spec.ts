import { expect, test, type Page } from '@playwright/test';
import { seedRefreshToken } from './mock-backend';
import { mockAdminAppointments } from './support/admin-appointments';

const DAY = '2026-03-10';

async function setup(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  const api = await mockAdminAppointments(page);
  await seedRefreshToken(page, 'rt_1');
  const colombo = api.seedBranch({ code: 'COL', name: 'Colombo Central' });
  const kandy = api.seedBranch({ code: 'KDY', name: 'Kandy', timeZoneId: 'Europe/London' });
  api.staff.seedCustomer('c-ann', { firstName: 'Ann', lastName: 'Silva' });
  api.staff.seedCustomer('c-kim', { firstName: 'Kim', lastName: 'Fernando' });
  const serviceId = api.staff.state.services[0].id;
  const ann = api.staff.seedAppointment({
    branchId: colombo.id,
    serviceTypeId: serviceId,
    customerId: 'c-ann',
    startUtc: `${DAY}T09:00:00Z`,
  });
  api.staff.seedAppointment({
    branchId: kandy.id,
    serviceTypeId: serviceId,
    customerId: 'c-kim',
    startUtc: `${DAY}T11:00:00Z`,
  });
  return { api, colombo, kandy, ann };
}

test('without a branch it asks for one and sends no request', async ({ page }) => {
  const { api } = await setup(page);
  await page.goto('/admin/appointments');
  await expect(page.getByText('Choose a branch to see its appointments.')).toBeVisible();
  expect(api.staff.state.dayRequests).toEqual([]);
});

test('choose a branch, mark an appointment, change branch', async ({ page }) => {
  const { api, colombo, kandy, ann } = await setup(page);
  await page.goto('/admin/appointments');
  await page.getByLabel('Branch').selectOption(colombo.id);
  await expect(page).toHaveURL(/branch=/);
  await page.getByLabel('Go to date').fill(DAY);
  await expect(page).toHaveURL(new RegExp(`date=${DAY}`));
  await expect(page.getByRole('row', { name: /Ann Silva/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /Kim Fernando/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Complete Ann Silva at 09:00' }).click();
  await expect(page.getByText('Ann Silva marked as completed.').first()).toBeVisible();
  await expect(page.getByRole('row', { name: /Ann Silva/ })).toContainText('Completed');
  expect(api.staff.state.marks).toEqual([{ id: ann.id, kind: 'complete' }]);

  // A branch change resets the day to today in the new branch's zone.
  await page.getByLabel('Branch').selectOption(kandy.id);
  await expect(page).not.toHaveURL(new RegExp(`date=${DAY}`));
  await expect(page.getByText('No appointments on this day.')).toBeVisible();
  await page.getByLabel('Go to date').fill(DAY);
  await expect(page.getByRole('row', { name: /Kim Fernando/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /Ann Silva/ })).toHaveCount(0);
});
