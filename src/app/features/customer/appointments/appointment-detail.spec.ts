import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { AppointmentsBackend } from '../../../../testing/appointments-backend';
import {
  createFakeSession,
  createFakeToast,
  provideFakeSession,
} from '../../../../testing/fake-session';
import { appointmentsHandlers } from '../../../../testing/handlers/appointments.handlers';
import { makeAppointment, resetMakeAppointment } from '../../../../testing/make-appointment';
import { ManualClock } from '../../../../testing/manual-clock';
import { server } from '../../../../testing/server';
import { APP_CONFIG } from '../../../core/config/app-config';
import { provideCoreHttp } from '../../../core/http/http.providers';
import { CLOCK } from '../../../core/util/clock';
import { ViewportService } from '../../../core/util/viewport.service';
import { CUSTOMER_ROUTES } from '../customer.routes';
import { ALREADY_STARTED_DETAIL } from './cancel-conflict';

const BASE = 'http://gw.test:5290';
const NOW = Date.parse('2026-10-04T12:00:00Z');

async function open(
  url: string,
  options: { lg?: boolean; fromList?: boolean; setup?: (b: AppointmentsBackend) => void } = {},
) {
  resetMakeAppointment();
  const backend = new AppointmentsBackend();
  backend.now = () => NOW;
  const target = makeAppointment({ startUtc: '2026-10-05T15:00:00Z' });
  backend.add(target, makeAppointment({ startUtc: '2026-10-06T15:00:00Z' }));
  server.use(...appointmentsHandlers(BASE, backend));
  options.setup?.(backend);
  const isLg = signal(options.lg ?? false);
  const toast = createFakeToast();
  TestBed.configureTestingModule({
    providers: [
      provideCoreHttp(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      { provide: CLOCK, useValue: new ManualClock(NOW) },
      { provide: ViewportService, useValue: { isLg, isMd: signal(true), isSm: signal(true) } },
      provideRouter([{ path: '', children: CUSTOMER_ROUTES }]),
      ...provideFakeSession(createFakeSession('authenticated', 'Customer'), toast),
    ],
  });
  const harness = await RouterTestingHarness.create();
  const router = TestBed.inject(Router);
  const target_ = url.replace(':id', target.id);
  await router.navigateByUrl(target_, options.fromList ? { state: { fromList: true } } : {});
  return { backend, target, toast, isLg, router, harness };
}

const SHEET = '/appointments/:id';

describe('AppointmentDetail presentation', () => {
  it('is a sheet over the list at >= 1024 px when entered from the list', async () => {
    const { target } = await open(SHEET, { lg: true, fromList: true });
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Appointment details' })).toBeTruthy();
    // The list stays mounted behind it.
    expect(
      screen.getByRole('heading', { level: 1, name: 'My appointments', hidden: true }),
    ).toBeTruthy();
    await within(dialog).findByText(target.id);
  });

  it('is a page below 1024 px, with a Back link, and the list is not shown', async () => {
    await open(SHEET, { lg: false, fromList: true });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Appointment details' }),
    ).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'My appointments' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to my appointments' }).getAttribute('href')).toBe(
      '/appointments',
    );
  });

  it('a deep link (no list state) is a page even on a wide viewport', async () => {
    await open(SHEET, { lg: true, fromList: false });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Appointment details' }),
    ).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the fields of the detail and none of the internal ids', async () => {
    const { target } = await open(SHEET);
    await screen.findByText('Health check', { exact: false });
    expect(screen.getByText('(30 minutes)')).toBeTruthy();
    expect(screen.getByText('London Central')).toBeTruthy();
    expect(screen.getByText('1 High Street')).toBeTruthy();
    expect(screen.getByText(target.id)).toBeTruthy();
    expect(screen.getByText('Booked on')).toBeTruthy();
    expect(screen.queryByText('Cancelled on')).toBeNull();
    expect(screen.queryByText(target.customerId)).toBeNull();
    expect(screen.queryByText(target.slotId)).toBeNull();
    expect(screen.queryByText(target.branchId)).toBeNull();
  });

  it('closing the sheet returns to the list, and focus goes to the card', async () => {
    const user = userEvent.setup();
    const { router, target } = await open('/appointments', { lg: true });
    await vi.waitFor(() =>
      expect(document.querySelector(`a[href^="/appointments/${target.id}"]`)).toBeTruthy(),
    );
    await router.navigateByUrl(`/appointments/${target.id}`, { state: { fromList: true } });
    const dialog = await screen.findByRole('dialog');
    await vi.waitFor(() =>
      expect(document.querySelector(`a[href^="/appointments/${target.id}"]`)).toBeTruthy(),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await vi.waitFor(() => expect(router.url).toBe('/appointments'));
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(
        document.querySelector(`a[href^="/appointments/${target.id}"]`),
      ),
    );
  });
});

