import { beforeEach, describe, expect, it } from 'vitest';
import type { Role } from '../app/core/auth/session.model';
import {
  createStaffAccountsBackend,
  STAFF_API_BASE,
  STAFF_BRANCH_ID,
  STAFF_TEXTS,
} from './staff-accounts-backend';
import { makeAccessToken } from './make-access-token';
import { server } from './server';

const GHOST = '00000000-0000-4000-8000-00000000ffff';

interface Reply {
  status: number;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  headers: Headers;
}

const backend = createStaffAccountsBackend();

async function call(
  method: string,
  path: string,
  options: { body?: unknown; role?: Role | null; headers?: Record<string, string> } = {},
): Promise<Reply> {
  const role = options.role === undefined ? 'Admin' : options.role;
  const headers: Record<string, string> = { ...options.headers };
  if (role) {
    const token = makeAccessToken({
      sub: 'admin-1',
      email: 'admin@example.com',
      role,
      expiresInSeconds: 600,
    });
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${STAFF_API_BASE}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined, headers: res.headers };
}

const newStaff = (over: Record<string, unknown> = {}) => ({
  firstName: 'Ana',
  lastName: 'Perera',
  email: 'ana@example.com',
  phoneNumber: '+94771234567',
  password: 'Str0ng!Passw0rd',
  branchId: STAFF_BRANCH_ID,
  ...over,
});

const names = (r: Reply) => r.body.items.map((i: { firstName: string }) => i.firstName);

beforeEach(() => {
  backend.reset();
  server.use(...backend.handlers);
});

describe('list', () => {
  it('returns staff oldest first, without deleted ones, with a total', async () => {
    backend.addStaff({ firstName: 'First' });
    backend.addStaff({ firstName: 'Second' });
    backend.addStaff({ firstName: 'Gone', deleted: true });
    backend.addStaff({ firstName: 'Third' });
    const r = await call('GET', '/api/auth/staff');
    expect(r.status).toBe(200);
    expect(names(r)).toEqual(['First', 'Second', 'Third']);
    expect(r.body).toMatchObject({ page: 1, pageSize: 20, totalCount: 3 });
  });

  it('serves the path in any casing', async () => {
    backend.addStaff();
    expect((await call('GET', '/api/Auth/staff')).status).toBe(200);
  });

  it('filters by branch and by isActive', async () => {
    const other = backend.addBranch();
    backend.addStaff({ firstName: 'A' });
    backend.addStaff({ firstName: 'B', branchId: other.id });
    backend.addStaff({ firstName: 'C', isActive: false });
    expect(names(await call('GET', `/api/auth/staff?branchId=${other.id}`))).toEqual(['B']);
    expect(names(await call('GET', '/api/auth/staff?isActive=false'))).toEqual(['C']);
    expect(names(await call('GET', '/api/auth/staff?isActive=TRUE'))).toEqual(['A', 'B']);
    expect(
      names(await call('GET', `/api/auth/staff?branchId=${STAFF_BRANCH_ID}&isActive=true`)),
    ).toEqual(['A']);
  });

  it('pages with a default of 20 and a maximum of 100', async () => {
    for (let i = 0; i < 25; i++) backend.addStaff({ firstName: `S${String(i).padStart(2, '0')}` });
    const first = await call('GET', '/api/auth/staff');
    expect(first.body.items).toHaveLength(20);
    expect(first.body.totalCount).toBe(25);
    const second = await call('GET', '/api/auth/staff?page=2');
    expect(names(second)).toEqual(['S20', 'S21', 'S22', 'S23', 'S24']);
    const small = await call('GET', '/api/auth/staff?pageSize=10&page=3');
    expect(names(small)).toEqual(['S20', 'S21', 'S22', 'S23', 'S24']);
    const beyond = await call('GET', '/api/auth/staff?page=9');
    expect(beyond.body).toMatchObject({ items: [], totalCount: 25 });
    expect((await call('GET', '/api/auth/staff?pageSize=100')).body.items).toHaveLength(25);
  });

  it('lists every validation failure in one 400, an empty value counting as invalid', async () => {
    const r = await call('GET', '/api/auth/staff?branchId=nope&isActive=maybe&page=0&pageSize=101');
    expect(r.status).toBe(400);
    expect(r.headers.get('content-type')).toContain('application/problem+json');
    expect(r.body).toEqual({
      status: 400,
      detail:
        STAFF_TEXTS.validationPrefix +
        [
          STAFF_TEXTS.invalidBranchId,
          STAFF_TEXTS.invalidIsActive,
          STAFF_TEXTS.invalidPage,
          STAFF_TEXTS.invalidPageSize,
        ].join(','),
    });
    for (const q of ['branchId=', 'isActive=', 'page=', 'pageSize=', 'page=-1', 'pageSize=1.5']) {
      expect((await call('GET', `/api/auth/staff?${q}`)).status, q).toBe(400);
    }
    const empty = '00000000-0000-0000-0000-000000000000';
    expect((await call('GET', `/api/auth/staff?branchId=${empty}`)).status).toBe(400);
  });
});

