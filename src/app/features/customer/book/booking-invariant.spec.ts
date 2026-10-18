import { screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { BRANCH_IDS, SERVICE_IDS } from '../../../../testing/booking-backend';
import { firstSlot, renderBook } from '../../../../testing/render-book';

const DATE = '2026-10-05';

/** A small seeded PRNG (mulberry32), so a failing sequence can be replayed from its seed. */
function prng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PRIMARY = ['Confirm booking', 'Try again', 'Check again'];
const primary = () =>
  PRIMARY.map((name) => screen.queryByRole('button', { name })).find((b) => b !== null) ?? null;
const successViews = () =>
  screen.queryAllByRole('heading', { level: 2, name: 'Booking confirmed!' }).length;
const pause = (ms = 25) => new Promise((r) => setTimeout(r, ms));

describe('booking invariant (Req 13.3)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it.each([1, 2, 3, 7, 11, 42, 99, 2026])(
    'seed %i: activations, retries, lost responses, 503s, reloads and double taps book at most once and show one success',
    async (seed) => {
      const random = prng(seed);
      const view = await renderBook({
        url: `/book?branch=${BRANCH_IDS.london}&service=${SERVICE_IDS.checkup}&date=${DATE}`,
      });
      const slot = firstSlot(view.backend, { date: DATE });
      const user = userEvent.setup();
      const reviewUrl = `/book?branch=${BRANCH_IDS.london}&service=${SERVICE_IDS.checkup}&date=${DATE}&slot=${slot.id}`;
      await view.go(reviewUrl);
      await screen.findByRole('button', { name: 'Confirm booking' });
      await vi.waitFor(() =>
        expect(screen.getByRole('button', { name: 'Confirm booking' })).toBeEnabled(),
      );

      const flags = view.backend.state.flags;
      for (let step = 0; step < 40 && successViews() === 0; step++) {
        const roll = random();
        if (roll < 0.15) flags.dropResponseAfterBookingNext = true;
        else if (roll < 0.3) flags.unavailableNext = 1;
        else if (roll < 0.4) flags.inProgressNext = true;
        else if (roll < 0.45) flags.createRateLimited = true;

        const action = random();
        const button = primary();
        if (action < 0.45 && button) {
          await user.click(button);
        } else if (action < 0.65 && button) {
          await user.dblClick(button);
        } else if (action < 0.8) {
          await view.go(reviewUrl); // reload of Review
        } else if (action < 0.9) {
          view.clock.advance(2000);
        } else {
          view.clock.advance(60_000);
          flags.createRateLimited = false;
        }
        await pause();
        // The invariant holds after every single step, not only at the end.
        expect(view.backend.bookedFor(slot.id).length).toBeLessThanOrEqual(1);
        expect(successViews()).toBeLessThanOrEqual(1);
      }

      // Let it finish: clear every fault and press the primary button until the booking shows.
      flags.createRateLimited = false;
      flags.dropResponseAfterBookingNext = false;
      flags.unavailableNext = 0;
      flags.inProgressNext = false;
      view.clock.advance(60_000);
      for (let i = 0; i < 10 && successViews() === 0; i++) {
        await pause();
        const button = primary();
        if (button && !button.hasAttribute('disabled')) await user.click(button);
        await pause();
      }
      await vi.waitFor(() => expect(successViews()).toBe(1));
      expect(view.backend.bookedFor(slot.id)).toHaveLength(1);
    },
    30_000,
  );
});
