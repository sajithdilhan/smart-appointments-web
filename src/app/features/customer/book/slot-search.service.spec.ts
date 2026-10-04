import { TestBed } from '@angular/core/testing';
import { http, HttpResponse } from 'msw';
import type { SlotResponse } from '../../../core/api/models';
import { APP_CONFIG } from '../../../core/config/app-config';
import { provideCoreHttp } from '../../../core/http/http.providers';
import { OutageState } from '../../../core/http/outage-state';
import { CLOCK } from '../../../core/util/clock';
import { availabilityHandlers } from '../../../../testing/availability.handlers';
import { BRANCH_IDS, SERVICE_IDS, createBookingBackend } from '../../../../testing/booking-backend';
import { ManualClock } from '../../../../testing/manual-clock';
import {
  createFakeSession,
  createFakeToast,
  provideFakeSession,
} from '../../../../testing/fake-session';
import { server } from '../../../../testing/server';
import { SlotSearchService, normaliseSlots, sameSlots } from './slot-search.service';
import type { SlotKey } from './slot-cache';

const BASE = 'http://gw.test:5290';
const NOW = Date.UTC(2026, 9, 4, 10, 0, 0);
const key = (
  date: string,
  branchId = BRANCH_IDS.london,
  serviceId = SERVICE_IDS.checkup,
): SlotKey => ({
  branchId,
  serviceId,
  date,
});

function setup() {
  const backend = createBookingBackend({ nowMs: NOW });
  const clock = new ManualClock(NOW);
  const toast = createFakeToast();
  server.use(...availabilityHandlers(backend, BASE));
  TestBed.configureTestingModule({
    providers: [
      provideCoreHttp(),
      SlotSearchService,
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      { provide: CLOCK, useValue: clock },
      ...provideFakeSession(createFakeSession('authenticated', 'Customer'), toast),
    ],
  });
  return { backend, clock, toast, service: TestBed.inject(SlotSearchService) };
}

function slotsFrom(state: ReturnType<SlotSearchService['state']>): SlotResponse[] {
  if (state.status !== 'ready') throw new Error(`state is ${state.status}`);
  return state.slots;
}

