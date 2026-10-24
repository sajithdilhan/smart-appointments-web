import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { screen } from '@testing-library/angular';
import { createFakeSession, provideFakeSession } from '../../../testing/fake-session';
import { provideAdminApi, useAdminBackend } from '../../../testing/admin-test-setup';
import { seedBranch, seedService, state } from '../../../testing/availability-admin-backend';
import { routes } from '../../app.routes';
import { crumbsOf } from '../../shared/layout/breadcrumb-trail';
import type { Role } from '../../core/auth/session.model';
import { AppTitleStrategy } from '../../core/routing/app-title.strategy';
import { PaletteLauncher } from '../../core/ui/palette-launcher';
import { BranchesStore } from './data/branches.store';
import { AdminFrame } from './admin-frame.component';

beforeEach(useAdminBackend);

async function open(url: string, role: Role = 'Admin') {
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes, withComponentInputBinding()),
      { provide: TitleStrategy, useClass: AppTitleStrategy },
      ...provideFakeSession(createFakeSession('authenticated', role)),
      ...provideAdminApi(role),
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  const router = TestBed.inject(Router);
  return { harness, router, title: TestBed.inject(Title).getTitle() };
}

const GHOST = '0190a1b2-0000-7000-8000-0000000000ff';

describe('admin route table', () => {
  it.each([
    ['/admin', 'Dashboard', 'Dashboard | Smart Appointments'],
    ['/admin/branches', 'Branches', 'Branches | Smart Appointments'],
    ['/admin/services', 'Services', 'Services | Smart Appointments'],
    ['/admin/slots', 'Slot generation', 'Generate slots | Smart Appointments'],
    ['/admin/staff', 'Staff', 'Staff | Smart Appointments'],
    ['/admin/appointments', 'Appointments', 'Appointments | Smart Appointments'],
  ])('%s resolves with its heading and title', async (url, heading, title) => {
    const result = await open(url);
    expect(result.router.url).toBe(url);
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    expect(result.title).toBe(title);
  });

  it('opens the new-branch drawer over the list, with its own title and crumb', async () => {
    const { router, title } = await open('/admin/branches/new');
    expect(screen.getByRole('heading', { level: 1, name: 'Branches' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'New branch' })).toBeInTheDocument();
    expect(title).toBe('New branch | Smart Appointments');
    expect(crumbsOf(router.routerState.snapshot.root).map((c) => c.label)).toEqual([
      'Admin',
      'Branches',
      'New branch',
    ]);
  });

  it('branches/:id/schedule is the schedule page, not the drawer child :id', async () => {
    const branch = seedBranch({ name: 'Colombo Central' });
    const { router, title } = await open(`/admin/branches/${branch.id}/schedule`);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Schedule for Colombo Central' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Edit branch' })).not.toBeInTheDocument();
    expect(title).toBe('Schedule | Smart Appointments');
    expect(crumbsOf(router.routerState.snapshot.root)).toEqual([
      { label: 'Admin', url: '/admin' },
      { label: 'Branches', url: '/admin/branches' },
      { label: 'Colombo Central', url: `/admin/branches/${branch.id}` },
      { label: 'Schedule', url: `/admin/branches/${branch.id}/schedule` },
    ]);
  });

  it('staff/new is the create drawer, not the edit drawer taking "new" for an id', async () => {
    const { router, title } = await open('/admin/staff/new');
    expect(screen.getByRole('heading', { level: 1, name: 'Staff' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'New staff member' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Edit staff member' })).not.toBeInTheDocument();
    expect(title).toBe('New staff member | Smart Appointments');
    expect(crumbsOf(router.routerState.snapshot.root).map((c) => c.label)).toEqual([
      'Admin',
      'Staff',
      'New staff member',
    ]);
  });

  it('staff/:id is the edit drawer, with the "Staff member" crumb and no request', async () => {
    const { router, title } = await open(`/admin/staff/${GHOST}`);
    expect(
      screen.getByRole('heading', { level: 2, name: 'Edit staff member' }),
    ).toBeInTheDocument();
    expect(title).toBe('Edit staff member | Smart Appointments');
    expect(crumbsOf(router.routerState.snapshot.root)).toEqual([
      { label: 'Admin', url: '/admin' },
      { label: 'Staff', url: '/admin/staff' },
      { label: 'Staff member', url: `/admin/staff/${GHOST}` },
    ]);
    expect(state.requests).toEqual([]);
  });

  it('the staff drawers leave a pristine form without asking (unsavedChangesGuard)', async () => {
    const { harness, router } = await open('/admin/staff/new');
    await harness.navigateByUrl('/admin/staff');
    expect(router.url).toBe('/admin/staff');
  });

  it('sends a Staff member and a Customer away from /admin/staff and /admin/appointments', async () => {
    const staff = await open('/admin/appointments', 'Staff');
    expect(staff.router.url).not.toBe('/admin/appointments');
    TestBed.resetTestingModule();
    const customer = await open('/admin/staff', 'Customer');
    expect(customer.router.url).toBe('/book');
  });

  it('the resolver supplies the record name as the breadcrumb', async () => {
    const branch = seedBranch({ name: 'Kandy' });
    const service = seedService({ name: 'Haircut' });
    const b = await open(`/admin/branches/${branch.id}`);
    expect(crumbsOf(b.router.routerState.snapshot.root).at(-1)).toEqual({
      label: 'Kandy',
      url: `/admin/branches/${branch.id}`,
    });
    await b.harness.navigateByUrl(`/admin/services/${service.id}`);
    expect(crumbsOf(b.router.routerState.snapshot.root).at(-1)?.label).toBe('Haircut');
  });

  it('falls back to "Branch" for an id the server does not know', async () => {
    const { router } = await open(`/admin/branches/${GHOST}`);
    expect(crumbsOf(router.routerState.snapshot.root).at(-1)?.label).toBe('Branch');
  });

  it('a non-GUID :id shows not-found without sending a request', async () => {
    await open('/admin/branches/not-a-guid');
    expect(screen.getByText('That branch could not be found.')).toBeInTheDocument();
    expect(state.requests).toEqual([]);
  });

  it('sends a Customer from /admin/branches to /book (F1 guard)', async () => {
    const { router } = await open('/admin/branches', 'Customer');
    expect(router.url).toBe('/book');
  });
});

describe('AdminFrame', () => {
  it('marks the palette available while alive and resets the stores when destroyed', async () => {
    const { harness } = await open('/admin');
    const launcher = TestBed.inject(PaletteLauncher);
    expect(launcher.available()).toBe(true);
    const frame = harness.fixture.debugElement.query(
      (d) => d.componentInstance instanceof AdminFrame,
    );
    const store = frame.injector.get(BranchesStore);
    store.upsert(seedBranch());
    expect(store.items()).toHaveLength(1);
    await TestBed.inject(Router).navigateByUrl('/');
    expect(launcher.available()).toBe(false);
    expect(store.items()).toEqual([]);
  });
});
