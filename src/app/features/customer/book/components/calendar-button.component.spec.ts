import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { ToastService } from '../../../../core/notify/toast.service';
import {
  BRANCH_IDS,
  SERVICE_IDS,
  createBookingBackend,
} from '../../../../../testing/booking-backend';
import { createFakeToast } from '../../../../../testing/fake-session';
import { firstSlot } from '../../../../../testing/render-book';
import type { Booked } from '../wizard.store';
import { CALENDAR_ERROR, CalendarButtonComponent } from './calendar-button.component';

function booked(): Booked {
  const backend = createBookingBackend();
  const slot = firstSlot(backend, { date: '2026-10-05' });
  const { startMs, endMs, ...rest } = slot;
  void rest;
  return {
    slot,
    branch: backend.state.branches.find((b) => b.id === BRANCH_IDS.london)!,
    service: backend.state.services.find((s) => s.id === SERVICE_IDS.checkup)!,
    appointment: {
      id: '00000000-0000-4000-8000-0000000000a1',
      customerId: backend.state.customerId,
      slotId: slot.id,
      branchId: slot.branchId,
      serviceTypeId: slot.serviceTypeId,
      startUtc: new Date(startMs).toISOString(),
      endUtc: new Date(endMs).toISOString(),
      status: 'Booked',
      createdAtUtc: '2026-10-04T10:00:00Z',
      updatedAtUtc: '2026-10-04T10:00:00Z',
    },
  };
}

describe('CalendarButtonComponent', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is a button named "Add to calendar" with a hidden .ics suffix', async () => {
    await render(CalendarButtonComponent, {
      inputs: { booked: booked() },
      providers: [{ provide: ToastService, useValue: createFakeToast() }],
    });
    expect(screen.getByRole('button', { name: 'Add to calendar download .ics file' })).toBeTruthy();
  });

  it('downloads a file with DTSTART and LOCATION, named after the branch and date, with no request', async () => {
    const toast = createFakeToast();
    let text = '';
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      void (blob as Blob).text().then((t) => (text = t));
      return 'blob:x';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    let name = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      name = this.download;
    });
    await render(CalendarButtonComponent, {
      inputs: { booked: booked() },
      providers: [{ provide: ToastService, useValue: toast }],
    });
    await userEvent.setup().click(screen.getByRole('button', { name: /Add to calendar/ }));
    await vi.waitFor(() => expect(name).toBe('appointment-20261005-lon.ics'));
    await vi.waitFor(() => expect(text).toContain('DTSTART:20261005T080000Z'));
    expect(text).toContain(String.raw`LOCATION:10 Baker Street\, London`);
    expect(text).toContain('SUMMARY:Check-up at London');
    expect(toast.showError).not.toHaveBeenCalled();
  });

  it('shows one error toast and does not throw when the file cannot be created', async () => {
    const toast = createFakeToast();
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      throw new Error('no blobs');
    });
    await render(CalendarButtonComponent, {
      inputs: { booked: booked() },
      providers: [{ provide: ToastService, useValue: toast }],
    });
    await userEvent.setup().click(screen.getByRole('button', { name: /Add to calendar/ }));
    await vi.waitFor(() => expect(toast.showError).toHaveBeenCalledTimes(1));
    expect(toast.showError).toHaveBeenCalledWith(
      expect.objectContaining({ message: CALENDAR_ERROR }),
    );
  });
});