describe('access', () => {
  it('is Admin only: 403 for Staff and Customer, 401 without a token', async () => {
    for (const role of ['Staff', 'Customer'] as const) {
      expect(await call('GET', '/api/auth/staff', { role })).toMatchObject({
        status: 403,
        body: { status: 403, detail: STAFF_TEXTS.forbidden },
      });
      expect((await call('POST', '/api/auth/staff', { role, body: newStaff() })).status).toBe(403);
    }
    expect((await call('GET', '/api/auth/staff', { role: null })).status).toBe(401);
    expect(backend.state.accounts).toHaveLength(0);
  });

  it('echoes the correlation id and records requests', async () => {
    const r = await call('GET', '/api/auth/staff', { headers: { 'X-Correlation-ID': 'cid-1' } });
    expect(r.headers.get('x-correlation-id')).toBe('cid-1');
    expect(backend.state.requests.at(-1)).toMatchObject({ method: 'GET', search: '' });
  });

  it('can fail like an outage: one 5xx, a rate limit, a network error', async () => {
    backend.flags.failNext = 500;
    expect((await call('GET', '/api/auth/staff')).status).toBe(500);
    expect((await call('GET', '/api/auth/staff')).status).toBe(200);
    backend.flags.rateLimited = true;
    const limited = await call('GET', '/api/auth/staff');
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('60');
    backend.flags.rateLimited = false;
    backend.flags.networkError = true;
    await expect(call('GET', '/api/auth/staff')).rejects.toThrow();
  });
});

