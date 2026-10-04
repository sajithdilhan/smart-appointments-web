import { TestBed } from '@angular/core/testing';
import { http, HttpResponse } from 'msw';
import { APP_CONFIG } from '../../../../core/config/app-config';
import { provideCoreHttp } from '../../../../core/http/http.providers';
import { OutageState } from '../../../../core/http/outage-state';
import { availabilityHandlers } from '../../../../../testing/availability.handlers';
import {
  BRANCH_IDS,
  SERVICE_IDS,
  createBookingBackend,
} from '../../../../../testing/booking-backend';
import { server } from '../../../../../testing/server';
import { ReferenceDataStore } from './reference-data.store';

const BASE = 'http://gw.test:5290';

function setup() {
  const backend = createBookingBackend();
  server.use(...availabilityHandlers(backend, BASE));
  TestBed.configureTestingModule({
    providers: [provideCoreHttp(), { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } }],
  });
  return { backend, store: TestBed.inject(ReferenceDataStore) };
}

async function settled(store: ReferenceDataStore): Promise<void> {
  await vi.waitFor(() => {
    expect(store.branchesState()).not.toBe('loading');
    expect(store.servicesState()).not.toBe('loading');
  });
}

describe('ReferenceDataStore', () => {
  it('starts idle with nothing loaded', () => {
    const { store } = setup();
    expect(store.branches()).toBeNull();
    expect(store.services()).toBeNull();
    expect(store.branchesState()).toBe('idle');
    expect(store.servicesState()).toBe('idle');
  });

  it('loads once per session: later and concurrent reads send no request', async () => {
    const { backend, store } = setup();
    store.ensureBranches();
    store.ensureBranches();
    store.ensureServices();
    store.ensureServices();
    expect(store.branchesState()).toBe('loading');
    await settled(store);
    store.ensureBranches();
    store.ensureServices();
    expect(backend.state.counters).toMatchObject({ branches: 1, services: 1 });
    expect(store.branchesState()).toBe('ready');
  });

  it('sorts bookable branches first, then by name; services by name', async () => {
    const { store } = setup();
    store.ensureBranches();
    store.ensureServices();
    await settled(store);
    expect(store.branches()!.map((b) => b.code)).toEqual(['AKL', 'LON', 'NYC', 'NOS']);
    expect(store.services()!.map((s) => s.name)).toEqual([
      'Check-up',
      'Consultation',
      'Long session',
    ]);
  });

  it('looks branches and services up by id', async () => {
    const { store } = setup();
    store.ensureBranches();
    store.ensureServices();
    await settled(store);
    expect(store.branchById(BRANCH_IDS.london)?.code).toBe('LON');
    expect(store.serviceById(SERVICE_IDS.consult)?.code).toBe('CON');
    expect(store.branchById('nope')).toBeUndefined();
  });

  it('refresh bypasses the cache and keeps the old data until the new arrives', async () => {
    const { backend, store } = setup();
    store.ensureBranches();
    store.ensureServices();
    await settled(store);
    store.refresh();
    expect(store.branchesState()).toBe('loading');
    expect(store.branches()).not.toBeNull();
    await settled(store);
    expect(backend.state.counters).toMatchObject({ branches: 2, services: 2 });
  });

  it('clear forgets everything so the next read loads again', async () => {
    const { backend, store } = setup();
    store.ensureBranches();
    await settled(store);
    store.clear();
    expect(store.branches()).toBeNull();
    expect(store.branchesState()).toBe('idle');
    store.ensureBranches();
    await settled(store);
    expect(backend.state.counters.branches).toBe(2);
  });

  it('keeps an error and retries on the next read', async () => {
    const { store } = setup();
    let fail = true;
    server.use(
      http.get(`${BASE}/api/Branches`, () =>
        fail
          ? HttpResponse.json({ status: 500, detail: 'Boom.' }, { status: 500 })
          : HttpResponse.json([]),
      ),
    );
    store.ensureBranches();
    await settled(store);
    expect(store.branchesState()).toBe('error');
    expect(store.error()?.message).toBe('Boom.');
    fail = false;
    store.ensureBranches();
    await settled(store);
    expect(store.branchesState()).toBe('ready');
    expect(store.error()).toBeNull();
    expect(store.branches()).toEqual([]);
  });

  it('reloads after an outage recovers, only what had failed', async () => {
    const { backend, store } = setup();
    backend.state.flags.unavailableNext = 0;
    let failBranches = true;
    server.use(
      http.get(`${BASE}/api/Branches`, () =>
        failBranches
          ? HttpResponse.json({ status: 503, detail: 'Down.' }, { status: 503 })
          : HttpResponse.json([]),
      ),
    );
    store.ensureBranches();
    store.ensureServices();
    await settled(store);
    expect(store.branchesState()).toBe('error');
    expect(store.servicesState()).toBe('ready');
    expect(TestBed.inject(OutageState).down()).toBe(true);

    failBranches = false;
    // The next successful response from anywhere clears the outage and increments `recovered`.
    TestBed.inject(OutageState).onResponse(200);
    TestBed.tick();
    await settled(store);
    expect(store.branchesState()).toBe('ready');
    expect(backend.state.counters.services).toBe(1);
  });

  it('does not reload on recovery when nothing had failed', async () => {
    const { backend, store } = setup();
    store.ensureBranches();
    await settled(store);
    const outage = TestBed.inject(OutageState);
    outage.down.set(true);
    outage.onResponse(200);
    TestBed.tick();
    expect(backend.state.counters.branches).toBe(1);
  });
});
