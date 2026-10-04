import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { http, HttpResponse } from 'msw';
import { createAuthBackend } from '../../../testing/auth-backend';
import { makeAccessToken } from '../../../testing/make-access-token';
import { TEST_API_BASE } from '../../../testing/render-with-session';
import { server } from '../../../testing/server';
import { APP_CONFIG } from '../config/app-config';
import { AppError } from '../http/app-error';
import { provideCoreHttp } from '../http/http.providers';
import { SessionStore } from './session.store';
import { REFRESH_TOKEN_KEY, TokenStorage } from './token-storage';

function setup() {
  const backend = createAuthBackend({ baseUrl: TEST_API_BASE });
  const user = backend.addUser({
    email: 'ann@example.com',
    password: 'pw',
    role: 'Customer',
    firstName: 'Ann',
    lastName: 'Lee',
  });
  server.use(...backend.handlers);
  TestBed.configureTestingModule({
    providers: [
      { provide: APP_CONFIG, useValue: { apiBaseUrl: TEST_API_BASE } },
      provideCoreHttp(),
      provideRouter([]),
    ],
  });
  return {
    backend,
    user,
    store: TestBed.inject(SessionStore),
    tokens: TestBed.inject(TokenStorage),
  };
}

/** Lets the background `me` call finish. */
const profileSettled = (store: InstanceType<typeof SessionStore>) =>
  vi.waitFor(() => expect(['ready', 'error']).toContain(store.profileStatus()));

