import { EnvironmentInjector, createEnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { createAuthBackend } from '../../../testing/auth-backend';
import { type FakeCrossTab, createFakeChannelPair } from '../../../testing/fake-channel';
import { makeAccessToken } from '../../../testing/make-access-token';
import { ManualClock } from '../../../testing/manual-clock';
import { TEST_API_BASE } from '../../../testing/render-with-session';
import { server } from '../../../testing/server';
import { ApiClient } from '../api/api-client';
import { AuthApiService } from '../api/auth-api.service';
import { APP_CONFIG } from '../config/app-config';
import { provideCoreHttp } from '../http/http.providers';
import { OutageState } from '../http/outage-state';
import { ToastService } from '../notify/toast.service';
import { CLOCK } from '../util/clock';
import { CrossTabSync } from './cross-tab';
import { RefreshCoordinator } from './refresh-coordinator';
import { RefreshScheduler } from './refresh-scheduler';
import { SessionEnder } from './session-ender';
import { SessionSync } from './session-sync';
import { SessionStore } from './session.store';
import { TokenStorage } from './token-storage';

function setup(accessTokenSeconds = 3600) {
  const backend = createAuthBackend({ baseUrl: TEST_API_BASE, accessTokenSeconds });
  const user = backend.addUser({ email: 'ann@example.com', password: 'pw', role: 'Customer' });
  server.use(...backend.handlers);
  TestBed.configureTestingModule({
    providers: [{ provide: APP_CONFIG, useValue: { apiBaseUrl: TEST_API_BASE } }],
  });
  const { a, b, bus } = createFakeChannelPair();

  const createTab = (channel: FakeCrossTab, url = '/book') => {
    const router = { url, navigate: vi.fn(() => Promise.resolve(true)) };
    const toast = { showSessionExpired: vi.fn(), showInfo: vi.fn() };
    const injector = createEnvironmentInjector(
      [
        { provide: APP_CONFIG, useValue: { apiBaseUrl: TEST_API_BASE } },
        provideCoreHttp(),
        { provide: CLOCK, useValue: new ManualClock(Date.now()) },
        { provide: CrossTabSync, useValue: channel },
        { provide: Router, useValue: router },
        { provide: ToastService, useValue: toast },
        ApiClient,
        AuthApiService,
        OutageState,
        TokenStorage,
        RefreshScheduler,
        RefreshCoordinator,
        SessionEnder,
        SessionStore,
        SessionSync,
      ],
      TestBed.inject(EnvironmentInjector),
    );
    const store = injector.get(SessionStore);
    injector.get(SessionSync);
    return { store, router, toast, injector };
  };

  return { backend, user, bus, A: createTab(a), B: createTab(b) };
}

describe('cross-tab session', () => {
  afterEach(() => {
    TestBed.inject(TokenStorage).clear();
    localStorage.clear();
  });

  it('login in tab A authenticates the anonymous tab B', async () => {
    const { A, B } = setup();
    B.store.restore().catch(() => undefined); // B settles anonymous: nothing stored yet
    await vi.waitFor(() => expect(B.store.status()).toBe('anonymous'));
    await A.store.login('ann@example.com', 'pw');
    await vi.waitFor(() => expect(B.store.status()).toBe('authenticated'));
    expect(B.store.user()).toMatchObject({ email: 'ann@example.com', role: 'Customer' });
    expect(B.store.accessToken()).toBe(A.store.accessToken());
  });

  it('a refresh in A is adopted by B without any request from B', async () => {
    const { A, B, backend } = setup(30); // short tokens are never "fresh": refresh really runs
    await A.store.login('ann@example.com', 'pw');
    await vi.waitFor(() => expect(B.store.status()).toBe('authenticated'));
    const before = B.store.accessToken();
    backend.state.accessTokenSeconds = 120;
    await A.store.refresh();
    await vi.waitFor(() => expect(B.store.accessToken()).toBe(A.store.accessToken()));
    expect(B.store.accessToken()).not.toBe(before);
    expect(backend.state.counters.refresh).toBe(1);
  });

  it('two tabs restoring at the same moment send one refresh and both authenticate', async () => {
    const { A, B, backend, user } = setup();
    new TokenStorage().write(backend.issueTokens(user.id).refreshToken);
    await Promise.all([A.store.restore(), B.store.restore()]);
    expect(backend.state.counters.refresh).toBe(1);
    expect(A.store.status()).toBe('authenticated');
    expect(B.store.status()).toBe('authenticated');
    expect([...backend.state.families.values()][0].revokedAll).toBe(false);
  });

  it('logout in A clears B without a second logout call', async () => {
    const { A, B, backend } = setup();
    await A.store.login('ann@example.com', 'pw');
    await vi.waitFor(() => expect(B.store.status()).toBe('authenticated'));
    await A.store.logout();
    await vi.waitFor(() => expect(B.store.status()).toBe('anonymous'));
    expect(B.store.accessToken()).toBeNull();
    expect(B.router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: undefined });
    expect(B.toast.showSessionExpired).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 20));
    expect(backend.state.counters.logout).toBe(1);
  });

  it('an expired session in A sends A and B to the session-expired login; only A toasts', async () => {
    const { A, B } = setup();
    await A.store.login('ann@example.com', 'pw');
    await vi.waitFor(() => expect(B.store.status()).toBe('authenticated'));
    A.store.endSession('expired');
    await vi.waitFor(() => expect(B.store.status()).toBe('anonymous'));
    const expired = { queryParams: { reason: 'session-expired', returnUrl: '/book' } };
    expect(A.router.navigate).toHaveBeenCalledWith(['/login'], expired);
    expect(B.router.navigate).toHaveBeenCalledWith(['/login'], expired);
    expect(A.toast.showSessionExpired).toHaveBeenCalledTimes(1);
    expect(B.toast.showSessionExpired).not.toHaveBeenCalled();
  });

  it('an invalid session shows no toast and other tabs go to the plain login', async () => {
    const { A, B } = setup();
    await A.store.login('ann@example.com', 'pw');
    await vi.waitFor(() => expect(B.store.status()).toBe('authenticated'));
    A.store.endSession('invalid');
    await vi.waitFor(() => expect(B.store.status()).toBe('anonymous'));
    expect(A.toast.showSessionExpired).not.toHaveBeenCalled();
    expect(B.toast.showSessionExpired).not.toHaveBeenCalled();
    expect(B.router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: undefined });
  });

  it('a tab already on the login page stays there', async () => {
    const { A, B } = setup();
    await A.store.login('ann@example.com', 'pw');
    await vi.waitFor(() => expect(B.store.status()).toBe('authenticated'));
    B.router.url = '/login?x=1';
    await A.store.logout();
    await vi.waitFor(() => expect(B.store.status()).toBe('anonymous'));
    expect(B.router.navigate).not.toHaveBeenCalled();
  });

  it('a removed sa.refreshToken (storage event) signs the tab out as a logout', async () => {
    const { A, B } = setup();
    await A.store.login('ann@example.com', 'pw');
    await vi.waitFor(() => expect(B.store.status()).toBe('authenticated'));
    window.dispatchEvent(new StorageEvent('storage', { key: 'sa.refreshToken', newValue: null }));
    expect(B.store.status()).toBe('anonymous');
    expect(B.router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: undefined });
  });

  it('five simultaneous failures give one navigation and one toast', async () => {
    const { A } = setup();
    await A.store.login('ann@example.com', 'pw');
    for (let i = 0; i < 5; i++) A.store.endSession('expired');
    expect(A.router.navigate).toHaveBeenCalledTimes(1);
    expect(A.toast.showSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('the ender omits returnUrl on the login or register page', async () => {
    const { A } = setup();
    await A.store.login('ann@example.com', 'pw');
    A.router.url = '/register';
    A.store.endSession('expired');
    expect(A.router.navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { reason: 'session-expired' },
    });
  });

  it('a tab ignores an older token from another tab', async () => {
    const { A, B, user } = setup();
    await A.store.login('ann@example.com', 'pw');
    await vi.waitFor(() => expect(B.store.status()).toBe('authenticated'));
    const current = B.store.accessToken();
    const older = makeAccessToken({
      sub: user.id,
      email: user.email,
      role: 'Customer',
      expiresInSeconds: 5,
    });
    expect(B.store.adoptAccessToken(older)).toBe(false);
    expect(B.store.accessToken()).toBe(current);
  });
});