describe('AppointmentDetail not found', () => {
  it('an unknown GUID shows the not-found state and title', async () => {
    await open('/appointments/00000000-0000-4000-8000-00000000dead');
    expect(await screen.findByText('We could not find this appointment.')).toBeTruthy();
    expect(document.title).toBe('Appointment not found | Smart Appointments');
    expect(screen.getByRole('link', { name: 'Back to my appointments' })).toBeTruthy();
  });

  it('a non-GUID id shows the same state without calling the API', async () => {
    const { backend } = await open('/appointments/not-a-guid');
    expect(await screen.findByRole('heading', { name: 'Appointment not found' })).toBeTruthy();
    expect(backend.getCalls).toHaveLength(0);
  });

  it('a failed load shows an alert with Try again', async () => {
    const user = userEvent.setup();
    let fail = true;
    await open(SHEET, {
      setup: (b) => {
        server.use(
          http.get(`${BASE}/api/appointments/:id`, ({ params }) =>
            fail
              ? HttpResponse.json({ status: 500, detail: 'x' }, { status: 500 })
              : HttpResponse.json(b.appointments.find((a) => a.id === params['id'])),
          ),
        );
      },
    });
    await screen.findByRole('alert');
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Booked on');
  });
});

describe('AppointmentDetail cancel', () => {
  it('shows Cancel only for a Booked appointment that starts later', async () => {
    await open(SHEET);
    expect(await screen.findByRole('button', { name: 'Cancel appointment' })).toBeTruthy();
  });

  it('a Booked appointment that has started shows the note instead', async () => {
    await open(SHEET, {
      setup: (b) => {
        b.appointments[0].startUtc = '2026-10-04T10:00:00Z';
        b.appointments[0].endUtc = '2026-10-04T10:30:00Z';
      },
    });
    await screen.findByText('Booked on');
    expect(screen.queryByRole('button', { name: 'Cancel appointment' })).toBeNull();
    expect(
      screen.getByText('This appointment has already started and can no longer be cancelled.'),
    ).toBeTruthy();
  });

  it('a Cancelled appointment has no Cancel and no Add to calendar, and shows Cancelled on', async () => {
    await open(SHEET, {
      setup: (b) => {
        b.appointments[0].status = 'Cancelled';
        b.appointments[0].cancelledAtUtc = '2026-10-04T09:00:00Z';
      },
    });
    await screen.findByText('Cancelled on');
    expect(screen.queryByRole('button', { name: 'Cancel appointment' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add to calendar' })).toBeNull();
  });

  it('the dialog opens with Keep focused; Escape keeps the appointment', async () => {
    const user = userEvent.setup();
    const { backend } = await open(SHEET);
    await user.click(await screen.findByRole('button', { name: 'Cancel appointment' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Cancel this appointment?')).toBeTruthy();
    expect(dialog.textContent).toContain('Health check at London Central');
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(
        within(dialog).getByRole('button', { name: 'Keep appointment' }),
      ),
    );
    await user.keyboard('{Escape}');
    await vi.waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(backend.cancelCalls).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Cancel appointment' })).toBeTruthy();
  });

  it('confirming cancels once: optimistic badge, then Cancelled, toast and no Cancel button', async () => {
    const user = userEvent.setup();
    const { backend, toast } = await open(SHEET);
    await user.click(await screen.findByRole('button', { name: 'Cancel appointment' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel appointment' }));
    await vi.waitFor(() =>
      expect(toast.showSuccess).toHaveBeenCalledWith('Appointment cancelled.'),
    );
    expect(backend.cancelCalls).toHaveLength(1);
    expect(screen.getByText('Cancelled', { selector: '[data-slot=badge]' })).toBeTruthy();
    expect(screen.getByText('Cancelled on')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel appointment' })).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('a 409 explains inline with the fixed message and does not toast', async () => {
    const user = userEvent.setup();
    const { toast } = await open(SHEET, {
      setup: (b) => {
        b.forceCancelConflict = ALREADY_STARTED_DETAIL;
      },
    });
    await user.click(await screen.findByRole('button', { name: 'Cancel appointment' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel appointment' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(
      'This appointment has already started, so it can no longer be cancelled.',
    );
    expect(toast.showSuccess).not.toHaveBeenCalled();
    expect(toast.showError).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Cancel appointment' })).toBeNull();
  });

  it('a 503 where the re-GET shows Cancelled gives the slot notice', async () => {
    const user = userEvent.setup();
    await open(SHEET, {
      setup: (b) => {
        b.failReleaseWith503 = true;
      },
    });
    await user.click(await screen.findByRole('button', { name: 'Cancel appointment' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel appointment' }));
    expect(
      await screen.findByText(/Your appointment is cancelled\. The time slot may take a moment/),
    ).toBeTruthy();
  });

  it('a 503 where it is still Booked reverts with a Try again that repeats the cancel', async () => {
    const user = userEvent.setup();
    const { backend } = await open(SHEET, {
      setup: (b) => {
        server.use(
          http.post(`${BASE}/api/appointments/:id/cancel`, () => {
            b.cancelCalls.push('x');
            return HttpResponse.json({ status: 503, detail: 'down' }, { status: 503 });
          }),
        );
      },
    });
    await user.click(await screen.findByRole('button', { name: 'Cancel appointment' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel appointment' }));
    expect(
      await screen.findByText(
        'We could not cancel right now. Nothing was changed. Try again in a moment.',
      ),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await vi.waitFor(() => expect(backend.cancelCalls).toHaveLength(2));
  });

  it('a resize across 1024 px keeps the loaded data and an open dialog', async () => {
    const user = userEvent.setup();
    const { isLg, target } = await open(SHEET, { lg: true, fromList: true });
    await user.click(await screen.findByRole('button', { name: 'Cancel appointment' }));
    await screen.findByRole('alertdialog');
    isLg.set(false);
    await screen.findByRole('heading', { level: 1, name: 'Appointment details', hidden: true });
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect((await screen.findAllByText(target.id)).length).toBeGreaterThan(0);
  });
});

describe('AppointmentDetail Add to calendar', () => {
  let blobs: Blob[];
  let names: string[];
  let createObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    blobs = [];
    names = [];
    createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return 'blob:test';
    });
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      names.push(this.download);
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('downloads an event with the names and the location', async () => {
    const user = userEvent.setup();
    await open(SHEET);
    await user.click(await screen.findByRole('button', { name: 'Add to calendar' }));
    expect(blobs).toHaveLength(1);
    const text = await blobs[0].text();
    expect(text).toContain('SUMMARY:Health check at London Central');
    expect(text).toContain('LOCATION:1 High Street');
    expect(names[0]).toBe('appointment-20261005-ldn.ics');
  });

  it('with a deactivated branch it uses "Appointment" and no location', async () => {
    const user = userEvent.setup();
    await open(SHEET, {
      setup: (b) => {
        b.deactivateBranch(b.branches[0].id);
        b.deactivateService(b.services[0].id);
      },
    });
    await user.click(await screen.findByRole('button', { name: 'Add to calendar' }));
    const text = await blobs[0].text();
    expect(text).toContain('SUMMARY:Appointment');
    expect(text).not.toContain('LOCATION');
    expect(text).not.toContain('Unavailable');
  });

  it('a failed download toasts the one error', async () => {
    const user = userEvent.setup();
    const { toast } = await open(SHEET);
    createObjectURL.mockImplementationOnce(() => {
      throw new Error('no blob');
    });
    await user.click(await screen.findByRole('button', { name: 'Add to calendar' }));
    expect(toast.showError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'We could not create the calendar file.' }),
    );
  });
});
