import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { createBranchDayBackend } from '../../../testing/branch-day-backend';
import { provideBranchDayApi } from '../../../testing/branch-day-test-setup';
import {
  createFakeSession,
  createFakeToast,
  provideFakeSession,
} from '../../../testing/fake-session';
import { ManualClock } from '../../../testing/manual-clock';
import { BRANCH_ID, CUSTOMER_ID, resetMakeAppointment } from '../../../testing/make-appointment';
import { server } from '../../../testing/server';
import { stubViewport } from '../../../testing/stub-viewport';
import { CLOCK } from '../../core/util/clock';
import { StaffDayPage } from './staff-day.page';

// Saturday 24 October 2026, 09:00 UTC = 10:00 in London (BST).
const NOW = Date.parse('2026-10-24T09:00:00Z');
const OTHER_ID = '00000000-0000-4000-8000-0000000000b2';

interface Options {
  url?: string;
  tokenBranch?: string;
  zone?: string | null;
  zoneUnavailable?: boolean;
}

async function setup(options: Options = {}) {
  resetMakeAppointment();
  stubViewport(1280);
  const clock = new ManualClock(NOW);
  const backend = createBranchDayBackend({ now: () => clock.now() });
  backend.addCustomer(CUSTOMER_ID, { firstName: 'Ann', lastName: 'Lee', phoneNumber: '+441234' });
  if (options.zone !== undefined) backend.state.branches[0].timeZoneId = options.zone;
  backend.flags.zoneUnavailable = options.zoneUnavailable ?? false;
  backend.addBranch({
    id: OTHER_ID,
    name: 'Auckland',
    code: 'AKL',
    timeZoneId: 'Pacific/Auckland',
  });
  backend.addAppointment({ startUtc: '2026-10-24T08:00:00Z', endUtc: '2026-10-24T08:30:00Z' });
  backend.addAppointment({ startUtc: '2026-10-24T09:30:00Z', endUtc: '2026-10-24T10:00:00Z' });
  server.use(...backend.handlers);
  const session = createFakeSession('authenticated', 'Staff');
  const claim = (id: string) =>
    session.user.set({ email: 'staff@example.com', branchId: id } as never);
  claim(BRANCH_ID);
  const view = await render(StaffDayPage, {
    providers: [
      provideRouter([]),
      ...provideBranchDayApi({ branchId: options.tokenBranch }),
      ...provideFakeSession(session, createFakeToast()),
      { provide: CLOCK, useValue: clock },
    ],
  });
  const router = TestBed.inject(Router);
  if (options.url) await router.navigateByUrl(options.url);
  const dayRequests = () =>
    backend.state.requests.filter(
      (r) => r.method === 'GET' && r.path.toLowerCase().includes('/appointments/branch'),
    );
  return { ...view, backend, clock, claim, router, dayRequests, user: userEvent.setup() };
}

describe('StaffDayPage', () => {
  it('defaults the date to today in the branch zone, replacing the URL, and lists the day', async () => {
    const { router, dayRequests } = await setup();
    expect(await screen.findByText('09:00 to 09:30')).toBeTruthy();
    expect(router.url).toBe('/?date=2026-10-24');
    expect(screen.getByRole('heading', { level: 1, name: 'Appointments' })).toBeTruthy();
    expect(new URLSearchParams(dayRequests()[0].search).get('date')).toBe('2026-10-24');
    expect(screen.queryByText(/Times in/)).toBeNull();
  });

  it('adds history entries for Previous and Next, and loads that day', async () => {
    const { router, user, dayRequests } = await setup();
    await screen.findByText('09:00 to 09:30');
    const navigate = vi.spyOn(router, 'navigate');
    await user.click(screen.getByRole('button', { name: /Previous day/ }));
    await vi.waitFor(() => expect(router.url).toBe('/?date=2026-10-23'));
    await user.click(screen.getByRole('button', { name: /Next day/ }));
    await vi.waitFor(() => expect(router.url).toBe('/?date=2026-10-24'));
    for (const call of navigate.mock.calls) {
      expect((call[1] as { replaceUrl?: boolean }).replaceUrl).toBeFalsy();
    }
    expect(dayRequests().map((r) => new URLSearchParams(r.search).get('date'))).toContain(
      '2026-10-23',
    );
  });

  it('sends the status of the filter', async () => {
    const { user, dayRequests } = await setup();
    await screen.findByText('09:00 to 09:30');
    await user.selectOptions(screen.getByLabelText('Status'), 'Booked');
    await vi.waitFor(() =>
      expect(
        dayRequests().some((r) => new URLSearchParams(r.search).get('status') === 'Booked'),
      ).toBe(true),
    );
  });

  it('reloads on Refresh and never polls on a timer', async () => {
    const { user, dayRequests, clock } = await setup();
    await screen.findByText('09:00 to 09:30');
    expect(dayRequests()).toHaveLength(1);
    clock.advance(30 * 60_000);
    TestBed.tick();
    await new Promise((r) => setTimeout(r, 50));
    expect(dayRequests()).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await vi.waitFor(() => expect(dayRequests()).toHaveLength(2));
  });

  it('marks an appointment from the sheet and shows the new status in the row and the sheet', async () => {
    const { user, backend } = await setup();
    await screen.findByText('09:00 to 09:30');
    await user.click(screen.getAllByRole('button', { name: /Ann Lee/ })[0]);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^Complete/ }));
    await vi.waitFor(() =>
      expect(backend.state.appointments.some((a) => a.status === 'Completed')).toBe(true),
    );
    await vi.waitFor(() =>
      expect(within(dialog).getAllByText('Completed').length).toBeGreaterThan(0),
    );
    expect(screen.getAllByText('Completed').length).toBeGreaterThan(1);
  });

  it('resets the date to today in the new zone when the branch claim changes', async () => {
    const { router, claim, dayRequests } = await setup({ url: '/?date=2026-10-20' });
    await vi.waitFor(() => expect(dayRequests().length).toBeGreaterThan(0));
    expect(router.url).toBe('/?date=2026-10-20');
    claim(OTHER_ID);
    await vi.waitFor(() => expect(router.url).toBe('/?date=2026-10-24'));
    await vi.waitFor(() =>
      expect(dayRequests().some((r) => r.path.toLowerCase().includes(OTHER_ID))).toBe(true),
    );
  });

  it('shows the 403 text for another branch', async () => {
    await setup({ tokenBranch: OTHER_ID });
    expect(await screen.findByText('You can only see your own branch.')).toBeTruthy();
  });

  it('shows the 503 text when the branch zone cannot be resolved', async () => {
    await setup({ zoneUnavailable: true });
    expect(
      await screen.findByText("The branch's time zone could not be loaded. Try again shortly."),
    ).toBeTruthy();
  });

  it('labels the zone UTC for a branch without one', async () => {
    const { router } = await setup({ zone: null });
    expect(await screen.findByText('Times in UTC')).toBeTruthy();
    await vi.waitFor(() => expect(router.url).toBe('/?date=2026-10-24'));
  });
});
