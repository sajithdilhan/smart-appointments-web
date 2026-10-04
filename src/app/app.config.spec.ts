import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { delay, http, HttpResponse } from 'msw';
import { createAuthBackend } from '../testing/auth-backend';
import { TEST_API_BASE } from '../testing/render-with-session';
import { server } from '../testing/server';
import { App } from './app';
import { appConfig } from './app.config';
import { TokenStorage } from './core/auth/token-storage';
import { SessionStore } from './core/auth/session.store';
import type { Role } from './core/auth/session.model';

/** Boots the real `appConfig` (config initializer, session initializer, router) against MSW. */
async function boot(storedRole: Role | null, configDelayMs = 0) {
  const backend = createAuthBackend({ baseUrl: TEST_API_BASE });
  const user = backend.addUser({
    email: 'ann@example.com',
    password: 'pw',
    role: storedRole ?? 'Customer',
  });
  server.use(
    ...backend.handlers,
    http.get(`${location.origin}/config.json`, async () => {
      await delay(configDelayMs);
      return HttpResponse.json({ apiBaseUrl: TEST_API_BASE });
    }),
  );
  // The config loader fetches a relative URL, which Node's fetch cannot resolve.
  const realFetch = globalThis.fetch;
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
    realFetch(
      typeof input === 'string' && input.startsWith('/') ? location.origin + input : input,
      init,
    ),
  );
  localStorage.clear();
  if (storedRole) new TokenStorage().write(backend.issueTokens(user.id).refreshToken);

  TestBed.configureTestingModule({ providers: [...appConfig.providers] });
  await TestBed.inject(ApplicationInitStatus).donePromise;
  const fixture = TestBed.createComponent(App);
  return { backend, fixture, router: TestBed.inject(Router), store: TestBed.inject(SessionStore) };
}

const heading = (root: HTMLElement) => root.querySelector('h1')?.textContent?.trim();

describe('the real application configuration', () => {
  afterEach(() => {
    new TokenStorage().clear();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('settles anonymous with no stored token and redirects /book to /login with returnUrl', async () => {
    const { backend, fixture, router, store } = await boot(null);
    expect(store.status()).toBe('anonymous');
    expect(backend.state.counters.refresh).toBe(0);
    await router.navigateByUrl('/book');
    await fixture.whenStable();
    expect(router.url).toBe('/login?returnUrl=%2Fbook');
    expect(heading(fixture.nativeElement)).toBe('Sign in');
  });

  it.each([
    ['Customer', '/book', 'Book an appointment'],
    ['Admin', '/admin', 'Dashboard'],
    ['Staff', '/staff', 'Staff workspace'],
  ] as const)(
    'restores a stored %s session with one refresh and lands on %s',
    async (role, landing, expected) => {
      const { backend, fixture, router, store } = await boot(role);
      expect(store.status()).toBe('authenticated');
      expect(backend.state.counters.refresh).toBe(1);
      await router.navigateByUrl('/login');
      await vi.waitFor(() => expect(router.url).toBe(landing));
      await fixture.whenStable();
      expect(heading(fixture.nativeElement)).toBe(expected);
    },
  );

  it('waits for a slow config.json before it restores the session (initializers start together)', async () => {
    const { backend, store } = await boot('Customer', 150);
    expect(store.status()).toBe('authenticated');
    expect(backend.state.counters.refresh).toBe(1);
  });

  it('mounts the progress bar host, the outage banner, the outlet, the toaster and the announcer', async () => {
    const { fixture } = await boot(null);
    const el: HTMLElement = fixture.nativeElement;
    for (const selector of [
      'app-route-progress',
      'app-outage-banner',
      'router-outlet',
      'hlm-toaster',
      'app-route-announcer',
    ]) {
      expect(el.querySelector(selector), selector).not.toBeNull();
    }
  });
});
