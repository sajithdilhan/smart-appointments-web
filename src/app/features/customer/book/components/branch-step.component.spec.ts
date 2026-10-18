import { fireEvent, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { BRANCH_IDS, createBookingBackend } from '../../../../../testing/booking-backend';
import { BOOK_BASE, renderBook } from '../../../../../testing/render-book';
import { formatClock } from '../clock-text';

const card = (name: string) => screen.getByRole('radio', { name });
const utc = (iso: string) => Date.parse(iso);

describe('BranchStepComponent', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows skeleton cards with aria-busy until the branches arrive', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await renderBook({
      settle: false,
      handlers: [
        http.get(`${BOOK_BASE}/api/Branches`, async () => {
          await gate;
          return HttpResponse.json([]);
        }),
      ],
    });
    expect(await screen.findByLabelText('Loading branches')).toHaveAttribute('aria-busy', 'true');
    release();
    expect(
      await screen.findByText('There are no branches available for online booking yet.'),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Loading branches')).toBeNull();
  });

  it('lists bookable branches first with address and the phone as plain text', async () => {
    await renderBook();
    const names = (await screen.findAllByRole('radio')).map((r) =>
      r.getAttribute('aria-labelledby'),
    );
    expect(names).toHaveLength(4);
    const labels = screen
      .getAllByRole('radio')
      .map((r) => within(r).getAllByText(/./)[0].textContent);
    expect(labels).toEqual(['Auckland', 'London', 'New York', 'No Schedule']);
    expect(within(card('London')).getByText('10 Baker Street, London')).toBeTruthy();
    expect(within(card('London')).getByText('+00 555 0120')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByRole('radiogroup', { name: 'Branch' })).toBeTruthy();
  });

  describe.each([
    // [branch, instant, today's hours, badge]
    ['Auckland', '2026-10-04T20:00:00Z', 'open', 'Open now'], // Monday 09:00 NZDT, at opensAt
    ['Auckland', '2026-10-05T04:00:00Z', 'open', 'Closed'], // Monday 17:00 NZDT, at closesAt
    ['London', '2026-10-05T08:00:00Z', 'open', 'Open now'], // Monday 09:00 BST
    ['London', '2026-10-05T15:59:00Z', 'open', 'Open now'], // 16:59 BST
    ['London', '2026-10-05T16:00:00Z', 'open', 'Closed'], // 17:00 BST
    ['New York', '2026-10-05T13:00:00Z', 'open', 'Open now'], // Monday 09:00 EDT
    ['New York', '2026-10-05T21:00:00Z', 'open', 'Closed'], // 17:00 EDT
    ['London', '2026-10-04T10:00:00Z', 'closed-today', 'Closed'], // a Sunday in London
  ])('hours and badge: %s at %s', (name, instant, hours, badge) => {
    it(`${hours}, ${badge}`, async () => {
      await renderBook({ nowMs: utc(instant) });
      const view = within(await screen.findByRole('radio', { name }));
      expect(
        view.getByText(
          hours === 'open'
            ? `Today ${formatClock('09:00')} to ${formatClock('17:00')}`
            : 'Closed today',
        ),
      ).toBeTruthy();
      expect(view.getByText(badge)).toBeTruthy();
    });
  });

  it('uses the success badge for Open now and the muted badge for Closed', async () => {
    await renderBook({ nowMs: utc('2026-10-05T08:00:00Z') });
    const open = within(await screen.findByRole('radio', { name: 'London' })).getByText('Open now');
    expect(open).toHaveAttribute('data-variant', 'success');
    const closed = within(card('Auckland')).getByText('Closed');
    expect(closed).toHaveAttribute('data-variant', 'muted');
  });

  it('keeps a decorative radio dot on every card', async () => {
    await renderBook();
    const cards = await screen.findAllByRole('radio');
    for (const c of cards)
      expect(c.querySelector('[aria-hidden="true"].rounded-full')).not.toBeNull();
  });

  it('refreshes the badge once a minute', async () => {
    const view = await renderBook({ nowMs: utc('2026-10-05T15:59:30Z') });
    expect(
      within(await screen.findByRole('radio', { name: 'London' })).getByText('Open now'),
    ).toBeTruthy();
    view.clock.advance(30_000); // 16:00:00Z = 17:00 BST
    await vi.waitFor(() => expect(within(card('London')).getByText('Closed')).toBeTruthy());
  });

  describe('a branch with no schedule', () => {
    it('is dimmed, disabled, described and focusable, and cannot be selected', async () => {
      const view = await renderBook();
      const disabled = await screen.findByRole('radio', { name: 'No Schedule' });
      expect(disabled).toHaveAttribute('aria-disabled', 'true');
      expect(within(disabled).getByText('Online booking not available')).toBeTruthy();
      const describedBy = disabled.getAttribute('aria-describedby')!;
      expect(document.getElementById(describedBy.split(' ')[1])).toHaveTextContent(
        'cannot be booked online',
      );
      const user = userEvent.setup();
      await user.click(disabled);
      disabled.focus();
      expect(disabled).toHaveFocus();
      await user.keyboard('{Enter}');
      await user.keyboard(' ');
      await view.harness.fixture.whenStable();
      expect(view.router.url).toBe('/book');
      expect(screen.getByRole('heading', { level: 2, name: 'Choose a branch' })).toBeTruthy();
    });
  });

  describe('selection', () => {
    it('click navigates to step 2 with the branch', async () => {
      const view = await renderBook();
      await userEvent.setup().click(await screen.findByRole('radio', { name: 'London' }));
      await vi.waitFor(() =>
        expect(screen.getByRole('heading', { level: 2, name: 'Choose a service' })).toBeTruthy(),
      );
      expect(view.router.url).toBe(`/book?branch=${BRANCH_IDS.london}`);
    });

    it('arrows move focus only; Enter selects', async () => {
      const view = await renderBook();
      const user = userEvent.setup();
      (await screen.findByRole('radio', { name: 'Auckland' })).focus();
      await user.keyboard('{ArrowRight}');
      expect(card('London')).toHaveFocus();
      expect(view.router.url).toBe('/book');
      await user.keyboard('{Enter}');
      await vi.waitFor(() => expect(view.router.url).toBe(`/book?branch=${BRANCH_IDS.london}`));
    });
  });

  describe('search', () => {
    it('filters after 150 ms by name, code or address, with no API call, and announces the count', async () => {
      const view = await renderBook();
      await screen.findByRole('radio', { name: 'London' });
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const input = screen.getByRole('searchbox', { name: 'Search branches' });
      fireEvent.input(input, { target: { value: 'lon' } });
      vi.advanceTimersByTime(149);
      expect(screen.getAllByRole('radio')).toHaveLength(4);
      vi.advanceTimersByTime(1);
      await view.harness.fixture.whenStable();
      view.harness.fixture.detectChanges();
      expect(screen.getAllByRole('radio').map((r) => r.getAttribute('aria-labelledby'))).toEqual([
        `branch-${BRANCH_IDS.london}-name`,
      ]);
      expect(screen.getByText('1 branch found')).toBeTruthy();

      fireEvent.input(input, { target: { value: 'NYC' } });
      vi.advanceTimersByTime(150);
      view.harness.fixture.detectChanges();
      expect(card('New York')).toBeTruthy();
      fireEvent.input(input, { target: { value: 'baker' } });
      vi.advanceTimersByTime(150);
      view.harness.fixture.detectChanges();
      expect(card('London')).toBeTruthy();
      expect(view.backend.state.counters.branches).toBe(1);
    });

    it('ignores accents and case', async () => {
      const backend = createBookingBackend();
      backend.state.branches[1].address = '1 L\u00f6wenstrasse, Z\u00fcrich';
      const view = await renderBook({ backend });
      await screen.findByRole('radio', { name: 'London' });
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      fireEvent.input(screen.getByRole('searchbox', { name: 'Search branches' }), {
        target: { value: 'ZURICH' },
      });
      vi.advanceTimersByTime(150);
      view.harness.fixture.detectChanges();
      expect(screen.getAllByRole('radio')).toHaveLength(1);
      expect(card('London')).toBeTruthy();
    });

    it('shows the no-match state with the text as text, and Clear search restores the list', async () => {
      const view = await renderBook();
      await screen.findByRole('radio', { name: 'London' });
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      fireEvent.input(screen.getByRole('searchbox', { name: 'Search branches' }), {
        target: { value: '<b>zzz</b>' },
      });
      vi.advanceTimersByTime(150);
      view.harness.fixture.detectChanges();
      expect(screen.getByText('No branches match "<b>zzz</b>"')).toBeTruthy();
      expect(document.querySelector('app-empty-state b')).toBeNull();
      screen.getByRole('button', { name: 'Clear search' }).click();
      view.harness.fixture.detectChanges();
      expect(screen.getAllByRole('radio')).toHaveLength(4);
    });

    it('shows a Clear search button only for a non-empty search; it empties the field and refocuses it', async () => {
      const view = await renderBook();
      await screen.findByRole('radio', { name: 'London' });
      expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const input = screen.getByRole('searchbox', { name: 'Search branches' });
      fireEvent.input(input, { target: { value: 'lon' } });
      vi.advanceTimersByTime(150);
      view.harness.fixture.detectChanges();
      expect(screen.getAllByRole('radio')).toHaveLength(1);
      screen.getByRole('button', { name: 'Clear search' }).click();
      view.harness.fixture.detectChanges();
      expect(input).toHaveValue('');
      expect(input).toHaveFocus();
      expect(screen.getAllByRole('radio')).toHaveLength(4);
      expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
    });

    it('has one Clear search button when nothing matches (the empty state offers it)', async () => {
      const view = await renderBook();
      await screen.findByRole('radio', { name: 'London' });
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      fireEvent.input(screen.getByRole('searchbox', { name: 'Search branches' }), {
        target: { value: 'zzz' },
      });
      vi.advanceTimersByTime(150);
      view.harness.fixture.detectChanges();
      expect(screen.getAllByRole('button', { name: 'Clear search' })).toHaveLength(1);
    });

    it('draws a decorative search icon in the field', async () => {
      await renderBook();
      const input = await screen.findByRole('searchbox', { name: 'Search branches' });
      expect(input.parentElement?.querySelector('ng-icon[aria-hidden="true"]')).not.toBeNull();
    });
  });

  describe('empty and error states', () => {
    it('says so when there are no branches', async () => {
      const backend = createBookingBackend();
      backend.state.branches.splice(0);
      await renderBook({ backend });
      expect(
        await screen.findByText('There are no branches available for online booking yet.'),
      ).toBeTruthy();
      expect(screen.queryByRole('searchbox')).toBeNull();
    });

    it('an outage shows the inline error with Try again, and no toast', async () => {
      let down = true;
      const view = await renderBook({
        handlers: [
          http.get(`${BOOK_BASE}/api/Branches`, () =>
            down
              ? HttpResponse.json({ status: 503, detail: 'Down.' }, { status: 503 })
              : HttpResponse.json([]),
          ),
        ],
      });
      expect(await screen.findByText(/We could not load the branches/)).toBeTruthy();
      expect(view.toast.showError).not.toHaveBeenCalled();
      down = false;
      await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
      expect(
        await screen.findByText('There are no branches available for online booking yet.'),
      ).toBeTruthy();
    });

    it('another failure shows its message inline and toasts once', async () => {
      const view = await renderBook({
        handlers: [
          http.get(`${BOOK_BASE}/api/Branches`, () =>
            HttpResponse.json({ status: 500, detail: 'Boom.' }, { status: 500 }),
          ),
        ],
      });
      expect(await screen.findByText('Boom.')).toBeTruthy();
      expect(view.toast.showError).toHaveBeenCalledTimes(1);
    });
  });
});
