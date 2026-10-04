import type { Page, Route } from '@playwright/test';

export const API = 'http://gateway.e2e.test';
export const REFRESH_KEY = 'sa.refreshToken';

type Role = 'Customer' | 'Staff' | 'Admin';

const b64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

/** An unsigned JWT with the claims the SPA reads (it never verifies a signature). */
export function makeJwt(role: Role, expiresInSeconds = 3600): string {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({
    sub: 'user-1',
    email: 'ann@example.com',
    role,
    exp,
  })}.sig`;
}

export interface MockBackend {
  /** Number of `POST /api/Auth/refresh` calls seen. */
  readonly refreshCalls: () => number;
}

export interface MockOptions {
  role?: Role;
  /** When set, the refresh endpoint answers with this status and a problem body. */
  refreshStatus?: number;
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE',
  'access-control-expose-headers': 'X-Correlation-ID, Retry-After, Location',
};

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

/**
 * Mocks `/config.json` and the auth endpoints of the gateway with `page.route`, so the
 * end-to-end tests need no backend. Refresh tokens rotate (`rt_1`, `rt_2`, ...).
 */
export async function mockBackend(page: Page, options: MockOptions = {}): Promise<MockBackend> {
  const role = options.role ?? 'Customer';
  let refreshCalls = 0;

  await page.route('**/config.json', (route) => json(route, 200, { apiBaseUrl: API }));

  await page.route(`${API}/**`, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS });
    }
    const path = new URL(request.url()).pathname.toLowerCase();
    if (path === '/api/auth/refresh') {
      refreshCalls++;
      if (options.refreshStatus) {
        return route.fulfill({
          status: options.refreshStatus,
          headers: { ...CORS, 'content-type': 'application/problem+json' },
          body: JSON.stringify({ status: options.refreshStatus, detail: 'Invalid refresh token.' }),
        });
      }
      return json(route, 200, {
        accessToken: makeJwt(role),
        refreshToken: `rt_${refreshCalls + 1}`,
        accessTokenExpiresAtUtc: new Date(Date.now() + 3_600_000).toISOString(),
      });
    }
    if (path === '/api/auth/me') {
      return json(route, 200, {
        firstName: 'Ann',
        lastName: 'Example',
        email: 'ann@example.com',
        phoneNumber: null,
      });
    }
    return json(route, 404, { status: 404, detail: 'Not mocked.' });
  });

  return { refreshCalls: () => refreshCalls };
}

/** Seeds a refresh token before the app starts, only when none is stored yet. */
export async function seedRefreshToken(page: Page, token: string): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      if (!localStorage.getItem(key!)) localStorage.setItem(key!, value!);
    },
    [REFRESH_KEY, token],
  );
}
