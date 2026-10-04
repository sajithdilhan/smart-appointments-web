import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { http, HttpResponse } from 'msw';
import { createAuthBackend } from '../../../testing/auth-backend';
import { ManualClock } from '../../../testing/manual-clock';
import { TEST_API_BASE } from '../../../testing/render-with-session';
import { server } from '../../../testing/server';
import { APP_CONFIG } from '../config/app-config';
import { provideCoreHttp } from '../http/http.providers';
import { ToastService } from '../notify/toast.service';
import { CLOCK } from '../util/clock';
import { provideAuth } from './auth.providers';
import { SessionStore } from './session.store';
import { TokenStorage } from './token-storage';

function setup(stored: 'valid' | 'none' | 'unknown-token') {
  const backend = createAuthBackend({ baseUrl: TEST_API_BASE });
  const user = backend.addUser({ email: 'ann@example.com', password: 'pw', role: 'Staff' });
  server.use(...backend.handlers);
  const toast = { showSessionExpired: vi.fn(), showInfo: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      { provide: APP_CONFIG, useValue: { apiBaseUrl: TEST_API_BASE } },
      { provide: CLOCK, useValue: new ManualClock(Date.now()) },
      { provide: ToastService, useValue: toast },
      provideCoreHttp(),
      provideRouter([{ path: '**', children: [] }]),
      provideAuth(),
    ],
  });
  const tokens = new TokenStorage();
  if (stored === 'valid') tokens.write(backend.issueTokens(user.id).refreshToken);
  if (stored === 'unknown-token') tokens.write('rt_unknown');
  return { backend, toast, tokens };
}

const initialized = () => TestBed.inject(ApplicationInitStatus).donePromise;

describe('session restore initializer', () => {
  afterEach(async () => {
    // A profile load started by a restore may still be in flight; it must not reach the next test's handlers.
    const store = TestBed.inject(SessionStore);
    await vi.waitFor(() => expect(store.profileStatus()).not.toBe('loading'));
    new TokenStorage().clear();
    localStorage.clear();
  });

  it('with no stored token it sends no request and settles anonymous', async () => {
    const { backend } = setup('none');
    await initialized();
    const store = TestBed.inject(SessionStore);
    expect(store.status()).toBe('anonymous');
    expect(backend.state.counters.refresh).toBe(0);
  });

  it('with a stored token it sends exactly one refresh before the initializer resolves', async () => {
    const { backend } = setup('valid');
    await initialized();
    const store = TestBed.inject(SessionStore);
    expect(backend.state.counters.refresh).toBe(1);
    expect(store.status()).toBe('authenticated');
    expect(store.role()).toBe('Staff');
  });

  it('a 401 clears the stored token and leaves anonymous with no toast or redirect', async () => {
    const { backend, toast, tokens } = setup('unknown-token');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    await initialized();
    expect(backend.state.counters.refresh).toBe(1);
    expect(TestBed.inject(SessionStore).status()).toBe('anonymous');
    expect(tokens.read()).toBeNull();
    expect(toast.showSessionExpired).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each([
    ['a network error', 'network'],
    ['a 503', 503],
    ['a 500', 500],
  ] as const)('%s keeps the stored token and leaves anonymous', async (_name, failure) => {
    const { backend, tokens } = setup('valid');
    backend.state.flags.refreshFailure = failure;
    const stored = tokens.read();
    await initialized();
    expect(TestBed.inject(SessionStore).status()).toBe('anonymous');
    expect(tokens.read()).toBe(stored);
    expect(backend.state.counters.refresh).toBe(1);
  });

  it('a 429 keeps the stored token and leaves anonymous', async () => {
    const { backend, tokens } = setup('valid');
    backend.state.flags.refreshRateLimited = true;
    const stored = tokens.read();
    await initialized();
    expect(TestBed.inject(SessionStore).status()).toBe('anonymous');
    expect(tokens.read()).toBe(stored);
  });

  it('settled() resolves once, after the restore', async () => {
    setup('valid');
    const store = TestBed.inject(SessionStore);
    let count = 0;
    void store.settled().then(() => count++);
    await initialized();
    await store.settled();
    await store.restore(); // a second call is a no-op
    expect(count).toBe(1);
    expect(store.status()).toBe('authenticated');
  });

  it('retries a failed profile load once, on a navigation, and no more', async () => {
    setup('valid');
    let calls = 0;
    server.use(
      http.get(`${TEST_API_BASE}/api/Auth/me`, () => {
        calls++;
        return HttpResponse.json({ status: 500, detail: 'boom' }, { status: 500 });
      }),
    );
    await initialized();
    const store = TestBed.inject(SessionStore);
    const router = TestBed.inject(Router);
    await vi.waitFor(() => expect(store.profileStatus()).toBe('error'));
    // The first navigation after the failure retries once (an early initial navigation may have done so already).
    await router.navigateByUrl('/one');
    await vi.waitFor(() => expect(calls).toBe(2));
    await vi.waitFor(() => expect(store.profileStatus()).toBe('error'));
    await router.navigateByUrl('/two');
    await router.navigateByUrl('/three');
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toBe(2);
    expect(store.status()).toBe('authenticated');
  });
});
