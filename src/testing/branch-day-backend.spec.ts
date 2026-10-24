import { beforeEach, describe, expect, it } from 'vitest';
import type { Role } from '../app/core/auth/session.model';
import {
  BRANCH_DAY_API_BASE,
  BRANCH_DAY_TEXTS,
  createBranchDayBackend,
} from './branch-day-backend';
import { BRANCH_ID, CUSTOMER_ID, resetMakeAppointment } from './make-appointment';
import { makeAccessToken } from './make-access-token';
import { server } from './server';

const OTHER_BRANCH = '00000000-0000-4000-8000-0000000000b2';
const GHOST = '00000000-0000-4000-8000-00000000ffff';
// Saturday 24 October 2026, 09:00 UTC (10:00 in London: BST lasts until 01:00 UTC on the 25th).
const NOW = Date.parse('2026-10-24T09:00:00Z');

interface Reply {
  status: number;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  headers: Headers;
}

const backend = createBranchDayBackend();

function token(role: Role, branchId?: string): string {
  return makeAccessToken({
    sub: CUSTOMER_ID,
    email: 'x@example.com',
    role,
    expiresInSeconds: 600,
    branchId,
  });
}

async function call(
  method: string,
  path: string,
  options: { role?: Role | null; branchId?: string; headers?: Record<string, string> } = {},
): Promise<Reply> {
  const role = options.role === undefined ? 'Staff' : options.role;
  const branchId = options.branchId === undefined ? BRANCH_ID : options.branchId;
  const headers: Record<string, string> = { ...options.headers };
  if (role) {
    headers['Authorization'] = `Bearer ${token(role, role === 'Staff' ? branchId : undefined)}`;
  }
  const res = await fetch(`${BRANCH_DAY_API_BASE}${path}`, { method, headers });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined, headers: res.headers };
}

const day = (query = '', branch = BRANCH_ID) => `/api/appointments/branch/${branch}${query}`;
const ids = (r: Reply) => r.body.items.map((i: { id: string }) => i.id);

beforeEach(() => {
  resetMakeAppointment();
  backend.reset();
  backend.setNow(NOW);
  server.use(...backend.handlers);
});

