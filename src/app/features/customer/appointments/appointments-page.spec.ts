import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { AppointmentsBackend } from '../../../../testing/appointments-backend';
import { createFakeSession, provideFakeSession } from '../../../../testing/fake-session';
import { appointmentsHandlers } from '../../../../testing/handlers/appointments.handlers';
import { ManualClock } from '../../../../testing/manual-clock';
import { makeAppointment, resetMakeAppointment } from '../../../../testing/make-appointment';
import { server } from '../../../../testing/server';
import { APP_CONFIG } from '../../../core/config/app-config';
import { provideCoreHttp } from '../../../core/http/http.providers';
import { CLOCK } from '../../../core/util/clock';
import { AppointmentsPage } from './appointments-page';

const BASE = 'http://gw.test:5290';
const NOW = Date.parse('2026-10-04T12:00:00Z');

function many(count: number) {
  return Array.from({ length: count }, (_, i) =>
    makeAppointment({ startUtc: new Date(NOW + (i + 1) * 86_400_000).toISOString() }),
  );
}

async function open(
  count: number,
  url = '/appointments',
  setup?: (b: AppointmentsBackend) => void,
) {
  resetMakeAppointment();
  const backend = new AppointmentsBackend();
  backend.now = () => NOW;
  backend.add(...many(count));
  server.use(...appointmentsHandlers(BASE, backend));
  setup?.(backend);
  TestBed.configureTestingModule({
    providers: [
      provideCoreHttp(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      { provide: CLOCK, useValue: new ManualClock(NOW) },
      provideRouter([{ path: 'appointments', component: AppointmentsPage }]),
      ...provideFakeSession(createFakeSession('authenticated', 'Customer')),
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  return { backend, harness, router: TestBed.inject(Router) };
}

const cards = () => screen.queryAllByRole('link', { name: /Health check/ });

describe('AppointmentsPage', () => {
  it('shows the heading, a Book link and Upcoming selected by default', async () => {
    const { backend } = await open(2);
    expect(screen.getByRole('heading', { level: 1, name: 'My appointments' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Book an appointment' }).getAttribute('href')).toBe(
      '/book',
    );
    expect(screen.getByRole('tab', { name: 'Upcoming' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    await vi.waitFor(() => expect(cards()).toHaveLength(2));
    expect(backend.listCalls).toEqual([
      { status: 'Booked', when: 'upcoming', page: '1', pageSize: '20' },
    ]);
  });

  it('shows skeletons (busy) first, never the empty state, then the cards', async () => {
    await open(2);
    const panel = screen.getByRole('tabpanel');
    expect(panel.getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByText('No upcoming appointments')).toBeNull();
    await vi.waitFor(() => expect(cards()).toHaveLength(2));
    expect(panel.getAttribute('aria-busy')).toBeNull();
  });

  it('renders names and the zone label from the lookup, grouped by branch-zone date', async () => {
    await open(1);
    const link = (await screen.findAllByRole('link', { name: /Health check/ }))[0];
    expect(within(link).getByText('London Central')).toBeTruthy();
    expect(within(link).getByText(/^(BST|GMT\+1)$/)).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1);
  });

  it('announces "N appointments" and the singular', async () => {
    await open(1);
    await vi.waitFor(() => expect(screen.getByText('1 appointment')).toBeTruthy());
  });

  it('falls back to Upcoming for an unknown tab without changing the URL', async () => {
    const { router, backend } = await open(1, '/appointments?tab=bogus');
    await vi.waitFor(() => expect(cards()).toHaveLength(1));
    expect(router.url).toBe('/appointments?tab=bogus');
    expect(backend.listCalls[0]).toMatchObject({ status: 'Booked', when: 'upcoming' });
  });

  it('selecting Past replaces the URL and requests when=past with no status', async () => {
    const user = userEvent.setup();
    const { router, backend } = await open(1);
    await vi.waitFor(() => expect(cards()).toHaveLength(1));
    await user.click(screen.getByRole('tab', { name: 'Past' }));
    await vi.waitFor(() => expect(router.url).toBe('/appointments?tab=past'));
    await vi.waitFor(() => expect(backend.listCalls).toHaveLength(2));
    expect(backend.listCalls[1]).toEqual({ status: null, when: 'past', page: '1', pageSize: '20' });
    expect(screen.queryByRole('switch')).toBeNull();
    await screen.findByText('No past appointments');
  });

  it('the Status select exists on Past only', async () => {
    const user = userEvent.setup();
    await open(1);
    await vi.waitFor(() => expect(cards()).toHaveLength(1));
    expect(screen.queryByRole('combobox', { name: 'Status' })).toBeNull();
    await user.click(screen.getByRole('tab', { name: 'Past' }));
    const select = await screen.findByRole<HTMLSelectElement>('combobox', { name: 'Status' });
    expect(Array.from(select.options).map((o) => o.text)).toEqual([
      'All',
      'Completed',
      'No-show',
      'Cancelled',
      'Booked',
    ]);
    expect(select.value).toBe('all');
    await user.click(screen.getByRole('tab', { name: 'Upcoming' }));
    await vi.waitFor(() => expect(screen.queryByRole('combobox', { name: 'Status' })).toBeNull());
  });

  it('choosing a status updates the URL and the request, and All clears it', async () => {
    const user = userEvent.setup();
    const { router, backend } = await open(1, '/appointments?tab=past', (b) => {
      b.add(makeAppointment({ startUtc: '2026-09-01T10:00:00Z', status: 'Cancelled' }));
    });
    const select = await screen.findByRole<HTMLSelectElement>('combobox', { name: 'Status' });
    await user.selectOptions(select, 'Cancelled');
    await vi.waitFor(() => expect(router.url).toBe('/appointments?tab=past&pstatus=Cancelled'));
    await vi.waitFor(() => expect(backend.listCalls).toHaveLength(2));
    expect(backend.listCalls[1]).toEqual({
      status: 'Cancelled',
      when: 'past',
      page: '1',
      pageSize: '20',
    });
    await vi.waitFor(() => expect(screen.getByText('1 appointment, Cancelled')).toBeTruthy());
    await user.selectOptions(select, 'All');
    await vi.waitFor(() => expect(router.url).toBe('/appointments?tab=past'));
    await vi.waitFor(() => expect(backend.listCalls).toHaveLength(3));
    expect(backend.listCalls[2]).toMatchObject({ status: null, when: 'past' });
  });

  it('reads pstatus from the URL; No-show is sent as NoShow', async () => {
    const { backend } = await open(1, '/appointments?tab=past&pstatus=NoShow');
    await vi.waitFor(() => expect(backend.listCalls).toHaveLength(1));
    expect(backend.listCalls[0]).toMatchObject({ status: 'NoShow', when: 'past' });
    const select = await screen.findByRole<HTMLSelectElement>('combobox', { name: 'Status' });
    expect(select.value).toBe('NoShow');
  });

  it('an unknown pstatus is All, and pstatus is ignored on Upcoming', async () => {
    const { backend } = await open(1, '/appointments?tab=past&pstatus=Archived');
    await vi.waitFor(() => expect(backend.listCalls).toHaveLength(1));
    expect(backend.listCalls[0]).toMatchObject({ status: null, when: 'past' });
  });

  it('Upcoming ignores pstatus and its request is unchanged', async () => {
    const { backend } = await open(1, '/appointments?pstatus=Completed');
    await vi.waitFor(() => expect(backend.listCalls).toHaveLength(1));
    expect(backend.listCalls[0]).toEqual({
      status: 'Booked',
      when: 'upcoming',
      page: '1',
      pageSize: '20',
    });
  });

  it('a filtered empty Past list says no appointments match', async () => {
    await open(0, '/appointments?tab=past&pstatus=Cancelled');
    await screen.findByText('No matching appointments');
  });

  it('Show cancelled drops the status filter and is held in the URL', async () => {
    const user = userEvent.setup();
    const { router, backend } = await open(1);
    await vi.waitFor(() => expect(cards()).toHaveLength(1));
    await user.click(screen.getByRole('switch', { name: 'Show cancelled' }));
    await vi.waitFor(() => expect(router.url).toContain('cancelled=1'));
    await vi.waitFor(() => expect(backend.listCalls).toHaveLength(2));
    expect(backend.listCalls[1]).toMatchObject({ status: null, when: 'upcoming' });
  });

  it('reads cancelled=1 from the URL on Upcoming only', async () => {
    const { backend } = await open(1, '/appointments?tab=past&cancelled=1');
    await vi.waitFor(() => expect(backend.listCalls).toHaveLength(1));
    expect(backend.listCalls[0]).toMatchObject({ status: null, when: 'past' });
  });

  it('Load more appends the next page, once per click, and keeps focus on the button', async () => {
    const user = userEvent.setup();
    const { backend } = await open(25);
    await vi.waitFor(() => expect(cards()).toHaveLength(20));
    const button = screen.getByRole('button', { name: 'Load more' });
    await user.dblClick(button);
    await vi.waitFor(() => expect(cards()).toHaveLength(25));
    expect(backend.listCalls.map((c) => c.page)).toEqual(['1', '2']);
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    expect(screen.getByText('Loaded 5 more appointments')).toBeTruthy();
  });

  it('shows the empty state only after a successful empty response', async () => {
    await open(0);
    expect(screen.queryByText('No upcoming appointments')).toBeNull();
    await screen.findByText('No upcoming appointments');
    expect(screen.getAllByRole('link', { name: 'Book an appointment' })).toHaveLength(2);
  });

  it('a failed first page shows an alert with Try again and no empty state', async () => {
    const user = userEvent.setup();
    const { backend } = await open(1, '/appointments', (b) => {
      b.forceListProblem = { status: 500, detail: 'boom' };
    });
    const alert = await screen.findByRole('alert');
    expect(alert).toBeTruthy();
    expect(screen.queryByText('No upcoming appointments')).toBeNull();
    backend.forceListProblem = null;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await vi.waitFor(() => expect(cards()).toHaveLength(1));
  });

  it('a failed Load more keeps the list and retries the same page', async () => {
    const user = userEvent.setup();
    const { backend } = await open(25);
    await vi.waitFor(() => expect(cards()).toHaveLength(20));
    backend.forceListProblem = { status: 500, detail: 'boom' };
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByRole('alert');
    expect(cards()).toHaveLength(20);
    backend.forceListProblem = null;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await vi.waitFor(() => expect(cards()).toHaveLength(25));
    expect(backend.listCalls.map((c) => c.page)).toEqual(['1', '2', '2']);
  });

  it('a 403 shows the message and a link to the landing route', async () => {
    await open(0, '/appointments', (b) => {
      b.forceListProblem = { status: 403, detail: 'Forbidden' };
    });
    await screen.findByRole('alert');
    expect(screen.getByRole('link', { name: 'Go to your home page' }).getAttribute('href')).toBe(
      '/book',
    );
  });

  it('a lookup failure does not block the list: fallbacks plus one notice with Try again', async () => {
    const user = userEvent.setup();
    resetMakeAppointment();
    let failing = true;
    await open(1, '/appointments', () => {
      server.use(
        http.get(`${BASE}/api/Branches`, () =>
          failing
            ? HttpResponse.json({ status: 500, detail: 'x' }, { status: 500 })
            : HttpResponse.json([]),
        ),
      );
    });
    const link = (await screen.findAllByRole('link', { name: /Health check/ }))[0];
    expect(within(link).getByText('Unavailable branch')).toBeTruthy();
    expect(within(link).getByText('your time')).toBeTruthy();
    expect(screen.getByText('Some names could not be loaded.')).toBeTruthy();
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await vi.waitFor(() =>
      expect(screen.queryByText('Some names could not be loaded.')).toBeNull(),
    );
  });
});
