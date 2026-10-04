import { server } from './server';
import { createAuthBackend } from './auth-backend';
import { makeAccessToken } from './make-access-token';
import { authHandlers } from './handlers/auth.handlers';

const BASE = 'http://localhost:5290';

function setup() {
  const backend = createAuthBackend();
  server.use(...backend.handlers);
  const user = backend.addUser({ email: 'a@b.c', password: 'pw', role: 'Staff' });
  return { backend, user };
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const refresh = (token: string) => post('/api/Auth/refresh', { refreshToken: token });

describe('makeAccessToken', () => {
  it('builds a structurally valid JWT with exp = iat + lifetime', () => {
    const t = makeAccessToken({
      sub: 'u1',
      email: 'é@x.y',
      role: 'Admin',
      expiresInSeconds: 60,
      nowMs: 1_000_000,
    });
    const [h, p, s] = t.split('.');
    expect(JSON.parse(atob(h.replace(/-/g, '+').replace(/_/g, '/')))).toEqual({
      alg: 'HS256',
      typ: 'JWT',
    });
    expect(s).toBeTruthy();
    expect(p).not.toMatch(/[+/=]/);
    const payload = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(
          atob(p.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (p.length % 4)) % 4)),
          (c) => c.charCodeAt(0),
        ),
      ),
    );
    expect(payload).toMatchObject({
      sub: 'u1',
      email: 'é@x.y',
      role: 'Admin',
      iat: 1000,
      exp: 1060,
    });
  });
});

