import {
  EnvironmentInjector,
  createEnvironmentInjector,
  runInInjectionContext,
} from '@angular/core';
import { http, HttpResponse } from 'msw';
import { BRANCH_IDS, SERVICE_IDS, createBookingBackend } from '../../../../testing/booking-backend';
import {
  BOOK_BASE,
  firstSlot,
  renderBook,
  type RenderedBook,
} from '../../../../testing/render-book';
import { AUTO_RETRY_MS, createConfirmFlow, type ConfirmFlow } from './confirm.machine';
import { JUST_BOOKED_KEY } from './just-booked.marker';

const DATE = '2026-10-05';
const reviewUrl = (slotId: string) =>
  `/book?branch=${BRANCH_IDS.london}&service=${SERVICE_IDS.checkup}&date=${DATE}&slot=${slotId}`;

interface Sent {
  key: string | null;
  body: unknown;
}

/** Renders Review for the first slot, with a flow created in an injector that can be destroyed. */
async function setup(options: { backend?: ReturnType<typeof createBookingBackend> } = {}) {
  const backend = options.backend ?? createBookingBackend();
  const slot = firstSlot(backend, { date: DATE });
  const sent: Sent[] = [];
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
  await vi.waitFor(() => expect(view.store().slot()?.id).toBe(slot.id));
  const node = view.harness.routeDebugElement!.injector;
  const env = createEnvironmentInjector([], node.get(EnvironmentInjector));
  const flow = runInInjectionContext(env, () => createConfirmFlow());
  return { backend, slot, sent, view, flow, env };
}

const settled = async (view: RenderedBook) => {
  await view.harness.fixture.whenStable();
  await new Promise((r) => setTimeout(r, 0));
};
const stateIs = (flow: ConfirmFlow, s: string) => vi.waitFor(() => expect(flow.state().s).toBe(s));