describe('SessionStore', () => {
  afterEach(() => {
    TestBed.inject(TokenStorage).clear();
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('starts unknown with no user and an unresolved settled()', async () => {
    const { store } = setup();
    expect(store.status()).toBe('unknown');
    expect(store.isAuthenticated()).toBe(false);
    expect(store.role()).toBeNull();
    expect(store.displayName()).toBe('');
    let settled = false;
    void store.settled().then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
  });

  describe('login', () => {
    it('sets the tokens, decodes the claims, authenticates and loads the names', async () => {
      const { store, tokens, backend, user } = setup();
      await store.login('ann@example.com', 'pw');
      expect(store.status()).toBe('authenticated');
      expect(store.accessToken()).toBeTruthy();
      expect(store.user()).toMatchObject({
        id: user.id,
        email: 'ann@example.com',
        role: 'Customer',
      });
      expect(store.role()).toBe('Customer');
      expect(store.isAuthenticated()).toBe(true);
      expect(tokens.read()).toMatch(/^rt_/);
      await store.settled();
      expect(store.displayName()).toBe('ann@example.com'); // until `me` returns
      await profileSettled(store);
      expect(store.profileStatus()).toBe('ready');
      expect(store.displayName()).toBe('Ann Lee');
      expect(store.user()).toMatchObject({ firstName: 'Ann', lastName: 'Lee' });
      expect(backend.state.counters.me).toBe(1);
    });

    it('rejects with the AppError of a wrong password and stays anonymous-capable', async () => {
      const { store } = setup();
      const error = await store.login('ann@example.com', 'nope').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({
        status: 401,
        kind: 'unauthorized',
        message: 'Invalid user or password.',
      });
      expect(store.status()).toBe('unknown');
      expect(store.accessToken()).toBeNull();
    });

    it('derives the expiry from the token exp, and exp wins on a mismatch', async () => {
      const { store, backend } = setup();
      backend.state.accessTokenSeconds = 600;
      server.use(
        http.post(`${TEST_API_BASE}/api/Auth/login`, () => {
          const accessToken = makeAccessToken({
            sub: 'user-1',
            email: 'ann@example.com',
            role: 'Customer',
            expiresInSeconds: 600,
            nowMs: 1_700_000_000_000,
          });
          // No field, then a wrong field: the store trusts the token either way.
          return HttpResponse.json({ accessToken, refreshToken: 'rt_x' });
        }),
      );
      await store.login('ann@example.com', 'pw');
      expect(store.accessTokenExpiresAtUtc()).toBe(new Date(1_700_000_600_000).toISOString());

      server.use(
        http.post(`${TEST_API_BASE}/api/Auth/login`, () =>
          HttpResponse.json({
            accessToken: makeAccessToken({
              sub: 'user-1',
              email: 'ann@example.com',
              role: 'Customer',
              expiresInSeconds: 600,
              nowMs: 1_700_000_000_000,
            }),
            refreshToken: 'rt_y',
            accessTokenExpiresAtUtc: '2099-01-01T00:00:00Z',
          }),
        ),
      );
      await store.login('ann@example.com', 'pw');
      expect(store.accessTokenExpiresAtUtc()).toBe(new Date(1_700_000_600_000).toISOString());
    });

    it('treats an undecodable access token as an invalid session', async () => {
      const { store, tokens } = setup();
      server.use(
        http.post(`${TEST_API_BASE}/api/Auth/login`, () =>
          HttpResponse.json({ accessToken: 'garbage', refreshToken: 'rt_z' }),
        ),
      );
      const error = await store.login('ann@example.com', 'pw').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ message: 'Sign-in failed. Please try again.' });
      expect(store.status()).toBe('anonymous');
      expect(tokens.read()).toBeNull();
    });

    it('never writes the access token to localStorage or sessionStorage', async () => {
      const { store } = setup();
      const proto = Object.getPrototypeOf(localStorage);
      const writes: string[] = [];
      const original = proto.setItem;
      vi.spyOn(proto, 'setItem').mockImplementation(function (this: Storage, ...args: unknown[]) {
        writes.push(`${String(args[0])}=${String(args[1])}`);
        return original.apply(this, args);
      });
      await store.login('ann@example.com', 'pw');
      await profileSettled(store);
      const access = store.accessToken()!;
      expect(writes.length).toBeGreaterThan(0);
      expect(writes.every((w) => w.startsWith(`${REFRESH_TOKEN_KEY}=`))).toBe(true);
      for (const storage of [localStorage, sessionStorage]) {
        for (let i = 0; i < storage.length; i++) {
          expect(storage.getItem(storage.key(i)!)).not.toContain(access);
        }
      }
    });
  });

  describe('profile', () => {
    it('keeps the session when me fails, falls back to the email and reloads on demand', async () => {
      const { store, backend } = setup();
      let fail = true;
      const real = backend.handlers;
      server.use(
        http.get(`${TEST_API_BASE}/api/Auth/me`, () =>
          fail ? HttpResponse.json({ status: 500, detail: 'boom' }, { status: 500 }) : undefined,
        ),
        ...real,
      );
      await store.login('ann@example.com', 'pw');
      await vi.waitFor(() => expect(store.profileStatus()).toBe('error'));
      expect(store.status()).toBe('authenticated');
      expect(store.displayName()).toBe('ann@example.com');
      expect(store.profile()).toBeNull();

      fail = false;
      const reloading = store.reloadProfile();
      expect(store.profileStatus()).toBe('loading');
      await reloading;
      expect(store.profileStatus()).toBe('ready');
      expect(store.profile()).toEqual({
        firstName: 'Ann',
        lastName: 'Lee',
        email: 'ann@example.com',
        phoneNumber: null,
      });
      expect(store.displayName()).toBe('Ann Lee');
    });

    it('reloadProfile never rejects, even when me keeps failing', async () => {
      const { store } = setup();
      server.use(http.get(`${TEST_API_BASE}/api/Auth/me`, () => HttpResponse.error()));
      await store.login('ann@example.com', 'pw');
      await expect(store.reloadProfile()).resolves.toBeUndefined();
      expect(store.profileStatus()).toBe('error');
    });

    it('is idle and empty while anonymous, and ignores a reload', async () => {
      const { store, backend } = setup();
      store.clearLocal();
      await store.reloadProfile();
      expect(store.profileStatus()).toBe('idle');
      expect(store.profile()).toBeNull();
      expect(backend.state.counters.me).toBe(0);
    });
  });

  describe('logout', () => {
    it('sends one logout with the stored token, clears everything and is silent', async () => {
      const { store, tokens, backend } = setup();
      await store.login('ann@example.com', 'pw');
      await profileSettled(store);
      const refreshToken = tokens.read()!;
      await store.logout();
      await vi.waitFor(() => expect(backend.state.counters.logout).toBe(1));
      expect(store.status()).toBe('anonymous');
      expect(store.accessToken()).toBeNull();
      expect(store.user()).toBeNull();
      expect(store.profile()).toBeNull();
      expect(store.profileStatus()).toBe('idle');
      expect(tokens.read()).toBeNull();
      expect(backend.state.tokenToFamily.has(refreshToken)).toBe(true);
      expect([...backend.state.families.values()][0].revokedAll).toBe(true);
    });

    it('does not surface a failing logout call', async () => {
      const { store } = setup();
      server.use(http.post(`${TEST_API_BASE}/api/Auth/logout`, () => HttpResponse.error()));
      await store.login('ann@example.com', 'pw');
      await profileSettled(store);
      await expect(store.logout()).resolves.toBeUndefined();
      expect(store.status()).toBe('anonymous');
      await new Promise((r) => setTimeout(r, 30));
    });

    it('skips the call when there is no stored token', async () => {
      const { store, tokens, backend } = setup();
      await store.login('ann@example.com', 'pw');
      await profileSettled(store);
      tokens.clear();
      await store.logout();
      await new Promise((r) => setTimeout(r, 20));
      expect(backend.state.counters.logout).toBe(0);
      expect(store.status()).toBe('anonymous');
    });
  });

  it('settled() resolves once the session leaves unknown', async () => {
    const { store } = setup();
    let done = false;
    void store.settled().then(() => (done = true));
    await store.login('ann@example.com', 'pw');
    await vi.waitFor(() => expect(done).toBe(true));
  });
});
