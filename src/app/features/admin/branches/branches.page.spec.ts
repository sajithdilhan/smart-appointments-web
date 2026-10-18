import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { provideAdminApi, useAdminBackend } from '../../../../testing/admin-test-setup';
import { flags, seedBranch, state } from '../../../../testing/availability-admin-backend';
import { stubViewport } from '../../../../testing/stub-viewport';
import { OutageState } from '../../../core/http/outage-state';
import { BranchesStore } from '../data/branches.store';
import { BranchesPage, scheduleSummary } from './branches.page';

@Component({ selector: 'app-drawer-stub', template: `<p>drawer is open</p>` })
class DrawerStub {}

beforeEach(useAdminBackend);
afterEach(() => vi.unstubAllGlobals());

const HOURS = (days: number) =>
  (['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const)
    .slice(0, days)
    .map((dayOfWeek) => ({ dayOfWeek, opensAt: '09:00', closesAt: '17:00' }));

async function open(url = '/', width = 1280) {
  stubViewport(width);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        {
          path: '',
          component: BranchesPage,
          children: [{ path: 'new', component: DrawerStub }],
        },
      ]),
      ...provideAdminApi(),
      BranchesStore,
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, BranchesPage);
  return { harness, router: TestBed.inject(Router), store: TestBed.inject(BranchesStore) };
}

function names(): string[] {
  return screen
    .queryAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('cell')[1].textContent!.trim());
}

function seedThree() {
  seedBranch({
    code: 'COL',
    name: 'Colombo Central',
    phoneNumber: '+94112223344',
    timeZoneId: 'Asia/Colombo',
    workingHours: HOURS(5),
  });
  seedBranch({ code: 'KDY', name: 'Kandy', address: 'Temple Road' });
  seedBranch({
    code: 'GAL',
    name: 'Galle',
    isActive: false,
    timeZoneId: 'Asia/Colombo',
    workingHours: HOURS(1),
  });
}

describe('scheduleSummary', () => {
  it.each([
    [{ timeZoneId: 'Asia/Colombo', workingHours: HOURS(5) }, 'Asia/Colombo, 5 days open'],
    [{ timeZoneId: 'Asia/Colombo', workingHours: HOURS(1) }, 'Asia/Colombo, 1 day open'],
    [{ timeZoneId: 'Asia/Colombo', workingHours: [] }, null],
    [{ timeZoneId: null, workingHours: HOURS(3) }, null],
  ])('%j gives %s', (over, expected) => {
    expect(scheduleSummary(seedBranch(over))).toBe(expected);
  });
});

