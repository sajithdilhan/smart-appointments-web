import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { createFakeToast } from '../../../../testing/fake-session';
import { seedBranch } from '../../../../testing/availability-admin-backend';
import { server } from '../../../../testing/server';
import { STAFF_API_BASE } from '../../../../testing/staff-accounts-backend';
import {
  provideStaffApi,
  staffBackend,
  useStaffBackends,
} from '../../../../testing/staff-test-setup';
import { stubViewport } from '../../../../testing/stub-viewport';
import { OutageState } from '../../../core/http/outage-state';
import { ToastService } from '../../../core/notify/toast.service';
import { BranchesStore } from '../data/branches.store';
import { StaffAccountsStore } from '../data/staff-accounts.store';
import { StaffAccountsPage } from './staff.page';

@Component({ selector: 'app-drawer-stub', template: `<p>drawer is open</p>` })
class DrawerStub {}

beforeEach(useStaffBackends);
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.querySelectorAll('app-confirm-dialog').forEach((n) => n.remove());
});

const GHOST_BRANCH = '00000000-0000-4000-8000-0000000000ee';

async function open(url = '/', width = 1280) {
  stubViewport(width);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        {
          path: '',
          component: StaffAccountsPage,
          children: [{ path: 'new', component: DrawerStub }],
        },
      ]),
      ...provideStaffApi(),
      { provide: ToastService, useValue: createFakeToast() },
      BranchesStore,
      StaffAccountsStore,
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, StaffAccountsPage);
  return {
    router: TestBed.inject(Router),
    store: TestBed.inject(StaffAccountsStore),
    branches: TestBed.inject(BranchesStore),
  };
}

const lists = () => staffBackend.state.requests.filter((r) => r.method === 'GET');

/** Two branches known to both backends, and a staff member in each. */
function seedTwoBranches() {
  const kandy = seedBranch({ name: 'Kandy', code: 'KDY' });
  const galle = seedBranch({ name: 'Galle', code: 'GAL', isActive: false });
  staffBackend.addBranch({ id: kandy.id });
  staffBackend.addBranch({ id: galle.id });
  const ana = staffBackend.addStaff({
    firstName: 'Ana',
    lastName: 'Perera',
    email: 'ana@example.com',
    phoneNumber: '+94771111111',
    branchId: kandy.id,
  });
  const ben = staffBackend.addStaff({
    firstName: 'Ben',
    lastName: 'Silva',
    email: 'ben@example.com',
    phoneNumber: '+94772222222',
    branchId: galle.id,
    isActive: false,
  });
  return { kandy, galle, ana, ben };
}

function bodyRows(): HTMLElement[] {
  return screen.queryAllByRole('row').slice(1);
}