describe('createConfirmFlow', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
    localStorage.clear();
  });

  describe('success', () => {
    it('sends the exact body and header, clears the key, marks the booking and shows done=1', async () => {
      const { slot, sent, view, flow } = await setup();
      flow.submit();
      await stateIs(flow, 'done');
      expect(sent).toHaveLength(1);
      expect(sent[0].body).toEqual({ slotId: slot.id });
      expect(sent[0].key).toMatch(/^[0-9a-f-]{36}$/);
      expect(sessionStorage.getItem(`sa.idem.${slot.id}`)).toBeNull();
      expect(sessionStorage.getItem(JUST_BOOKED_KEY)).not.toBeNull();
      await vi.waitFor(() => expect(view.router.url).toContain('done=1'));
      expect(view.router.url).not.toContain('slot=');
      expect(view.store().booking()?.appointment.slotId).toBe(slot.id);
      expect(view.toast.showInfo).not.toHaveBeenCalled();
      expect(view.toast.showSuccess).not.toHaveBeenCalled();
    });
  });

  describe('double activation', () => {
    it('sends one request for two synchronous submits and for a retry while in flight', async () => {
      const { backend, flow } = await setup();
      flow.submit();
      flow.submit();
      flow.retry();
      expect(flow.state().s).toBe('submitting');
      await stateIs(flow, 'done');
      expect(backend.state.counters.create).toBe(1);
    });
  });

  describe('overlap', () => {
    it('stays on review in the overlap state and keeps the key', async () => {
      const { backend, slot, view, flow } = await setup();
      const other = firstSlot(backend, { date: DATE, serviceId: SERVICE_IDS.consult });
      backend.createAppointment('00000000-0000-4000-8000-00000000f001', { slotId: other.id });
      flow.submit();
      await stateIs(flow, 'overlap');
      expect(sessionStorage.getItem(`sa.idem.${slot.id}`)).toMatch(/^[0-9a-f-]{36}$/);
      expect(view.router.url).toContain(`slot=${slot.id}`);
      expect(view.toast.showInfo).not.toHaveBeenCalled();
    });
  });

  describe('in progress', () => {
    it('re-sends the same key once after 2 s, then only on a manual retry', async () => {
      const { backend, sent, view, flow } = await setup();
      backend.state.flags.inProgressNext = true;
      flow.submit();
      await stateIs(flow, 'in-progress');
      expect(flow.state()).toEqual({ s: 'in-progress', autoRetried: false });
      view.clock.advance(AUTO_RETRY_MS - 1);
      expect(sent).toHaveLength(1);
      view.clock.advance(1);
      await stateIs(flow, 'done');
      expect(sent).toHaveLength(2);
      expect(sent[1].key).toBe(sent[0].key);
    });

    it('does not auto retry a second time', async () => {
      const { backend, sent, view, flow } = await setup();
      backend.state.flags.inProgressNext = true;
      flow.submit();
      await stateIs(flow, 'in-progress');
      backend.state.flags.inProgressNext = true;
      view.clock.advance(AUTO_RETRY_MS);
      await vi.waitFor(() => expect(sent).toHaveLength(2));
      await vi.waitFor(() => expect(flow.state()).toEqual({ s: 'in-progress', autoRetried: true }));
      view.clock.advance(10 * AUTO_RETRY_MS);
      await settled(view);
      expect(sent).toHaveLength(2);
      flow.retry();
      await stateIs(flow, 'done');
      expect(sent).toHaveLength(3);
      expect(new Set(sent.map((s) => s.key)).size).toBe(1);
    });
  });

  describe('the slot is gone', () => {
    it('on 409 clears the key, refreshes the day, returns to step 3 without slot and toasts', async () => {
      const { backend, slot, view, flow } = await setup();
      backend.state.slots.get(slot.id)!.availableCapacity = 0;
      const searches = backend.state.counters.search;
      flow.submit();
      await vi.waitFor(() =>
        expect(view.toast.showInfo).toHaveBeenCalledWith(
          'That time is no longer available. Please choose another.',
        ),
      );
      expect(flow.state().s).toBe('idle');
      expect(sessionStorage.getItem(`sa.idem.${slot.id}`)).toBeNull();
      await vi.waitFor(() => expect(view.router.url).not.toContain('slot='));
      await vi.waitFor(() => expect(backend.state.counters.search).toBeGreaterThan(searches));
      expect(view.store().step()).toBe('datetime');
      expect(view.toast.showInfo).toHaveBeenCalledTimes(1);
    });

    it('on 404 does the same', async () => {
      const { backend, slot, view, flow } = await setup();
      backend.state.slots.delete(slot.id);
      flow.submit();
      await vi.waitFor(() => expect(view.toast.showInfo).toHaveBeenCalled());
      expect(sessionStorage.getItem(`sa.idem.${slot.id}`)).toBeNull();
      await vi.waitFor(() => expect(view.router.url).not.toContain('slot='));
    });
  });

  describe('422', () => {
    it('rotates the key, stays on review and shows the message', async () => {
      const { backend, slot, sent, view, flow } = await setup();
      const stale = '00000000-0000-4000-8000-00000000f002';
      sessionStorage.setItem(`sa.idem.${slot.id}`, stale);
      const other = firstSlot(backend, { date: DATE, serviceId: SERVICE_IDS.consult });
      backend.createAppointment(stale, { slotId: other.id });
      flow.submit();
      await stateIs(flow, 'failed');
      expect(flow.state()).toEqual({
        s: 'failed',
        message: 'Something went wrong with that request. Please confirm again.',
      });
      const fresh = sessionStorage.getItem(`sa.idem.${slot.id}`);
      expect(fresh).toMatch(/^[0-9a-f-]{36}$/);
      expect(fresh).not.toBe(stale);
      expect(view.router.url).toContain(`slot=${slot.id}`);
      // Confirm is enabled again and the next request carries the new key.
      const sentBefore = sent.length;
      flow.retry();
      await vi.waitFor(() => expect(sent.length).toBe(sentBefore + 1));
      expect(sent.at(-1)!.key).toBe(fresh);
    });
  });

  describe('unavailable, network and timeout', () => {
    it('keeps the key and a user retry sends the same key', async () => {
      const { backend, slot, sent, flow } = await setup();
      backend.state.flags.unavailableNext = 1;
      flow.submit();
      await stateIs(flow, 'retryable');
      const key = sessionStorage.getItem(`sa.idem.${slot.id}`);
      expect(key).not.toBeNull();
      flow.retry();
      await stateIs(flow, 'done');
      expect(sent.map((s) => s.key)).toEqual([key, key]);
    });

    it('replays a lost response: the same key twice, one appointment, one success', async () => {
      const { backend, slot, sent, view, flow } = await setup();
      backend.state.flags.dropResponseAfterBookingNext = true;
      flow.submit();
      await stateIs(flow, 'retryable');
      expect(backend.bookedFor(slot.id)).toHaveLength(1);
      flow.retry();
      await stateIs(flow, 'done');
      expect(sent).toHaveLength(2);
      expect(sent[1].key).toBe(sent[0].key);
      expect(backend.bookedFor(slot.id)).toHaveLength(1);
      await vi.waitFor(() => expect(view.router.url).toContain('done=1'));
    });
  });

  describe('429', () => {
    it('counts down, keeps the key, and returns to idle with no automatic retry', async () => {
      const { backend, slot, sent, view, flow } = await setup();
      backend.state.flags.createRateLimited = true;
      flow.submit();
      await stateIs(flow, 'rate-limited');
      expect(flow.countdown.remaining()).toBe(60);
      expect(sessionStorage.getItem(`sa.idem.${slot.id}`)).not.toBeNull();
      view.clock.advance(60_000);
      await stateIs(flow, 'idle');
      expect(sent).toHaveLength(1);
      backend.state.flags.createRateLimited = false;
      flow.submit();
      await stateIs(flow, 'done');
      expect(sent[1].key).toBe(sent[0].key);
    });
  });

  describe('400 and 403', () => {
    it.each([400, 403])('shows the message inline and toasts once for %i', async (status) => {
      const { flow, view } = await setup();
      const { server } = await import('../../../../testing/server');
      server.use(
        http.post(`${BOOK_BASE}/api/appointments`, () =>
          HttpResponse.json(
            { status, detail: 'Nope.' },
            { status, headers: { 'Content-Type': 'application/problem+json' } },
          ),
        ),
      );
      flow.submit();
      await stateIs(flow, 'failed');
      expect(flow.state()).toEqual({ s: 'failed', message: 'Nope.' });
      expect(view.toast.showError).toHaveBeenCalledTimes(1);
    });
  });

  describe('401', () => {
    it('leaves the flow idle for F1 and keeps the key for the return', async () => {
      const { flow, slot } = await setup();
      const { server } = await import('../../../../testing/server');
      server.use(
        http.post(`${BOOK_BASE}/api/appointments`, () =>
          HttpResponse.json(
            { status: 401, detail: 'Unauthorized.' },
            { status: 401, headers: { 'Content-Type': 'application/problem+json' } },
          ),
        ),
      );
      flow.submit();
      await vi.waitFor(() => expect(flow.state().s).toBe('idle'));
      await new Promise((r) => setTimeout(r, 20));
      expect(flow.state().s).toBe('idle');
      expect(sessionStorage.getItem(`sa.idem.${slot.id}`)).not.toBeNull();
    });
  });

  describe('not sent', () => {
    it('makes no call for a Staff user', async () => {
      const { backend, view, flow } = await setup();
      view.session.role.set('Staff');
      flow.submit();
      await settled(view);
      expect(backend.state.counters.create).toBe(0);
      expect(flow.state().s).toBe('idle');
    });

    it('makes no call when the session is not authenticated', async () => {
      const { backend, view, flow } = await setup();
      view.session.status.set('anonymous');
      flow.submit();
      await settled(view);
      expect(backend.state.counters.create).toBe(0);
    });
  });

  describe('leaving Review mid-flight', () => {
    it('does not abort the request and a new flow stays disabled until it ends', async () => {
      const backend = createBookingBackend();
      const slot = firstSlot(backend, { date: DATE });
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
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
      await vi.waitFor(() => expect(view.store().slot()?.id).toBe(slot.id));
      const node = view.harness.routeDebugElement!.injector;
      const first = createEnvironmentInjector([], node.get(EnvironmentInjector));
      const flow = runInInjectionContext(first, () => createConfirmFlow());
      flow.submit();
      first.destroy(); // the component is gone
      const second = createEnvironmentInjector([], node.get(EnvironmentInjector));
      const again = runInInjectionContext(second, () => createConfirmFlow());
      expect(again.state().s).toBe('submitting');
      again.submit();
      release();
      await vi.waitFor(() => expect(view.router.url).toContain('done=1'));
      expect(backend.state.counters.create).toBe(1);
      expect(backend.bookedFor(slot.id)).toHaveLength(1);
      expect(view.store().booking()).not.toBeNull();
      expect(again.state().s).not.toBe('submitting');
    });
  });
});
