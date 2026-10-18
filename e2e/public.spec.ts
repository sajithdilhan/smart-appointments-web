import { expect, test, type Page, type Route } from '@playwright/test';
import { API, CORS, json, makeJwt, mockBackend, seedRefreshToken } from './mock-backend';

type Role = 'Customer' | 'Staff' | 'Admin';

const tokens = (role: Role) => ({
  accessToken: makeJwt(role),
  refreshToken: 'rt_login',
  accessTokenExpiresAtUtc: new Date(Date.now() + 3_600_000).toISOString(),
});

/** Overrides one endpoint (routes added later win); preflights fall through to the base mock. */
async function stub(page: Page, path: string, respond: (route: Route) => Promise<void>) {
  await page.route(`${API}${path}`, (route) =>
    route.request().method() === 'OPTIONS' ? route.fallback() : respond(route),
  );
}

const problem = (
  route: Route,
  status: number,
  detail: string,
  headers: Record<string, string> = {},
) =>
  route.fulfill({
    status,
    headers: { ...CORS, 'content-type': 'application/problem+json', ...headers },
    body: JSON.stringify({ status, detail }),
  });

async function loginAs(page: Page, role: Role) {
  await stub(page, '/api/Auth/login', (route) => json(route, 200, tokens(role)));
}

async function fillLogin(page: Page, password = 'Secret1!') {
  await page.getByLabel('Email').fill('ann@example.com');
  await page.getByLabel('Password', { exact: false }).first().fill(password);
}

async function fillRegister(page: Page) {
  await page.getByLabel('First name').fill('Ann');
  await page.getByLabel('Last name').fill('Example');
  await page.getByLabel('Email').fill('ann@example.com');
  await page.getByLabel('Phone number').fill('+14155550123');
  await page.getByLabel('Password').first().fill('Abcdefg1!');
}

test.describe('register', () => {
  test('success signs in and lands on /book', async ({ page }) => {
    await mockBackend(page);
    let body: Record<string, unknown> = {};
    await stub(page, '/api/Auth/register', (route) => {
      body = route.request().postDataJSON() as Record<string, unknown>;
      return json(route, 201, { userId: 'u1', email: 'ann@example.com', role: 'Customer' });
    });
    await loginAs(page, 'Customer');
    await page.goto('/register');
    await fillRegister(page);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/book$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Book an appointment' }),
    ).toBeVisible();
    expect(Object.keys(body).sort()).toEqual([
      'email',
      'firstName',
      'lastName',
      'password',
      'phoneNumber',
    ]);
    await expect(page.getByText('Welcome, Ann! Your account is ready.')).toBeVisible();
  });

  test('a duplicate email is reported on the email field', async ({ page }) => {
    await mockBackend(page);
    await stub(page, '/api/Auth/register', (route) =>
      problem(route, 400, 'Email is already registered.'),
    );
    await page.goto('/register');
    await fillRegister(page);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('An account with this email already exists.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Log in instead' })).toBeVisible();
    await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Email')).toBeFocused();
    await expect(page).toHaveURL(/\/register$/);
  });
});

test.describe('login', () => {
  for (const [role, url] of [
    ['Customer', '/book'],
    ['Admin', '/admin'],
    ['Staff', '/staff'],
  ] as const) {
    test(`a ${role} lands on ${url}`, async ({ page }) => {
      await mockBackend(page, { role });
      await loginAs(page, role);
      await page.goto('/login');
      await fillLogin(page);
      await page.getByRole('button', { name: 'Log in', exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${url}$`));
    });
  }

  test('a 401 shows the generic message and returns focus to an empty password', async ({
    page,
  }) => {
    await mockBackend(page);
    await stub(page, '/api/Auth/login', (route) =>
      problem(route, 401, 'Invalid user or password.'),
    );
    await page.goto('/login');
    await fillLogin(page);
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText(/Invalid email or password\./);
    await expect(page.getByLabel('Password').first()).toHaveValue('');
    await expect(page.getByLabel('Password').first()).toBeFocused();
    await expect(page.getByLabel('Email')).toHaveValue('ann@example.com');
  });

  test('a 429 counts down and re-enables the button', async ({ page }) => {
    await page.clock.install();
    await mockBackend(page);
    await stub(page, '/api/Auth/login', (route) =>
      problem(route, 429, 'Too many requests.', { 'Retry-After': '3' }),
    );
    await page.goto('/login');
    await fillLogin(page);
    const submit = page.getByRole('button', { name: 'Log in', exact: true });
    await submit.click();
    await expect(submit).toBeDisabled();
    await expect(page.getByText(/Try again in \d seconds?\./).first()).toBeVisible();
    await page.clock.fastForward(4000);
    await expect(submit).toBeEnabled();
    await expect(page.getByText('You can try again now.').first()).toBeVisible();
  });

  test('a safe returnUrl is honoured', async ({ page }) => {
    await mockBackend(page);
    await loginAs(page, 'Customer');
    await page.goto('/login?returnUrl=%2Fappointments');
    await fillLogin(page);
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page).toHaveURL(/\/appointments$/);
  });

  test('an external returnUrl is ignored', async ({ page }) => {
    await mockBackend(page);
    await loginAs(page, 'Customer');
    await page.goto('/login?returnUrl=https%3A%2F%2Fevil.example');
    await fillLogin(page);
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page).toHaveURL(/\/book$/);
    expect(new URL(page.url()).origin).toBe(new URL(test.info().project.use.baseURL!).origin);
  });

  test('a signed-in visit to /login is redirected', async ({ page }) => {
    await mockBackend(page, { role: 'Customer' });
    await seedRefreshToken(page, 'rt_1');
    await page.goto('/login');
    await expect(page).toHaveURL(/\/book$/);
    await page.goto('/register');
    await expect(page).toHaveURL(/\/book$/);
  });
});

test.describe('keyboard only', () => {
  test('the login form is completed with Tab, Space and Enter', async ({ page }) => {
    await mockBackend(page);
    await loginAs(page, 'Customer');
    await page.goto('/login');
    await page.getByLabel('Email').focus();
    await page.keyboard.type('ann@example.com');
    await page.keyboard.press('Tab');
    await page.keyboard.type('Secret1!');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Show password' })).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/book$/);
  });

  test('the register form is completed with Tab and Enter', async ({ page }) => {
    await mockBackend(page);
    await stub(page, '/api/Auth/register', (route) => json(route, 201, { userId: 'u1' }));
    await loginAs(page, 'Customer');
    await page.goto('/register');
    await page.getByLabel('First name').focus();
    for (const [i, value] of ['Ann', 'Example', 'ann@example.com', '+14155550123'].entries()) {
      if (i > 0) await page.keyboard.press('Tab');
      await page.keyboard.type(value);
    }
    await page.keyboard.press('Tab');
    await page.keyboard.type('Abcdefg1!');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Create account' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/book$/);
  });
});