describe('createAuthBackend', () => {
  it('logs in with the right password and returns a token pair with an expiry', async () => {
    const { backend } = setup();
    const res = await post('/api/Auth/login', { email: 'A@B.C', password: 'pw' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toMatch(/^rt_/);
    expect(new Date(body.accessTokenExpiresAtUtc).getTime()).toBeGreaterThan(Date.now());
    expect(backend.state.counters.login).toBe(1);
  });

  it('rejects a wrong password with a problem+json 401', async () => {
    setup();
    const res = await post('/api/auth/login', { email: 'a@b.c', password: 'nope' });
    expect(res.status).toBe(401);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
    expect(await res.json()).toEqual({ status: 401, detail: 'Invalid user or password.' });
  });

  it('answers 429 with Retry-After 60 when the login flag is set', async () => {
    const { backend } = setup();
    backend.state.flags.loginRateLimited = true;
    const res = await post('/api/Auth/login', { email: 'a@b.c', password: 'pw' });
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
  });

  it('registers a customer and rejects a duplicate email', async () => {
    const { backend } = setup();
    const body = {
      firstName: 'N',
      lastName: 'M',
      email: 'new@x.y',
      phoneNumber: '1',
      password: 'p',
    };
    const created = await post('/api/Auth/register', body);
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ email: 'new@x.y', role: 'Customer' });
    expect(backend.state.users.has('new@x.y')).toBe(true);
    const dup = await post('/api/Auth/register', body);
    expect(dup.status).toBe(400);
    expect(dup.headers.get('content-type')).toContain('application/problem+json');
  });

  it('rotates the refresh token: the old one is revoked, the new one works', async () => {
    const { backend, user } = setup();
    const t1 = backend.issueTokens(user.id);
    const res2 = await refresh(t1.refreshToken);
    expect(res2.status).toBe(200);
    const t2 = await res2.json();
    expect(t2.refreshToken).not.toBe(t1.refreshToken);
    expect(t2.accessTokenExpiresAtUtc).toBeTruthy();
    expect((await refresh(t2.refreshToken)).status).toBe(200);
    expect(backend.state.counters.refresh).toBe(2);
  });

  it('presenting a revoked token revokes the whole family, so the latest token fails too', async () => {
    const { backend, user } = setup();
    const t1 = backend.issueTokens(user.id);
    const t2 = await (await refresh(t1.refreshToken)).json();
    expect((await refresh(t1.refreshToken)).status).toBe(401); // reuse
    const latest = await refresh(t2.refreshToken);
    expect(latest.status).toBe(401);
    expect(await latest.json()).toEqual({
      status: 401,
      detail: 'Invalid or expired refresh token.',
    });
    expect([...backend.state.families.values()][0].revokedAll).toBe(true);
  });

  it('gives 401 for an unknown, malformed or expired token', async () => {
    const { backend, user } = setup();
    expect((await refresh('rt_unknown')).status).toBe(401);
    expect((await post('/api/Auth/refresh', {})).status).toBe(401);
    expect((await post('/api/Auth/refresh', 'not json')).status).toBe(401);
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const t = backend.issueTokens(user.id);
      vi.setSystemTime(Date.now() + 8 * 86_400_000);
      expect((await refresh(t.refreshToken)).status).toBe(401);
    } finally {
      vi.useRealTimers();
    }
  });

  it('can simulate network and 503 refresh failures, counting every call', async () => {
    const { backend, user } = setup();
    const t = backend.issueTokens(user.id);
    backend.state.flags.refreshFailure = 503;
    expect((await refresh(t.refreshToken)).status).toBe(503);
    backend.state.flags.refreshFailure = 'network';
    await expect(refresh(t.refreshToken)).rejects.toThrow();
    backend.state.flags.refreshFailure = null;
    backend.state.flags.refreshRateLimited = true;
    expect((await refresh(t.refreshToken)).status).toBe(429);
    expect(backend.state.counters.refresh).toBe(3);
  });

  it('logout always answers 204 and revokes the family', async () => {
    const { backend, user } = setup();
    const t = backend.issueTokens(user.id);
    expect((await post('/api/Auth/logout', { refreshToken: t.refreshToken })).status).toBe(204);
    expect((await post('/api/Auth/logout', { refreshToken: 'unknown' })).status).toBe(204);
    expect((await refresh(t.refreshToken)).status).toBe(401);
    expect(backend.state.counters.logout).toBe(2);
  });

  it('me needs a valid bearer token; otherwise 401 with an empty body', async () => {
    const { backend, user } = setup();
    const t = backend.issueTokens(user.id);
    const ok = await fetch(`${BASE}/api/Auth/me`, {
      headers: { Authorization: `Bearer ${t.accessToken}` },
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ email: 'a@b.c', firstName: 'Test', isActive: true });
    const anon = await fetch(`${BASE}/api/Auth/me`);
    expect(anon.status).toBe(401);
    expect(await anon.text()).toBe('');
    const forged = await fetch(`${BASE}/api/Auth/me`, {
      headers: {
        Authorization: `Bearer ${makeAccessToken({ sub: 'ghost', email: 'g@x.y', role: 'Admin', expiresInSeconds: 60 })}`,
      },
    });
    expect(forged.status).toBe(401);
    expect(backend.state.counters.me).toBe(3);
  });

  it('echoes the correlation id, or generates one, on every response', async () => {
    const { backend, user } = setup();
    const t = backend.issueTokens(user.id);
    const echoed = await post(
      '/api/Auth/login',
      { email: 'a@b.c', password: 'bad' },
      { 'X-Correlation-ID': 'abc' },
    );
    expect(echoed.headers.get('x-correlation-id')).toBe('abc');
    const generated = await refresh(t.refreshToken);
    expect(generated.headers.get('x-correlation-id')).toMatch(/^[0-9a-f-]{36}$/);
    const noContent = await post(
      '/api/Auth/logout',
      { refreshToken: 'x' },
      { 'X-Correlation-ID': 'xyz' },
    );
    expect(noContent.headers.get('x-correlation-id')).toBe('xyz');
  });

  it('reset clears users, tokens and counters', async () => {
    const { backend, user } = setup();
    backend.issueTokens(user.id);
    backend.reset();
    expect(backend.state.users.size).toBe(0);
    expect(backend.state.families.size).toBe(0);
    expect(backend.state.counters.login).toBe(0);
  });

  it('authHandlers builds a backend for a custom base URL', async () => {
    const backend = authHandlers({ baseUrl: 'http://other.test' });
    server.use(...backend.handlers);
    backend.addUser({ email: 'z@z.z', password: 'p' });
    const res = await fetch('http://other.test/api/Auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'z@z.z', password: 'p' }),
    });
    expect(res.status).toBe(200);
  });
});
