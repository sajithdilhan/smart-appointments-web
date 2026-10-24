import { TestBed } from '@angular/core/testing';
import {
  provideStaffApi,
  staffBackend,
  useStaffBackends,
} from '../../../../testing/staff-test-setup';
import { STAFF_BRANCH_ID } from '../../../../testing/staff-accounts-backend';
import { OutageState } from '../../../core/http/outage-state';
import { STAFF_PAGE_SIZE, StaffAccountsStore } from './staff-accounts.store';

const OTHER_BRANCH = '00000000-0000-4000-8000-0000000000b2';

beforeEach(() => {
  useStaffBackends();
  TestBed.configureTestingModule({ providers: [...provideStaffApi(), StaffAccountsStore] });
});

const lists = () => staffBackend.state.requests.filter((r) => r.method === 'GET');
const store = () => TestBed.inject(StaffAccountsStore);

function seed(n: number): void {
  for (let i = 0; i < n; i++) staffBackend.addStaff();
}

describe('StaffAccountsStore', () => {
  it('loads page 1 with the maximum page size and no filters, oldest first', async () => {
    seed(3);
    await store().load();
    expect(STAFF_PAGE_SIZE).toBe(100);
    expect(lists().map((r) => r.search)).toEqual(['?page=1&pageSize=100']);
    expect(
      store()
        .items()
        .map((i) => i.firstName),
    ).toEqual(['Staff1', 'Staff2', 'Staff3']);
    expect(store().status()).toBe('ready');
    expect(store().totalCount()).toBe(3);
  });

  it('sends the branch and status filters', async () => {
    staffBackend.addBranch({ id: OTHER_BRANCH });
    staffBackend.addStaff({ branchId: OTHER_BRANCH, isActive: false });
    staffBackend.addStaff({ branchId: STAFF_BRANCH_ID });
    await store().load({ branchId: OTHER_BRANCH, isActive: false });
    expect(lists()[0].search).toContain(`branchId=${OTHER_BRANCH}`);
    expect(lists()[0].search).toContain('isActive=false');
    expect(store().items()).toHaveLength(1);
  });

  it('drops the items of the previous filter as soon as another filter is applied', async () => {
    staffBackend.addStaff({ isActive: true });
    staffBackend.addStaff({ isActive: false });
    await store().load({ branchId: null, isActive: true });
    expect(store().items()).toHaveLength(1);
    const pending = store().load({ branchId: null, isActive: false });
    expect(store().items()).toEqual([]);
    await pending;
    expect(
      store()
        .items()
        .map((i) => i.isActive),
    ).toEqual([false]);
  });

  it('keeps the latest response when two loads overlap', async () => {
    staffBackend.addStaff({ isActive: true });
    staffBackend.addStaff({ isActive: false });
    const first = store().load({ branchId: null, isActive: true });
    const second = store().load({ branchId: null, isActive: false });
    await Promise.all([first, second]);
    expect(
      store()
        .items()
        .map((i) => i.isActive),
    ).toEqual([false]);
    expect(store().status()).toBe('ready');
  });

  it('appends the next page on loadMore and ignores it when everything is loaded', async () => {
    seed(105);
    await store().load();
    expect(store().items()).toHaveLength(100);
    await store().loadMore();
    expect(store().items()).toHaveLength(105);
    expect(store().page()).toBe(2);
    expect(lists().at(-1)!.search).toBe('?page=2&pageSize=100');
    const before = lists().length;
    await store().loadMore();
    expect(lists()).toHaveLength(before);
  });

  it('reload re-requests every loaded page and picks up changes', async () => {
    seed(105);
    await store().load();
    await store().loadMore();
    staffBackend.addStaff({ firstName: 'Late' });
    const before = lists().length;
    await store().reload();
    expect(
      lists()
        .slice(before)
        .map((r) => r.search),
    ).toEqual(['?page=1&pageSize=100', '?page=2&pageSize=100']);
    expect(store().items()).toHaveLength(106);
    expect(store().totalCount()).toBe(106);
  });

  it('keeps the items when a load, a load more or a reload fails', async () => {
    seed(105);
    await store().load();
    staffBackend.flags.failNext = 500;
    await store().loadMore();
    expect(store().status()).toBe('error');
    expect(store().error()?.status).toBe(500);
    expect(store().items()).toHaveLength(100);

    staffBackend.flags.failNext = 500;
    await store().reload();
    expect(store().status()).toBe('error');
    expect(store().items()).toHaveLength(100);

    // Load more is still possible from the error state and clears it.
    await store().loadMore();
    expect(store().status()).toBe('ready');
    expect(store().items()).toHaveLength(105);
  });

  it('shows an error with no items when the first load fails, and recovers on retry', async () => {
    staffBackend.flags.networkError = true;
    await store().load();
    expect(store().status()).toBe('error');
    expect(store().items()).toEqual([]);
    staffBackend.flags.networkError = false;
    seed(1);
    await store().load();
    expect(store().status()).toBe('ready');
    expect(store().items()).toHaveLength(1);
  });

  it('finds a loaded account by id', async () => {
    const a = staffBackend.addStaff();
    await store().load();
    expect(store().byId(a.id)?.id).toBe(a.id);
    expect(store().byId('nope')).toBeUndefined();
  });

  it('reset empties the list and ignores a response still in flight', async () => {
    seed(2);
    const pending = store().load();
    store().reset();
    await pending;
    expect(store().items()).toEqual([]);
    expect(store().status()).toBe('idle');
  });

  it('reloads after the backend recovers from an outage, but only once something was loaded', async () => {
    const outage = TestBed.inject(OutageState);
    const s = store();
    outage.recovered.update((n) => n + 1);
    TestBed.tick();
    expect(lists()).toHaveLength(0);

    seed(1);
    await s.load();
    seed(1);
    const before = lists().length;
    outage.recovered.update((n) => n + 1);
    TestBed.tick();
    await vi.waitFor(() => expect(s.items()).toHaveLength(2));
    expect(lists().length).toBeGreaterThan(before);
  });
});
