import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { createBranchDayBackend } from '../../../../testing/branch-day-backend';
import { provideBranchDayApi } from '../../../../testing/branch-day-test-setup';
import { createFakeToast } from '../../../../testing/fake-session';
import { ManualClock } from '../../../../testing/manual-clock';
import { BRANCH_ID, CUSTOMER_ID, resetMakeAppointment } from '../../../../testing/make-appointment';
import { server } from '../../../../testing/server';
import { stubViewport } from '../../../../testing/stub-viewport';
import type { Branch, ServiceType } from '../../../core/api/models';
import { ToastService } from '../../../core/notify/toast.service';
import { CLOCK } from '../../../core/util/clock';
import { BranchesStore } from '../data/branches.store';
import { ServicesStore } from '../data/services.store';
import { AdminAppointmentsPage } from './appointments.page';

const NOW = Date.parse('2026-10-24T09:00:00Z');
const PAGO_ID = '00000000-0000-4000-8000-0000000000b2';
const GALLE_ID = '00000000-0000-4000-8000-0000000000b3';

function fakeStore<T extends { id: string }>(items: T[]) {
  const list = signal(items);
  return {
    items: list,
    status: signal<'idle' | 'loading' | 'loaded' | 'error'>('loaded'),
    load: vi.fn(() => Promise.resolve()),
    byId: (id: string) => list().find((i) => i.id === id),
  };
}

async function setup(url: string) {
  stubViewport(1280);
  resetMakeAppointment();
  const clock = new ManualClock(NOW);
  const backend = createBranchDayBackend({ now: () => clock.now() });
  server.use(...backend.handlers);
  backend.addCustomer(CUSTOMER_ID);
  backend.addBranch({
    id: PAGO_ID,
    code: 'PPG',
    name: 'Pago Pago',
    timeZoneId: 'Pacific/Pago_Pago',
  });
  backend.addBranch({
    id: GALLE_ID,
    code: 'GAL',
    name: 'Galle',
    isActive: false,
    timeZoneId: null,
  });
  const branches = fakeStore<Branch>(backend.state.branches);
  const services = fakeStore<ServiceType>(backend.state.services);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'admin/appointments', component: AdminAppointmentsPage }]),
      ...provideBranchDayApi({ role: 'Admin' }),
      { provide: CLOCK, useValue: clock },
      { provide: ToastService, useValue: createFakeToast() },
      { provide: BranchesStore, useValue: branches },
      { provide: ServicesStore, useValue: services },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, AdminAppointmentsPage);
  harness.detectChanges();
  const router = TestBed.inject(Router);
  const query = () => new URL(router.url, 'http://x').searchParams;
  return { backend, harness, query };
}

const dayRequests = (backend: ReturnType<typeof createBranchDayBackend>) =>
  backend.state.requests.filter((r) => r.path.includes('/branch/'));

afterEach(() => vi.unstubAllGlobals());

describe('AdminAppointmentsPage', () => {
  it('lists every branch by name and code, marking inactive ones', async () => {
    await setup('/admin/appointments');
    const select = screen.getByRole('combobox', { name: 'Branch' });
    const options = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent?.replace(/\s+/g, ' ').trim());
    expect(options).toEqual([
      'Choose a branch',
      'London Central (LDN)',
      'Pago Pago (PPG)',
      'Galle (GAL) (inactive)',
    ]);
  });

  it('asks for a branch and requests nothing without one', async () => {
    const { backend } = await setup('/admin/appointments');
    expect(screen.getByText('Choose a branch to see its appointments.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
    expect(dayRequests(backend)).toHaveLength(0);
  });

  it.each(['not-a-guid', '00000000-0000-4000-8000-0000000000ff'])(
    'treats ?branch=%s as none',
    async (value) => {
      const { backend } = await setup(`/admin/appointments?branch=${value}`);
      expect(screen.getByText('Choose a branch to see its appointments.')).toBeTruthy();
      expect(dayRequests(backend)).toHaveLength(0);
    },
  );

  it('shows the chosen branch day in its zone and keeps date and status in the URL', async () => {
    const { backend, query } = await setup('/admin/appointments');
    backend.addAppointment({
      startUtc: '2026-10-24T09:30:00Z',
      endUtc: '2026-10-24T10:00:00Z',
    });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Branch' }), BRANCH_ID);
    await waitFor(() => expect(query().get('date')).toBe('2026-10-24'));
    expect(query().get('branch')).toBe(BRANCH_ID);
    expect(await screen.findByRole('button', { name: '10:30 to 11:00' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ana Perera' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Appointments' })).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: /Next day/ }));
    await waitFor(() => expect(query().get('date')).toBe('2026-10-25'));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'Cancelled');
    await waitFor(() => expect(query().get('status')).toBe('Cancelled'));
    await waitFor(() => expect(dayRequests(backend).at(-1)!.search).toContain('Cancelled'));
  });

  it('resets the date to today in the new branch zone and keeps the status', async () => {
    const { backend, query } = await setup(
      `/admin/appointments?branch=${BRANCH_ID}&date=2026-10-20&status=Booked`,
    );
    await waitFor(() => expect(dayRequests(backend)).toHaveLength(1));
    expect(query().get('date')).toBe('2026-10-20');

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Branch' }), PAGO_ID);
    // 09:00Z on 24 October is still the 23rd in Pago Pago.
    await waitFor(() => expect(query().get('date')).toBe('2026-10-23'));
    expect(query().get('branch')).toBe(PAGO_ID);
    expect(query().get('status')).toBe('Booked');
    await waitFor(() => {
      const last = dayRequests(backend).at(-1)!;
      expect(last.path).toContain(PAGO_ID);
      expect(last.search).toContain('2026-10-23');
    });
  });

  it('labels a branch without a time zone as UTC', async () => {
    await setup(`/admin/appointments?branch=${GALLE_ID}&date=2026-10-24`);
    await waitFor(() => expect(screen.getByText('Times in UTC')).toBeTruthy());
  });

  it('marks an appointment complete from the page', async () => {
    const { backend } = await setup(`/admin/appointments?branch=${BRANCH_ID}&date=2026-10-24`);
    backend.addAppointment({
      startUtc: '2026-10-24T08:00:00Z',
      endUtc: '2026-10-24T08:30:00Z',
    });
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Complete Ana Perera at 09:00' }),
    );
    await waitFor(() => expect(screen.getByText('Completed')).toBeTruthy());
    expect(
      backend.state.requests.some((r) => r.method === 'POST' && r.path.endsWith('/complete')),
    ).toBe(true);
  });

  it('loads more when the day has more than one page', async () => {
    const { backend } = await setup(`/admin/appointments?branch=${BRANCH_ID}&date=2026-10-24`);
    for (let i = 0; i < 101; i += 1) {
      const minute = String(i % 60).padStart(2, '0');
      const hour = String(Math.floor(i / 60) + 1).padStart(2, '0');
      backend.addAppointment({
        startUtc: `2026-10-24T${hour}:${minute}:00Z`,
        endUtc: `2026-10-24T${hour}:${minute}:30Z`,
      });
    }
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull());
    expect(screen.getByText('101 appointments')).toBeTruthy();
  });
});
