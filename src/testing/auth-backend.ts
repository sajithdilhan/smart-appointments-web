import { http, HttpResponse, type HttpHandler } from 'msw';
import type { Role } from '../app/core/auth/session.model';
import { makeAccessToken } from './make-access-token';

export interface BackendUser {
  id: string;
  email: string;
  password: string;
  role: Role;
  firstName: string;
  lastName: string;
}

interface Family {
  userId: string;
  tokens: Map<string, { revoked: boolean; expiresAtMs: number }>;
  revokedAll: boolean;
}

export interface BackendState {
  users: Map<string, BackendUser>;
  families: Map<string, Family>;
  tokenToFamily: Map<string, string>;
  counters: { login: number; refresh: number; logout: number; me: number };
  flags: {
    loginRateLimited: boolean;
    refreshRateLimited: boolean;
    refreshFailure: null | 'network' | 500 | 503;
  };
  accessTokenSeconds: number;
  refreshTokenDays: number;
}

export interface AuthBackendOptions {
  /** API origin the handlers answer for. */
  baseUrl?: string;
  accessTokenSeconds?: number;
  refreshTokenDays?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAtUtc: string;
}

const PROBLEM = 'application/problem+json';

function freshState(options: AuthBackendOptions): BackendState {
  return {
    users: new Map(),
    families: new Map(),
    tokenToFamily: new Map(),
    counters: { login: 0, refresh: 0, logout: 0, me: 0 },
    flags: { loginRateLimited: false, refreshRateLimited: false, refreshFailure: null },
    accessTokenSeconds: options.accessTokenSeconds ?? 3600,
    refreshTokenDays: options.refreshTokenDays ?? 7,
  };
}

function decodePayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = part.padEnd(Math.ceil(part.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * A stateful model of the backend's auth endpoints that enforces the real server rules
 * (single-use refresh tokens, reuse revokes the whole family), so tests catch a client that
 * breaks them. Handlers answer both `/api/Auth/...` and `/api/auth/...`.
 */
export function createAuthBackend(options: AuthBackendOptions = {}) {
  const base = (options.baseUrl ?? 'http://localhost:5290').replace(/\/+$/, '');
  const state = freshState(options);
  let sequence = 0;

  const correlation = (request: Request) =>
    request.headers.get('X-Correlation-ID') ?? crypto.randomUUID();

  function problem(request: Request, status: number, detail: string, extra: HeadersInit = {}) {
    return HttpResponse.json(
      { status, detail },
      {
        status,
        headers: { 'Content-Type': PROBLEM, 'X-Correlation-ID': correlation(request), ...extra },
      },
    );
  }

  function ok(request: Request, body: object, status = 200) {
    return HttpResponse.json(body, {
      status,
      headers: { 'X-Correlation-ID': correlation(request) },
    });
  }

  function newRefreshToken(familyId: string, family: Family): string {
    const token = `rt_${++sequence}_${Math.random().toString(36).slice(2, 10)}`;
    family.tokens.set(token, {
      revoked: false,
      expiresAtMs: Date.now() + state.refreshTokenDays * 86_400_000,
    });
    state.tokenToFamily.set(token, familyId);
    return token;
  }

  function tokenPair(user: BackendUser, refreshToken: string): TokenPair {
    const now = Date.now();
    return {
      accessToken: makeAccessToken({
        sub: user.id,
        email: user.email,
        role: user.role,
        expiresInSeconds: state.accessTokenSeconds,
        nowMs: now,
      }),
      refreshToken,
      accessTokenExpiresAtUtc: new Date(now + state.accessTokenSeconds * 1000).toISOString(),
    };
  }

  function addUser(user: Partial<BackendUser> & Pick<BackendUser, 'email' | 'password'>) {
    const full: BackendUser = {
      id: user.id ?? `user-${state.users.size + 1}`,
      role: 'Customer',
      firstName: 'Test',
      lastName: 'User',
      ...user,
    };
    state.users.set(full.email.toLowerCase(), full);
    return full;
  }

  /** Starts a new token family for a user, as a login would, and returns the pair. */
  function issueTokens(userId: string): TokenPair {
    const user = [...state.users.values()].find((u) => u.id === userId);
    if (!user) throw new Error(`Unknown test user ${userId}`);
    const familyId = `family-${state.families.size + 1}`;
    const family: Family = { userId, tokens: new Map(), revokedAll: false };
    state.families.set(familyId, family);
    return tokenPair(user, newRefreshToken(familyId, family));
  }

  function revokeFamily(family: Family): void {
    family.revokedAll = true;
    for (const t of family.tokens.values()) t.revoked = true;
  }

  function familyOf(token: string | undefined) {
    const id = token ? state.tokenToFamily.get(token) : undefined;
    return { id, family: id ? state.families.get(id) : undefined };
  }

  const both = (name: string) => ['Auth', 'auth'].map((c) => `${base}/api/${c}/${name}`);

  const handlers: HttpHandler[] = [
    ...both('register').map((url) =>
      http.post(url, async ({ request }) => {
        const body = (await request.json()) as Partial<BackendUser>;
        if (!body.email || state.users.has(body.email.toLowerCase())) {
          return problem(request, 400, 'A user with this email already exists.');
        }
        const user = addUser({
          email: body.email,
          password: body.password ?? '',
          firstName: body.firstName,
          lastName: body.lastName,
        });
        return ok(request, { userId: user.id, email: user.email, role: 'Customer' }, 201);
      }),
    ),

    ...both('login').map((url) =>
      http.post(url, async ({ request }) => {
        state.counters.login++;
        if (state.flags.loginRateLimited) {
          return problem(request, 429, 'Too many requests.', { 'Retry-After': '60' });
        }
        const body = (await request.json()) as { email?: string; password?: string };
        const user = state.users.get((body.email ?? '').toLowerCase());
        if (!user || user.password !== body.password) {
          return problem(request, 401, 'Invalid user or password.');
        }
        return ok(request, issueTokens(user.id));
      }),
    ),

    ...both('refresh').map((url) =>
      http.post(url, async ({ request }) => {
        state.counters.refresh++;
        if (state.flags.refreshRateLimited) {
          return problem(request, 429, 'Too many requests.', { 'Retry-After': '60' });
        }
        if (state.flags.refreshFailure === 'network') return HttpResponse.error();
        if (state.flags.refreshFailure !== null) {
          return problem(request, state.flags.refreshFailure, 'Service unavailable.');
        }
        const body = (await request.json().catch(() => ({}))) as { refreshToken?: string };
        const invalid = () => problem(request, 401, 'Invalid or expired refresh token.');
        const { id, family } = familyOf(body.refreshToken);
        const entry = family?.tokens.get(body.refreshToken ?? '');
        if (!id || !family || !entry) return invalid();
        if (entry.revoked || family.revokedAll) {
          revokeFamily(family); // reuse of a consumed token revokes the whole family
          return invalid();
        }
        if (entry.expiresAtMs <= Date.now()) return invalid();
        entry.revoked = true;
        const user = [...state.users.values()].find((u) => u.id === family.userId)!;
        return ok(request, tokenPair(user, newRefreshToken(id, family)));
      }),
    ),

    ...both('logout').map((url) =>
      http.post(url, async ({ request }) => {
        state.counters.logout++;
        const body = (await request.json().catch(() => ({}))) as { refreshToken?: string };
        const { family } = familyOf(body.refreshToken);
        if (family) revokeFamily(family);
        return new HttpResponse(null, {
          status: 204,
          headers: { 'X-Correlation-ID': correlation(request) },
        });
      }),
    ),

    ...both('me').map((url) =>
      http.get(url, ({ request }) => {
        state.counters.me++;
        const auth = request.headers.get('Authorization') ?? '';
        const claims = auth.startsWith('Bearer ') ? decodePayload(auth.slice(7)) : null;
        const user = claims
          ? [...state.users.values()].find((u) => u.id === claims['sub'])
          : undefined;
        const exp = typeof claims?.['exp'] === 'number' ? claims['exp'] : 0;
        if (!user || exp * 1000 <= Date.now()) {
          // The gateway's JWT challenge: 401 with no body.
          return new HttpResponse(null, {
            status: 401,
            headers: { 'X-Correlation-ID': correlation(request) },
          });
        }
        return ok(request, {
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phoneNumber: null,
          isActive: true,
        });
      }),
    ),
  ];

  function reset(): void {
    Object.assign(state, freshState(options));
    sequence = 0;
  }

  return { handlers, state, reset, addUser, issueTokens, baseUrl: base };
}

export type AuthBackend = ReturnType<typeof createAuthBackend>;