describe('BranchesPage', () => {
  it('renders the heading, the New branch link, a captioned table and its columns', async () => {
    seedThree();
    await open();
    expect(screen.getByRole('heading', { level: 1, name: 'Branches' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New branch' })).toHaveAttribute(
      'href',
      '/admin/branches/new',
    );
    const table = await screen.findByRole('table', { name: 'Branches' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent!.trim()),
    ).toEqual(['Code', 'Name', 'Phone', 'Status', 'Schedule', 'Actions']);
    expect(names()).toEqual(['Colombo Central', 'Galle', 'Kandy']);
    expect(state.requests.filter((r) => r.method === 'GET').map((r) => r.search)).toEqual([
      '?includeInactive=true',
    ]);
  });

  it('shows status badges with text, and the schedule or "Not set"', async () => {
    seedThree();
    await open();
    const rows = (await screen.findAllByRole('row')).slice(1);
    const [colombo, galle, kandy] = rows.map((r) => within(r).getAllByRole('cell'));
    expect(colombo[3]).toHaveTextContent('Active');
    expect(galle[3]).toHaveTextContent('Inactive');
    expect(colombo[4]).toHaveTextContent('Asia/Colombo, 5 days open');
    expect(galle[4]).toHaveTextContent('Asia/Colombo, 1 day open');
    expect(kandy[4]).toHaveTextContent('Not set');
  });

  it('names each row action after its branch', async () => {
    const [first] = [seedBranch({ name: 'Colombo Central' })];
    await open();
    expect(await screen.findByRole('link', { name: 'Edit Colombo Central' })).toHaveAttribute(
      'href',
      `/admin/branches/${first.id}`,
    );
    expect(screen.getByRole('link', { name: 'Schedule for Colombo Central' })).toHaveAttribute(
      'href',
      `/admin/branches/${first.id}/schedule`,
    );
  });

  describe('search and filter', () => {
    it('filters by code, name, address or phone, and by status', async () => {
      seedThree();
      await open();
      await screen.findByRole('table');
      const search = screen.getByRole('searchbox', { name: 'Search branches' });
      await userEvent.type(search, 'temple');
      expect(names()).toEqual(['Kandy']);
      await userEvent.clear(search);
      await userEvent.type(search, '94112');
      expect(names()).toEqual(['Colombo Central']);
      await userEvent.clear(search);
      await userEvent.selectOptions(screen.getByLabelText('Status'), 'inactive');
      expect(names()).toEqual(['Galle']);
      await userEvent.selectOptions(screen.getByLabelText('Status'), 'active');
      expect(names()).toEqual(['Colombo Central', 'Kandy']);
    });

    it('mirrors the search and filter in the URL', async () => {
      seedThree();
      const { router } = await open();
      await screen.findByRole('table');
      await userEvent.type(screen.getByRole('searchbox', { name: 'Search branches' }), 'kan');
      await userEvent.selectOptions(screen.getByLabelText('Status'), 'active');
      await waitFor(() => expect(router.url).toBe('/?q=kan&status=active'));
    });

    it('reads the filter from the URL, and an unknown status means All', async () => {
      seedThree();
      await open('/?status=inactive&q=gal');
      await screen.findByRole('table');
      expect(names()).toEqual(['Galle']);
      expect(screen.getByRole('searchbox', { name: 'Search branches' })).toHaveValue('gal');
      expect(screen.getByLabelText('Status')).toHaveValue('inactive');
    });

    it('treats an unknown status value as All', async () => {
      seedThree();
      await open('/?status=bogus');
      await screen.findByRole('table');
      expect(names()).toHaveLength(3);
      expect(screen.getByLabelText('Status')).toHaveValue('all');
    });
  });

  describe('sorting', () => {
    it('cycles ascending, descending, default, with aria-sort on the header', async () => {
      seedBranch({ code: 'ZED', name: 'Alpha' });
      seedBranch({ code: 'MID', name: 'Beta' });
      seedBranch({ code: 'AAA', name: 'Gamma' });
      await open();
      await screen.findByRole('table');
      const code = () => screen.getByRole('columnheader', { name: /Code/ });
      const click = (name: string) => userEvent.click(screen.getByRole('button', { name }));
      expect(code()).toHaveAttribute('aria-sort', 'none');
      expect(names()).toEqual(['Alpha', 'Beta', 'Gamma']);
      await click('Sort by Code');
      expect(code()).toHaveAttribute('aria-sort', 'ascending');
      expect(names()).toEqual(['Gamma', 'Beta', 'Alpha']);
      await click('Sort by Code');
      expect(code()).toHaveAttribute('aria-sort', 'descending');
      expect(names()).toEqual(['Alpha', 'Beta', 'Gamma']);
      await click('Sort by Code');
      expect(code()).toHaveAttribute('aria-sort', 'none');
      await click('Sort by Name');
      await click('Sort by Name');
      expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute(
        'aria-sort',
        'descending',
      );
      expect(names()).toEqual(['Gamma', 'Beta', 'Alpha']);
    });
  });

  describe('list states', () => {
    it('shows skeleton rows while loading', async () => {
      await open();
      expect(screen.getByRole('status', { name: 'Loading branches' })).toHaveAttribute(
        'aria-busy',
        'true',
      );
      await screen.findByText('No branches yet.');
    });

    it('shows the empty state with a New branch button', async () => {
      await open();
      expect(await screen.findByText('No branches yet.')).toBeVisible();
      expect(screen.getAllByRole('link', { name: 'New branch' })).toHaveLength(2);
    });

    it('shows the no-match state with Clear filters', async () => {
      seedThree();
      await open();
      await screen.findByRole('table');
      await userEvent.type(screen.getByRole('searchbox'), 'zzz');
      expect(screen.getByText('No branches match your filters.')).toBeVisible();
      await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
      expect(names()).toHaveLength(3);
      expect(screen.getByRole('searchbox')).toHaveValue('');
    });

    it('shows the error with Retry in place of the table', async () => {
      seedThree();
      flags.failAll = 503;
      await open();
      expect(await screen.findByRole('alert')).toHaveTextContent(/.+/);
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      flags.failAll = null;
      await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(await screen.findByRole('table')).toBeVisible();
    });
  });

  it('announces the count once per settled change', async () => {
    seedThree();
    await open();
    await screen.findByRole('table');
    await waitFor(() => expect(screen.getByText('3 branches shown')).toBeInTheDocument(), {
      timeout: 2000,
    });
    await userEvent.type(screen.getByRole('searchbox'), 'kan');
    await waitFor(() => expect(screen.getByText('1 branch shown')).toBeInTheDocument(), {
      timeout: 2000,
    });
  });

  describe('card layout below 768 px', () => {
    it('renders one card per branch with the same fields and actions', async () => {
      seedThree();
      await open('/', 500);
      const cards = await screen.findAllByRole('listitem');
      expect(cards).toHaveLength(3);
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      const colombo = cards[0];
      expect(colombo).toHaveTextContent('Colombo Central');
      expect(colombo).toHaveTextContent('COL');
      expect(colombo).toHaveTextContent('Active');
      expect(colombo).toHaveTextContent('Asia/Colombo, 5 days open');
      expect(within(colombo).getByRole('link', { name: 'Edit Colombo Central' })).toBeVisible();
      expect(within(cards[2]).getByText('Not set')).toBeVisible();
    });

    it('sorts through a labelled select', async () => {
      seedThree();
      await open('/', 500);
      await screen.findAllByRole('listitem');
      await userEvent.selectOptions(screen.getByLabelText('Sort by'), 'name:desc');
      expect(
        screen.getAllByRole('listitem').map((li) => li.querySelector('p')!.textContent!.trim()),
      ).toEqual(['Kandy', 'Galle', 'Colombo Central']);
    });
  });

  it('keeps search, filter and sort after the store is updated', async () => {
    seedThree();
    const { store } = await open();
    await screen.findByRole('table');
    await userEvent.type(screen.getByRole('searchbox'), 'gal');
    await userEvent.click(screen.getByRole('button', { name: 'Sort by Name' }));
    store.upsert({ ...store.byId(store.items()[1].id)!, name: 'Galle Fort' });
    await waitFor(() => expect(names()).toEqual(['Galle Fort']));
    expect(screen.getByRole('searchbox')).toHaveValue('gal');
    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
  });

  it('reloads when the backend recovers from an outage', async () => {
    await open();
    await screen.findByText('No branches yet.');
    seedBranch({ name: 'Late arrival' });
    TestBed.inject(OutageState).recovered.update((n) => n + 1);
    expect(await screen.findByText('Late arrival')).toBeVisible();
  });

  it('keeps the list mounted behind a drawer child route', async () => {
    seedThree();
    const { router } = await open('/?q=kan');
    await screen.findByRole('table');
    await router.navigateByUrl('/new?q=kan');
    expect(await screen.findByText('drawer is open')).toBeVisible();
    expect(names()).toEqual(['Kandy']);
    expect(screen.getByRole('searchbox')).toHaveValue('kan');
    expect(state.requests.filter((r) => r.method === 'GET')).toHaveLength(1);
  });
});
