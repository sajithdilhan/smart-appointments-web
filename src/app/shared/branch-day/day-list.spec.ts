import { TestBed } from '@angular/core/testing';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { createBranchDayBackend } from '../../../testing/branch-day-backend';
import { makeDayContext, provideBranchDayApi } from '../../../testing/branch-day-test-setup';
import { createFakeToast } from '../../../testing/fake-session';
import { ManualClock } from '../../../testing/manual-clock';
import {
  BRANCH_ID,
  CUSTOMER_ID,
  resetMakeAppointment,
  SERVICE_ID,
} from '../../../testing/make-appointment';
import { server } from '../../../testing/server';
import { stubViewport } from '../../../testing/stub-viewport';
import { ToastService } from '../../core/notify/toast.service';
import { CLOCK } from '../../core/util/clock';
import { BranchDayStore, type DayQuery } from './branch-day.store';
import { BRANCH_DAY_CONTEXT } from './branch-day-context';
import { DayList } from './day-list.component';

const NOW = Date.parse('2026-10-24T09:00:00Z');
const DAY: DayQuery = { branchId: BRANCH_ID, date: '2026-10-24', status: 'all' };
const OTHER_CUSTOMER = '00000000-0000-4000-8000-0000000000c2';

async function setup(width = 1024, options: { branchId?: string } = {}) {
  stubViewport(width);
  resetMakeAppointment();
  const clock = new ManualClock(NOW);
  const backend = createBranchDayBackend({ now: () => clock.now() });
  server.use(...backend.handlers);
  backend.addCustomer(CUSTOMER_ID);
  const ctx = makeDayContext({ services: [[SERVICE_ID, 'Health check']] });
  const view = await render(DayList, {
    providers: [
      ...provideBranchDayApi({ branchId: options.branchId }),
      { provide: CLOCK, useValue: clock },
      { provide: ToastService, useValue: createFakeToast() },
      { provide: BRANCH_DAY_CONTEXT, useValue: ctx },
      BranchDayStore,
    ],
  });
  const store = TestBed.inject(BranchDayStore);
  const open = async (query: DayQuery = DAY) => {
    await store.open(query);
    view.detectChanges();
  };
  return { backend, store, view, open };
}

function seed(backend: Awaited<ReturnType<typeof setup>>['backend'], count = 2) {
  for (let i = 0; i < count; i += 1) {
    backend.addAppointment({
      startUtc: `2026-10-24T${String(9 + i).padStart(2, '0')}:30:00Z`,
      endUtc: `2026-10-24T${String(10 + i).padStart(2, '0')}:00:00Z`,
    });
  }
}

afterEach(() => vi.unstubAllGlobals());

