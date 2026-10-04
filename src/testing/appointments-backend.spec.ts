import { beforeEach, describe, expect, it } from 'vitest';
import { server } from './server';
import { ALREADY_STARTED_DETAIL, AppointmentsBackend, makeBranch } from './appointments-backend';
import { appointmentsHandlers } from './handlers/appointments.handlers';
import { BRANCH_ID, makeAppointment, resetMakeAppointment } from './make-appointment';

const NOW = Date.parse('2026-10-04T12:00:00Z');
const BASE = 'http://gw.test:5290';

describe('AppointmentsBackend', () => {
  let backend: AppointmentsBackend;

  beforeEach(() => {
    resetMakeAppointment();
    backend = new AppointmentsBackend();
    backend.now = () => NOW;
  });

  function ids(params: Parameters<AppointmentsBackend['list']>[0]): string[] {
    const r = backend.list(params);
    if (!r.ok) throw new Error(r.problem.detail);
    return r.body.items.map((a) => a.id);
  }

  it('upcoming is ascending with an id tie-break and past is descending', () => {
    const late = makeAppointment({ id: 'b', startUtc: '2026-10-06T10:00:00Z' });
    const tieB = makeAppointment({ id: 'z', startUtc: '2026-10-05T10:00:00Z' });
    const tieA = makeAppointment({ id: 'a', startUtc: '2026-10-05T10:00:00Z' });
    const old = makeAppointment({ id: 'o1', startUtc: '2026-10-01T10:00:00Z' });
    const older = makeAppointment({ id: 'o2', startUtc: '2026-09-01T10:00:00Z' });
    backend.add(late, tieB, old, tieA, older);
    expect(ids({ when: 'upcoming' })).toEqual(['a', 'z', 'b']);
    expect(ids({ when: 'past' })).toEqual(['o1', 'o2']);
    expect(ids({})).toEqual(['b', 'a', 'z', 'o1', 'o2']);
  });

  it('upcoming includes an appointment starting exactly now, past does not', () => {
    backend.add(makeAppointment({ id: 'n', startUtc: '2026-10-04T12:00:00Z' }));
    expect(ids({ when: 'upcoming' })).toEqual(['n']);
    expect(ids({ when: 'past' })).toEqual([]);
  });

  it('filters by status, case-insensitively', () => {
    backend.add(
      makeAppointment({ id: 'x', startUtc: '2026-10-06T10:00:00Z' }),
      makeAppointment({ id: 'y', startUtc: '2026-10-07T10:00:00Z', status: 'Cancelled' }),
    );
    expect(ids({ status: 'booked', when: 'UPCOMING' })).toEqual(['x']);
    expect(ids({ status: 'Cancelled' })).toEqual(['y']);
    expect(ids({ when: 'upcoming' })).toEqual(['x', 'y']);
  });

  it('defaults to page 1 of 20 and reports the total', () => {
    for (let i = 0; i < 25; i++) {
      backend.add(
        makeAppointment({ startUtc: `2026-11-${String(i + 1).padStart(2, '0')}T10:00:00Z` }),
      );
    }
    const first = backend.list({ when: 'upcoming' });
    expect(first.ok && first.body).toMatchObject({ page: 1, pageSize: 20, totalCount: 25 });
    expect(first.ok && first.body.items).toHaveLength(20);
    const second = backend.list({ when: 'upcoming', page: '2' });
    expect(second.ok && second.body.items).toHaveLength(5);
  });

  it('answers 200 with empty items beyond the last page', () => {
    backend.add(makeAppointment());
    const r = backend.list({ page: '9', pageSize: '5' });
    expect(r.ok && r.body).toMatchObject({ items: [], page: 9, pageSize: 5, totalCount: 1 });
  });

  it('hides other customers appointments', () => {
    backend.add(
      makeAppointment({ id: 'mine' }),
      makeAppointment({ id: 'theirs', customerId: 'other' }),
    );
    expect(ids({})).toEqual(['mine']);
    expect(backend.get('theirs')).toMatchObject({ ok: false, problem: { status: 404 } });
    expect(backend.cancel('theirs')).toMatchObject({ kind: 'problem', problem: { status: 404 } });
  });

  it.each([
    [{ status: 'Done' }, ['status']],
    [{ when: 'later' }, ['when']],
    [{ page: '0' }, ['page']],
    [{ page: 'x' }, ['page']],
    [{ pageSize: '101' }, ['pageSize']],
    [{ pageSize: '0' }, ['pageSize']],
    [{ status: 'x', when: 'y', page: '-1', pageSize: 'z' }, ['status', 'when', 'page', 'pageSize']],
  ])('400 names every invalid parameter: %j', (params, names) => {
    const r = backend.list(params);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problem.status).toBe(400);
    for (const n of names) expect(r.problem.detail).toContain(n);
    const all = ['status', 'when', 'page', 'pageSize'];
    for (const n of all.filter((x) => !names.includes(x))) {
      expect(r.problem.detail).not.toMatch(new RegExp(`(^|; )${n} `));
    }
  });

  it('get returns the appointment or a 404', () => {
    backend.add(makeAppointment({ id: 'g' }));
    expect(backend.get('g')).toMatchObject({ ok: true, body: { id: 'g' } });
    expect(backend.get('nope')).toMatchObject({ ok: false, problem: { status: 404 } });
  });

  describe('cancel', () => {
    it('cancels a future appointment and stamps it', () => {
      backend.add(makeAppointment({ id: 'c', startUtc: '2026-10-06T10:00:00Z' }));
      expect(backend.cancel('c')).toEqual({ kind: 'no-content' });
      const r = backend.get('c');
      expect(r.ok && r.body).toMatchObject({
        status: 'Cancelled',
        cancelledAtUtc: '2026-10-04T12:00:00.000Z',
      });
    });

    it('is idempotent', () => {
      backend.add(makeAppointment({ id: 'c', startUtc: '2026-10-06T10:00:00Z' }));
      expect(backend.cancel('c')).toEqual({ kind: 'no-content' });
      expect(backend.cancel('c')).toEqual({ kind: 'no-content' });
    });

    it('409 with the documented text once started', () => {
      backend.add(makeAppointment({ id: 's', startUtc: '2026-10-04T11:00:00Z' }));
      expect(backend.cancel('s')).toEqual({
        kind: 'problem',
        problem: { status: 409, detail: ALREADY_STARTED_DETAIL },
      });
      expect(backend.get('s')).toMatchObject({ ok: true, body: { status: 'Booked' } });
    });

    it('can be told to answer 409 with another text', () => {
      backend.add(makeAppointment({ id: 'c', startUtc: '2026-10-06T10:00:00Z' }));
      backend.forceCancelConflict = 'Something else.';
      expect(backend.cancel('c')).toMatchObject({
        problem: { status: 409, detail: 'Something else.' },
      });
    });

    it('503-after-cancel leaves the appointment Cancelled', () => {
      backend.add(makeAppointment({ id: 'c', startUtc: '2026-10-06T10:00:00Z' }));
      backend.failReleaseWith503 = true;
      expect(backend.cancel('c')).toMatchObject({ kind: 'problem', problem: { status: 503 } });
      expect(backend.get('c')).toMatchObject({ ok: true, body: { status: 'Cancelled' } });
    });
  });

  it('branches and services return only active items', () => {
    backend.branches.push(makeBranch({ id: 'b2', name: 'Leeds' }));
    backend.deactivateBranch(BRANCH_ID);
    expect(backend.activeBranches().map((b) => b.id)).toEqual(['b2']);
    backend.deactivateService(backend.services[0].id);
    expect(backend.activeServices()).toEqual([]);
  });
});

