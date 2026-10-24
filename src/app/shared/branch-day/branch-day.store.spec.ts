import { TestBed } from '@angular/core/testing';
import { createBranchDayBackend } from '../../../testing/branch-day-backend';
import { makeDayContext, provideBranchDayApi } from '../../../testing/branch-day-test-setup';
import { createFakeToast } from '../../../testing/fake-session';
import { ManualClock } from '../../../testing/manual-clock';
import { CUSTOMER_ID, resetMakeAppointment, SERVICE_ID } from '../../../testing/make-appointment';
import { server } from '../../../testing/server';
import { OutageState } from '../../core/http/outage-state';
import { ToastService } from '../../core/notify/toast.service';
import { CLOCK } from '../../core/util/clock';
import { ANNOUNCEMENT_MS, BranchDayStore, DAY_PAGE_SIZE } from './branch-day.store';
import { BRANCH_DAY_CONTEXT } from './branch-day-context';

// Saturday 24 October 2026, 09:00 UTC = 10:00 in London (BST).
const NOW = Date.parse('2026-10-24T09:00:00Z');
const DAY = {
  branchId: '00000000-0000-4000-8000-0000000000b1',
  date: '2026-10-24',
  status: 'all',
} as const;

function setup() {
  resetMakeAppointment();
  const clock = new ManualClock(NOW);
  const backend = createBranchDayBackend({ now: () => clock.now() });
  server.use(...backend.handlers);
  backend.addCustomer(CUSTOMER_ID);
  const toast = createFakeToast();
  const ctx = makeDayContext({ services: [[SERVICE_ID, 'Health check']] });
  TestBed.configureTestingModule({
    providers: [
      ...provideBranchDayApi(),
      { provide: CLOCK, useValue: clock },
      { provide: ToastService, useValue: toast },
      { provide: BRANCH_DAY_CONTEXT, useValue: ctx },
      BranchDayStore,
    ],
  });
  return { clock, backend, toast, ctx, store: TestBed.inject(BranchDayStore) };
}

/** Appointments at 08:00Z (started) and 09:30Z, 10:00Z (ahead) on the 24th. */
function seedDay(backend: ReturnType<typeof setup>['backend']) {
  const started = backend.addAppointment({
    startUtc: '2026-10-24T08:00:00Z',
    endUtc: '2026-10-24T08:30:00Z',
  });
  const ahead = backend.addAppointment({
    startUtc: '2026-10-24T09:30:00Z',
    endUtc: '2026-10-24T10:00:00Z',
  });
  return { started, ahead };
}

const dayRequests = (backend: ReturnType<typeof setup>['backend']) =>
  backend.state.requests.filter(
    (r) => r.method === 'GET' && r.path.includes('/appointments/branch'),
  );
const posts = (backend: ReturnType<typeof setup>['backend']) =>
  backend.state.requests.filter((r) => r.method === 'POST');

