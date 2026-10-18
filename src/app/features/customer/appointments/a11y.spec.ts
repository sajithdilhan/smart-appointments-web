import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
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
import { toViewModel } from './appointment-view';
import { AppointmentCard } from './appointment-card';
import { AppointmentsSkeleton } from './appointments-skeleton';
import { ViewportService } from '../../../core/util/viewport.service';
import { CUSTOMER_ROUTES } from '../customer.routes';

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

describe('Accessibility and motion (F4)', () => {
  const animated = () =>
    Array.from(document.body.querySelectorAll('*')).filter((el) =>
      /animate-(in|out)/.test(el.getAttribute('class') ?? ''),
    );
  const unguarded = (el: Element) =>
    (el.getAttribute('class') ?? '')
      .split(/\s+/)
      .filter((c) => !c.startsWith('motion-safe:') && /animate-(in|out)$|^transition$/.test(c));

  it('the sheet and its overlay animate only under motion-safe', async () => {
    await open(SHEET, { lg: true, fromList: true });
    await screen.findByRole('dialog');
    expect(animated().length).toBeGreaterThan(0);
    for (const el of animated()) expect(unguarded(el)).toEqual([]);
  }, 20_000);

  it('the cancel dialog animates only under motion-safe', async () => {
    const user = userEvent.setup();
    await open(SHEET);
    await user.click(await screen.findByRole('button', { name: 'Cancel appointment' }));
    await screen.findByRole('alertdialog');
    expect(animated().length).toBeGreaterThan(0);
    for (const el of animated()) expect(unguarded(el)).toEqual([]);
  });

  it('the skeleton pulses only under motion-safe', async () => {
    await render(AppointmentsSkeleton);
    const blocks = document.querySelectorAll('[data-slot=skeleton], .bg-muted');
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of Array.from(blocks)) {
      expect(block.className).toContain('motion-safe:animate-pulse');
      expect(block.className).not.toMatch(/(^|\s)animate-pulse/);
    }
  });

  it('announces the cancellation once, in a single polite status region', async () => {
    const user = userEvent.setup();
    const { toast } = await open(SHEET);
    await user.click(await screen.findByRole('button', { name: 'Cancel appointment' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel appointment' }));
    await vi.waitFor(() => expect(toast.showSuccess).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(
        screen.getAllByText('Appointment cancelled.', { selector: '[role=status]' }),
      ).toHaveLength(1),
    );
  });

  it('a card link keeps a 44 px target', async () => {
    const view = toViewModel(makeAppointment({ startUtc: '2026-10-05T15:00:00Z' }), {
      tab: 'upcoming',
      now: new Date(NOW),
    });
    await render(AppointmentCard, { inputs: { view }, routes: [] });
    expect(screen.getByRole('link').className).toContain('min-h-11');
  });
});