describe('appointmentsHandlers', () => {
  it('serves the model over HTTP, 400 problem body included', async () => {
    const backend = new AppointmentsBackend();
    backend.now = () => NOW;
    backend.add(makeAppointment({ id: 'h1', startUtc: '2026-10-06T10:00:00Z' }));
    server.use(...appointmentsHandlers(BASE, backend));

    const ok = await fetch(`${BASE}/api/appointments/my?when=upcoming&Status=Booked`);
    expect(ok.status).toBe(200);
    expect((await ok.json()).items).toHaveLength(1);

    const bad = await fetch(`${BASE}/api/appointments/my?page=0`);
    expect(bad.status).toBe(400);
    expect(bad.headers.get('content-type')).toContain('application/problem+json');
    expect(await bad.json()).toMatchObject({
      status: 400,
      detail: expect.stringContaining('page'),
    });

    expect((await fetch(`${BASE}/api/appointments/h1`)).status).toBe(200);
    expect((await fetch(`${BASE}/api/appointments/missing`)).status).toBe(404);
    expect((await fetch(`${BASE}/api/appointments/h1/cancel`, { method: 'POST' })).status).toBe(
      204,
    );
    expect((await fetch(`${BASE}/api/Branches`)).status).toBe(200);
    expect(await (await fetch(`${BASE}/api/services`)).json()).toHaveLength(1);
  });
});