describe('BranchDayStore', () => {
  it('starts idle and requests nothing', () => {
    const { store, backend } = setup();
    expect(store.load()).toBe('idle');
    expect(store.rows()).toEqual([]);
    expect(backend.state.requests).toEqual([]);
  });

  it('loads the day with date and pageSize=100, no status for All', async () => {
    const { store, backend } = setup();
    seedDay(backend);
    const pending = store.open(DAY);
    expect(store.load()).toBe('loading');
    await pending;
    expect(store.load()).toBe('ready');
    expect(store.rows().map((r) => r.startLabel)).toEqual(['09:00', '10:30']);
    expect(store.countLabel()).toBe('2 appointments');
    const params = new URLSearchParams(dayRequests(backend)[0].search);
    expect(params.get('date')).toBe('2026-10-24');
    expect(params.get('pageSize')).toBe(String(DAY_PAGE_SIZE));
    expect(params.get('page')).toBe('1');
    expect(params.has('status')).toBe(false);
  });

  it('adds status when the filter is not All and counts one appointment in the singular', async () => {
    const { store, backend } = setup();
    seedDay(backend);
    await store.open({ ...DAY, status: 'Booked' });
    expect(new URLSearchParams(dayRequests(backend)[0].search).get('status')).toBe('Booked');
    await store.open({ ...DAY, status: 'Completed' });
    expect(store.isEmpty()).toBe(true);
    expect(store.countLabel()).toBe('0 appointments');
    backend.state.appointments[0].status = 'Completed';
    await store.open({ ...DAY, status: 'Completed' });
    expect(store.countLabel()).toBe('1 appointment');
  });

  it('resolves names from the context services and flags the customers notice', async () => {
    const { store, backend } = setup();
    seedDay(backend);
    await store.open(DAY);
    expect(store.rows()[0].serviceName).toBe('Health check');
    expect(store.rows()[0].customerName).toBe('Ana Perera');
    expect(store.showCustomersNotice()).toBe(false);

    backend.flags.customersUnavailable = true;
    await store.open(DAY);
    expect(store.showCustomersNotice()).toBe(true);
    expect(store.rows().every((r) => r.customerName === null)).toBe(true);
  });

  it('loadMore appends the next page, once, and ends when everything is loaded', async () => {
    const { store, backend } = setup();
    for (let i = 0; i < 105; i += 1) {
      const minute = String(i % 60).padStart(2, '0');
      const hour = String(Math.floor(i / 60) + 1).padStart(2, '0');
      backend.addAppointment({
        startUtc: `2026-10-24T${hour}:${minute}:00Z`,
        endUtc: `2026-10-24T${hour}:${minute}:30Z`,
      });
    }
    await store.open(DAY);
    expect(store.items()).toHaveLength(100);
    expect(store.totalCount()).toBe(105);
    expect(store.hasMore()).toBe(true);

    const more = store.loadMore();
    expect(store.load()).toBe('loading-more');
    // A second activation while loading sends nothing.
    await store.loadMore();
    await more;
    expect(store.items()).toHaveLength(105);
    expect(store.hasMore()).toBe(false);
    expect(dayRequests(backend).map((r) => new URLSearchParams(r.search).get('page'))).toEqual([
      '1',
      '2',
    ]);
    await store.loadMore();
    expect(dayRequests(backend)).toHaveLength(2);
  });

  it('shows an appointment that appears on two pages once', async () => {
    const { store, backend } = setup();
    for (let i = 0; i < 101; i += 1) {
      const minute = String(i % 60).padStart(2, '0');
      const hour = String(Math.floor(i / 60) + 1).padStart(2, '0');
      backend.addAppointment({
        startUtc: `2026-10-24T${hour}:${minute}:00Z`,
        endUtc: `2026-10-24T${hour}:${minute}:30Z`,
      });
    }
    await store.open(DAY);
    // A new earlier appointment pushes the last row of page 1 onto page 2.
    backend.addAppointment({ startUtc: '2026-10-24T00:00:00Z', endUtc: '2026-10-24T00:00:30Z' });
    await store.loadMore();
    const ids = store.items().map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(101);
  });

  it('a failed Load more keeps the rows and can be repeated', async () => {
    const { store, backend } = setup();
    for (let i = 0; i < 101; i += 1) {
      const minute = String(i % 60).padStart(2, '0');
      const hour = String(Math.floor(i / 60) + 1).padStart(2, '0');
      backend.addAppointment({
        startUtc: `2026-10-24T${hour}:${minute}:00Z`,
        endUtc: `2026-10-24T${hour}:${minute}:30Z`,
      });
    }
    await store.open(DAY);
    backend.flags.failNext = 500;
    await store.loadMore();
    expect(store.load()).toBe('more-error');
    expect(store.items()).toHaveLength(100);
    await store.retryMore();
    expect(store.load()).toBe('ready');
    expect(store.items()).toHaveLength(101);
  });

  it('drops the response of a superseded request', async () => {
    const { store, backend } = setup();
    seedDay(backend);
    backend.addAppointment({
      startUtc: '2026-10-25T12:00:00Z',
      endUtc: '2026-10-25T12:30:00Z',
    });
    const first = store.open(DAY);
    const second = store.open({ ...DAY, date: '2026-10-25' });
    await Promise.all([first, second]);
    expect(store.query()?.date).toBe('2026-10-25');
    expect(store.items()).toHaveLength(1);
    expect(store.load()).toBe('ready');
  });

  it('shows an error and retries the first page', async () => {
    const { store, backend } = setup();
    seedDay(backend);
    backend.flags.failNext = 500;
    await store.open(DAY);
    expect(store.load()).toBe('error');
    expect(store.error()?.status).toBe(500);
    await store.retry();
    expect(store.load()).toBe('ready');
    expect(store.items()).toHaveLength(2);
  });

  it('refresh keeps the rows on screen while it reloads, and every loaded page', async () => {
    const { store, backend } = setup();
    for (let i = 0; i < 101; i += 1) {
      const minute = String(i % 60).padStart(2, '0');
      const hour = String(Math.floor(i / 60) + 1).padStart(2, '0');
      backend.addAppointment({
        startUtc: `2026-10-24T${hour}:${minute}:00Z`,
        endUtc: `2026-10-24T${hour}:${minute}:30Z`,
      });
    }
    await store.open(DAY);
    await store.loadMore();
    const before = dayRequests(backend).length;
    const pending = store.refresh();
    expect(store.load()).toBe('refreshing');
    expect(store.items()).toHaveLength(101);
    await pending;
    expect(store.load()).toBe('ready');
    expect(store.items()).toHaveLength(101);
    expect(dayRequests(backend).length - before).toBe(2);
  });

  it('a failed refresh keeps the rows and toasts through F1', async () => {
    const { store, backend, toast } = setup();
    seedDay(backend);
    await store.open(DAY);
    backend.flags.failNext = 500;
    await store.refresh();
    expect(store.load()).toBe('ready');
    expect(store.items()).toHaveLength(2);
    expect(toast.handleError).toHaveBeenCalledTimes(1);
  });

  it('open(null) clears the list and requests nothing', async () => {
    const { store, backend } = setup();
    seedDay(backend);
    await store.open(DAY);
    await store.open(null);
    expect(store.rows()).toEqual([]);
    expect(store.load()).toBe('idle');
    expect(dayRequests(backend)).toHaveLength(1);
  });

  it('refreshes when the outage clears', async () => {
    const { store, backend } = setup();
    seedDay(backend);
    await store.open(DAY);
    TestBed.tick();
    const before = dayRequests(backend).length;
    TestBed.inject(OutageState).recovered.update((n) => n + 1);
    TestBed.tick();
    await vi.waitFor(() => expect(dayRequests(backend).length).toBe(before + 1));
  });

  describe('mark', () => {
    it('completes a started appointment: toast, announcement, reload, cleared after 5 s', async () => {
      const { store, backend, toast, clock } = setup();
      const { started } = seedDay(backend);
      await store.open(DAY);
      const result = await store.mark(started.id, 'complete');
      expect(result).toEqual({ ok: true });
      expect(toast.showSuccess).toHaveBeenCalledWith('Ana Perera marked as completed.');
      expect(store.announcement()).toBe('Ana Perera, 09:00, marked as completed');
      expect(store.rows()[0].status).toBe('Completed');
      expect(store.rows()[0].canMark).toBe(false);
      expect(store.marking()).toEqual({});
      expect(posts(backend)).toHaveLength(1);
      clock.advance(ANNOUNCEMENT_MS - 1);
      expect(store.announcement()).not.toBe('');
      clock.advance(1);
      expect(store.announcement()).toBe('');
    });

    it('marks a no-show and words the toast for a missing name', async () => {
      const { store, backend, toast } = setup();
      const { started } = seedDay(backend);
      backend.flags.customersUnavailable = true;
      await store.open(DAY);
      await store.mark(started.id, 'no-show');
      expect(toast.showSuccess).toHaveBeenCalledWith('Appointment marked as no-show.');
      expect(store.announcement()).toBe('09:00, marked as no-show');
      expect(posts(backend)[0].path).toMatch(/\/no-show$/);
    });

    it('a 409 shows the server text and reloads the list', async () => {
      const { store, backend, toast } = setup();
      const { ahead } = seedDay(backend);
      await store.open(DAY);
      const before = dayRequests(backend).length;
      const result = await store.mark(ahead.id, 'complete');
      expect(result.ok).toBe(false);
      expect(toast.showError).toHaveBeenCalledTimes(1);
      expect(toast.showError.mock.calls[0][0].message).toBe('The appointment has not started yet.');
      expect(dayRequests(backend).length - before).toBe(1);
      expect(store.marking()).toEqual({});
    });

    it('a 404 shows the fixed text and reloads', async () => {
      const { store, backend, toast } = setup();
      const { started } = seedDay(backend);
      await store.open(DAY);
      backend.state.appointments = backend.state.appointments.filter((a) => a.id !== started.id);
      await store.mark(started.id, 'no-show');
      expect(toast.showError.mock.calls[0][0].message).toBe(
        'This appointment is no longer available.',
      );
      expect(store.rows()).toHaveLength(1);
    });

    it('any other failure toasts through F1 and does not reload', async () => {
      const { store, backend, toast } = setup();
      const { started } = seedDay(backend);
      await store.open(DAY);
      const before = dayRequests(backend).length;
      backend.flags.failNext = 500;
      const result = await store.mark(started.id, 'complete');
      expect(result).toMatchObject({ ok: false, reloaded: false });
      expect(toast.handleError).toHaveBeenCalledTimes(1);
      expect(dayRequests(backend)).toHaveLength(before);
      expect(store.marking()).toEqual({});
    });

    it('does not toast an other failure when the caller shows it (quietFailure)', async () => {
      const { store, backend, toast } = setup();
      const { started } = seedDay(backend);
      await store.open(DAY);
      backend.flags.failNext = 500;
      await store.mark(started.id, 'no-show', { quietFailure: true });
      expect(toast.handleError).not.toHaveBeenCalled();
    });

    it('ignores a repeat while the first is in flight and sends one request', async () => {
      const { store, backend } = setup();
      const { started } = seedDay(backend);
      await store.open(DAY);
      const first = store.mark(started.id, 'complete');
      expect(store.marking()[started.id]).toBe('complete');
      expect(await store.mark(started.id, 'no-show')).toEqual({ ok: 'ignored' });
      await first;
      expect(posts(backend)).toHaveLength(1);
    });
  });
});
