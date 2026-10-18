import { TestBed } from '@angular/core/testing';
import { delay, http, HttpResponse } from 'msw';
import { AppointmentsBackend } from '../../../../testing/appointments-backend';
import { appointmentsHandlers } from '../../../../testing/handlers/appointments.handlers';
import { makeAppointment, resetMakeAppointment } from '../../../../testing/make-appointment';
import { server } from '../../../../testing/server';
import { APP_CONFIG } from '../../../core/config/app-config';
import { provideCoreHttp } from '../../../core/http/http.providers';
import { OutageState } from '../../../core/http/outage-state';
import { AppointmentsStore, MAX_REFRESH } from './appointments.store';

const BASE = 'http://gw.test:5290';
const NOW = Date.parse('2026-10-04T12:00:00Z');
const UPCOMING = { tab: 'upcoming', showCancelled: false } as const;

function many(count: number, status: 'Booked' | 'Cancelled' = 'Booked') {
  return Array.from({ length: count }, (_, i) =>
    makeAppointment({
      startUtc: new Date(NOW + (i + 1) * 3_600_000).toISOString(),
      status,
    }),
  );
}

function setup(count = 0) {
  resetMakeAppointment();
  const backend = new AppointmentsBackend();
  backend.now = () => NOW;
  backend.add(...many(count));
  server.use(...appointmentsHandlers(BASE, backend));
  TestBed.configureTestingModule({
    providers: [
      provideCoreHttp(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      AppointmentsStore,
    ],
  });
  return { backend, store: TestBed.inject(AppointmentsStore) };
}

describe('AppointmentsStore', () => {
  it('starts idle and loads the first page of the filter', async () => {
    const { backend, store } = setup(45);
    expect(store.status()).toBe('idle');
    const pending = store.setFilter(UPCOMING);
    expect(store.status()).toBe('loading-first');
    await pending;
    expect(store.status()).toBe('ready');
    expect(store.items()).toHaveLength(20);
    expect(store.totalCount()).toBe(45);
    expect(store.hasMore()).toBe(true);
    expect(backend.listCalls).toEqual([
      { status: 'Booked', when: 'upcoming', page: '1', pageSize: '20' },
    ]);
  });

  it('an empty answer is ready and empty, not an error', async () => {
    const { store } = setup(0);
    await store.setFilter(UPCOMING);
    expect(store.isEmpty()).toBe(true);
    expect(store.hasMore()).toBe(false);
  });

  it('loadMore appends the next page and announces once', async () => {
    const { backend, store } = setup(45);
    await store.setFilter(UPCOMING);
    await store.loadMore();
    expect(store.items()).toHaveLength(40);
    expect(store.page()).toBe(2);
    expect(store.announcement()).toBe('Loaded 20 more appointments');
    await store.loadMore();
    expect(store.items()).toHaveLength(45);
    expect(store.hasMore()).toBe(false);
    expect(store.announcement()).toBe('Loaded 5 more appointments');
    expect(backend.listCalls.map((c) => c.page)).toEqual(['1', '2', '3']);
  });

  it('shows an item that appears on two pages once, keeping the first', async () => {
    const { backend, store } = setup(25);
    await store.setFilter(UPCOMING);
    const repeated = store.items()[19];
    // The list changed between requests: page 2 starts with an item already shown.
    const rest = backend.appointments.slice(20, 25);
    server.use(
      http.get(`${BASE}/api/appointments/my`, () =>
        HttpResponse.json({ items: [repeated, ...rest], page: 2, pageSize: 20, totalCount: 25 }),
      ),
    );
    await store.loadMore();
    const ids = store.items().map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id === repeated.id)).toHaveLength(1);
  });

  it('ignores a second loadMore while the first is pending (one request)', async () => {
    const { backend, store } = setup(45);
    await store.setFilter(UPCOMING);
    const first = store.loadMore();
    expect(store.status()).toBe('loading-more');
    const second = store.loadMore();
    await Promise.all([first, second]);
    expect(backend.listCalls.map((c) => c.page)).toEqual(['1', '2']);
    expect(store.items()).toHaveLength(40);
  });

  it('a failed loadMore keeps the list and retryMore repeats the same page', async () => {
    const { backend, store } = setup(45);
    await store.setFilter(UPCOMING);
    backend.forceListProblem = { status: 500, detail: 'boom' };
    await store.loadMore();
    expect(store.status()).toBe('more-error');
    expect(store.error()).not.toBeNull();
    expect(store.items()).toHaveLength(20);
    backend.forceListProblem = null;
    await store.retryMore();
    expect(store.status()).toBe('ready');
    expect(store.items()).toHaveLength(40);
    expect(backend.listCalls.map((c) => c.page)).toEqual(['1', '2', '2']);
  });

  it('a failed first page is an error with no items (never an empty state)', async () => {
    const { backend, store } = setup(3);
    backend.forceListProblem = { status: 500, detail: 'boom' };
    await store.setFilter(UPCOMING);
    expect(store.status()).toBe('error');
    expect(store.isEmpty()).toBe(false);
    backend.forceListProblem = null;
    await store.loadFirst();
    expect(store.status()).toBe('ready');
    expect(store.items()).toHaveLength(3);
  });

  it('a response without items becomes an error', async () => {
    const { store } = setup(0);
    server.use(
      http.get(`${BASE}/api/appointments/my`, () => HttpResponse.json({ page: 1, totalCount: 0 })),
    );
    await store.setFilter(UPCOMING);
    expect(store.status()).toBe('error');
    expect(store.error()?.kind).toBe('http');
  });

  it('the same filter is a no-op; a new filter resets and aborts the old request', async () => {
    const { backend, store } = setup(3);
    await store.setFilter(UPCOMING);
    await store.setFilter(UPCOMING);
    expect(backend.listCalls).toHaveLength(1);

    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    server.use(
      http.get(`${BASE}/api/appointments/my`, async ({ request }) => {
        const when = new URL(request.url).searchParams.get('when');
        if (when === 'upcoming') {
          await gate;
          return HttpResponse.json({
            items: [makeAppointment({ startUtc: '2026-12-01T10:00:00Z' })],
            page: 1,
            pageSize: 20,
            totalCount: 1,
          });
        }
        return HttpResponse.json({ items: [], page: 1, pageSize: 20, totalCount: 0 });
      }),
    );
    const slow = store.setFilter({ tab: 'upcoming', showCancelled: true });
    const past = store.setFilter({ tab: 'past', showCancelled: false });
    release();
    await Promise.all([slow, past]);
    // The late "upcoming" answer must not render in the Past tab.
    expect(store.filter().tab).toBe('past');
    expect(store.items()).toHaveLength(0);
    expect(store.status()).toBe('ready');
  });

  describe('quietRefresh', () => {
    it('re-requests page 1 sized to what is loaded, without a skeleton status', async () => {
      const { backend, store } = setup(45);
      await store.setFilter(UPCOMING);
      await store.loadMore();
      const statuses: string[] = [];
      const pending = store.quietRefresh();
      statuses.push(store.status());
      await pending;
      expect(statuses).toEqual(['refreshing']);
      expect(backend.listCalls.at(-1)).toMatchObject({ page: '1', pageSize: '40' });
      expect(store.items()).toHaveLength(40);
      expect(store.page()).toBe(2);
      expect(store.status()).toBe('ready');
    });

    it('restarts at page 1 with the normal size beyond 100 loaded', async () => {
      const { backend, store } = setup(MAX_REFRESH + 20);
      await store.setFilter(UPCOMING);
      for (let i = 0; i < 5; i += 1) await store.loadMore();
      expect(store.items().length).toBeGreaterThan(MAX_REFRESH);
      await store.quietRefresh();
      expect(backend.listCalls.at(-1)).toMatchObject({ page: '1', pageSize: '20' });
      expect(store.items()).toHaveLength(20);
      expect(store.page()).toBe(1);
    });

    it('keeps the list and stays silent when the refresh fails', async () => {
      const { backend, store } = setup(5);
      await store.setFilter(UPCOMING);
      backend.forceListProblem = { status: 500, detail: 'boom' };
      await store.quietRefresh();
      expect(store.status()).toBe('ready');
      expect(store.items()).toHaveLength(5);
      expect(store.error()).toBeNull();
    });
  });

  it('reloads a shown list quietly when the outage recovers', async () => {
    const { backend, store } = setup(5);
    await store.setFilter(UPCOMING);
    TestBed.tick();
    const outage = TestBed.inject(OutageState);
    outage.down.set(true);
    outage.onResponse(200);
    TestBed.tick();
    await vi.waitFor(() => expect(backend.listCalls).toHaveLength(2));
    expect(backend.listCalls[1]).toMatchObject({ page: '1', pageSize: '5' });
  });

  it('reloads a failed first page when the outage recovers', async () => {
    const { backend, store } = setup(2);
    backend.forceListProblem = { status: 503, detail: 'down' };
    await store.setFilter(UPCOMING);
    expect(store.status()).toBe('error');
    TestBed.tick();
    backend.forceListProblem = null;
    const outage = TestBed.inject(OutageState);
    outage.down.set(true);
    outage.onResponse(200);
    TestBed.tick();
    await vi.waitFor(() => expect(store.status()).toBe('ready'));
    expect(store.items()).toHaveLength(2);
  });

  describe('applyCancelled', () => {
    it('drops the cancelled item from Upcoming once the refresh confirms', async () => {
      const { backend, store } = setup(3);
      await store.setFilter(UPCOMING);
      const target = store.items()[1];
      backend.cancel(target.id);
      const updated = { ...target, status: 'Cancelled', cancelledAtUtc: '2026-10-04T12:00:00Z' };
      const pending = store.applyCancelled(updated);
      expect(store.byId(target.id)?.status).toBe('Cancelled');
      await pending;
      expect(store.byId(target.id)).toBeUndefined();
      expect(store.items()).toHaveLength(2);
      expect(store.totalCount()).toBe(2);
    });

    it('keeps it with its new status when Show cancelled is on', async () => {
      const { backend, store } = setup(3);
      await store.setFilter({ tab: 'upcoming', showCancelled: true });
      const target = store.items()[1];
      backend.cancel(target.id);
      await store.applyCancelled({ ...target, status: 'Cancelled' });
      expect(store.byId(target.id)?.status).toBe('Cancelled');
      expect(store.items()).toHaveLength(3);
    });
  });

  it('tracks pending cancels and notRefreshed marks', async () => {
    const { store } = setup(1);
    store.setPending('a', true);
    store.setPending('b', true);
    store.setPending('a', false);
    expect(store.pending()).toEqual({ b: true });
    store.markNotRefreshed('b');
    expect(store.notRefreshed()).toEqual({ b: true });
  });

  it('abort() drops a slow in-flight list response', async () => {
    const { store } = setup(1);
    server.use(
      http.get(`${BASE}/api/appointments/my`, async () => {
        await delay(150);
        return HttpResponse.json({
          items: [makeAppointment()],
          page: 1,
          pageSize: 20,
          totalCount: 1,
        });
      }),
    );
    void store.setFilter(UPCOMING);
    await delay(30);
    store.abort();
    await delay(300);
    expect(store.items()).toHaveLength(0);
    expect(store.status()).toBe('loading-first');
  });
});