describe('DayList', () => {
  describe('table layout (640 px and wider)', () => {
    it('renders a captioned table with one row per appointment', async () => {
      const { backend, open } = await setup(1024);
      seed(backend);
      await open();
      const table = screen.getByRole('table', {
        name: /Appointments for\s+Saturday 24 October 2026/,
      });
      expect(
        within(table)
          .getAllByRole('columnheader')
          .map((h) => h.textContent?.trim()),
      ).toEqual(['Time', 'Customer', 'Phone', 'Service', 'Status', 'Actions']);
      const rows = within(table).getAllByRole('row').slice(1);
      expect(rows).toHaveLength(2);
      const first = within(rows[0]);
      expect(first.getByRole('button', { name: '10:30 to 11:00' })).toBeTruthy();
      expect(first.getByRole('button', { name: 'Ana Perera' })).toBeTruthy();
      expect(first.getByRole('link', { name: '+94771234567' }).getAttribute('href')).toBe(
        'tel:+94771234567',
      );
      expect(first.getByText('Health check')).toBeTruthy();
      expect(first.getByText('Booked')).toBeTruthy();
      expect(screen.queryByRole('list')).toBeNull();
    });

    it('shows the count for the filter, politely', async () => {
      const { backend, open } = await setup();
      seed(backend);
      await open();
      expect(screen.getByText('2 appointments').getAttribute('role')).toBe('status');
    });

    it('falls back to Unavailable service for an unknown service id', async () => {
      const { backend, open } = await setup();
      backend.addAppointment({
        serviceTypeId: '00000000-0000-4000-8000-0000000000e9',
        startUtc: '2026-10-24T09:30:00Z',
        endUtc: '2026-10-24T10:00:00Z',
      });
      await open();
      expect(screen.getByText('Unavailable service')).toBeTruthy();
    });

    it('opens a row from the name or the time', async () => {
      const { backend, view, open } = await setup();
      seed(backend, 1);
      await open();
      const opened: { id: string; trigger: HTMLElement }[] = [];
      view.fixture.componentInstance.open.subscribe((e) => opened.push(e));
      const name = screen.getByRole('button', { name: 'Ana Perera' });
      await userEvent.click(name);
      await userEvent.click(screen.getByRole('button', { name: '10:30 to 11:00' }));
      expect(opened).toHaveLength(2);
      expect(opened[0].id).toBe(backend.state.appointments[0].id);
      expect(opened[0].trigger).toBe(name);
      expect(name.getAttribute('aria-haspopup')).toBe('dialog');
    });
  });

  describe('card layout (below 640 px)', () => {
    it('renders a list of cards and no table', async () => {
      const { backend, open } = await setup(400);
      seed(backend);
      await open();
      expect(screen.queryByRole('table')).toBeNull();
      const items = screen.getAllByRole('listitem');
      expect(items).toHaveLength(2);
      const card = within(items[0]);
      expect(card.getByRole('button', { name: /10:30 to 11:00,s*Ana Perera/ })).toBeTruthy();
      expect(card.getByRole('link', { name: '+94771234567' }).getAttribute('href')).toBe(
        'tel:+94771234567',
      );
      expect(card.getByText('Health check')).toBeTruthy();
    });

    it('uses no fixed widths at 320 px, so nothing forces a horizontal scroll', async () => {
      const { backend, open, view } = await setup(320);
      seed(backend);
      await open();
      const root = view.fixture.nativeElement as HTMLElement;
      expect(root.querySelectorAll('[class*="w-["], [class*="min-w-["]')).toHaveLength(0);
      expect(root.querySelector('table')).toBeNull();
      expect(root.querySelector('ul')?.className).not.toContain('overflow-x');
    });

    it('opens a card', async () => {
      const { backend, view, open } = await setup(400);
      seed(backend, 1);
      await open();
      const opened: string[] = [];
      view.fixture.componentInstance.open.subscribe((e) => opened.push(e.id));
      await userEvent.click(screen.getByRole('button', { name: /^10:30 to 11:00/ }));
      expect(opened).toEqual([backend.state.appointments[0].id]);
    });
  });

  describe('states', () => {
    it('shows a busy skeleton while loading', async () => {
      const { backend, store, view } = await setup();
      seed(backend);
      const pending = store.open(DAY);
      view.detectChanges();
      const skeleton = screen.getByRole('status', { name: 'Loading appointments' });
      expect(skeleton.getAttribute('aria-busy')).toBe('true');
      expect(screen.queryByRole('table')).toBeNull();
      await pending;
      view.detectChanges();
      expect(screen.queryByRole('status', { name: 'Loading appointments' })).toBeNull();
    });

    it('shows nothing before a day is opened', async () => {
      const { view } = await setup();
      expect((view.fixture.nativeElement as HTMLElement).textContent?.trim()).toBe('');
    });

    it('says the day is empty, with the filter named, and shows no table', async () => {
      const { open } = await setup();
      await open();
      expect(screen.getByText('No appointments on this day.')).toBeTruthy();
      expect(screen.queryByRole('table')).toBeNull();
      await open({ ...DAY, status: 'Booked' });
      expect(screen.getByText('No Booked appointments on this day.')).toBeTruthy();
      await open({ ...DAY, status: 'NoShow' });
      expect(screen.getByText('No No-show appointments on this day.')).toBeTruthy();
    });

    it('shows the customers notice and "Name unavailable" on every row when Auth is down', async () => {
      const { backend, open } = await setup();
      seed(backend);
      backend.flags.customersUnavailable = true;
      await open();
      expect(
        screen.getByText('Customer names are unavailable right now. Refresh to try again.'),
      ).toBeTruthy();
      expect(screen.getAllByRole('button', { name: 'Name unavailable' })).toHaveLength(2);
      expect(screen.queryByRole('link', { name: /\+94/ })).toBeNull();
    });

    it('marks only the row without a customer when one lookup is missing', async () => {
      const { backend, open } = await setup();
      backend.addAppointment({
        startUtc: '2026-10-24T09:30:00Z',
        endUtc: '2026-10-24T10:00:00Z',
      });
      backend.addAppointment({
        customerId: OTHER_CUSTOMER,
        startUtc: '2026-10-24T10:30:00Z',
        endUtc: '2026-10-24T11:00:00Z',
      });
      await open();
      expect(screen.queryByText(/Customer names are unavailable/)).toBeNull();
      expect(screen.getAllByRole('button', { name: 'Name unavailable' })).toHaveLength(1);
      expect(screen.getByRole('button', { name: 'Ana Perera' })).toBeTruthy();
      expect(screen.getAllByRole('link', { name: /\+94/ })).toHaveLength(1);
    });

    it('shows Load more only while rows are missing, busy while it loads, and appends', async () => {
      const { backend, store, open } = await setup();
      for (let i = 0; i < 101; i += 1) {
        const minute = String(i % 60).padStart(2, '0');
        const hour = String(Math.floor(i / 60) + 1).padStart(2, '0');
        backend.addAppointment({
          startUtc: `2026-10-24T${hour}:${minute}:00Z`,
          endUtc: `2026-10-24T${hour}:${minute}:30Z`,
        });
      }
      await open();
      expect(screen.getByText('101 appointments')).toBeTruthy();
      const button = screen.getByRole('button', { name: 'Load more' }) as HTMLButtonElement;
      await userEvent.click(button);
      expect(button.disabled).toBe(true);
      expect(button.getAttribute('aria-busy')).toBe('true');
      await vi.waitFor(() => expect(store.items()).toHaveLength(101));
      await vi.waitFor(() =>
        expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull(),
      );
    });

    it('has no Load more when everything is loaded', async () => {
      const { backend, open } = await setup();
      seed(backend);
      await open();
      expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    });

    it('shows a failed Load more with Retry and keeps the rows', async () => {
      const { backend, store, view, open } = await setup();
      for (let i = 0; i < 101; i += 1) {
        const minute = String(i % 60).padStart(2, '0');
        const hour = String(Math.floor(i / 60) + 1).padStart(2, '0');
        backend.addAppointment({
          startUtc: `2026-10-24T${hour}:${minute}:00Z`,
          endUtc: `2026-10-24T${hour}:${minute}:30Z`,
        });
      }
      await open();
      backend.flags.failNext = 500;
      await store.loadMore();
      view.detectChanges();
      const alert = screen.getByRole('alert');
      expect(store.items()).toHaveLength(100);
      expect(screen.getByRole('table')).toBeTruthy();
      await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
      await vi.waitFor(() => expect(store.items()).toHaveLength(101));
    });
  });

  describe('errors', () => {
    it('403 reads "You can only see your own branch." and Retry repeats the request', async () => {
      const { backend, open } = await setup(1024, {
        branchId: '00000000-0000-4000-8000-0000000000b9',
      });
      seed(backend);
      await open();
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toContain('You can only see your own branch.');
      const before = backend.state.requests.length;
      await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
      await vi.waitFor(() => expect(backend.state.requests.length).toBe(before + 1));
    });

    it('503 reads the time zone text, then Retry loads the day', async () => {
      const { backend, open } = await setup();
      seed(backend);
      backend.flags.zoneUnavailable = true;
      await open();
      expect(screen.getByRole('alert').textContent).toContain(
        "The branch's time zone could not be loaded. Try again shortly.",
      );
      backend.flags.zoneUnavailable = false;
      await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
      await vi.waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
    });

    it('other failures show the F1 message', async () => {
      const { backend, open } = await setup();
      backend.flags.failNext = 500;
      await open();
      const text = screen.getByRole('alert').textContent ?? '';
      expect(text).toContain('Retry');
      expect(text).not.toContain('own branch');
      expect(text).not.toContain('time zone');
    });

    it('a network error shows the F1 message', async () => {
      const { backend, open } = await setup();
      backend.flags.networkError = true;
      await open();
      expect(screen.getByRole('alert').textContent).toContain('Cannot reach the server');
    });
  });
});
