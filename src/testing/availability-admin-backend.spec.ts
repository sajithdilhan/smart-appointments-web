import { afterEach, beforeEach } from 'vitest';
import contract from './fixtures/availability-contract.json';
import {
  ADMIN_API_BASE,
  flags,
  handlers,
  reset,
  seedBranch,
  seedService,
  state,
  tokenFor,
  type Role,
} from './availability-admin-backend';
import { server } from './server';

const PREFIX = 'Invalid request data. Errors: ';
const GHOST = '0190a1b2-0000-7000-8000-0000000000ff';

interface Reply {
  status: number;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  headers: Headers;
}

async function call(
  method: string,
  path: string,
  options: { body?: unknown; role?: Role | null; headers?: Record<string, string> } = {},
): Promise<Reply> {
  const role = options.role === undefined ? 'Admin' : options.role;
  const headers: Record<string, string> = { ...options.headers };
  if (role) headers['Authorization'] = `Bearer ${tokenFor(role)}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${ADMIN_API_BASE}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined, headers: res.headers };
}

const branchBody = {
  code: 'pg',
  name: 'Peradeniya',
  description: null,
  address: '1 Hill Road',
  phoneNumber: '+14155550123',
};
const serviceBody = { code: 'cut', name: 'Cut', description: null, durationMinutes: 30 };
const week = (dayOfWeek: string, opensAt = '09:00', closesAt = '17:00') => ({
  dayOfWeek,
  opensAt,
  closesAt,
});
const names = (rows: { name: string }[]) => rows.map((r) => r.name);

beforeEach(() => {
  reset();
  server.use(...handlers);
});
afterEach(reset);

describe('availability admin backend', () => {
  describe('envelope and auth', () => {
    it('answers problem+json with the echoed correlation id', async () => {
      const res = await call('GET', `/api/Branches/${GHOST}`, {
        headers: { 'X-Correlation-ID': 'abc-123' },
      });
      expect(res.status).toBe(404);
      expect(res.headers.get('content-type')).toBe('application/problem+json');
      expect(res.headers.get('x-correlation-id')).toBe('abc-123');
      expect(res.body).toEqual({ status: 404, detail: `Branch '${GHOST}' was not found.` });
    });

    it('generates a correlation id when none is sent', async () => {
      const res = await call('GET', '/api/Branches');
      expect(res.headers.get('x-correlation-id')).toBeTruthy();
    });

    it('answers 401 without a token', async () => {
      expect((await call('GET', '/api/Branches', { role: null })).status).toBe(401);
    });

    it.each([
      ['POST', '/api/Branches', branchBody],
      ['PUT', `/api/Branches/${GHOST}`, branchBody],
      ['PUT', `/api/Branches/${GHOST}/schedule`, { timeZoneId: 'UTC', workingHours: [] }],
      ['POST', `/api/Branches/${GHOST}/activate`, undefined],
      ['POST', `/api/Branches/${GHOST}/deactivate`, undefined],
      ['POST', '/api/Services', serviceBody],
      ['PUT', `/api/Services/${GHOST}`, serviceBody],
      ['POST', `/api/Services/${GHOST}/activate`, undefined],
      ['POST', `/api/Services/${GHOST}/deactivate`, undefined],
      ['POST', '/api/Slots/generate', {}],
    ])('answers 403 to a Customer and to Staff on %s %s', async (method, path, body) => {
      for (const role of ['Customer', 'Staff'] as const) {
        const res = await call(method, path, { role, body });
        expect(res.status).toBe(403);
        expect(res.body.status).toBe(403);
      }
    });

    it('forced failures, 429 and network errors', async () => {
      flags.failNext = 503;
      expect((await call('GET', '/api/Branches')).status).toBe(503);
      expect((await call('GET', '/api/Branches')).status).toBe(200);
      flags.failAll = 502;
      expect((await call('GET', '/api/Branches')).status).toBe(502);
      expect((await call('GET', '/api/Services')).status).toBe(502);
      flags.failAll = null;
      flags.rateLimited = true;
      const limited = await call('GET', '/api/Branches');
      expect(limited.status).toBe(429);
      expect(limited.headers.get('retry-after')).toBe('60');
      flags.rateLimited = false;
      flags.networkError = true;
      await expect(call('GET', '/api/Branches')).rejects.toThrow();
    });

    it('records requests', async () => {
      await call('GET', '/api/Branches?includeInactive=true');
      expect(state.requests).toHaveLength(1);
      expect(state.requests[0]).toMatchObject({ method: 'GET', search: '?includeInactive=true' });
    });

    it('answers an empty 404 for a non-GUID id (the route constraint)', async () => {
      const res = await call('GET', '/api/Branches/not-a-guid');
      expect(res.status).toBe(404);
      expect(res.body).toBeUndefined();
    });
  });

  describe('branches', () => {
    it('creates with 201, Location, trimmed fields and an upper-cased code', async () => {
      const res = await call('POST', '/api/Branches', {
        body: { ...branchBody, code: ' pg ', name: '  Peradeniya ', description: '   ' },
      });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        code: 'PG',
        name: 'Peradeniya',
        description: null,
        isActive: true,
        timeZoneId: null,
        workingHours: [],
      });
      expect(res.headers.get('location')).toBe(`${ADMIN_API_BASE}/api/Branches/${res.body.id}`);
      expect(state.branches).toHaveLength(1);
    });

    it('answers 409 for a duplicate code, whatever its case', async () => {
      await call('POST', '/api/Branches', { body: branchBody });
      const res = await call('POST', '/api/Branches', { body: { ...branchBody, code: ' Pg' } });
      expect(res.status).toBe(409);
      expect(res.body.detail).toBe("A branch with code 'PG' already exists.");
    });

    it('joins every failing rule message with a bare comma', async () => {
      const res = await call('POST', '/api/Branches', {
        body: {
          code: '-AB',
          name: '',
          description: 'x'.repeat(501),
          address: '',
          phoneNumber: '0123',
        },
      });
      expect(res.status).toBe(400);
      expect(res.body.detail).toBe(
        PREFIX +
          [
            'Code must be 2-10 letters, digits or hyphens, and cannot start or end with a hyphen.',
            'Name is required.',
            'Description cannot exceed 500 characters.',
            'Address is required.',
            'Invalid phone number format.',
          ].join(','),
      );
    });

    it.each(contract.patterns.branchCode.vectors)('branch code vector %j', async (v) => {
      const res = await call('POST', '/api/Branches', { body: { ...branchBody, code: v.input } });
      expect(res.status === 201).toBe(v.valid);
    });

    it.each(contract.patterns.phone.vectors)('phone vector %j', async (v) => {
      const res = await call('POST', '/api/Branches', {
        body: { ...branchBody, phoneNumber: v.input },
      });
      expect(res.status === 201).toBe(v.valid);
    });

    it('applies the length limits', async () => {
      const ok = await call('POST', '/api/Branches', {
        body: {
          ...branchBody,
          name: 'n'.repeat(100),
          address: 'a'.repeat(200),
          description: 'd'.repeat(500),
        },
      });
      expect(ok.status).toBe(201);
      const tooLong = await call('POST', '/api/Branches', {
        body: { ...branchBody, code: 'XY', name: 'n'.repeat(101), address: 'a'.repeat(201) },
      });
      expect(tooLong.body.detail).toBe(
        `${PREFIX}Name cannot exceed 100 characters.,Address cannot exceed 200 characters.`,
      );
    });

    it('reports a missing code once (the pattern is not also reported)', async () => {
      const res = await call('POST', '/api/Branches', { body: { ...branchBody, code: '' } });
      expect(res.body.detail).toBe(`${PREFIX}Code is required.`);
    });

    it('lists active branches by name; includeInactive is honoured for an Admin only', async () => {
      seedBranch({ name: 'Zeta', code: 'ZZ' });
      seedBranch({ name: 'Alpha', code: 'AA' });
      seedBranch({ name: 'Mid', code: 'MM', isActive: false });
      expect(names((await call('GET', '/api/Branches')).body)).toEqual(['Alpha', 'Zeta']);
      const all = await call('GET', '/api/Branches?includeInactive=true');
      expect(names(all.body)).toEqual(['Alpha', 'Mid', 'Zeta']);
      for (const role of ['Customer', 'Staff'] as const) {
        const res = await call('GET', '/api/Branches?includeInactive=true', { role });
        expect(res.body).toHaveLength(2);
      }
    });

    it('hides an inactive branch from non-admins with the same 404', async () => {
      const branch = seedBranch({ isActive: false });
      expect((await call('GET', `/api/Branches/${branch.id}`)).status).toBe(200);
      const res = await call('GET', `/api/Branches/${branch.id}`, { role: 'Customer' });
      expect(res.status).toBe(404);
      expect(res.body.detail).toBe(`Branch '${branch.id}' was not found.`);
    });

    it('updates details, keeps the code, and answers 404 or 400', async () => {
      const branch = seedBranch({ code: 'KEEP' });
      const body = { name: ' New ', description: 'd', address: 'A', phoneNumber: '+14155550000' };
      const res = await call('PUT', `/api/Branches/${branch.id}`, { body });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ code: 'KEEP', name: 'New', description: 'd' });
      expect((await call('PUT', `/api/Branches/${GHOST}`, { body })).status).toBe(404);
      const bad = await call('PUT', `/api/Branches/${branch.id}`, { body: { ...body, name: '' } });
      expect(bad.body.detail).toBe(`${PREFIX}Name is required.`);
    });

    it('activates and deactivates idempotently with 204, and 404 for an unknown id', async () => {
      const branch = seedBranch();
      for (let i = 0; i < 2; i++) {
        expect((await call('POST', `/api/Branches/${branch.id}/deactivate`)).status).toBe(204);
        expect(branch.isActive).toBe(false);
      }
      for (let i = 0; i < 2; i++) {
        expect((await call('POST', `/api/Branches/${branch.id}/activate`)).status).toBe(204);
        expect(branch.isActive).toBe(true);
      }
      expect((await call('POST', `/api/Branches/${GHOST}/activate`)).status).toBe(404);
    });
  });

  describe('schedule', () => {
    const schedule = (workingHours: unknown[], timeZoneId = 'Asia/Colombo') => ({
      timeZoneId,
      workingHours,
    });

    it('replaces the schedule and returns the branch Monday first', async () => {
      const branch = seedBranch();
      const res = await call('PUT', `/api/Branches/${branch.id}/schedule`, {
        body: schedule([week('Sunday'), week('Friday'), week('Monday', '08:30', '12:00')]),
      });
      expect(res.status).toBe(200);
      expect(res.body.timeZoneId).toBe('Asia/Colombo');
      expect(res.body.workingHours.map((h: { dayOfWeek: string }) => h.dayOfWeek)).toEqual([
        'Monday',
        'Friday',
        'Sunday',
      ]);
      expect(branch.workingHours).toHaveLength(3);
    });

    it('accepts an empty list, which closes every day', async () => {
      const branch = seedBranch({ timeZoneId: 'UTC', workingHours: [week('Monday')] as never });
      const res = await call('PUT', `/api/Branches/${branch.id}/schedule`, {
        body: schedule([], 'UTC'),
      });
      expect(res.status).toBe(200);
      expect(res.body.workingHours).toEqual([]);
    });

    it('rejects an unknown time zone, a missing list and a repeated day', async () => {
      const branch = seedBranch();
      const url = `/api/Branches/${branch.id}/schedule`;
      const zone = await call('PUT', url, { body: schedule([], 'Mars/Olympus') });
      expect(zone.body.detail).toBe(
        `${PREFIX}Time zone must be an IANA time zone identifier, such as 'Asia/Colombo'.`,
      );
      const missing = await call('PUT', url, { body: { timeZoneId: 'UTC' } });
      expect(missing.body.detail).toBe(
        `${PREFIX}Working hours are required; use an empty list to close every day.`,
      );
      const twice = await call('PUT', url, { body: schedule([week('Monday'), week('Monday')]) });
      expect(twice.body.detail).toBe(`${PREFIX}A day of the week can be listed only once.`);
    });

    it.each(contract.patterns.time.vectors)('opening time vector %j', async (v) => {
      const branch = seedBranch();
      const res = await call('PUT', `/api/Branches/${branch.id}/schedule`, {
        body: schedule([week('Monday', v.input, '23:59')]),
      });
      // "23:59" opens equal to closes, which is the order rule, not the format rule.
      expect(res.status === 200).toBe(v.valid && v.input < '23:59');
    });

    it('rejects opens >= closes and a bad day, and 404s an unknown branch', async () => {
      const branch = seedBranch();
      const url = `/api/Branches/${branch.id}/schedule`;
      const equal = await call('PUT', url, { body: schedule([week('Monday', '09:00', '09:00')]) });
      expect(equal.body.detail).toBe(`${PREFIX}Opening time must be before closing time.`);
      const day = await call('PUT', url, { body: schedule([week('Funday')]) });
      expect(day.body.detail).toBe(`${PREFIX}Day of week is not valid.`);
      const none = await call('PUT', `/api/Branches/${GHOST}/schedule`, { body: schedule([]) });
      expect(none.status).toBe(404);
    });
  });

  describe('services', () => {
    it('creates with 201, normalises the code and answers 409 for a duplicate', async () => {
      const res = await call('POST', '/api/Services', {
        body: { ...serviceBody, code: ' cut_1 ' },
      });
      expect(res.status).toBe(201);
      expect(res.body.code).toBe('CUT_1');
      expect(res.headers.get('location')).toBe(`${ADMIN_API_BASE}/api/Services/${res.body.id}`);
      const dup = await call('POST', '/api/Services', { body: { ...serviceBody, code: 'cut_1' } });
      expect(dup.status).toBe(409);
      expect(dup.body.detail).toBe("A service type with code 'CUT_1' already exists.");
    });

    it.each(contract.patterns.serviceCode.vectors)('service code vector %j', async (v) => {
      const res = await call('POST', '/api/Services', { body: { ...serviceBody, code: v.input } });
      expect(res.status === 201).toBe(v.valid);
    });

    it.each([
      [4, 'Duration must be between 5 and 480 minutes.,Duration must be a multiple of 5 minutes.'],
      [5, null],
      [7, 'Duration must be a multiple of 5 minutes.'],
      [480, null],
      [485, 'Duration must be between 5 and 480 minutes.'],
    ])('duration %d', async (durationMinutes, error) => {
      const res = await call('POST', '/api/Services', {
        body: { ...serviceBody, durationMinutes },
      });
      if (error === null) expect(res.status).toBe(201);
      else expect(res.body.detail).toBe(PREFIX + error);
    });

    it('lists, hides inactive from non-admins, updates and toggles', async () => {
      const a = seedService({ name: 'B' });
      const b = seedService({ name: 'A', isActive: false });
      const all = await call('GET', '/api/Services?includeInactive=true');
      expect(names(all.body)).toEqual(['A', 'B']);
      const customer = await call('GET', '/api/Services?includeInactive=true', {
        role: 'Customer',
      });
      expect(customer.body).toHaveLength(1);
      expect((await call('GET', `/api/Services/${b.id}`, { role: 'Customer' })).status).toBe(404);
      const upd = await call('PUT', `/api/Services/${a.id}`, {
        body: { name: 'C', description: null, durationMinutes: 45 },
      });
      expect(upd.body).toMatchObject({ name: 'C', durationMinutes: 45, code: a.code });
      expect((await call('POST', `/api/Services/${a.id}/deactivate`)).status).toBe(204);
      expect(a.isActive).toBe(false);
      expect((await call('POST', `/api/Services/${GHOST}/deactivate`)).status).toBe(404);
      const missing = await call('PUT', `/api/Services/${GHOST}`, {
        body: { name: 'C', description: null, durationMinutes: 45 },
      });
      expect(missing.status).toBe(404);
    });
  });

  describe('slot generation', () => {
    function ready() {
      state.nowMs = Date.UTC(2026, 9, 5, 0, 0); // Monday 2026-10-05 00:00 UTC
      const branch = seedBranch({
        timeZoneId: 'UTC',
        workingHours: [
          week('Monday', '09:00', '11:00'),
          week('Tuesday', '09:00', '10:30'),
        ] as never,
      });
      const service = seedService({ durationMinutes: 30 });
      return { branch, service };
    }
    const body = (branchId: string, serviceTypeId: string, extra = {}) => ({
      branchId,
      serviceTypeId,
      fromDate: '2026-10-05',
      toDate: '2026-10-06',
      capacity: 2,
      ...extra,
    });

    it('creates slots from the schedule and skips overlaps on a repeat', async () => {
      const { branch, service } = ready();
      const send = () => call('POST', '/api/Slots/generate', { body: body(branch.id, service.id) });
      const first = await send();
      expect(first.status).toBe(200);
      expect(first.body).toEqual({ createdCount: 7, skippedCount: 0 });
      expect((await send()).body).toEqual({ createdCount: 0, skippedCount: 7 });
    });

    it('drops slots that have already started without counting them', async () => {
      const { branch, service } = ready();
      state.nowMs = Date.UTC(2026, 9, 5, 9, 45); // the 09:00 and 09:30 starts are past
      const res = await call('POST', '/api/Slots/generate', {
        body: body(branch.id, service.id, { toDate: '2026-10-05' }),
      });
      expect(res.body).toEqual({ createdCount: 2, skippedCount: 0 }); // 10:00 and 10:30
    });

    it('answers the four 409 conditions', async () => {
      const { branch, service } = ready();
      const send = () => call('POST', '/api/Slots/generate', { body: body(branch.id, service.id) });
      flags.concurrentGeneration = true;
      expect((await send()).body.detail).toBe(
        'Slots for this branch and service type were generated by a concurrent request. Try again.',
      );
      flags.concurrentGeneration = false;
      service.isActive = false;
      expect((await send()).body.detail).toBe(`Service type '${service.code}' is inactive.`);
      service.isActive = true;
      branch.isActive = false;
      expect((await send()).body.detail).toBe(`Branch '${branch.code}' is inactive.`);
      branch.isActive = true;
      branch.workingHours = [];
      const none = await send();
      expect(none.status).toBe(409);
      expect(none.body.detail).toBe(`Branch '${branch.code}' has no working hours.`);
      branch.workingHours = [week('Monday')] as never;
      branch.timeZoneId = null;
      expect((await send()).body.detail).toBe(`Branch '${branch.code}' has no working hours.`);
    });

    it('answers 404 for an unknown branch or service', async () => {
      const { branch, service } = ready();
      const noBranch = await call('POST', '/api/Slots/generate', { body: body(GHOST, service.id) });
      expect(noBranch.status).toBe(404);
      expect(noBranch.body.detail).toBe(`Branch '${GHOST}' was not found.`);
      const noService = await call('POST', '/api/Slots/generate', {
        body: body(branch.id, GHOST),
      });
      expect(noService.body.detail).toBe(`Service type '${GHOST}' was not found.`);
    });

    it('validates order, span (30 vs 31 days) and capacity', async () => {
      const { branch, service } = ready();
      const send = (extra: object) =>
        call('POST', '/api/Slots/generate', { body: body(branch.id, service.id, extra) });
      expect((await send({ fromDate: '2026-10-06', toDate: '2026-10-05' })).body.detail).toBe(
        `${PREFIX}From date cannot be after to date.`,
      );
      expect((await send({ toDate: '2026-11-04' })).status).toBe(200); // 30 days apart
      const span = await send({ toDate: '2026-11-05' }); // 31 days apart
      expect(span.body.detail).toBe(`${PREFIX}The date range cannot span more than 31 days.`);
      for (const capacity of [0, 101]) {
        expect((await send({ capacity })).body.detail).toBe(
          `${PREFIX}Capacity must be between 1 and 100.`,
        );
      }
      for (const capacity of [1, 100]) expect((await send({ capacity })).status).toBe(200);
    });

    it('requires both ids', async () => {
      const res = await call('POST', '/api/Slots/generate', {
        body: { fromDate: '2026-10-05', toDate: '2026-10-05', capacity: 1 },
      });
      expect(res.body.detail).toBe(`${PREFIX}Branch id is required.,Service type id is required.`);
    });

    it('answers 404 for an unknown slots path and 405 for a wrong method', async () => {
      expect((await call('POST', '/api/Slots/other', { body: {} })).status).toBe(404);
      expect((await call('GET', '/api/Slots/generate')).status).toBe(405);
    });
  });
});
