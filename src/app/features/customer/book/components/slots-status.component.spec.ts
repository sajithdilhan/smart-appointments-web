import { screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { BRANCH_IDS, SERVICE_IDS } from '../../../../../testing/booking-backend';
import { BOOK_BASE, renderBook } from '../../../../../testing/render-book';

const LONDON = BRANCH_IDS.london;
const url = (date: string) => `/book?branch=${LONDON}&service=${SERVICE_IDS.checkup}&date=${date}`;
const status = () =>
  Array.from(document.querySelectorAll('[role="status"]')).map((e) => e.textContent?.trim());

describe('SlotsStatusComponent', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows a busy skeleton until the times arrive', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await renderBook({
      url: url('2026-10-05'),
      settle: false,
      handlers: [
        http.get(`${BOOK_BASE}/api/Slots/available`, async () => {
          await gate;
          return HttpResponse.json([]);
        }),
      ],
    });
    const region = (await screen.findByLabelText('Loading times')).parentElement!;
    expect(region).toHaveAttribute('aria-busy', 'true');
    release();
    await screen.findByText(/No times available on/);
    expect(region).toHaveAttribute('aria-busy', 'false');
  });

  it('announces "N times available" once per completed search', async () => {
    const view = await renderBook({ url: url('2026-10-05') });
    await screen.findByRole('radiogroup', { name: 'Available times' });
    const count = status().find((t) => /times available$/.test(t ?? ''));
    expect(count).toMatch(/^\d+ times available$/);
    // A refresh with the same list is not a new announcement of different text.
    await userEvent.setup().click(screen.getByRole('button', { name: 'Refresh times' }));
    await view.harness.fixture.whenStable();
    expect(status().filter((t) => t === count)).toHaveLength(1);
  });

  describe('empty day', () => {
    it('offers the next day and another branch', async () => {
      const view = await renderBook({ url: url('2026-10-11') }); // a Sunday: closed
      expect(await screen.findByText(/^No times available on Sunday,? 11 October\.$/)).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Choose another branch' })).toHaveAttribute(
        'href',
        '/book',
      );
      await userEvent
        .setup()
        .click(screen.getByRole('button', { name: /^Check Monday,? 12 October$/ }));
      await vi.waitFor(() => expect(view.router.url).toContain('date=2026-10-12'));
    });

    it('has no next-day button on the last strip day', async () => {
      await renderBook({ url: url('2026-10-17') }); // a Saturday, the 14th day
      await screen.findByText(/^No times available on Saturday,? 17 October\.$/);
      expect(screen.queryByRole('button', { name: /^Check / })).toBeNull();
    });
  });

  it('shows an error with Try again that reloads', async () => {
    let fail = true;
    const view = await renderBook({
      url: url('2026-10-05'),
      handlers: [
        http.get(`${BOOK_BASE}/api/Slots/available`, ({ request }) => {
          if (fail) return HttpResponse.json({ status: 500, detail: 'x' }, { status: 500 });
          void request;
          return undefined;
        }),
      ],
    });
    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(screen.getByRole('alert')).toHaveTextContent(/could not load the times/i);
    fail = false;
    await userEvent.setup().click(retry);
    await screen.findByRole('radiogroup', { name: 'Available times' });
    void view;
  });

  it('shows the 429 countdown, never retries by itself, and Try again after it ends', async () => {
    const view = await renderBook({ url: url('2026-10-05') });
    await screen.findByRole('radiogroup', { name: 'Available times' });
    view.backend.state.flags.searchRateLimitAfter = view.backend.state.counters.search;
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Tuesday,? (6 October|October 6)/ }));
    expect(
      (await screen.findAllByText(/Too many attempts. Try again in 60 seconds/)).length,
    ).toBeGreaterThan(0);
    const calls = view.backend.state.counters.search;
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    view.clock.advance(60_000);
    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(view.backend.state.counters.search).toBe(calls);
    view.backend.state.flags.searchRateLimitAfter = null;
    await user.click(retry);
    await screen.findByRole('radiogroup', { name: 'Available times' });
  });
});