describe('create', () => {
  it('creates an active Staff account and answers 201 with a Location and no password', async () => {
    const r = await call('POST', '/api/auth/staff', { body: newStaff() });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      firstName: 'Ana',
      lastName: 'Perera',
      email: 'ana@example.com',
      phoneNumber: '+94771234567',
      role: 'Staff',
      branchId: STAFF_BRANCH_ID,
      isActive: true,
    });
    expect(r.body.password).toBeUndefined();
    expect(r.body.registeredAtUtc).toEqual(expect.any(String));
    expect(r.headers.get('location')).toBe(`${STAFF_API_BASE}/api/auth/staff/${r.body.id}`);
    expect((await call('GET', `/api/auth/staff/${r.body.id}`)).body).toEqual(r.body);
  });

  it('lists every validation failure in one 400', async () => {
    const r = await call('POST', '/api/auth/staff', {
      body: {
        firstName: '',
        lastName: 'x'.repeat(51),
        email: 'not-an-email',
        phoneNumber: '12',
        password: 'abc',
        branchId: '00000000-0000-0000-0000-000000000000',
      },
    });
    expect(r.status).toBe(400);
    expect(r.body.detail).toBe(
      STAFF_TEXTS.validationPrefix +
        [
          STAFF_TEXTS.firstNameRequired,
          STAFF_TEXTS.lastNameLength,
          STAFF_TEXTS.emailFormat,
          // '12' matches ^\+?[1-9]\d{1,14}$, so only the password and branch rules remain.
          STAFF_TEXTS.passwordLength,
          STAFF_TEXTS.passwordUpper,
          STAFF_TEXTS.passwordDigit,
          STAFF_TEXTS.passwordSpecial,
          STAFF_TEXTS.branchRequired,
        ].join(','),
    );
  });

  it('reports each missing field as required', async () => {
    const r = await call('POST', '/api/auth/staff', { body: {} });
    expect(r.body.detail).toBe(
      STAFF_TEXTS.validationPrefix +
        [
          STAFF_TEXTS.firstNameRequired,
          STAFF_TEXTS.lastNameRequired,
          STAFF_TEXTS.emailRequired,
          STAFF_TEXTS.phoneRequired,
          STAFF_TEXTS.passwordRequired,
          STAFF_TEXTS.branchRequired,
        ].join(','),
    );
  });

  it('rejects a phone number outside E.164 and an underscore as the only special character', async () => {
    const phone = await call('POST', '/api/auth/staff', {
      body: newStaff({ phoneNumber: '0771234' }),
    });
    expect(phone.body.detail).toBe(STAFF_TEXTS.validationPrefix + STAFF_TEXTS.phoneFormat);
    const pw = await call('POST', '/api/auth/staff', { body: newStaff({ password: 'Abcdefg1_' }) });
    expect(pw.body.detail).toBe(STAFF_TEXTS.validationPrefix + STAFF_TEXTS.passwordSpecial);
  });

  it('answers 400 "Email is already registered." for a taken email, any case, even a deleted one', async () => {
    backend.addStaff({ email: 'taken@example.com' });
    backend.addStaff({ email: 'gone@example.com', deleted: true });
    backend.state.takenEmails.push('customer@example.com');
    for (const email of ['TAKEN@example.com', 'gone@example.com', 'customer@example.com']) {
      expect(await call('POST', '/api/auth/staff', { body: newStaff({ email }) })).toMatchObject({
        status: 400,
        body: { status: 400, detail: STAFF_TEXTS.duplicateEmail },
      });
    }
  });

  it('checks the email before the branch', async () => {
    backend.addStaff({ email: 'taken@example.com' });
    const r = await call('POST', '/api/auth/staff', {
      body: newStaff({ email: 'taken@example.com', branchId: GHOST }),
    });
    expect(r.body.detail).toBe(STAFF_TEXTS.duplicateEmail);
  });

  it('answers 422 for an unknown or inactive branch and 503 while Availability is down', async () => {
    const closed = backend.addBranch({ isActive: false });
    for (const branchId of [GHOST, closed.id]) {
      expect(await call('POST', '/api/auth/staff', { body: newStaff({ branchId }) })).toMatchObject(
        {
          status: 422,
          body: { status: 422, detail: STAFF_TEXTS.branchInactive(branchId) },
        },
      );
    }
    backend.flags.branchCheckUnavailable = true;
    expect(await call('POST', '/api/auth/staff', { body: newStaff() })).toMatchObject({
      status: 503,
      body: { status: 503, detail: STAFF_TEXTS.unavailable },
    });
    expect(backend.state.accounts).toHaveLength(0);
  });
});

describe('read', () => {
  it('reads an active or inactive account, 404 for deleted, unknown and non-GUID ids', async () => {
    const active = backend.addStaff();
    const inactive = backend.addStaff({ isActive: false });
    const gone = backend.addStaff({ deleted: true });
    expect((await call('GET', `/api/auth/staff/${active.id}`)).status).toBe(200);
    expect((await call('GET', `/api/auth/staff/${inactive.id}`)).body.isActive).toBe(false);
    expect(await call('GET', `/api/auth/staff/${gone.id}`)).toMatchObject({
      status: 404,
      body: { status: 404, detail: STAFF_TEXTS.notFound(gone.id) },
    });
    expect((await call('GET', `/api/auth/staff/${GHOST}`)).status).toBe(404);
    const bad = await call('GET', '/api/auth/staff/not-a-guid');
    expect(bad.status).toBe(404);
    expect(bad.body).toBeUndefined();
  });
});

