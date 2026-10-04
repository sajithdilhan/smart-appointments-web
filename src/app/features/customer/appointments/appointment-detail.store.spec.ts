import { TestBed } from '@angular/core/testing';
import { http, HttpResponse } from 'msw';
import { AppointmentsBackend } from '../../../../testing/appointments-backend';
import {
  createFakeSession,
  createFakeToast,
  provideFakeSession,
} from '../../../../testing/fake-session';
import { appointmentsHandlers } from '../../../../testing/handlers/appointments.handlers';
import { makeAppointment, resetMakeAppointment } from '../../../../testing/make-appointment';
import { ManualClock } from '../../../../testing/manual-clock';
import { server } from '../../../../testing/server';
import { APP_CONFIG } from '../../../core/config/app-config';
import { provideCoreHttp } from '../../../core/http/http.providers';
import { OutageState } from '../../../core/http/outage-state';
import { CLOCK } from '../../../core/util/clock';
import { AppointmentDetailStore } from './appointment-detail.store';
import { AppointmentsStore } from './appointments.store';
import { GENERIC_CONFLICT_MESSAGE } from './cancel-conflict';

const BASE = 'http://gw.test:5290';
const NOW = Date.parse('2026-10-04T12:00:00Z');
const problem = (status: number, detail: string, headers: Record<string, string> = {}) =>
  HttpResponse.json({ status, detail }, { status, headers });