describe('branch day list', () => {
  it('returns the branch-local day, soonest first, with customers and a total', async () => {
    backend.addCustomer('c-ana', {
      firstName: 'Ana',
      lastName: 'Perera',
      phoneNumber: '+94771234567',
    });
    // London on 24 October 2026 is [2026-10-23T23:00Z, 2026-10-24T23:00Z).
    backend.addAppointment({ id: 'd', customerId: 'c-ana', startUtc: '2026-10-24T10:00:00Z' });
    backend.addAppointment({ id: 'b', customerId: 'c-ana', startUtc: '2026-10-24T08:00:00Z' });
    backend.addAppointment({ id: 'a', customerId: 'c-ana', startUtc: '2026-10-23T22:59:00Z' });
    backend.addAppointment({ id: 'e', customerId: 'c-ana', startUtc: '2026-10-24T22:59:00Z' });
    backend.addAppointment({ id: 'f', customerId: 'c-ana', startUtc: '2026-10-24T23:00:00Z' });
    const r = await call('GET', day('?date=2026-10-24'));
    expect(r.status).toBe(200);
    expect(ids(r)).toEqual(['b', 'd', 'e']);
    expect(r.body).toMatchObject({
      page: 1,
      pageSize: 20,
      totalCount: 3,
      customersUnavailable: false,
    });
    expect(r.body.items[0].customer).toEqual({
      firstName: 'Ana',
      lastName: 'Perera',
      phoneNumber: '+94771234567',
    });
    expect(r.body.items[0]).toMatchObject({ completedAtUtc: null, noShowAtUtc: null });
  });

  it('breaks start-time ties by id', async () => {
    backend.addAppointment({ id: 'z', startUtc: '2026-10-24T10:00:00Z' });
    backend.addAppointment({ id: 'a', startUtc: '2026-10-24T10:00:00Z' });
    expect(ids(await call('GET', day('?date=2026-10-24')))).toEqual(['a', 'z']);
  });

  it('defaults the date to today in the branch zone', async () => {
    backend.addAppointment({ id: 'today', startUtc: '2026-10-25T10:00:00Z' });
    backend.addAppointment({ id: 'yesterday', startUtc: '2026-10-24T10:00:00Z' });
    // 23:30 UTC on the 24th is 00:30 on the 25th in London.
    backend.setNow(Date.parse('2026-10-24T23:30:00Z'));
    expect(ids(await call('GET', day()))).toEqual(['today']);
  });

  it('uses UTC for a branch without a zone', async () => {
    const utcBranch = backend.addBranch({ timeZoneId: null });
    backend.addAppointment({ id: 'in', branchId: utcBranch.id, startUtc: '2026-10-24T23:30:00Z' });
    backend.addAppointment({
      id: 'out',
      branchId: utcBranch.id,
      startUtc: '2026-10-25T00:00:00Z',
    });
    const r = await call('GET', day('?date=2026-10-24', utcBranch.id), { role: 'Admin' });
    expect(ids(r)).toEqual(['in']);
  });

  it('makes the day the clocks go back 25 hours long (London, 25 October 2026)', async () => {
    backend.addAppointment({ id: 'first', startUtc: '2026-10-24T23:00:00Z' });
    backend.addAppointment({ id: 'last', startUtc: '2026-10-25T23:59:00Z' });
    backend.addAppointment({ id: 'next', startUtc: '2026-10-26T00:00:00Z' });
    expect(ids(await call('GET', day('?date=2026-10-25')))).toEqual(['first', 'last']);
  });

  it('filters by status case-insensitively', async () => {
    backend.addAppointment({ id: 'b', startUtc: '2026-10-24T08:00:00Z' });
    backend.addAppointment({ id: 'c', startUtc: '2026-10-24T09:00:00Z', status: 'Cancelled' });
    backend.addAppointment({ id: 'n', startUtc: '2026-10-24T10:00:00Z', status: 'NoShow' });
    expect(ids(await call('GET', day('?date=2026-10-24&status=noshow')))).toEqual(['n']);
    expect(ids(await call('GET', day('?date=2026-10-24&status=Booked')))).toEqual(['b']);
    expect(ids(await call('GET', day('?date=2026-10-24')))).toEqual(['b', 'c', 'n']);
  });

  it('pages with a default of 20 and a maximum of 100; totalCount counts the whole day', async () => {
    for (let i = 0; i < 25; i++) {
      backend.addAppointment({
        id: `a${String(i).padStart(2, '0')}`,
        startUtc: `2026-10-24T10:${String(i).padStart(2, '0')}:00Z`,
      });
    }
    const first = await call('GET', day('?date=2026-10-24'));
    expect(first.body).toMatchObject({ page: 1, pageSize: 20, totalCount: 25 });
    expect(first.body.items).toHaveLength(20);
    const second = await call('GET', day('?date=2026-10-24&page=2'));
    expect(ids(second)).toEqual(['a20', 'a21', 'a22', 'a23', 'a24']);
    const small = await call('GET', day('?date=2026-10-24&pageSize=5&page=2'));
    expect(small.body).toMatchObject({ page: 2, pageSize: 5 });
    expect(ids(small)).toEqual(['a05', 'a06', 'a07', 'a08', 'a09']);
    const past = await call('GET', day('?date=2026-10-24&page=99'));
    expect(past.body.items).toEqual([]);
    expect(past.body.totalCount).toBe(25);
    const max = await call('GET', day('?date=2026-10-24&pageSize=100'));
    expect(max.body.items).toHaveLength(25);
  });

  it('answers customer: null for an unknown customer without flagging the page', async () => {
    backend.addAppointment({ id: 'x', customerId: 'unknown', startUtc: '2026-10-24T08:00:00Z' });
    const r = await call('GET', day('?date=2026-10-24'));
    expect(r.body.items[0].customer).toBeNull();
    expect(r.body.customersUnavailable).toBe(false);
  });

  it('flags customersUnavailable and nulls every customer when Auth is down', async () => {
    backend.addCustomer('c-ana');
    backend.addAppointment({ id: 'x', customerId: 'c-ana', startUtc: '2026-10-24T08:00:00Z' });
    backend.flags.customersUnavailable = true;
    const r = await call('GET', day('?date=2026-10-24'));
    expect(r.status).toBe(200);
    expect(r.body.customersUnavailable).toBe(true);
    expect(r.body.items[0].customer).toBeNull();
    // An empty day never asks Auth, so it is not flagged.
    const empty = await call('GET', day('?date=2026-10-20'));
    expect(empty.body).toMatchObject({ items: [], customersUnavailable: false });
  });

  it('lists every validation failure in one 400, an empty value counting as invalid', async () => {
    const r = await call('GET', day('?date=2026-13-40&status=Gone&page=0&pageSize=101'));
    expect(r.status).toBe(400);
    expect(r.headers.get('content-type')).toContain('application/problem+json');
    expect(r.body).toEqual({
      status: 400,
      detail:
        BRANCH_DAY_TEXTS.validationPrefix +
        [
          BRANCH_DAY_TEXTS.invalidDate,
          BRANCH_DAY_TEXTS.invalidStatus,
          BRANCH_DAY_TEXTS.invalidPage,
          BRANCH_DAY_TEXTS.invalidPageSize,
        ].join(','),
    });
    for (const q of [
      'date=',
      'status=',
      'page=',
      'pageSize=',
      'page=1.5',
      'page=-1',
      'date=2026-1-5',
    ]) {
      expect((await call('GET', day(`?${q}`))).status, q).toBe(400);
    }
  });

  it('is 403 for a Staff token of another branch (or without a claim) and 200 for Admin', async () => {
    const other = await call('GET', day('?date=2026-10-24', OTHER_BRANCH));
    expect(other).toMatchObject({
      status: 403,
      body: { status: 403, detail: BRANCH_DAY_TEXTS.otherBranch },
    });
    const elsewhere = await call('GET', day('?date=2026-10-24'), { branchId: OTHER_BRANCH });
    expect(elsewhere.status).toBe(403);
    const unlinked = await call('GET', day('?date=2026-10-24'), { branchId: '' });
    expect(unlinked.status).toBe(403);
    const admin = await call('GET', day('?date=2026-10-24'), { role: 'Admin' });
    expect(admin.status).toBe(200);
  });

  it('is 403 for a Customer and 401 without a token', async () => {
    expect((await call('GET', day(), { role: 'Customer' })).status).toBe(403);
    expect((await call('GET', day(), { role: null })).status).toBe(401);
  });

  it('answers 503 while the zone is unavailable and 404 for an unknown branch', async () => {
    backend.flags.zoneUnavailable = true;
    expect(await call('GET', day('?date=2026-10-24'))).toMatchObject({
      status: 503,
      body: { status: 503, detail: BRANCH_DAY_TEXTS.unavailable },
    });
    backend.flags.zoneUnavailable = false;
    const unknown = await call('GET', day('?date=2026-10-24', GHOST), { role: 'Admin' });
    expect(unknown.status).toBe(404);
  });

  it('echoes the correlation id and records the request', async () => {
    const r = await call('GET', day('?date=2026-10-24'), {
      headers: { 'X-Correlation-ID': 'abc-1' },
    });
    expect(r.headers.get('x-correlation-id')).toBe('abc-1');
    expect(backend.state.requests.at(-1)).toMatchObject({
      method: 'GET',
      search: '?date=2026-10-24',
    });
  });

  it('can fail like an outage: one 5xx, a rate limit, a network error', async () => {
    backend.flags.failNext = 500;
    expect((await call('GET', day())).status).toBe(500);
    expect((await call('GET', day())).status).toBe(200);
    backend.flags.rateLimited = true;
    const limited = await call('GET', day());
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('60');
    backend.flags.rateLimited = false;
    backend.flags.networkError = true;
    await expect(call('GET', day())).rejects.toThrow();
  });
});

