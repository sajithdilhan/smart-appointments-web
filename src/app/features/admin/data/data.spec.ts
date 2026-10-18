import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, convertToParamMap } from '@angular/router';
import { http, HttpResponse } from 'msw';
import { server } from '../../../../testing/server';
import type { Branch, ServiceType } from '../../../core/api/models';
import { APP_CONFIG } from '../../../core/config/app-config';
import { AppError } from '../../../core/http/app-error';
import { OutageState } from '../../../core/http/outage-state';
import { BranchesStore } from './branches.store';
import { reloadOnRecovery } from './reload-on-recovery';
import { branchCrumb, isGuid, serviceCrumb } from './resolvers';
import { ServicesStore } from './services.store';
import { SlotActivityStore } from './slot-activity.store';

const BASE = 'http://gw.test:5290';
const ID_A = '0190a1b2-0000-7000-8000-00000000000a';
const ID_B = '0190a1b2-0000-7000-8000-00000000000b';

const branch = (over: Partial<Branch> = {}): Branch => ({
  id: ID_A,
  code: 'AA',
  name: 'Alpha',
  description: null,
  address: 'x',
  phoneNumber: '+14155550123',
  isActive: true,
  createdAtUtc: '2026-10-01T00:00:00Z',
  updatedAtUtc: null,
  timeZoneId: null,
  workingHours: [],
  ...over,
});

const service = (over: Partial<ServiceType> = {}): ServiceType => ({
  id: ID_A,
  code: 'CUT',
  name: 'Cut',
  description: null,
  durationMinutes: 30,
  isActive: true,
  createdAtUtc: '2026-10-01T00:00:00Z',
  updatedAtUtc: null,
  ...over,
});

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      BranchesStore,
      ServicesStore,
      SlotActivityStore,
    ],
  });
  return TestBed.inject(BranchesStore);
}

/** A list handler whose responses are queued; counts calls and records the query string. */
function listHandler(responses: (() => Response)[]) {
  const calls: string[] = [];
  server.use(
    http.get(`${BASE}/api/Branches`, ({ request }) => {
      calls.push(new URL(request.url).search);
      const next = responses.length > 1 ? responses.shift()! : responses[0];
      return next();
    }),
  );
  return calls;
}

const ok = (items: Branch[]) => () => HttpResponse.json(items);
const fails = (status: number) => () => HttpResponse.json({ status, detail: 'nope' }, { status });