function setup(options: { withList?: boolean } = {}) {
  resetMakeAppointment();
  const backend = new AppointmentsBackend();
  backend.now = () => NOW;
  const target = makeAppointment({ startUtc: '2026-10-05T15:00:00Z' });
  backend.add(target);
  server.use(...appointmentsHandlers(BASE, backend));
  const toast = createFakeToast();
  TestBed.configureTestingModule({
    providers: [
      provideCoreHttp(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      { provide: CLOCK, useValue: new ManualClock(NOW) },
      ...provideFakeSession(createFakeSession('authenticated', 'Customer'), toast),
      ...(options.withList ? [AppointmentsStore] : []),
      AppointmentDetailStore,
    ],
  });
  return { backend, toast, target, store: TestBed.inject(AppointmentDetailStore) };
}

async function confirmed(store: ReturnType<typeof setup>['store']) {
  store.openCancel();
  expect(store.phase().kind).toBe('confirming');
  return store.confirm();
}

describe('AppointmentDetailStore load', () => {
  it('loads an appointment: loading, then ready', async () => {
    const { store, target, backend } = setup();
    const pending = store.init(target.id);
    expect(store.load()).toBe('loading');
    await pending;
    expect(store.load()).toBe('ready');
    expect(store.appointment()?.id).toBe(target.id);
    expect(store.canCancel()).toBe(true);
    expect(backend.getCalls).toEqual([target.id]);
  });

  it('an unknown id is not-found', async () => {
    const { store } = setup();
    await store.init('00000000-0000-4000-8000-00000000dead');
    expect(store.load()).toBe('not-found');
    expect(store.appointment()).toBeNull();
  });

  it('another failure is an error that reload() recovers from', async () => {
    const { store, target } = setup();
    let fail = true;
    server.use(
      http.get(`${BASE}/api/appointments/:id`, () =>
        fail ? problem(500, 'boom') : HttpResponse.json(target),
      ),
    );
    await store.init(target.id);
    expect(store.load()).toBe('error');
    expect(store.error()).not.toBeNull();
    fail = false;
    await store.reload();
    expect(store.load()).toBe('ready');
  });

  it('reloads on OutageState.recovered only while in error', async () => {
    const { store, target, backend } = setup();
    let fail = true;
    server.use(
      http.get(`${BASE}/api/appointments/:id`, () => {
        backend.getCalls.push(target.id);
        return fail ? problem(503, 'down') : HttpResponse.json(target);
      }),
    );
    await store.init(target.id);
    expect(store.load()).toBe('error');
    TestBed.tick();
    fail = false;
    const outage = TestBed.inject(OutageState);
    outage.down.set(true);
    outage.onResponse(200);
    TestBed.tick();
    await vi.waitFor(() => expect(store.load()).toBe('ready'));
  });

  it('starts ready from the list item and re-GETs behind it', async () => {
    const { store, target, backend } = setup({ withList: true });
    const list = TestBed.inject(AppointmentsStore);
    await list.setFilter({ tab: 'upcoming', showCancelled: false });
    const pending = store.init(target.id);
    expect(store.load()).toBe('ready');
    expect(store.appointment()?.id).toBe(target.id);
    await pending;
    expect(backend.getCalls).toEqual([target.id]);
  });

  it('a Booked appointment that has started offers no Cancel and says so', async () => {
    const { store, backend } = setup();
    const started = makeAppointment({ startUtc: '2026-10-04T10:00:00Z' });
    backend.add(started);
    await store.init(started.id);
    expect(store.canCancel()).toBe(false);
    expect(store.hasStarted()).toBe(true);
  });

  it('a Cancelled appointment offers no Cancel', async () => {
    const { store, backend } = setup();
    const cancelled = makeAppointment({ status: 'Cancelled', startUtc: '2026-10-06T10:00:00Z' });
    backend.add(cancelled);
    await store.init(cancelled.id);
    expect(store.canCancel()).toBe(false);
    expect(store.hasStarted()).toBe(false);
  });
});

describe('AppointmentDetailStore cancel', () => {
  it('204: optimistic cancelling, one POST, a re-GET, the toast, and Cancelled', async () => {
    const { store, target, toast, backend } = setup();
    await store.init(target.id);
    store.openCancel();
    const first = store.confirm();
    expect(store.phase().kind).toBe('cancelling');
    expect(store.announcement()).toBe('Cancelling appointment…');
    const second = store.confirm(); // a repeated confirm sends nothing
    await Promise.all([first, second]);
    expect(backend.cancelCalls).toEqual([target.id]);
    expect(store.phase()).toEqual({ kind: 'cancelled', refreshed: true, slotMayBeDelayed: false });
    expect(store.appointment()?.status).toBe('Cancelled');
    expect(store.announcement()).toBe('Appointment cancelled.');
    expect(toast.showSuccess).toHaveBeenCalledExactlyOnceWith('Appointment cancelled.');
    expect(store.canCancel()).toBe(false);
    expect(backend.getCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('204 then a failing re-GET keeps Cancelled without an error toast', async () => {
    const { store, target, toast, backend } = setup({ withList: true });
    await store.init(target.id);
    let gets = 0;
    server.use(
      http.get(`${BASE}/api/appointments/:id`, () => {
        gets += 1;
        return HttpResponse.error();
      }),
    );
    await confirmed(store);
    expect(gets).toBeGreaterThan(0);
    expect(store.phase()).toEqual({ kind: 'cancelled', refreshed: false, slotMayBeDelayed: false });
    expect(store.appointment()?.status).toBe('Cancelled');
    expect(store.appointment()?.cancelledAtUtc).toBeTruthy();
    expect(toast.showError).not.toHaveBeenCalled();
    expect(backend.cancelCalls).toHaveLength(1);
    expect(TestBed.inject(AppointmentsStore).notRefreshed()[target.id]).toBe(true);
  });

  it('keep returns to idle without a request', async () => {
    const { store, target, backend } = setup();
    await store.init(target.id);
    store.openCancel();
    store.keep();
    expect(store.phase().kind).toBe('idle');
    expect(backend.cancelCalls).toHaveLength(0);
  });

  it('409 with the known text reverts, explains, removes Cancel and does not toast', async () => {
    const { store, target, toast, backend } = setup();
    await store.init(target.id);
    backend.now = () => Date.parse('2026-10-05T16:00:00Z'); // the server says it started
    await confirmed(store);
    expect(store.phase().kind).toBe('too-late');
    expect(store.canCancel()).toBe(false);
    expect(store.hasStarted()).toBe(true);
    expect(store.appointment()?.status).toBe('Booked');
    expect(toast.showSuccess).not.toHaveBeenCalled();
    expect(toast.showError).not.toHaveBeenCalled();
    expect(toast.handleError).not.toHaveBeenCalled();
  });

  it('409 with an unknown text shows the generic message and keeps the button', async () => {
    const { store, target, backend } = setup();
    await store.init(target.id);
    backend.forceCancelConflict = 'Some other business rule text.';
    await confirmed(store);
    const phase = store.phase();
    expect(phase.kind).toBe('failed');
    if (phase.kind === 'failed') {
      expect(phase.error.message).toBe(GENERIC_CONFLICT_MESSAGE);
      expect(phase.error.message).not.toContain('business rule');
    }
    expect(store.canCancel()).toBe(true);
  });

  it('503 where the re-GET shows Cancelled is cancelled, with the slot notice flag', async () => {
    const { store, target, backend, toast } = setup();
    await store.init(target.id);
    backend.failReleaseWith503 = true;
    await confirmed(store);
    expect(store.phase()).toEqual({ kind: 'cancelled', refreshed: true, slotMayBeDelayed: true });
    expect(store.appointment()?.status).toBe('Cancelled');
    expect(toast.showSuccess).toHaveBeenCalledTimes(1);
  });

  it('503 where the re-GET still shows Booked reverts to retryable, and retry repeats the POST', async () => {
    const { store, target, backend } = setup();
    await store.init(target.id);
    let failing = true;
    server.use(
      http.post(`${BASE}/api/appointments/:id/cancel`, ({ params }) => {
        backend.cancelCalls.push(String(params['id']));
        return failing ? problem(503, 'down') : new HttpResponse(null, { status: 204 });
      }),
    );
    await confirmed(store);
    expect(store.phase().kind).toBe('retryable');
    expect(store.appointment()?.status).toBe('Booked');
    failing = false;
    // The backend model has not cancelled it, so the re-GET after the 204 shows Booked.
    await store.retryCancel();
    expect(backend.cancelCalls).toHaveLength(2);
    expect(['cancelled', 'retryable']).toContain(store.phase().kind);
  });

  it('a network error re-GETs first: the server had cancelled it', async () => {
    const { store, target, backend } = setup();
    await store.init(target.id);
    server.use(
      http.post(`${BASE}/api/appointments/:id/cancel`, ({ params }) => {
        backend.cancel(String(params['id']));
        return HttpResponse.error();
      }),
    );
    await confirmed(store);
    expect(store.phase()).toEqual({ kind: 'cancelled', refreshed: true, slotMayBeDelayed: true });
  });

  it('a network error where the re-GET also fails is retryable', async () => {
    const { store, target } = setup();
    await store.init(target.id);
    server.use(
      http.post(`${BASE}/api/appointments/:id/cancel`, () => HttpResponse.error()),
      http.get(`${BASE}/api/appointments/:id`, () => HttpResponse.error()),
    );
    await confirmed(store);
    expect(store.phase().kind).toBe('retryable');
  });

  it('404 turns the detail into not-found and refreshes the list', async () => {
    const { store, target } = setup({ withList: true });
    const list = TestBed.inject(AppointmentsStore);
    await list.setFilter({ tab: 'upcoming', showCancelled: false });
    await store.init(target.id);
    server.use(
      http.post(`${BASE}/api/appointments/:id/cancel`, () =>
        problem(404, 'Appointment not found.'),
      ),
    );
    await confirmed(store);
    expect(store.load()).toBe('not-found');
    expect(store.phase().kind).toBe('idle');
  });

  it('403 reverts with the normalised message', async () => {
    const { store, target } = setup();
    await store.init(target.id);
    server.use(http.post(`${BASE}/api/appointments/:id/cancel`, () => problem(403, 'Forbidden')));
    await confirmed(store);
    expect(store.phase().kind).toBe('failed');
    expect(store.canCancel()).toBe(true);
  });

  it('429 reverts to rate-limited and starts the countdown', async () => {
    const { store, target } = setup();
    await store.init(target.id);
    server.use(
      http.post(`${BASE}/api/appointments/:id/cancel`, () =>
        problem(429, 'Too many requests.', { 'Retry-After': '60' }),
      ),
    );
    await confirmed(store);
    expect(store.phase().kind).toBe('rate-limited');
    expect(store.countdown.active()).toBe(true);
    expect(store.countdown.remaining()).toBe(60);
  });

  it('marks the list item pending while cancelling and clears it afterwards', async () => {
    const { store, target } = setup({ withList: true });
    const list = TestBed.inject(AppointmentsStore);
    await list.setFilter({ tab: 'upcoming', showCancelled: false });
    await store.init(target.id);
    store.openCancel();
    const pending = store.confirm();
    expect(list.pending()[target.id]).toBe(true);
    await pending;
    expect(list.pending()[target.id]).toBeUndefined();
    await vi.waitFor(() => expect(list.byId(target.id)).toBeUndefined()); // left Upcoming
  });
});
