import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { render, screen, waitFor, within } from '@testing-library/angular';
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
import type { AppointmentResponse } from '../../core/api/models';
import { ToastService } from '../../core/notify/toast.service';
import { CLOCK } from '../../core/util/clock';
import { AppointmentSheet } from './appointment-sheet.component';
import { BranchDayStore, type DayQuery } from './branch-day.store';
import { BRANCH_DAY_CONTEXT } from './branch-day-context';
import { DayList, type OpenRowEvent } from './day-list.component';

const NOW = Date.parse('2026-10-24T09:00:00Z');
const DAY: DayQuery = { branchId: BRANCH_ID, date: '2026-10-24', status: 'all' };

@Component({
  selector: 'app-sheet-host',
  imports: [DayList, AppointmentSheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-day-list (open)="onOpen($event)" />
    <app-appointment-sheet [rowId]="openId()" [opener]="opener()" (closed)="openId.set(null)" />
  `,
})
class Host {
  readonly openId = signal<string | null>(null);
  readonly opener = signal<HTMLElement | null>(null);

  onOpen(e: OpenRowEvent): void {
    this.opener.set(e.trigger);
    this.openId.set(e.id);
  }
}

async function setup(width = 1280, appointments: Partial<AppointmentResponse>[] = [{}]) {
  stubViewport(width);
  resetMakeAppointment();
  const clock = new ManualClock(NOW);
  const backend = createBranchDayBackend({ now: () => clock.now() });
  server.use(...backend.handlers);
  backend.addCustomer(CUSTOMER_ID);
  appointments.forEach((a, i) =>
    backend.addAppointment({
      startUtc: `2026-10-24T${String(8 + i).padStart(2, '0')}:00:00Z`,
      endUtc: `2026-10-24T${String(8 + i).padStart(2, '0')}:30:00Z`,
      createdAtUtc: '2026-10-20T13:45:00Z',
      ...a,
    }),
  );
  const toast = createFakeToast();
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
  return { backend, store, view, toast, host: view.fixture.componentInstance };
}

const openFirst = async () => {
  const name = screen.getAllByRole('button', { name: 'Ana Perera' })[0];
  await userEvent.click(name);
  return { name, dialog: await screen.findByRole('dialog') };
};

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.querySelectorAll('app-confirm-dialog').forEach((n) => n.remove());
});

describe('AppointmentSheet', () => {
  it('shows every field of a Booked appointment in the branch zone', async () => {
    const { backend } = await setup();
    const { dialog } = await openFirst();
    const d = within(dialog);
    expect(d.getByText('Appointment details')).toBeTruthy();
    expect(d.getByText('Ana Perera')).toBeTruthy();
    expect(d.getByRole('link', { name: '+94771234567' }).getAttribute('href')).toBe(
      'tel:+94771234567',
    );
    expect(d.getByText('Health check')).toBeTruthy();
    expect(d.getByText('(30 minutes)')).toBeTruthy();
    expect(d.getByText('Saturday 24 October 2026')).toBeTruthy();
    expect(d.getByText('09:00 to 09:30')).toBeTruthy();
    expect(d.getByText('Booked')).toBeTruthy();
    expect(d.getByText('Tuesday 20 October 2026, 14:45')).toBeTruthy();
    expect(d.getByText(backend.state.appointments[0].id)).toBeTruthy();
    expect(d.queryByText('Cancelled on')).toBeNull();
    expect(d.queryByText('Completed on')).toBeNull();
  });

  it('shows the cancelled, completed and no-show times of those rows', async () => {
    const { store } = await setup(1280, [
      { status: 'Cancelled', cancelledAtUtc: '2026-10-22T10:00:00Z' },
      { status: 'Completed', completedAtUtc: '2026-10-24T09:10:00Z' },
      { status: 'NoShow', noShowAtUtc: '2026-10-24T10:10:00Z' },
    ]);
    expect(store.rows()).toHaveLength(3);
    const names = screen.getAllByRole('button', { name: 'Ana Perera' });

    await userEvent.click(names[0]);
    let d = within(await screen.findByRole('dialog'));
    expect(d.getByText('Cancelled on')).toBeTruthy();
    expect(d.getByText('Thursday 22 October 2026, 11:00')).toBeTruthy();
    expect(d.getByText('Cancelled')).toBeTruthy();
    expect(d.queryByRole('button', { name: /^Complete/ })).toBeNull();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await userEvent.click(names[1]);
    d = within(await screen.findByRole('dialog'));
    expect(d.getByText('Completed on')).toBeTruthy();
    expect(d.getByText('Saturday 24 October 2026, 10:10')).toBeTruthy();
    expect(d.getByText('Completed')).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await userEvent.click(names[2]);
    d = within(await screen.findByRole('dialog'));
    expect(d.getByText('Marked as no-show on')).toBeTruthy();
    expect(d.getByText('Saturday 24 October 2026, 11:10')).toBeTruthy();
    expect(d.getByText('No-show')).toBeTruthy();
  });

  it('copes with a missing customer', async () => {
    const { backend, view } = await setup(1280, [{ customerId: 'gone' }]);
    backend.state.customers.clear();
    await TestBed.inject(BranchDayStore).open(DAY);
    view.detectChanges();
    await userEvent.click(screen.getAllByRole('button', { name: 'Name unavailable' })[0]);
    const d = within(await screen.findByRole('dialog'));
    expect(d.getByText('Name unavailable')).toBeTruthy();
    expect(d.getByText('Not available')).toBeTruthy();
    expect(d.queryByRole('link')).toBeNull();
  });

  it('copies the id and says so, or says it could not', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const { backend } = await setup();
    const { dialog } = await openFirst();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith(backend.state.appointments[0].id);
    await waitFor(() => expect(within(dialog).getByText('Appointment ID copied.')).toBeTruthy());

    writeText.mockRejectedValueOnce(new Error('denied'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Copy' }));
    await waitFor(() =>
      expect(within(dialog).getByText('Could not copy. Select the ID to copy it.')).toBeTruthy(),
    );
  });

  it('closes on Escape and returns focus to the button that opened it', async () => {
    await setup();
    const { name } = await openFirst();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(name).toHaveFocus());
  });

  it('closes with its Close button and returns focus', async () => {
    await setup();
    const { name, dialog } = await openFirst();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(name).toHaveFocus());
  });

  it('returns focus to the same row when the opener is gone from the page', async () => {
    const { host } = await setup();
    const { name } = await openFirst();
    host.opener.set(document.createElement('button'));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(name).toHaveFocus());
  });

  it('marks from the panel and shows the new status there', async () => {
    const { backend, toast } = await setup();
    const { dialog } = await openFirst();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Complete Ana Perera at 09:00' }),
    );
    await waitFor(() =>
      expect(toast.showSuccess).toHaveBeenCalledWith('Ana Perera marked as completed.'),
    );
    await waitFor(() => expect(within(dialog).getByText('Completed')).toBeTruthy());
    expect(within(dialog).getByText('Completed on')).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: /^Complete / })).toBeNull();
    expect(backend.state.requests.filter((r) => r.method === 'POST')).toHaveLength(1);
  });

  it('keeps the actions off until the start, with the hint', async () => {
    await setup(1280, [{ startUtc: '2026-10-24T09:30:00Z', endUtc: '2026-10-24T10:00:00Z' }]);
    const { dialog } = await openFirst();
    const complete = within(dialog).getByRole('button', {
      name: 'Complete Ana Perera at 10:30',
    }) as HTMLButtonElement;
    expect(complete.disabled).toBe(true);
    expect(within(dialog).getByText('Available from 10:30')).toBeTruthy();
  });

  it('closes by itself when its row leaves the list', async () => {
    const { store } = await setup();
    await openFirst();
    await store.open({ ...DAY, status: 'Completed' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('is a side sheet of limited width at 1024 px and wider, full width below', async () => {
    await setup(1280);
    await openFirst();
    const content = document.querySelector('hlm-sheet-content') as HTMLElement;
    expect(content.className).toContain('max-w-md');
    expect(content.className).not.toContain('max-w-none');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('is full width below 1024 px', async () => {
    await setup(700);
    await openFirst();
    const content = document.querySelector('hlm-sheet-content') as HTMLElement;
    expect(content.className).toContain('data-[side=right]:w-full');
    expect(content.className).toContain('max-w-none');
    expect(content.className).not.toContain('max-w-md');
  });
});
