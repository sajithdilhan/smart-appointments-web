import { TestBed } from '@angular/core/testing';
import { screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { makeAppointment, resetMakeAppointment } from '../../../testing/make-appointment';
import { ConfirmService } from '../ui/confirm-dialog';
import { toRow, type BranchDayRow } from './day-row';
import { confirmNoShow, noShowBody } from './no-show-confirm';

function row(customer = true): BranchDayRow {
  resetMakeAppointment();
  return toRow(
    {
      ...makeAppointment({ startUtc: '2026-10-24T09:30:00Z' }),
      customer: customer
        ? { firstName: 'Ana', lastName: 'Perera', phoneNumber: '+94771234567' }
        : null,
    },
    { zone: 'Europe/London', services: new Map() },
  );
}

function open(run: () => Promise<void> = vi.fn(() => Promise.resolve()), r = row()) {
  const result = confirmNoShow(TestBed.inject(ConfirmService), r, run);
  return { run, result };
}

afterEach(() => {
  document.body.querySelectorAll('app-confirm-dialog').forEach((n) => n.remove());
});

describe('confirmNoShow', () => {
  it('names the customer and the time and warns that it cannot be undone', async () => {
    const { result } = open();
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveAccessibleName('Mark as no-show?');
    expect(dialog.textContent).toContain('Ana Perera at 10:30.');
    expect(dialog.textContent).toContain(
      'This records that the customer did not attend. It cannot be undone.',
    );
    TestBed.inject(ConfirmService).cancel();
    await result;
  });

  it('words the body without a name', () => {
    expect(noShowBody(row(false))).toBe(
      'The appointment at 10:30. This records that the customer did not attend. It cannot be undone.',
    );
  });

  it('starts focus on Keep as booked, beside a Mark as no-show button', async () => {
    const { result } = open();
    const dialog = await screen.findByRole('alertdialog');
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Keep as booked' })).toHaveFocus(),
    );
    expect(within(dialog).getByRole('button', { name: 'Mark as no-show' })).toBeTruthy();
    TestBed.inject(ConfirmService).cancel();
    await result;
  });

  it('Keep as booked sends nothing', async () => {
    const run = vi.fn(() => Promise.resolve());
    const { result } = open(run);
    await userEvent.click(await screen.findByRole('button', { name: 'Keep as booked' }));
    expect(await result).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it('Escape sends nothing', async () => {
    const run = vi.fn(() => Promise.resolve());
    const { result } = open(run);
    await screen.findByRole('alertdialog');
    await userEvent.keyboard('{Escape}');
    expect(await result).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it('Mark as no-show runs the request once and closes', async () => {
    const run = vi.fn(() => Promise.resolve());
    const { result } = open(run);
    await userEvent.click(await screen.findByRole('button', { name: 'Mark as no-show' }));
    expect(await result).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('stays open with the message when the request fails', async () => {
    const run = vi.fn(() => Promise.reject(new Error('Cannot reach the server.')));
    const { result } = open(run);
    await userEvent.click(await screen.findByRole('button', { name: 'Mark as no-show' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Cannot reach'));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    TestBed.inject(ConfirmService).cancel();
    await result;
  });
});
