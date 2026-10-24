import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { render, screen, waitFor } from '@testing-library/angular';
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
import { DayAnnouncer } from './day-announcer.component';
import { DayList } from './day-list.component';

const NOW = Date.parse('2026-10-24T09:00:00Z');
const DAY: DayQuery = { branchId: BRANCH_ID, date: '2026-10-24', status: 'all' };

@Component({
  selector: 'app-marks-host',
  imports: [DayList, DayAnnouncer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-day-list /><app-day-announcer />`,
})
class Host {}

async function setup(backendNow = NOW) {
  stubViewport(1024);
  resetMakeAppointment();
  const clock = new ManualClock(NOW);
  const backend = createBranchDayBackend({ now: () => backendNow });
  server.use(...backend.handlers);
  backend.addCustomer(CUSTOMER_ID);
  const toast = createFakeToast();
  const started = backend.addAppointment({
    startUtc: '2026-10-24T08:00:00Z',
    endUtc: '2026-10-24T08:30:00Z',
  });
  const view = await render(Host, {
    providers: [
      ...provideBranchDayApi(),
      { provide: CLOCK, useValue: clock },
      { provide: ToastService, useValue: toast },
      {
        provide: BRANCH_DAY_CONTEXT,
        useValue: makeDayContext({ services: [[SERVICE_ID, 'Health check']] }),
      },
      BranchDayStore,
    ],
  });
  const store = TestBed.inject(BranchDayStore);
  await store.open(DAY);
  view.detectChanges();
  return { backend, toast, store, view, started };
}

const posts = (backend: Awaited<ReturnType<typeof setup>>['backend']) =>
  backend.state.requests.filter((r) => r.method === 'POST');

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.querySelectorAll('app-confirm-dialog').forEach((n) => n.remove());
});

describe('marks from the day list', () => {
  it('Complete sends at once, without a dialog, then toasts, announces and shows Completed', async () => {
    const { backend, toast, started } = await setup();
    await userEvent.click(screen.getByRole('button', { name: 'Complete Ana Perera at 09:00' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() =>
      expect(toast.showSuccess).toHaveBeenCalledWith('Ana Perera marked as completed.'),
    );
    expect(posts(backend)).toHaveLength(1);
    expect(posts(backend)[0].path).toMatch(new RegExp(`${started.id}/complete$`));
    await waitFor(() => expect(screen.getByText('Completed')).toBeTruthy());
    expect(screen.queryByRole('button', { name: /^Complete / })).toBeNull();
    expect(
      screen.getByText('Ana Perera, 09:00, marked as completed').closest('[role=status]'),
    ).toBeTruthy();
  });

  it('a second click while the request is in flight sends nothing more', async () => {
    const { backend } = await setup();
    const complete = screen.getByRole('button', { name: 'Complete Ana Perera at 09:00' });
    await userEvent.click(complete);
    await userEvent.click(complete);
    await waitFor(() => expect(screen.queryByText('Completed')).toBeTruthy());
    expect(posts(backend)).toHaveLength(1);
  });

  it('No-show asks first: Keep as booked sends nothing, Mark as no-show sends and toasts', async () => {
    const { backend, toast } = await setup();
    await userEvent.click(screen.getByRole('button', { name: 'No-show Ana Perera at 09:00' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('Ana Perera at 09:00.');
    await userEvent.click(screen.getByRole('button', { name: 'Keep as booked' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(posts(backend)).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'No-show Ana Perera at 09:00' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Mark as no-show' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(posts(backend)).toHaveLength(1);
    expect(toast.showSuccess).toHaveBeenCalledWith('Ana Perera marked as no-show.');
    await waitFor(() => expect(screen.getByText('No-show')).toBeTruthy());
  });

  it('a 409 shows the server text as an error toast and reloads the row', async () => {
    // The page thinks the appointment started; the server clock is an hour earlier.
    const { backend, toast, store } = await setup(NOW - 2 * 3_600_000);
    const before = backend.state.requests.length;
    await userEvent.click(screen.getByRole('button', { name: 'Complete Ana Perera at 09:00' }));
    await waitFor(() => expect(toast.showError).toHaveBeenCalledTimes(1));
    expect(toast.showError.mock.calls[0][0].message).toBe('The appointment has not started yet.');
    expect(toast.showSuccess).not.toHaveBeenCalled();
    // The POST plus the reload of the list.
    await waitFor(() => expect(backend.state.requests.length).toBe(before + 2));
    expect(store.rows()[0].status).toBe('Booked');
  });

  it('a 404 shows the fixed text and reloads, so the row goes away', async () => {
    const { backend, toast, store, started } = await setup();
    backend.state.appointments = backend.state.appointments.filter((a) => a.id !== started.id);
    await userEvent.click(screen.getByRole('button', { name: 'Complete Ana Perera at 09:00' }));
    await waitFor(() => expect(toast.showError).toHaveBeenCalledTimes(1));
    expect(toast.showError.mock.calls[0][0].message).toBe(
      'This appointment is no longer available.',
    );
    await waitFor(() => expect(store.rows()).toHaveLength(0));
  });

  it('a no-show that fails with a server error keeps the dialog open with the message', async () => {
    const { backend, toast } = await setup();
    await userEvent.click(screen.getByRole('button', { name: 'No-show Ana Perera at 09:00' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Mark as no-show' }).then((b) => {
        backend.flags.failNext = 500;
        return b;
      }),
    );
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(toast.handleError).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Keep as booked' }));
  });

  it('a no-show that hits a 409 closes the dialog and toasts the server text', async () => {
    const { toast } = await setup(NOW - 2 * 3_600_000);
    await userEvent.click(screen.getByRole('button', { name: 'No-show Ana Perera at 09:00' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Mark as no-show' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(toast.showError.mock.calls[0][0].message).toBe('The appointment has not started yet.');
  });

  it('clears the announcement after five seconds', async () => {
    const { store } = await setup();
    await userEvent.click(screen.getByRole('button', { name: 'Complete Ana Perera at 09:00' }));
    await waitFor(() => expect(store.announcement()).not.toBe(''));
    const clock = TestBed.inject(CLOCK) as ManualClock;
    clock.advance(5_000);
    expect(store.announcement()).toBe('');
  });
});