describe('SlotSearchService', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('debounces: no request before 250 ms, one at 250 ms', async () => {
    const { backend, service } = setup();
    service.load(key('2026-10-05'));
    expect(service.state().status).toBe('loading');
    await vi.advanceTimersByTimeAsync(249);
    expect(backend.state.counters.search).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(service.state().status).toBe('ready'));
    expect(backend.state.counters.search).toBe(1);
    expect(slotsFrom(service.state()).length).toBeGreaterThan(0);
  });

  it('sends one request for a burst of date changes (only the last settles)', async () => {
    const { backend, service } = setup();
    for (const d of ['2026-10-05', '2026-10-06', '2026-10-07']) {
      service.load(key(d));
      await vi.advanceTimersByTimeAsync(100);
    }
    await vi.advanceTimersByTimeAsync(300);
    await vi.waitFor(() => expect(service.state().status).toBe('ready'));
    expect(backend.state.counters.search).toBe(1);
    expect(slotsFrom(service.state())[0].date).toBe('2026-10-07');
  });

  it('aborts a superseded request and ignores its result', async () => {
    const { service } = setup();
    const aborted: string[] = [];
    const gates = new Map<string, () => void>();
    server.use(
      http.get(`${BASE}/api/Slots/available`, async ({ request }) => {
        const date = new URL(request.url).searchParams.get('date')!;
        request.signal.addEventListener('abort', () => aborted.push(date));
        await new Promise<void>((resolve) => gates.set(date, resolve));
        return HttpResponse.json([]);
      }),
    );
    service.load(key('2026-10-05'));
    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() => expect(gates.has('2026-10-05')).toBe(true));
    service.load(key('2026-10-06'));
    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() => expect(gates.has('2026-10-06')).toBe(true));
    gates.get('2026-10-05')!();
    gates.get('2026-10-06')!();
    await vi.waitFor(() => expect(service.state().status).toBe('ready'));
    expect(aborted).toContain('2026-10-05');
    expect(aborted).not.toContain('2026-10-06');
  });

  it('serves a fresh cache hit at once and sends nothing', async () => {
    const { backend, service } = setup();
    service.load(key('2026-10-05'));
    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() => expect(service.state().status).toBe('ready'));
    service.load(key('2026-10-06'));
    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() => expect(backend.state.counters.search).toBe(2));
    service.load(key('2026-10-05'));
    // Synchronous: no debounce wait.
    expect(slotsFrom(service.state())[0].date).toBe('2026-10-05');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(backend.state.counters.search).toBe(2);
  });

  it('renders a stale hit at once, refreshes, and replaces only when the list differs', async () => {
    const { backend, clock, service } = setup();
    service.load(key('2026-10-05'));
    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() => expect(service.state().status).toBe('ready'));
    const first = service.state();

    clock.advance(61_000);
    service.load(key('2026-10-05'));
    expect(service.state()).toBe(first); // still ready, no skeleton
    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() => expect(backend.state.counters.search).toBe(2));
    await vi.advanceTimersByTimeAsync(0);
    expect(service.state()).toBe(first); // same slots: nothing re-renders

    clock.advance(61_000);
    const target = slotsFrom(first)[0];
    backend.state.slots.get(target.id)!.availableCapacity = 1;
    service.load(key('2026-10-05'));
    expect(service.state()).toBe(first);
    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() => expect(service.state()).not.toBe(first));
    expect(slotsFrom(service.state()).find((s) => s.id === target.id)!.availableCapacity).toBe(1);
  });

  it('force bypasses a fresh entry', async () => {
    const { backend, service } = setup();
    service.load(key('2026-10-05'));
    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() => expect(service.state().status).toBe('ready'));
    service.load(key('2026-10-05'), { force: true });
    expect(service.state().status).toBe('loading');
    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() => expect(backend.state.counters.search).toBe(2));
  });

  it('26 rapid distinct searches send at most 25, then show a countdown instead', async () => {
    const { backend, service } = setup();
    const branches = [BRANCH_IDS.auckland, BRANCH_IDS.london, BRANCH_IDS.newYork];
    const services = [SERVICE_IDS.checkup, SERVICE_IDS.consult, SERVICE_IDS.longSession];
    const dates = ['2026-10-05', '2026-10-06', '2026-10-07'];
    const keys = branches.flatMap((b) => services.flatMap((s) => dates.map((d) => key(d, b, s))));
    for (const k of keys.slice(0, 26)) {
      service.load(k);
      await vi.advanceTimersByTimeAsync(250);
    }
    await vi.advanceTimersByTimeAsync(50);
    expect(backend.state.counters.search).toBe(25);
    expect(service.state()).toMatchObject({
      status: 'rate-limited',
      retryAfterSeconds: 60,
      source: 'budget',
    });
    expect(service.countdown.active()).toBe(true);
  });

  it('serves a cached day while the budget is spent, and refuses uncached ones', async () => {
    const { backend, service } = setup();
    const keys: SlotKey[] = [];
    for (const b of [BRANCH_IDS.auckland, BRANCH_IDS.london, BRANCH_IDS.newYork]) {
      for (const s of [SERVICE_IDS.checkup, SERVICE_IDS.consult, SERVICE_IDS.longSession]) {
        for (const d of ['2026-10-05', '2026-10-06', '2026-10-07']) keys.push(key(d, b, s));
      }
    }
    for (const k of keys.slice(0, 25)) {
      service.load(k);
      await vi.advanceTimersByTimeAsync(250);
    }
    await vi.advanceTimersByTimeAsync(50);
    expect(backend.state.counters.search).toBe(25);
    service.load(keys[0]);
    expect(service.state().status).toBe('ready');
    service.load(keys[25]);
    await vi.advanceTimersByTimeAsync(250);
    expect(service.state().status).toBe('rate-limited');
    expect(backend.state.counters.search).toBe(25);
  });

  it('a 429 shows the countdown, never retries by itself, and retries on request', async () => {
    const { backend, clock, service } = setup();
    backend.state.flags.searchRateLimitAfter = 0;
    service.load(key('2026-10-05'));
    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() => expect(service.state().status).toBe('rate-limited'));
    expect(service.state()).toMatchObject({
      status: 'rate-limited',
      retryAfterSeconds: 60,
      source: 'server',
    });
    expect(service.countdown.remaining()).toBe(60);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(backend.state.counters.search).toBe(1);

    // While the countdown runs even a new, uncached day sends nothing.
    backend.state.flags.searchRateLimitAfter = null;
    service.load(key('2026-10-06'));
    await vi.advanceTimersByTimeAsync(250);
    expect(service.state().status).toBe('rate-limited');
    expect(backend.state.counters.search).toBe(1);

    clock.advance(60_000);
    expect(service.countdown.active()).toBe(false);
    service.load(key('2026-10-05'), { force: true });
    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() => expect(service.state().status).toBe('ready'));
    expect(backend.state.counters.search).toBe(2);
  });

  it('a 404 refreshes the reference data, reports not-found and toasts once', async () => {
    const { backend, service, toast } = setup();
    service.load(key('2026-10-05', 'gone-branch'));
    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() => expect(service.state().status).toBe('not-found'));
    await vi.waitFor(() =>
      expect(backend.state.counters).toMatchObject({ branches: 1, services: 1 }),
    );
    expect(toast.showInfo).toHaveBeenCalledExactlyOnceWith(
      'That option is no longer available. Please choose again.',
    );
  });

  it('an outage shows an unavailable error, then re-issues the search on recovery', async () => {
    const { backend, service } = setup();
    backend.state.flags.searchRateLimitAfter = null;
    let down = true;
    server.use(
      http.get(`${BASE}/api/Slots/available`, () =>
        down
          ? HttpResponse.json({ status: 503, detail: 'Down.' }, { status: 503 })
          : HttpResponse.json([]),
      ),
    );
    service.load(key('2026-10-05'));
    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() => expect(service.state().status).toBe('error'));
    const state = service.state();
    expect(state.status === 'error' && state.kind).toBe('unavailable');

    down = false;
    TestBed.inject(OutageState).onResponse(200);
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() => expect(service.state().status).toBe('ready'));
  });

  it('other errors are reported as "other"', async () => {
    const { service } = setup();
    server.use(
      http.get(`${BASE}/api/Slots/available`, () =>
        HttpResponse.json({ status: 400, detail: 'Bad.' }, { status: 400 }),
      ),
    );
    service.load(key('2026-10-05'));
    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() => expect(service.state().status).toBe('error'));
    const state = service.state();
    expect(state.status === 'error' && state.kind).toBe('other');
  });

  it('keeps stale chips when a background refresh fails', async () => {
    const { clock, service } = setup();
    service.load(key('2026-10-05'));
    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() => expect(service.state().status).toBe('ready'));
    const first = service.state();
    server.use(
      http.get(`${BASE}/api/Slots/available`, () =>
        HttpResponse.json({ status: 500, detail: 'Boom.' }, { status: 500 }),
      ),
    );
    clock.advance(61_000);
    service.load(key('2026-10-05'));
    await vi.advanceTimersByTimeAsync(250);
    await vi.advanceTimersByTimeAsync(50);
    expect(service.state()).toBe(first);
  });

  it('invalidate and dropBefore forget cached days', async () => {
    const { backend, service } = setup();
    for (const d of ['2026-10-05', '2026-10-06']) {
      service.load(key(d));
      await vi.advanceTimersByTimeAsync(250);
      await vi.waitFor(() => expect(service.state().status).toBe('ready'));
    }
    expect(backend.state.counters.search).toBe(2);
    service.invalidate(key('2026-10-05'));
    service.load(key('2026-10-05'));
    expect(service.state().status).toBe('loading');
    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() => expect(backend.state.counters.search).toBe(3));
    service.dropBefore('2026-10-07');
    service.load(key('2026-10-06'));
    expect(service.state().status).toBe('loading');
  });

  it('reset cancels what is pending and goes idle', async () => {
    const { backend, service } = setup();
    service.load(key('2026-10-05'));
    service.reset();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(backend.state.counters.search).toBe(0);
    expect(service.state().status).toBe('idle');
  });
});

