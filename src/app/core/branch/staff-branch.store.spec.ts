import { TestBed } from '@angular/core/testing';
import { createBranchDayBackend } from '../../../testing/branch-day-backend';
import { provideBranchDayApi } from '../../../testing/branch-day-test-setup';
import { createFakeSession, provideFakeSession } from '../../../testing/fake-session';
import { BRANCH_ID } from '../../../testing/make-appointment';
import { server } from '../../../testing/server';
import { StaffBranchStore } from './staff-branch.store';

const OTHER_ID = '00000000-0000-4000-8000-0000000000b2';

function setup(branchId: string | null = BRANCH_ID) {
  const backend = createBranchDayBackend();
  server.use(...backend.handlers);
  const session = createFakeSession('authenticated', 'Staff');
  const claim = (id: string | null) =>
    session.user.set({ email: 'staff@example.com', ...(id ? { branchId: id } : {}) } as never);
  claim(branchId);
  TestBed.configureTestingModule({
    providers: [...provideBranchDayApi(), ...provideFakeSession(session)],
  });
  const store = TestBed.inject(StaffBranchStore);
  const branchRequests = () =>
    backend.state.requests.filter(
      (r) => r.method === 'GET' && r.path.toLowerCase().includes('/branches/'),
    );
  return { backend, session, claim, store, branchRequests };
}

describe('StaffBranchStore', () => {
  it('loads the claim branch once however often ensure is called', async () => {
    const { store, branchRequests } = setup();
    TestBed.tick();
    store.ensure();
    store.ensure();
    await vi.waitFor(() => expect(store.status()).toBe('ready'));
    store.ensure();
    expect(branchRequests()).toHaveLength(1);
    expect(store.branch()?.name).toBe('London Central');
    expect(store.zone()).toBe('Europe/London');
    expect(store.zoneLabel()).toBeNull();
    expect(store.activeBranchId()).toBe(BRANCH_ID);
  });

  it('loads again for a new branch claim, without an active branch meanwhile', async () => {
    const { store, backend, claim, branchRequests } = setup();
    backend.addBranch({ id: OTHER_ID, name: 'Leeds', code: 'LDS', timeZoneId: 'Europe/Paris' });
    TestBed.tick();
    await vi.waitFor(() => expect(store.status()).toBe('ready'));
    claim(OTHER_ID);
    TestBed.tick();
    expect(store.status()).toBe('loading');
    expect(store.activeBranchId()).toBeNull();
    await vi.waitFor(() => expect(store.status()).toBe('ready'));
    expect(store.branch()?.name).toBe('Leeds');
    expect(store.zone()).toBe('Europe/Paris');
    expect(branchRequests()).toHaveLength(2);
  });

  it('is not-linked without a claim and sends no request', () => {
    const { store, backend } = setup(null);
    TestBed.tick();
    expect(store.status()).toBe('not-linked');
    expect(backend.state.requests).toEqual([]);
  });

  it('is not-linked on a 404 and does not ask again', async () => {
    const { store, branchRequests } = setup(OTHER_ID);
    TestBed.tick();
    await vi.waitFor(() => expect(store.status()).toBe('not-linked'));
    store.ensure();
    expect(branchRequests()).toHaveLength(1);
    expect(store.activeBranchId()).toBeNull();
  });

  it('shows an error after a network failure and recovers on ensure', async () => {
    const { store, backend } = setup();
    backend.flags.networkError = true;
    TestBed.tick();
    await vi.waitFor(() => expect(store.status()).toBe('error'));
    expect(store.error()).not.toBeNull();
    backend.flags.networkError = false;
    store.ensure();
    expect(store.status()).toBe('loading');
    await vi.waitFor(() => expect(store.status()).toBe('ready'));
    expect(store.error()).toBeNull();
  });

  it('shows an error after a 503', async () => {
    const { store, backend } = setup();
    backend.flags.failNext = 503;
    TestBed.tick();
    await vi.waitFor(() => expect(store.status()).toBe('error'));
  });

  it('labels the zone UTC for a branch without one', async () => {
    const { store, backend } = setup();
    backend.state.branches[0].timeZoneId = null;
    TestBed.tick();
    await vi.waitFor(() => expect(store.status()).toBe('ready'));
    expect(store.zone()).toBe('UTC');
    expect(store.zoneLabel()).toBe('UTC');
  });

  it('resets when the session ends', async () => {
    const { store, session } = setup();
    TestBed.tick();
    await vi.waitFor(() => expect(store.status()).toBe('ready'));
    session.status.set('anonymous');
    TestBed.tick();
    expect(store.status()).toBe('idle');
    expect(store.branch()).toBeNull();
    expect(store.branchId()).toBeNull();
  });
});