describe('marks', () => {
  const started = '2026-10-24T08:00:00Z'; // before NOW
  const future = '2026-10-24T15:00:00Z';
  const mark = (id: string, kind: 'complete' | 'no-show', options = {}) =>
    call('POST', `/api/appointments/${id}/${kind}`, options);

  it('completes a started Booked appointment and stamps it', async () => {
    const { id } = backend.addAppointment({ startUtc: started });
    const r = await mark(id, 'complete');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      id,
      status: 'Completed',
      completedAtUtc: new Date(NOW).toISOString(),
      updatedAtUtc: new Date(NOW).toISOString(),
    });
    expect(backend.state.appointments[0].status).toBe('Completed');
    const listed = await call('GET', day('?date=2026-10-24&status=Completed'));
    expect(ids(listed)).toEqual([id]);
  });

  it('records a no-show with its own stamp', async () => {
    const { id } = backend.addAppointment({ startUtc: started });
    const r = await mark(id, 'no-show');
    expect(r.body).toMatchObject({ status: 'NoShow', noShowAtUtc: new Date(NOW).toISOString() });
  });

  it('is 409 before the start, and allowed from the start instant on', async () => {
    const { id } = backend.addAppointment({ startUtc: future });
    const early = await mark(id, 'complete');
    expect(early).toMatchObject({
      status: 409,
      body: { status: 409, detail: BRANCH_DAY_TEXTS.notStarted },
    });
    backend.setNow(Date.parse(future));
    expect((await mark(id, 'complete')).status).toBe(200);
  });

  it('answers a repeat of the same outcome with 200 and changes nothing', async () => {
    const { id } = backend.addAppointment({ startUtc: started });
    await mark(id, 'complete');
    backend.advance(60_000);
    const again = await mark(id, 'complete');
    expect(again.status).toBe(200);
    expect(again.body.completedAtUtc).toBe(new Date(NOW).toISOString());
  });

  it('is 409 from another status, naming both', async () => {
    const done = backend.addAppointment({ startUtc: started });
    await mark(done.id, 'complete');
    expect(await mark(done.id, 'no-show')).toMatchObject({
      status: 409,
      body: { detail: BRANCH_DAY_TEXTS.notMarkable('Completed', 'NoShow') },
    });
    const cancelled = backend.addAppointment({ startUtc: started, status: 'Cancelled' });
    expect(await mark(cancelled.id, 'complete')).toMatchObject({
      status: 409,
      body: { detail: BRANCH_DAY_TEXTS.notMarkable('Cancelled', 'Completed') },
    });
  });

  it('is 404 for an unknown id and for another branch (Staff), 200 for Admin', async () => {
    const { id } = backend.addAppointment({ startUtc: started });
    expect(await mark(GHOST, 'complete')).toMatchObject({
      status: 404,
      body: { status: 404, detail: BRANCH_DAY_TEXTS.notFound(GHOST) },
    });
    expect((await mark(id, 'complete', { branchId: OTHER_BRANCH })).status).toBe(404);
    expect((await mark(id, 'complete', { branchId: '' })).status).toBe(404);
    expect((await mark(id, 'complete', { role: 'Admin' })).status).toBe(200);
  });

  it('is 403 for a Customer, 401 without a token and an empty 404 for a non-GUID id', async () => {
    const { id } = backend.addAppointment({ startUtc: started });
    expect((await mark(id, 'complete', { role: 'Customer' })).status).toBe(403);
    expect((await mark(id, 'complete', { role: null })).status).toBe(401);
    expect(backend.state.appointments[0].status).toBe('Booked');
    const bad = await call('POST', '/api/appointments/not-a-guid/complete');
    expect(bad.status).toBe(404);
    expect(bad.body).toBeUndefined();
  });

  it('never needs an Idempotency-Key', async () => {
    const { id } = backend.addAppointment({ startUtc: started });
    await mark(id, 'complete');
    const last = backend.state.requests.at(-1)!;
    expect(last.headers.get('idempotency-key')).toBeNull();
  });
});