describe('BranchesStore', () => {
  it('first load: loading without items, then loaded and sorted by name', async () => {
    const store = setup();
    const calls = listHandler([
      ok([
        branch({ id: ID_B, name: 'beta', code: 'BB' }),
        branch({ id: ID_A, name: 'Alpha', isActive: false }),
      ]),
    ]);
    expect(store.status()).toBe('idle');
    const loading = store.load();
    expect(store.status()).toBe('loading');
    expect(store.items()).toEqual([]);
    await loading;
    expect(calls).toEqual(['?includeInactive=true']);
    expect(store.status()).toBe('loaded');
    expect(store.items().map((b) => b.name)).toEqual(['Alpha', 'beta']);
    expect(store.active().map((b) => b.name)).toEqual(['beta']);
    expect(store.inactive().map((b) => b.name)).toEqual(['Alpha']);
    expect(store.loadedAt()).not.toBeNull();
    expect(store.byId(ID_B)?.code).toBe('BB');
  });

  it('deduplicates an in-flight load', async () => {
    const store = setup();
    const calls = listHandler([ok([branch()])]);
    await Promise.all([store.load(), store.load(), store.load({ force: true })]);
    expect(calls).toHaveLength(1);
  });

  it('a revisit keeps the cached items while it refreshes in the background', async () => {
    const store = setup();
    listHandler([ok([branch({ name: 'Old' })]), ok([branch({ name: 'New' })])]);
    await store.load();
    const refresh = store.load();
    expect(store.status()).toBe('loading');
    expect(store.items().map((b) => b.name)).toEqual(['Old']);
    await refresh;
    expect(store.items().map((b) => b.name)).toEqual(['New']);
  });

  it('a failed refresh keeps the items and records the error', async () => {
    const store = setup();
    listHandler([ok([branch()]), fails(500)]);
    await store.load();
    await store.load();
    expect(store.items()).toHaveLength(1);
    expect(store.status()).toBe('error');
    expect(store.error()).toBeInstanceOf(AppError);
    expect(store.error()?.status).toBe(500);
  });

  it('a failed first load has no items and can be retried', async () => {
    const store = setup();
    listHandler([fails(503), ok([branch()])]);
    await store.load();
    expect(store.status()).toBe('error');
    expect(store.items()).toEqual([]);
    await store.load();
    expect(store.status()).toBe('loaded');
    expect(store.error()).toBeNull();
  });

  describe('ensure', () => {
    it('is a store hit with no request', async () => {
      const store = setup();
      store.upsert(branch());
      expect((await store.ensure(ID_A))?.name).toBe('Alpha');
    });

    it('fetches one record on a miss and upserts it', async () => {
      const store = setup();
      let requests = 0;
      server.use(
        http.get(`${BASE}/api/Branches/${ID_B}`, () => {
          requests++;
          return HttpResponse.json(branch({ id: ID_B, name: 'Beta' }));
        }),
      );
      const [a, b] = await Promise.all([store.ensure(ID_B), store.ensure(ID_B)]);
      expect(a?.name).toBe('Beta');
      expect(b?.name).toBe('Beta');
      expect(requests).toBe(1);
      expect(store.byId(ID_B)).toBeDefined();
    });

    it('answers null for a 404 and throws an AppError for other failures', async () => {
      const store = setup();
      server.use(
        http.get(`${BASE}/api/Branches/${ID_A}`, () =>
          HttpResponse.json({ status: 404, detail: 'gone' }, { status: 404 }),
        ),
        http.get(`${BASE}/api/Branches/${ID_B}`, () =>
          HttpResponse.json({ status: 500, detail: 'boom' }, { status: 500 }),
        ),
      );
      expect(await store.ensure(ID_A)).toBeNull();
      await expect(store.ensure(ID_B)).rejects.toBeInstanceOf(AppError);
    });

    it('force refetches even when the store has the record', async () => {
      const store = setup();
      store.upsert(branch({ name: 'Stale' }));
      server.use(
        http.get(`${BASE}/api/Branches/${ID_A}`, () =>
          HttpResponse.json(branch({ name: 'Fresh' })),
        ),
      );
      expect((await store.ensure(ID_A, { force: true }))?.name).toBe('Fresh');
      expect(store.byId(ID_A)?.name).toBe('Fresh');
    });
  });

  it('upsert replaces by id or adds, keeping the sort', () => {
    const store = setup();
    store.upsert(branch({ id: ID_A, name: 'Alpha' }));
    store.upsert(branch({ id: ID_B, name: 'Beta' }));
    store.upsert(branch({ id: ID_A, name: 'Zulu' }));
    expect(store.items().map((b) => b.name)).toEqual(['Beta', 'Zulu']);
  });

  it('setActive sets the flag from the intent and moves the record between lists', () => {
    const store = setup();
    store.upsert(branch());
    store.setActive(ID_A, false);
    expect(store.active()).toEqual([]);
    expect(store.inactive()).toHaveLength(1);
    store.setActive(ID_A, true);
    expect(store.active()).toHaveLength(1);
  });

  it('reset empties the store and ignores a response that arrives afterwards', async () => {
    const store = setup();
    listHandler([ok([branch()])]);
    const pending = store.load();
    store.reset();
    await pending;
    expect(store.items()).toEqual([]);
    expect(store.status()).toBe('idle');
    expect(store.loadedAt()).toBeNull();
  });
});

