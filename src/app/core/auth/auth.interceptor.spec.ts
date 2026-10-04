import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { http, HttpResponse } from 'msw';
import { firstValueFrom } from 'rxjs';
import { createAuthBackend } from '../../../testing/auth-backend';
import { ManualClock } from '../../../testing/manual-clock';
import { TEST_API_BASE } from '../../../testing/render-with-session';
import { server } from '../../../testing/server';
import { APP_CONFIG } from '../config/app-config';
import { AppError } from '../http/app-error';
import { provideCoreHttp } from '../http/http.providers';
import { CLOCK } from '../util/clock';
import { AuthApiService } from '../api/auth-api.service';
import { SessionStore } from './session.store';
import { TokenStorage } from './token-storage';

const DATA = `${TEST_API_BASE}/api/data`;

function setup(accessTokenSeconds = 3600) {
  const backend = createAuthBackend({ baseUrl: TEST_API_BASE, accessTokenSeconds });
  backend.addUser({ email: 'ann@example.com', password: 'pw', role: 'Customer' });
  server.use(...backend.handlers);
  // A manual clock keeps the proactive timer from firing on its own.
  TestBed.configureTestingModule({
    providers: [
      { provide: APP_CONFIG, useValue: { apiBaseUrl: TEST_API_BASE } },
      { provide: CLOCK, useValue: new ManualClock(Date.now()) },
      provideCoreHttp(),
      provideRouter([]),
    ],
  });
  const seen: (string | null)[] = [];
  const rejected = new Set<string>();
  let status = 0;
  server.use(
    http.get(DATA, ({ request }) => {
      const auth = request.headers.get('Authorization');
      seen.push(auth);
      if (status) return HttpResponse.json({ status, detail: 'nope' }, { status });
      const token = auth?.replace('Bearer ', '') ?? '';
      if (!token || rejected.has(token)) return new HttpResponse(null, { status: 401 });
      return HttpResponse.json({ ok: true });
    }),
  );
  return {
    backend,
    seen,
    rejected,
    forceStatus: (s: number) => (status = s),
    store: TestBed.inject(SessionStore),
    client: TestBed.inject(HttpClient),
    tokens: TestBed.inject(TokenStorage),
  };
}

const get = (client: HttpClient, url = DATA) => firstValueFrom(client.get(url));
const failureOf = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e as AppError,
  );

