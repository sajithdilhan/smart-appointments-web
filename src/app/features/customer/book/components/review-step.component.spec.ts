import { screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import {
  BRANCH_IDS,
  SERVICE_IDS,
  createBookingBackend,
} from '../../../../../testing/booking-backend';
import { BOOK_BASE, firstSlot, renderBook } from '../../../../../testing/render-book';
import { server } from '../../../../../testing/server';

const DATE = '2026-10-05';
const reviewUrl = (slotId: string, branch: string = BRANCH_IDS.london) =>
  `/book?branch=${branch}&service=${SERVICE_IDS.checkup}&date=${DATE}&slot=${slotId}`;
const confirmButton = () => screen.findByRole('button', { name: 'Confirm booking' });
const keyOf = (slotId: string) => sessionStorage.getItem(`sa.idem.${slotId}`);

async function setup(backend = createBookingBackend()) {
  const slot = firstSlot(backend, { date: DATE });
  const sent: { key: string | null; body: unknown }[] = [];
  const view = await renderBook({
    url: reviewUrl(slot.id),
    backend,
    handlers: [
      http.post(`${BOOK_BASE}/api/appointments`, async ({ request }) => {
        sent.push({
          key: request.headers.get('Idempotency-Key'),
          body: await request.clone().json(),
        });
        return undefined;
      }),
    ],
  });
  await screen.findByText('10 Baker Street, London');
  await vi.waitFor(() =>
    expect(screen.getByRole('button', { name: 'Confirm booking' })).toBeEnabled(),
  );
  return { backend, slot, sent, view };
}

describe('ReviewStepComponent', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
    localStorage.clear();
  });

  describe('the summary', () => {
    it('shows branch, address, a tel link, service, duration, the branch-local range and the cancel note', async () => {
      await setup();
      expect(screen.getByRole('heading', { level: 2, name: 'Review and confirm' })).toBeTruthy();
      expect(screen.getByText('10 Baker Street, London')).toBeTruthy();
      expect(screen.getByRole('link', { name: '+00 555 0120' })).toHaveAttribute(
        'href',
        'tel:+005550120',
      );
      expect(screen.getByText('Check-up')).toBeTruthy();
      expect(screen.getByText('30 min')).toBeTruthy();
      expect(screen.getByText(/Monday,? 5 October 2026, .*09:00.* to .*09:30/)).toBeTruthy();
      expect(
        screen.getByText('You can cancel this appointment from My appointments.'),
      ).toBeTruthy();
    });

    it('adds the zone and "your time" when the branch zone differs from the browser zone', async () => {
      await setup();
      expect(screen.getByText('Europe/London time')).toBeTruthy();
      expect(screen.getByText(/ your time$/)).toBeTruthy();
    });

    it('omits them when the zones agree', async () => {
      const backend = createBookingBackend();
      backend.state.branches.find((b) => b.id === BRANCH_IDS.london)!.timeZoneId =
        'Pacific/Kiritimati';
      await setup(backend);
      expect(screen.queryByText('Pacific/Kiritimati time')).toBeNull();
      expect(screen.queryByText(/your time/)).toBeNull();
    });

    it('does not claim the slot is still available', async () => {
      await setup();
      expect(screen.queryByText(/still available|guaranteed|reserved/i)).toBeNull();
    });
  });

  describe('Confirm', () => {
    it('sends exactly { slotId } with the stored Idempotency-Key and shows done=1', async () => {
      const { slot, sent, view } = await setup();
      const key = keyOf(slot.id);
      expect(key).toMatch(/^[0-9a-f-]{36}$/);
      await userEvent.setup().click(await confirmButton());
      await vi.waitFor(() => expect(view.router.url).toContain('done=1'));
      expect(sent).toEqual([{ key, body: { slotId: slot.id } }]);
    });

    it('is disabled and busy while in flight, with Back and the indicator disabled; Enter and double click send one', async () => {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const backend = createBookingBackend();
      const slot = firstSlot(backend, { date: DATE });
      const view = await renderBook({
        url: reviewUrl(slot.id),
        backend,
        handlers: [
          http.post(`${BOOK_BASE}/api/appointments`, async () => {
            await gate;
            return undefined;
          }),
        ],
      });
      const confirm = await confirmButton();
      await vi.waitFor(() => expect(confirm).toBeEnabled());
      const user = userEvent.setup();
      await user.dblClick(confirm);
      await user.keyboard('{Enter}');
      await vi.waitFor(() => expect(confirm).toHaveAttribute('aria-busy', 'true'));
      expect(confirm).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
      expect(screen.getByRole('button', { name: '3. Date and time' })).toBeDisabled();
      release();
      await vi.waitFor(() => expect(view.router.url).toContain('done=1'));
      expect(backend.state.counters.create).toBe(1);
    });
  });

  describe('states', () => {
    it('overlap: alert, link to My appointments, Choose another time replaces Confirm', async () => {
      const { backend, view } = await setup();
      const other = firstSlot(backend, { date: DATE, serviceId: SERVICE_IDS.consult });
      backend.createAppointment('00000000-0000-4000-8000-00000000f001', { slotId: other.id });
      await userEvent.setup().click(await confirmButton());
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('You already have an appointment at that time.');
      expect(within(alert).getByRole('link', { name: 'View my appointments' })).toHaveAttribute(
        'href',
        '/appointments',
      );
      expect(screen.queryByRole('button', { name: 'Confirm booking' })).toBeNull();
      await userEvent.setup().click(screen.getByRole('button', { name: 'Choose another time' }));
      await vi.waitFor(() => expect(view.store().step()).toBe('datetime'));
      expect(view.router.url).not.toContain('slot=');
    });

    it('in progress: message and a Check again button after the one automatic retry', async () => {
      const { backend, sent, view } = await setup();
      backend.state.flags.inProgressNext = true;
      await userEvent.setup().click(await confirmButton());
      expect(await screen.findByText('Your booking is still being processed.')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Check again' })).toBeTruthy();
      backend.state.flags.inProgressNext = true;
      view.clock.advance(2000);
      await vi.waitFor(() => expect(sent).toHaveLength(2));
      await userEvent.setup().click(await screen.findByRole('button', { name: 'Check again' }));
      await vi.waitFor(() => expect(view.router.url).toContain('done=1'));
      expect(new Set(sent.map((s) => s.key)).size).toBe(1);
    });

    it('unavailable: the may-or-may-not message and Try again with the same key', async () => {
      const { backend, slot, sent, view } = await setup();
      backend.state.flags.unavailableNext = 1;
      const user = userEvent.setup();
      await user.click(await confirmButton());
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'We could not confirm your booking. It may or may not have gone through. Try again; you will not be booked twice.',
      );
      await user.click(screen.getByRole('button', { name: 'Try again' }));
      await vi.waitFor(() => expect(view.router.url).toContain('done=1'));
      expect(sent).toHaveLength(2);
      expect(sent[1].key).toBe(sent[0].key);
      expect(sent[0].body).toEqual({ slotId: slot.id });
    });

    it('422: the new key message and Confirm enabled again', async () => {
      const { backend, slot } = await setup();
      const stale = '00000000-0000-4000-8000-00000000f002';
      sessionStorage.setItem(`sa.idem.${slot.id}`, stale);
      const other = firstSlot(backend, { date: DATE, serviceId: SERVICE_IDS.consult });
      backend.createAppointment(stale, { slotId: other.id });
      await userEvent.setup().click(await confirmButton());
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Something went wrong with that request. Please confirm again.',
      );
      expect(await confirmButton()).toBeEnabled();
      expect(keyOf(slot.id)).not.toBe(stale);
    });

    it('429: the countdown replaces Confirm and Confirm returns when it ends', async () => {
      const { backend, view } = await setup();
      backend.state.flags.createRateLimited = true;
      await userEvent.setup().click(await confirmButton());
      expect((await screen.findAllByText(/Try again in 60 seconds/)).length).toBeGreaterThan(0);
      expect(screen.queryByRole('button', { name: 'Confirm booking' })).toBeNull();
      view.clock.advance(60_000);
      expect(await confirmButton()).toBeEnabled();
    });

    it('400 or 403: the message inline and one error toast', async () => {
      const { view } = await setup();
      server.use(
        http.post(`${BOOK_BASE}/api/appointments`, () =>
          HttpResponse.json(
            { status: 403, detail: 'Only customers can book.' },
            { status: 403, headers: { 'Content-Type': 'application/problem+json' } },
          ),
        ),
      );
      await userEvent.setup().click(await confirmButton());
      expect(await screen.findByRole('alert')).toHaveTextContent('Only customers can book.');
      expect(view.toast.showError).toHaveBeenCalledTimes(1);
    });

    it('slot gone: back to step 3 with the toast', async () => {
      const { backend, slot, view } = await setup();
      backend.state.slots.get(slot.id)!.availableCapacity = 0;
      await userEvent.setup().click(await confirmButton());
      await vi.waitFor(() => expect(view.store().step()).toBe('datetime'));
      expect(view.toast.showInfo).toHaveBeenCalledWith(
        'That time is no longer available. Please choose another.',
      );
    });

    it('no secure random source: the message shows and Confirm is disabled', async () => {
      const { backend, slot, view } = await setup();
      const next = [...backend.state.slots.values()]
        .filter(
          (x) =>
            x.branchId === BRANCH_IDS.london &&
            x.serviceTypeId === SERVICE_IDS.checkup &&
            x.date === DATE &&
            x.id !== slot.id,
        )
        .sort((a, b) => a.startMs - b.startMs)[0];
      vi.stubGlobal('crypto', {});
      await view.go(reviewUrl(next.id));
      expect(
        await screen.findByText(
          'Your browser cannot book appointments safely. Try a newer browser.',
        ),
      ).toBeTruthy();
      expect(await confirmButton()).toBeDisabled();
    });
  });

  describe('the idempotency key', () => {
    it('is created on entering Review and reused on Back and on reload', async () => {
      const { slot, view } = await setup();
      const key = keyOf(slot.id);
      expect(key).not.toBeNull();
      await userEvent.setup().click(screen.getByRole('button', { name: 'Back' }));
      await vi.waitFor(() => expect(view.store().step()).toBe('datetime'));
      expect(keyOf(slot.id)).toBe(key);
      await view.go(reviewUrl(slot.id));
      await confirmButton();
      expect(keyOf(slot.id)).toBe(key);
    });

    it('is not created before step 4', async () => {
      const backend = createBookingBackend();
      await renderBook({
        url: `/book?branch=${BRANCH_IDS.london}&service=${SERVICE_IDS.checkup}&date=${DATE}`,
        backend,
      });
      await screen.findByRole('radiogroup', { name: 'Available times' });
      expect(Object.keys(sessionStorage).filter((k) => k.startsWith('sa.idem.'))).toEqual([]);
    });

    it('gives another slot a new key and removes the old one', async () => {
      const { backend, slot, view } = await setup();
      const oldKey = keyOf(slot.id);
      const next = [...backend.state.slots.values()]
        .filter(
          (s) =>
            s.branchId === BRANCH_IDS.london &&
            s.serviceTypeId === SERVICE_IDS.checkup &&
            s.date === DATE &&
            s.id !== slot.id,
        )
        .sort((a, b) => a.startMs - b.startMs)[0];
      await view.go(reviewUrl(next.id));
      await confirmButton();
      await vi.waitFor(() => expect(keyOf(next.id)).not.toBeNull());
      expect(keyOf(next.id)).not.toBe(oldKey);
      expect(keyOf(slot.id)).toBeNull();
    });
  });
});