describe('branch and service reads for staff', () => {
  it('serves one branch in either casing; an unknown or inactive one is 404 (Admin sees inactive)', async () => {
    expect(await call('GET', `/api/Branches/${BRANCH_ID}`)).toMatchObject({
      status: 200,
      body: { id: BRANCH_ID, name: 'London Central', timeZoneId: 'Europe/London' },
    });
    expect((await call('GET', `/api/branches/${BRANCH_ID}`)).status).toBe(200);
    expect(await call('GET', `/api/branches/${GHOST}`)).toMatchObject({
      status: 404,
      body: { detail: BRANCH_DAY_TEXTS.branchNotFound(GHOST) },
    });
    const closed = backend.addBranch({ isActive: false });
    expect((await call('GET', `/api/branches/${closed.id}`)).status).toBe(404);
    expect((await call('GET', `/api/branches/${closed.id}`, { role: 'Admin' })).status).toBe(200);
  });

  it('lists active services for Staff and all of them for Admin', async () => {
    backend.addService({ name: 'Old', isActive: false });
    const staff = await call('GET', '/api/Services');
    expect(staff.status).toBe(200);
    expect(staff.body.map((s: { name: string }) => s.name)).toEqual(['Health check']);
    const admin = await call('GET', '/api/services', { role: 'Admin' });
    expect(admin.body).toHaveLength(2);
  });

  it('needs a token', async () => {
    expect((await call('GET', '/api/services', { role: null })).status).toBe(401);
  });
});