describe('authInterceptor', () => {
  afterEach(() => {
    TestBed.inject(TokenStorage).clear();
    localStorage.clear();
  });

  it('sends the bearer only to the API origin and never on the auth endpoints', async () => {
    const { store, client, seen } = setup();
    let loginAuth: string | null = 'unset';
    let otherAuth: string | null = 'unset';
    server.use(
      http.post(`${TEST_API_BASE}/api/Auth/login`, ({ request }) => {
        loginAuth = request.headers.get('Authorization');
        return HttpResponse.json(
          { status: 401, detail: 'Invalid user or password.' },
          { status: 401 },
        );
      }),
      http.get('https://other.example/x', ({ request }) => {
        otherAuth = request.headers.get('Authorization');
        return HttpResponse.json({});
      }),
    );
    await failureOf(store.login('ann@example.com', 'x'));
    expect(loginAuth).toBeNull();
    await get(client, 'https://other.example/x');
    expect(otherAuth).toBeNull();
    server.use(http.post(`${TEST_API_BASE}/api/Auth/login`, () => HttpResponse.json({})));
    await store.login('ann@example.com', 'pw').catch(() => undefined);
    expect(seen).toEqual([]);
  });

  it('refreshes once on a 401 and retries the request with the new token', async () => {
    const { store, client, backend, seen, rejected } = setup();
    await store.login('ann@example.com', 'pw');
    const first = store.accessToken()!;
    rejected.add(first);
    expect(await get(client)).toEqual({ ok: true });
    expect(backend.state.counters.refresh).toBe(1);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(`Bearer ${first}`);
    expect(seen[1]).toBe(`Bearer ${store.accessToken()}`);
    expect(store.accessToken()).not.toBe(first);
  });

  it('sends exactly one refresh for five concurrent 401s', async () => {
    const { store, client, backend, rejected } = setup();
    await store.login('ann@example.com', 'pw');
    rejected.add(store.accessToken()!);
    const results = await Promise.all(Array.from({ length: 5 }, () => get(client)));
    expect(results).toHaveLength(5);
    expect(backend.state.counters.refresh).toBe(1);
    expect(store.status()).toBe('authenticated');
  });

  it('ends the session when the retried request is also 401, with no second refresh', async () => {
    const { store, client, backend, tokens, rejected } = setup();
    await store.login('ann@example.com', 'pw');
    // Reject every token the backend will ever issue for this test.
    server.use(http.get(DATA, () => new HttpResponse(null, { status: 401 })));
    void rejected;
    const error = await failureOf(get(client));
    expect(error).toMatchObject({ kind: 'unauthorized', status: 401 });
    expect(backend.state.counters.refresh).toBe(1);
    expect(store.status()).toBe('anonymous');
    expect(tokens.read()).toBeNull();
  });

  it('waits for a refresh first when the token expires within 10 seconds', async () => {
    const { store, client, backend, seen } = setup(5);
    await store.login('ann@example.com', 'pw');
    const short = store.accessToken()!;
    backend.state.accessTokenSeconds = 3600;
    await get(client);
    expect(backend.state.counters.refresh).toBe(1);
    expect(seen).toHaveLength(1);
    expect(seen[0]).not.toBe(`Bearer ${short}`);
    expect(seen[0]).toBe(`Bearer ${store.accessToken()}`);
  });

  it('sends the refresh without Authorization and does not retry it on 503', async () => {
    const { store, client, backend, rejected, tokens } = setup();
    let refreshAuth: string | null = 'unset';
    await store.login('ann@example.com', 'pw');
    const stored = tokens.read();
    rejected.add(store.accessToken()!);
    backend.state.flags.refreshFailure = 503;
    server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith('/refresh')) refreshAuth = request.headers.get('Authorization');
    });
    const error = await failureOf(get(client));
    server.events.removeAllListeners();
    expect(error).toMatchObject({ kind: 'unavailable', status: 503 });
    expect(backend.state.counters.refresh).toBe(1);
    expect(refreshAuth).toBeNull();
    expect(store.status()).toBe('authenticated');
    expect(tokens.read()).toBe(stored);
  });

  it('keeps the session when the refresh hits a network error', async () => {
    const { store, client, backend, rejected, tokens } = setup();
    await store.login('ann@example.com', 'pw');
    rejected.add(store.accessToken()!);
    backend.state.flags.refreshFailure = 'network';
    const error = await failureOf(get(client));
    expect(error).toMatchObject({ kind: 'network' });
    expect(backend.state.counters.refresh).toBe(1);
    expect(store.status()).toBe('authenticated');
    expect(tokens.read()).toBeTruthy();
  });

  it('ends the session when the refresh itself is 401', async () => {
    const { store, client, backend, rejected, tokens } = setup();
    await store.login('ann@example.com', 'pw');
    rejected.add(store.accessToken()!);
    for (const f of backend.state.families.values()) f.revokedAll = true;
    const error = await failureOf(get(client));
    expect(error).toMatchObject({ kind: 'unauthorized' });
    expect(store.status()).toBe('anonymous');
    expect(tokens.read()).toBeNull();
  });

  it('keeps the session on 429 and blocks an early second refresh without a request', async () => {
    const { store, client, backend, rejected } = setup();
    await store.login('ann@example.com', 'pw');
    rejected.add(store.accessToken()!);
    backend.state.flags.refreshRateLimited = true;
    const first = await failureOf(get(client));
    expect(first).toMatchObject({ kind: 'rate-limited', retryAfterSeconds: 60 });
    expect(store.status()).toBe('authenticated');
    backend.state.flags.refreshRateLimited = false;
    const second = await failureOf(get(client));
    expect(second).toMatchObject({ kind: 'rate-limited' });
    expect(backend.state.counters.refresh).toBe(1);
    expect(store.status()).toBe('authenticated');
  });

  it('leaves the session alone on a 403', async () => {
    const { store, client, backend, forceStatus } = setup();
    await store.login('ann@example.com', 'pw');
    forceStatus(403);
    const error = await failureOf(get(client));
    expect(error).toMatchObject({ status: 403, kind: 'http' });
    expect(store.status()).toBe('authenticated');
    expect(backend.state.counters.refresh).toBe(0);
  });

  it('returns the 401 of an anonymous request as is, without refreshing', async () => {
    const { store, client, backend } = setup();
    const error = await failureOf(get(client));
    expect(error).toMatchObject({ kind: 'unauthorized' });
    expect(store.status()).toBe('unknown');
    expect(backend.state.counters.refresh).toBe(0);
  });

  it('reuse scenario: presenting a consumed token again ends the session and revokes the family', async () => {
    const { store, backend, tokens } = setup(30); // short tokens are never "fresh", so refresh always runs
    await store.login('ann@example.com', 'pw');
    const consumed = tokens.read()!;
    await store.refresh(); // consumes `consumed`, stores its successor
    const latest = tokens.read()!;
    expect(latest).not.toBe(consumed);
    tokens.write(consumed); // a buggy client retries the rotated token
    await failureOf(store.refresh());
    expect(store.status()).toBe('anonymous');
    expect([...backend.state.families.values()][0].revokedAll).toBe(true);
    const api = TestBed.inject(AuthApiService);
    const latestAttempt = await failureOf(firstValueFrom(api.refresh(latest)));
    expect(latestAttempt).toMatchObject({ status: 401 });
  });
});