describe('StaffAccountsPage', () => {
  it('renders the heading, the New staff member link and a captioned table with its columns', async () => {
    seedTwoBranches();
    await open();
    expect(screen.getByRole('heading', { level: 1, name: 'Staff' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New staff member' })).toHaveAttribute(
      'href',
      '/admin/staff/new',
    );
    const table = await screen.findByRole('table', { name: 'Staff accounts' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent!.trim()),
    ).toEqual(['Name', 'Email', 'Phone', 'Branch', 'Status', 'Registered', 'Actions']);
    expect(lists().map((r) => r.search)).toEqual(['?page=1&pageSize=100']);
  });

  it('shows each member oldest first with the branch name, a status badge and the date', async () => {
    seedTwoBranches();
    await open();
    await screen.findByRole('table');
    await waitFor(() => expect(bodyRows()).toHaveLength(2));
    const [ana, ben] = bodyRows().map((r) => within(r).getAllByRole('cell'));
    expect(ana[0]).toHaveTextContent('Ana Perera');
    expect(ana[1]).toHaveTextContent('ana@example.com');
    expect(ana[2]).toHaveTextContent('+94771111111');
    expect(ana[3]).toHaveTextContent('Kandy');
    expect(ana[4]).toHaveTextContent('Active');
    expect(ana[5]).toHaveTextContent(/2026/);
    expect(ben[0]).toHaveTextContent('Ben Silva');
    expect(ben[3]).toHaveTextContent('Galle');
    expect(ben[4]).toHaveTextContent('Inactive');
  });

  it('shows "Unknown branch" for a member whose branch is not in the store', async () => {
    seedBranch({ name: 'Kandy' });
    staffBackend.addStaff({ branchId: GHOST_BRANCH });
    await open();
    await screen.findByRole('table');
    await waitFor(() => expect(bodyRows()[0]).toHaveTextContent('Unknown branch'));
  });

  it('shows skeleton rows with aria-busy while the first page loads', async () => {
    seedTwoBranches();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    server.use(
      http.get(`${STAFF_API_BASE}/api/auth/staff`, async () => {
        await gate; // no response: the next matching handler (the model) answers
      }),
    );
    stubViewport(1280);
    const pending = open();
    const busy = await screen.findByRole('status', { name: 'Loading staff' });
    expect(busy).toHaveAttribute('aria-busy', 'true');
    release();
    await pending;
  });

  describe('filters', () => {
    it('writes the branch filter to ?branch= and sends it to the server', async () => {
      const { kandy, ana } = seedTwoBranches();
      const { router } = await open();
      await waitFor(() => expect(bodyRows()).toHaveLength(2));
      await userEvent.selectOptions(screen.getByLabelText('Branch'), kandy.id);
      await waitFor(() => expect(bodyRows()).toHaveLength(1));
      expect(router.url).toBe(`/?branch=${kandy.id}`);
      expect(lists().at(-1)!.search).toContain(`branchId=${kandy.id}`);
      expect(bodyRows()[0]).toHaveTextContent(`${ana.firstName} ${ana.lastName}`);
    });

    it('writes the status filter to ?status= and sends isActive', async () => {
      seedTwoBranches();
      const { router } = await open();
      await waitFor(() => expect(bodyRows()).toHaveLength(2));
      await userEvent.selectOptions(screen.getByLabelText('Status'), 'inactive');
      await waitFor(() => expect(bodyRows()).toHaveLength(1));
      expect(router.url).toBe('/?status=inactive');
      expect(lists().at(-1)!.search).toContain('isActive=false');
      expect(bodyRows()[0]).toHaveTextContent('Ben Silva');
    });

    it('lists the branches, marking inactive ones', async () => {
      seedTwoBranches();
      await open();
      await screen.findByRole('table');
      const options = within(screen.getByLabelText('Branch'))
        .getAllByRole('option')
        .map((o) => o.textContent!.trim());
      expect(options).toEqual(['All branches', 'Galle (inactive)', 'Kandy']);
    });

    it('starts from the URL and treats unknown values as All', async () => {
      seedTwoBranches();
      await open('/?status=banana&branch=not-a-guid');
      await waitFor(() => expect(bodyRows()).toHaveLength(2));
      expect(lists().map((r) => r.search)).toEqual(['?page=1&pageSize=100']);
      expect(screen.getByLabelText('Status')).toHaveValue('all');
      expect(screen.getByLabelText('Branch')).toHaveValue('');
    });

    it('keeps a filtered branch the store does not know visible as "Unknown branch"', async () => {
      seedTwoBranches();
      await open(`/?branch=${GHOST_BRANCH}`);
      await screen.findByText('No staff match these filters.');
      const select = screen.getByLabelText('Branch');
      expect(select).toHaveValue(GHOST_BRANCH);
      expect(within(select).getByRole('option', { name: 'Unknown branch' })).toBeInTheDocument();
    });
  });

  describe('list states', () => {
    it('empty state with a New staff member link', async () => {
      await open();
      expect(await screen.findByText('No staff accounts yet.')).toBeVisible();
      expect(screen.getAllByRole('link', { name: 'New staff member' })).toHaveLength(2);
    });

    it('no-match state with Clear filters, which resets both filters', async () => {
      seedTwoBranches();
      staffBackend.state.accounts.splice(1, 1);
      const { router } = await open('/?status=inactive');
      expect(await screen.findByText('No staff match these filters.')).toBeVisible();
      await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
      await waitFor(() => expect(bodyRows()).toHaveLength(1));
      expect(router.url).toBe('/');
      expect(screen.getByLabelText('Status')).toHaveValue('all');
    });

    it('error state with Retry', async () => {
      seedTwoBranches();
      staffBackend.flags.failNext = 500;
      await open();
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/./);
      await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
      await waitFor(() => expect(bodyRows()).toHaveLength(2));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('keeps the rows and offers Retry when a later reload fails', async () => {
      seedTwoBranches();
      const { store } = await open();
      await waitFor(() => expect(bodyRows()).toHaveLength(2));
      staffBackend.flags.failNext = 500;
      await store.reload();
      const alert = await screen.findByRole('alert');
      expect(bodyRows()).toHaveLength(2);
      await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    });

    it('reloads when the backend recovers from an outage', async () => {
      seedTwoBranches();
      const { store } = await open();
      await waitFor(() => expect(bodyRows()).toHaveLength(2));
      staffBackend.flags.failNext = 503;
      await store.reload();
      await screen.findByRole('alert');
      staffBackend.addStaff({ firstName: 'Cleo', lastName: 'Fernando' });
      TestBed.inject(OutageState).recovered.update((n) => n + 1);
      await waitFor(() => expect(bodyRows()).toHaveLength(3));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('Load more', () => {
    it('appends the next page and then hides the button', async () => {
      staffBackend.addBranch({ id: GHOST_BRANCH });
      for (let i = 0; i < 105; i++) staffBackend.addStaff({ branchId: GHOST_BRANCH });
      await open();
      await waitFor(() => expect(bodyRows()).toHaveLength(100));
      await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
      await waitFor(() => expect(bodyRows()).toHaveLength(105));
      expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
      expect(lists().at(-1)!.search).toBe('?page=2&pageSize=100');
    });

    it('is absent when everything fits one page', async () => {
      seedTwoBranches();
      await open();
      await waitFor(() => expect(bodyRows()).toHaveLength(2));
      expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    });
  });

  describe('cards below 640 px', () => {
    it('renders a list of cards instead of a table, each with its menu', async () => {
      seedTwoBranches();
      await open('/', 400);
      const cards = await screen.findAllByRole('listitem');
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(cards).toHaveLength(2);
      expect(cards[0]).toHaveTextContent('Ana Perera');
      expect(cards[0]).toHaveTextContent('Kandy');
      expect(cards[0]).toHaveTextContent('Active');
      expect(cards[1]).toHaveTextContent('Inactive');
      expect(
        within(cards[0]).getByRole('button', { name: 'Actions for Ana Perera' }),
      ).toBeVisible();
    });
  });

  describe('row actions menu', () => {
    it('offers Edit (a link to the drawer), Deactivate and Delete for an active member', async () => {
      const { ana } = seedTwoBranches();
      await open();
      await waitFor(() => expect(bodyRows()).toHaveLength(2));
      await userEvent.click(screen.getByRole('button', { name: 'Actions for Ana Perera' }));
      expect(await screen.findByRole('menuitem', { name: 'Edit' })).toHaveAttribute(
        'href',
        `/admin/staff/${ana.id}`,
      );
      expect(screen.getByRole('menuitem', { name: 'Deactivate' })).toBeVisible();
      expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeVisible();
      expect(screen.queryByRole('menuitem', { name: 'Reactivate' })).not.toBeInTheDocument();
    });

    it('offers Reactivate instead of Deactivate for an inactive member', async () => {
      seedTwoBranches();
      await open();
      await waitFor(() => expect(bodyRows()).toHaveLength(2));
      await userEvent.click(screen.getByRole('button', { name: 'Actions for Ben Silva' }));
      expect(await screen.findByRole('menuitem', { name: 'Reactivate' })).toBeVisible();
      expect(screen.queryByRole('menuitem', { name: 'Deactivate' })).not.toBeInTheDocument();
    });
  });
});