describe('ServicesStore', () => {
  it('loads with includeInactive and ensures one record', async () => {
    setup();
    const store = TestBed.inject(ServicesStore);
    let search = '';
    server.use(
      http.get(`${BASE}/api/Services`, ({ request }) => {
        search = new URL(request.url).search;
        return HttpResponse.json([service({ name: 'B' }), service({ id: ID_B, name: 'A' })]);
      }),
      http.get(`${BASE}/api/Services/${ID_B}`, () => HttpResponse.json(service({ id: ID_B }))),
    );
    await store.load();
    expect(search).toBe('?includeInactive=true');
    expect(store.items().map((s) => s.name)).toEqual(['A', 'B']);
    expect((await store.ensure(ID_B))?.id).toBe(ID_B);
  });
});

describe('SlotActivityStore', () => {
  it('counts created slots and generations, including a run that created none', () => {
    setup();
    const store = TestBed.inject(SlotActivityStore);
    expect([store.createdThisSession(), store.generations()]).toEqual([0, 0]);
    store.add(12);
    store.add(0);
    expect([store.createdThisSession(), store.generations()]).toEqual([12, 2]);
    store.reset();
    expect([store.createdThisSession(), store.generations()]).toEqual([0, 0]);
  });
});

describe('reloadOnRecovery', () => {
  it('skips the first run and reloads on each recovery', async () => {
    const store = setup();
    const calls = listHandler([ok([branch()])]);
    TestBed.runInInjectionContext(() => reloadOnRecovery(store));
    TestBed.tick();
    expect(calls).toHaveLength(0);

    const outage = TestBed.inject(OutageState);
    outage.recovered.update((n) => n + 1);
    TestBed.tick();
    await store.load(); // joins the in-flight reload
    expect(calls).toHaveLength(1);

    outage.recovered.update((n) => n + 1);
    TestBed.tick();
    await store.load();
    expect(calls).toHaveLength(2);
  });
});

describe('resolvers', () => {
  const route = (id: string | null) =>
    ({ paramMap: convertToParamMap(id ? { id } : {}) }) as unknown as ActivatedRouteSnapshot;
  const resolve = (fn: typeof branchCrumb, id: string | null) =>
    TestBed.runInInjectionContext(() => fn(route(id), {} as never)) as Promise<string>;

  it('isGuid', () => {
    expect(isGuid(ID_A)).toBe(true);
    expect(isGuid(ID_A.toUpperCase())).toBe(true);
    expect(isGuid('abc')).toBe(false);
    expect(isGuid(null)).toBe(false);
    expect(isGuid(`${ID_A}x`)).toBe(false);
  });

  it('branchCrumb returns the name, from the store or one request', async () => {
    const store = setup();
    store.upsert(branch({ name: 'Cached' }));
    expect(await resolve(branchCrumb, ID_A)).toBe('Cached');
    server.use(
      http.get(`${BASE}/api/Branches/${ID_B}`, () =>
        HttpResponse.json(branch({ id: ID_B, name: 'Fetched' })),
      ),
    );
    expect(await resolve(branchCrumb, ID_B)).toBe('Fetched');
  });

  it('falls back without blocking: non-GUID (no request), 404 and failure', async () => {
    setup();
    expect(await resolve(branchCrumb, 'not-a-guid')).toBe('Branch'); // an unhandled request would fail
    expect(await resolve(branchCrumb, null)).toBe('Branch');
    server.use(
      http.get(`${BASE}/api/Branches/${ID_A}`, () =>
        HttpResponse.json({ status: 404, detail: 'x' }, { status: 404 }),
      ),
      http.get(`${BASE}/api/Services/${ID_A}`, () =>
        HttpResponse.json({ status: 500, detail: 'x' }, { status: 500 }),
      ),
    );
    expect(await resolve(branchCrumb, ID_A)).toBe('Branch');
    expect(await resolve(serviceCrumb, ID_A)).toBe('Service');
  });

  it('serviceCrumb returns the service name', async () => {
    setup();
    server.use(
      http.get(`${BASE}/api/Services/${ID_B}`, () =>
        HttpResponse.json(service({ id: ID_B, name: 'Haircut' })),
      ),
    );
    expect(await resolve(serviceCrumb, ID_B)).toBe('Haircut');
  });
});