describe('normaliseSlots', () => {
  const base: SlotResponse = {
    id: 'a',
    branchId: 'b',
    serviceTypeId: 's',
    date: '2026-10-05',
    startAtUtc: '2026-10-05T10:00:00Z',
    endAtUtc: '2026-10-05T10:30:00Z',
    localStartTime: '10:00:00',
    localEndTime: '10:30:00',
    capacity: 2,
    availableCapacity: 2,
  };

  it('drops foreign and zero-capacity slots and sorts by start', () => {
    const result = normaliseSlots({ branchId: 'b', serviceId: 's', date: '2026-10-05' }, [
      { ...base, id: 'late', startAtUtc: '2026-10-05T12:00:00Z' },
      { ...base, id: 'foreign-branch', branchId: 'x' },
      { ...base, id: 'foreign-service', serviceTypeId: 'x' },
      { ...base, id: 'full', availableCapacity: 0 },
      { ...base, id: 'early' },
    ]);
    expect(result.map((s) => s.id)).toEqual(['early', 'late']);
  });

  it('sameSlots compares ids and free capacity in order', () => {
    const a = [base, { ...base, id: 'b' }];
    expect(sameSlots(a, [{ ...base }, { ...base, id: 'b' }])).toBe(true);
    expect(sameSlots(a, [base])).toBe(false);
    expect(sameSlots(a, [base, { ...base, id: 'b', availableCapacity: 1 }])).toBe(false);
    expect(
      sameSlots(a, [
        { ...base, id: 'c' },
        { ...base, id: 'b' },
      ]),
    ).toBe(false);
  });
});
