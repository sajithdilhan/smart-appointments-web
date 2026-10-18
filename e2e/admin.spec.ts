import { expect, test, type Page } from '@playwright/test';
import { mockBackend, seedRefreshToken } from './mock-backend';
import { mockAdminApi } from './support/mock-admin-api';

async function signedInAdmin(page: Page) {
  const api = await mockAdminApi(page);
  await seedRefreshToken(page, 'rt_1');
  return api;
}

const WEEKDAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

test('create a branch, set its schedule, create a service and generate slots', async ({ page }) => {
  const api = await signedInAdmin(page);

  // Branch
  await page.goto('/admin/branches/new');
  const drawer = page.getByRole('dialog', { name: 'New branch' });
  await expect(drawer).toBeVisible();
  await drawer.getByRole('textbox', { name: /^Code/ }).fill('col-01');
  await expect(drawer.getByText('COL-01')).toBeVisible();
  await drawer.getByRole('textbox', { name: /^Name/ }).fill('Colombo Central');
  await drawer.getByRole('textbox', { name: /^Address/ }).fill('1 Galle Road');
  await drawer.getByRole('textbox', { name: /^Phone number/ }).fill('+94 11 222 3344');
  await drawer.getByRole('button', { name: 'Create branch' }).click();
  await expect(page).toHaveURL(/\/admin\/branches$/);
  await expect(page.getByRole('row', { name: /COL-01.*Colombo Central/ })).toBeVisible();
  expect(api.state.writes[0].body).toMatchObject({ code: 'col-01', phoneNumber: '+94112223344' });

  // Schedule with "Copy Monday to weekdays"
  await page.getByRole('link', { name: 'Schedule for Colombo Central' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Schedule for Colombo Central' }),
  ).toBeVisible();
  const zone = page.getByRole('combobox', { name: 'Time zone' });
  await zone.fill('colombo');
  await page.getByRole('option', { name: /Asia\/Colombo/ }).click();
  await page.getByRole('switch', { name: 'Open on Monday' }).click();
  await page.getByRole('button', { name: 'Copy Monday to weekdays' }).click();
  for (const day of WEEKDAY) await expect(page.getByLabel(`${day} opens`)).toHaveValue('09:00');
  await page.getByRole('button', { name: 'Save schedule' }).click();
  await expect(page.getByText('Schedule saved')).toBeVisible();
  expect(api.state.branches[0].workingHours.map((h) => h.dayOfWeek)).toEqual(WEEKDAY);

  // Service
  await page.goto('/admin/services/new');
  const service = page.getByRole('dialog', { name: 'New service' });
  await service.getByRole('textbox', { name: /^Code/ }).fill('cut');
  await service.getByRole('textbox', { name: /^Name/ }).fill('Haircut');
  await service.getByRole('button', { name: '60 min' }).click();
  await service.getByRole('button', { name: 'Create service' }).click();
  await expect(page).toHaveURL(/\/admin\/services$/);
  await expect(page.getByRole('row', { name: /CUT.*Haircut.*1 h/ })).toBeVisible();

  // Generate
  await page.goto('/admin/slots');
  await page.getByLabel('Branch').selectOption({ label: 'Colombo Central (COL-01)' });
  await page.getByLabel('Service').selectOption({ label: 'Haircut (CUT)' });
  await page.getByRole('button', { name: 'Next 7 days' }).click();
  await expect(page.getByTestId('preview')).toContainText('about');
  await page.getByRole('button', { name: 'Generate slots' }).click();
  const result = page.getByRole('heading', { name: /slots created/ });
  await expect(result).toBeVisible();
  await expect(result).toBeFocused();
});

test('a duplicate branch code shows the error under Code', async ({ page }) => {
  const api = await signedInAdmin(page);
  api.seedBranch({ code: 'COL-01', name: 'Existing' });
  await page.goto('/admin/branches/new');
  const drawer = page.getByRole('dialog', { name: 'New branch' });
  await drawer.getByRole('textbox', { name: /^Code/ }).fill('col-01');
  await drawer.getByRole('textbox', { name: /^Name/ }).fill('Another');
  await drawer.getByRole('textbox', { name: /^Address/ }).fill('2 Main Street');
  await drawer.getByRole('textbox', { name: /^Phone number/ }).fill('+14155550123');
  await drawer.getByRole('button', { name: 'Create branch' }).click();
  await expect(drawer.getByText('A branch with code COL-01 already exists.')).toBeVisible();
  await expect(drawer.getByRole('textbox', { name: /^Code/ })).toBeFocused();
  await expect(drawer.getByRole('textbox', { name: /^Name/ })).toHaveValue('Another');
});

test('generating for a branch without a schedule leads to "Set a schedule"', async ({ page }) => {
  const api = await signedInAdmin(page);
  const branch = api.seedBranch({ code: 'KDY', name: 'Kandy' });
  api.seedService({ code: 'CUT', name: 'Haircut' });
  await page.goto('/admin/slots');
  await page.getByLabel('Branch').selectOption({ label: 'Kandy (KDY)' });
  await expect(
    page.getByText(/This branch has no schedule, so slots cannot be generated/),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate slots' })).toBeDisabled();
  await page.getByRole('link', { name: 'Set a schedule' }).click();
  // The picker was changed, so leaving asks first (Req 11).
  await page.getByRole('button', { name: 'Discard changes' }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/branches/${branch.id}/schedule$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Schedule for Kandy' })).toBeVisible();
});

test('deactivating a branch goes through the confirmation', async ({ page }) => {
  const api = await signedInAdmin(page);
  api.seedBranch({ code: 'COL', name: 'Colombo' });
  await page.goto('/admin/branches');
  await page.getByRole('button', { name: 'Deactivate Colombo' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Deactivate Colombo?' });
  await expect(dialog).toContainText(
    'Existing appointments and already generated slots are not cancelled',
  );
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Deactivate branch' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('row', { name: /Colombo/ })).toContainText('Inactive');
  expect(api.state.branches[0].isActive).toBe(false);
});

test('a dirty drawer asks before it is discarded; a deep link opens the edit drawer', async ({
  page,
}) => {
  const api = await signedInAdmin(page);
  const branch = api.seedBranch({ code: 'COL', name: 'Colombo' });
  await page.goto(`/admin/branches/${branch.id}`);
  const drawer = page.getByRole('dialog', { name: 'Edit branch' });
  await expect(drawer.getByRole('textbox', { name: /^Name/ })).toHaveValue('Colombo');
  await drawer.getByRole('textbox', { name: /^Name/ }).fill('Colombo Fort');
  await page.keyboard.press('Escape');
  const confirm = page.getByRole('alertdialog', { name: 'Discard changes?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Keep editing' }).click();
  await expect(drawer).toBeVisible();
  await drawer.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Discard changes' }).click();
  await expect(page).toHaveURL(/\/admin\/branches$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Branches' })).toBeFocused();
});

test('the palette opens with Ctrl+K and runs "New service" with Enter', async ({ page }) => {
  await signedInAdmin(page);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette).toBeVisible();
  const input = palette.getByRole('combobox', { name: 'Search commands' });
  await expect(input).toBeFocused();
  await input.fill('new serv');
  await expect(palette.getByRole('option')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/admin\/services\/new$/);
  await expect(page.getByRole('dialog', { name: 'New service' })).toBeVisible();
});

test('a Customer opening /admin/branches lands on /book', async ({ page }) => {
  await mockBackend(page, { role: 'Customer' });
  await seedRefreshToken(page, 'rt_1');
  await page.goto('/admin/branches');
  await expect(page).toHaveURL(/\/book$/);
});

test('the branch drawer can be completed with the keyboard alone', async ({ page }) => {
  await signedInAdmin(page);
  await page.goto('/admin/branches');
  await expect(page.getByRole('heading', { level: 1, name: 'Branches' })).toBeVisible();
  await page.getByRole('link', { name: 'New branch' }).first().focus();
  await page.keyboard.press('Enter');
  const drawer = page.getByRole('dialog', { name: 'New branch' });
  await expect(drawer.getByRole('textbox', { name: /^Code/ })).toBeFocused();
  await page.keyboard.type('KBD-1');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Keyboard Branch');
  await page.keyboard.press('Tab'); // description
  await page.keyboard.press('Tab');
  await page.keyboard.type('3 Tab Street');
  await page.keyboard.press('Tab');
  await page.keyboard.type('+14155550199');
  await page.keyboard.press('Tab');
  await expect(drawer.getByRole('button', { name: 'Create branch' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/admin\/branches$/);
  await expect(page.getByRole('row', { name: /KBD-1.*Keyboard Branch/ })).toBeVisible();
});
