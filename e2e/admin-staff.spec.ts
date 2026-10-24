import { expect, test, type Locator, type Page } from '@playwright/test';
import { seedRefreshToken } from './mock-backend';
import { mockStaffAccountsApi } from './support/mock-staff-accounts-api';

async function setup(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  const api = await mockStaffAccountsApi(page);
  await seedRefreshToken(page, 'rt_1');
  const colombo = api.seedBranch({ code: 'COL', name: 'Colombo Central' });
  const kandy = api.seedBranch({ code: 'KDY', name: 'Kandy' });
  return { api, colombo, kandy };
}

const PASSWORD = 'Str0ng!Passw0rd';

async function fillCreate(drawer: Locator, email: string, branch: string) {
  await drawer.getByRole('textbox', { name: /^First name/ }).fill('Nimal');
  await drawer.getByRole('textbox', { name: /^Last name/ }).fill('Silva');
  await drawer.getByRole('textbox', { name: /^Email/ }).fill(email);
  await drawer.getByRole('textbox', { name: /^Phone number/ }).fill('+94771234567');
  await drawer.getByRole('textbox', { name: 'Password', exact: true }).fill(PASSWORD);
  await drawer.getByRole('combobox', { name: 'Branch' }).selectOption({ label: branch });
}

test('create a staff member, with the duplicate email error first', async ({ page }) => {
  const { api } = await setup(page);
  api.accounts.takenEmails.push('taken@example.com');
  await page.goto('/admin/staff');
  await expect(page.getByText('No staff accounts yet.')).toBeVisible();
  await page.getByRole('link', { name: 'New staff member' }).first().click();
  const drawer = page.getByRole('dialog', { name: 'New staff member' });
  await fillCreate(drawer, 'taken@example.com', 'Colombo Central');
  await drawer.getByRole('button', { name: 'Create staff member' }).click();
  await expect(drawer.getByText('Email is already registered.').first()).toBeVisible();
  await expect(drawer).toBeVisible();

  await drawer.getByRole('textbox', { name: /^Email/ }).fill('nimal@example.com');
  await drawer.getByRole('textbox', { name: 'Password', exact: true }).fill(PASSWORD);
  await drawer.getByRole('button', { name: 'Create staff member' }).click();
  await expect(page.getByText('Nimal Silva can now sign in.').first()).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/staff(\?.*)?$/);
  await expect(
    page.getByRole('row', { name: /Nimal Silva.*nimal@example.com.*Colombo Central/ }),
  ).toBeVisible();
  const posts = api.accounts.writes.filter((w) => w.method === 'POST');
  expect(posts).toHaveLength(2);
  expect(posts[1].body).toMatchObject({ email: 'nimal@example.com', firstName: 'Nimal' });
});

test('move a member to another branch', async ({ page }) => {
  const { api, kandy } = await setup(page);
  const member = api.seedStaff({ firstName: 'Nimal', lastName: 'Silva' });
  await page.goto(`/admin/staff/${member.id}`);
  const drawer = page.getByRole('dialog', { name: 'Edit staff member' });
  await expect(drawer.getByText('Moving a staff member signs them out')).toBeVisible();
  await drawer.getByRole('combobox', { name: 'Branch' }).selectOption({ label: 'Kandy' });
  await drawer.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Nimal Silva moved to Kandy.').first()).toBeVisible();
  await expect(page.getByRole('row', { name: /Nimal Silva.*Kandy/ })).toBeVisible();
  expect(api.accounts.accounts[0].branchId).toBe(kandy.id);
  expect(api.accounts.revocations[member.id]).toBe(1);
});

test('deactivate, reactivate and delete from the row menu', async ({ page }) => {
  const { api } = await setup(page);
  const member = api.seedStaff({
    firstName: 'Nimal',
    lastName: 'Silva',
    email: 'nimal@example.com',
  });
  await page.goto('/admin/staff');
  const row = page.getByRole('row', { name: /Nimal Silva/ });

  await row.getByRole('button', { name: 'Actions for Nimal Silva' }).click();
  await page.getByRole('menuitem', { name: 'Deactivate' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Deactivate Nimal Silva?');
  await dialog.getByRole('button', { name: 'Deactivate' }).click();
  await expect(page.getByText('Nimal Silva deactivated.').first()).toBeVisible();
  await expect(row).toContainText('Inactive');
  expect(api.accounts.revocations[member.id]).toBe(1);

  // Reactivating asks nothing.
  await row.getByRole('button', { name: 'Actions for Nimal Silva' }).click();
  await page.getByRole('menuitem', { name: 'Reactivate' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.getByText('Nimal Silva can sign in again.').first()).toBeVisible();
  await expect(row).toContainText('Active');

  await row.getByRole('button', { name: 'Actions for Nimal Silva' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(page.getByRole('alertdialog')).toContainText("Delete Nimal Silva's staff account?");
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete account' }).click();
  await expect(page.getByText("Nimal Silva's account was deleted.").first()).toBeVisible();
  await expect(page.getByText('No staff accounts yet.')).toBeVisible();
});

test('a member of an inactive branch cannot be reactivated until moved', async ({ page }) => {
  const { api, colombo } = await setup(page);
  api.seedStaff({ firstName: 'Nimal', lastName: 'Silva', isActive: false });
  colombo.isActive = false;
  await page.goto('/admin/staff');
  await page
    .getByRole('row', { name: /Nimal Silva/ })
    .getByRole('button', { name: 'Actions for Nimal Silva' })
    .click();
  await page.getByRole('menuitem', { name: 'Reactivate' }).click();
  await expect(page.getByRole('alert')).toContainText("Nimal Silva's branch is not active.");
  await expect(page.getByRole('link', { name: 'Edit Nimal Silva' })).toBeVisible();
});

test('creating a staff member works with the keyboard alone', async ({ page }) => {
  const { api } = await setup(page);
  await page.goto('/admin/staff');
  await page.getByRole('link', { name: 'New staff member' }).first().focus();
  await page.keyboard.press('Enter');
  const drawer = page.getByRole('dialog', { name: 'New staff member' });
  await expect(drawer).toBeVisible();

  await drawer.getByRole('textbox', { name: /^First name/ }).focus();
  await page.keyboard.type('Kamal');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Perera');
  await page.keyboard.press('Tab');
  await page.keyboard.type('kamal@example.com');
  await page.keyboard.press('Tab');
  await page.keyboard.type('+94779876543');
  await page.keyboard.press('Tab');
  await page.keyboard.type(PASSWORD);
  // Tab on to the branch select (past the show-password control), then choose with the keys.
  const branch = drawer.getByRole('combobox', { name: 'Branch' });
  for (let i = 0; i < 6 && !(await branch.evaluate((e) => e === document.activeElement)); i++) {
    await page.keyboard.press('Tab');
  }
  await expect(branch).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(branch).toHaveValue(api.state.branches[1].id);
  await page.keyboard.press('Tab');
  await expect(drawer.getByRole('button', { name: 'Create staff member' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Kamal Perera can now sign in.').first()).toBeVisible();
  expect(api.accounts.accounts).toHaveLength(1);
});