describe('move', () => {
  it('moves to another active branch and revokes the sessions', async () => {
    const other = backend.addBranch();
    const s = backend.addStaff();
    const r = await call('PUT', `/api/auth/staff/${s.id}/branch`, { body: { branchId: other.id } });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: s.id, branchId: other.id });
    expect(backend.state.revocations[s.id]).toBe(1);
  });

  it('is a no-op for the same branch: 200, sessions kept, no Availability call needed', async () => {
    const s = backend.addStaff();
    backend.flags.branchCheckUnavailable = true;
    const r = await call('PUT', `/api/auth/staff/${s.id}/branch`, {
      body: { branchId: STAFF_BRANCH_ID },
    });
    expect(r.status).toBe(200);
    expect(backend.state.revocations[s.id]).toBeUndefined();
  });

  it('answers 400, 404, 422 and 503 with the backend texts', async () => {
    const s = backend.addStaff();
    const closed = backend.addBranch({ isActive: false });
    const open = backend.addBranch();
    const put = (id: string, branchId: string) =>
      call('PUT', `/api/auth/staff/${id}/branch`, { body: { branchId } });
    expect(await call('PUT', `/api/auth/staff/${s.id}/branch`, { body: {} })).toMatchObject({
      status: 400,
      body: { detail: STAFF_TEXTS.validationPrefix + STAFF_TEXTS.branchRequired },
    });
    expect(await put(GHOST, open.id)).toMatchObject({
      status: 404,
      body: { detail: STAFF_TEXTS.notFound(GHOST) },
    });
    expect(await put(s.id, closed.id)).toMatchObject({
      status: 422,
      body: { detail: STAFF_TEXTS.branchInactive(closed.id) },
    });
    backend.flags.branchCheckUnavailable = true;
    expect((await put(s.id, open.id)).status).toBe(503);
    expect(backend.state.accounts[0].branchId).toBe(STAFF_BRANCH_ID);
    expect(backend.state.revocations[s.id]).toBeUndefined();
  });
});

describe('activate, deactivate and delete', () => {
  it('deactivates (204), revoking sessions even on a repeat', async () => {
    const s = backend.addStaff();
    expect((await call('POST', `/api/auth/staff/${s.id}/deactivate`)).status).toBe(204);
    expect(backend.state.accounts[0].isActive).toBe(false);
    expect((await call('POST', `/api/auth/staff/${s.id}/deactivate`)).status).toBe(204);
    expect(backend.state.revocations[s.id]).toBe(2);
  });

  it('reactivates (204) when the branch is still active; an active account is a no-op', async () => {
    const s = backend.addStaff({ isActive: false });
    expect((await call('POST', `/api/auth/staff/${s.id}/activate`)).status).toBe(204);
    expect(backend.state.accounts[0].isActive).toBe(true);
    backend.flags.branchCheckUnavailable = true;
    expect((await call('POST', `/api/auth/staff/${s.id}/activate`)).status).toBe(204);
  });

  it('refuses to reactivate into an inactive branch (422) or while Availability is down (503)', async () => {
    const closed = backend.addBranch({ isActive: false });
    const s = backend.addStaff({ isActive: false, branchId: closed.id });
    expect(await call('POST', `/api/auth/staff/${s.id}/activate`)).toMatchObject({
      status: 422,
      body: { detail: STAFF_TEXTS.branchInactive(closed.id) },
    });
    expect(backend.state.accounts[0].isActive).toBe(false);
    closed.isActive = true;
    backend.flags.branchCheckUnavailable = true;
    expect((await call('POST', `/api/auth/staff/${s.id}/activate`)).status).toBe(503);
  });

  it('deletes softly: gone from the list and the read, email stays taken, sessions revoked', async () => {
    const s = backend.addStaff({ email: 'bye@example.com' });
    expect((await call('DELETE', `/api/auth/staff/${s.id}`)).status).toBe(204);
    expect(backend.state.revocations[s.id]).toBe(1);
    expect((await call('GET', `/api/auth/staff/${s.id}`)).status).toBe(404);
    expect((await call('GET', '/api/auth/staff')).body.items).toEqual([]);
    const again = await call('POST', '/api/auth/staff', {
      body: newStaff({ email: 'bye@example.com' }),
    });
    expect(again.body.detail).toBe(STAFF_TEXTS.duplicateEmail);
  });

  it('answers 404 for an unknown, deleted or non-GUID id on each action', async () => {
    const gone = backend.addStaff({ deleted: true });
    for (const [method, suffix] of [
      ['POST', '/deactivate'],
      ['POST', '/activate'],
      ['DELETE', ''],
    ] as const) {
      for (const id of [GHOST, gone.id]) {
        expect(await call(method, `/api/auth/staff/${id}${suffix}`)).toMatchObject({
          status: 404,
          body: { detail: STAFF_TEXTS.notFound(id) },
        });
      }
      const bad = await call(method, `/api/auth/staff/nope${suffix}`);
      expect(bad.status).toBe(404);
      expect(bad.body).toBeUndefined();
    }
  });
});
