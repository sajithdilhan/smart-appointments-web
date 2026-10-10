import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { provideAdminApi, useAdminBackend } from '../../../../testing/admin-test-setup';
import { flags, seedService, state } from '../../../../testing/availability-admin-backend';
import { createFakeToast } from '../../../../testing/fake-session';
import { stubViewport } from '../../../../testing/stub-viewport';
import { OutageState } from '../../../core/http/outage-state';
import { ToastService } from '../../../core/notify/toast.service';
import { ServicesStore } from '../data/services.store';
import { ServicesPage } from './services.page';

@Component({ selector: 'app-drawer-stub', template: `<p>drawer is open</p>` })
class DrawerStub {}

beforeEach(useAdminBackend);
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.querySelectorAll('app-confirm-dialog').forEach((n) => n.remove());
});

async function open(url = '/', width = 1280) {
  stubViewport(width);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: '', component: ServicesPage, children: [{ path: 'new', component: DrawerStub }] },
      ]),
      ...provideAdminApi(),
      { provide: ToastService, useValue: createFakeToast() },
      ServicesStore,
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, ServicesPage);
  return { router: TestBed.inject(Router), store: TestBed.inject(ServicesStore) };
}

function names(): string[] {
  return screen
    .queryAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('cell')[1].textContent!.trim());
}

function seedThree() {
  seedService({ code: 'CUT', name: 'Haircut', durationMinutes: 45, description: 'Short back' });
  seedService({ code: 'COL', name: 'Colour', durationMinutes: 90 });
  seedService({ code: 'OLD', name: 'Archive', durationMinutes: 60, isActive: false });
}

describe('ServicesPage', () => {
  it('renders the heading, the New service link and a captioned table with its columns', async () => {
    seedThree();
    await open();
    expect(screen.getByRole('heading', { level: 1, name: 'Services' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New service' })).toHaveAttribute(
      'href',
      '/admin/services/new',
    );
    const table = await screen.findByRole('table', { name: 'Services' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent!.trim()),
    ).toEqual(['Code', 'Name', 'Duration', 'Status', 'Actions']);
    expect(names()).toEqual(['Archive', 'Colour', 'Haircut']);
    expect(state.requests.filter((r) => r.method === 'GET').map((r) => r.search)).toEqual([
      '?includeInactive=true',
    ]);
  });

  it('formats durations and shows status badges with text', async () => {
    seedThree();
    await open();
    const rows = (await screen.findAllByRole('row')).slice(1);
    const [archive, colour, haircut] = rows.map((r) => within(r).getAllByRole('cell'));
    expect(archive[2]).toHaveTextContent('1 h');
    expect(colour[2]).toHaveTextContent('1 h 30 min');
    expect(haircut[2]).toHaveTextContent('45 min');
    expect(archive[3]).toHaveTextContent('Inactive');
    expect(haircut[3]).toHaveTextContent('Active');
  });

  it('names row actions after the service', async () => {
    const s = seedService({ name: 'Haircut' });
    await open();
    expect(await screen.findByRole('link', { name: 'Edit Haircut' })).toHaveAttribute(
      'href',
      `/admin/services/${s.id}`,
    );
    expect(screen.getByRole('button', { name: 'Deactivate Haircut' })).toBeVisible();
  });

  it('searches code, name and description, and filters by status', async () => {
    seedThree();
    await open();
    await screen.findByRole('table');
    const search = screen.getByRole('searchbox', { name: 'Search services' });
    await userEvent.type(search, 'short back');
    expect(names()).toEqual(['Haircut']);
    await userEvent.clear(search);
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'inactive');
    expect(names()).toEqual(['Archive']);
  });

  it('sorts by duration with aria-sort', async () => {
    seedThree();
    await open();
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Sort by Duration' }));
    expect(screen.getByRole('columnheader', { name: /Duration/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    expect(names()).toEqual(['Haircut', 'Archive', 'Colour']);
    await userEvent.click(screen.getByRole('button', { name: 'Sort by Duration' }));
    expect(names()).toEqual(['Colour', 'Archive', 'Haircut']);
  });

  it('deactivates through the confirmation and updates the badge', async () => {
    seedService({ name: 'Haircut' });
    const { store } = await open();
    await userEvent.click(await screen.findByRole('button', { name: 'Deactivate Haircut' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Deactivate service' }));
    await waitFor(() => expect(store.items()[0].isActive).toBe(false));
    expect(await screen.findByRole('button', { name: 'Activate Haircut' })).toBeVisible();
  });

  describe('list states', () => {
    it('empty state with a New service button', async () => {
      await open();
      expect(await screen.findByText('No services yet.')).toBeVisible();
      expect(screen.getAllByRole('link', { name: 'New service' })).toHaveLength(2);
    });

    it('no-match state with Clear filters', async () => {
      seedThree();
      await open();
      await screen.findByRole('table');
      await userEvent.type(screen.getByRole('searchbox'), 'zzz');
      expect(screen.getByText('No services match your filters.')).toBeVisible();
      await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
      expect(names()).toHaveLength(3);
    });

    it('error state with Retry', async () => {
      seedThree();
      flags.failAll = 503;
      await open();
      expect(await screen.findByRole('alert')).toHaveTextContent(/.+/);
      flags.failAll = null;
      await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(await screen.findByRole('table')).toBeVisible();
    });
  });

  it('renders cards with the same fields below 768 px, and a labelled sort select', async () => {
    seedThree();
    await open('/', 500);
    const cards = await screen.findAllByRole('listitem');
    expect(cards).toHaveLength(3);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(cards[2]).toHaveTextContent('Haircut');
    expect(cards[2]).toHaveTextContent('45 min');
    expect(within(cards[2]).getByRole('link', { name: 'Edit Haircut' })).toBeVisible();
    await userEvent.selectOptions(screen.getByLabelText('Sort by'), 'duration:desc');
    expect(
      screen.getAllByRole('listitem').map((li) => li.querySelector('p')!.textContent!.trim()),
    ).toEqual(['Colour', 'Archive', 'Haircut']);
  });

  it('keeps the list mounted behind a drawer child route and reloads on recovery', async () => {
    seedThree();
    const { router } = await open('/?q=cut');
    await screen.findByRole('table');
    await router.navigateByUrl('/new?q=cut');
    expect(await screen.findByText('drawer is open')).toBeVisible();
    expect(names()).toEqual(['Haircut']);
    seedService({ name: 'Late cut' });
    TestBed.inject(OutageState).recovered.update((n) => n + 1);
    expect(await screen.findByText('Late cut')).toBeVisible();
  });
});
