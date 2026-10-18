import { screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import {
  BRANCH_IDS,
  SERVICE_IDS,
  createBookingBackend,
} from '../../../../../testing/booking-backend';
import { renderBook } from '../../../../../testing/render-book';

const CHECKUP = SERVICE_IDS.checkup;
const base = (branch: string) => `/book?branch=${branch}&service=${CHECKUP}`;
const utc = (iso: string) => Date.parse(iso);
/** Two months: 29 October to 11 November. */
const TWO_MONTHS = utc('2026-10-29T12:00:00Z');

/** The accessible name of a day; the order of day and month follows the runtime locale. */
const label = (weekday: string, day: number, month: string, today = false) =>
  new RegExp(`^${today ? 'Today, ' : ''}${weekday},? (?:${day} ${month}|${month} ${day}),? 2026$`);

const grid = () => screen.getByRole('grid');
const dayButton = (date: string) => {
  const el = grid().querySelector<HTMLButtonElement>(`[data-date="${date}"]`);
  if (!el) throw new Error(`no day ${date} in the grid`);
  return el;
};
const title = () => grid().getAttribute('aria-labelledby');
const titleText = () => document.getElementById(title()!)?.textContent?.trim();
const dateInUrl = (url: string) => /date=([\d-]+)/.exec(url)?.[1];

async function open(options: { nowMs?: number; branch?: string; date?: string } = {}) {
  const date = options.date ? `&date=${options.date}` : '';
  const view = await renderBook({
    url: `${base(options.branch ?? BRANCH_IDS.london)}${date}`,
    nowMs: options.nowMs,
  });
  await screen.findByRole('grid');
  if (!options.date) await vi.waitFor(() => expect(view.router.url).toContain('date='));
  return view;
}

describe('MonthCalendarComponent', () => {
  afterEach(() => vi.unstubAllGlobals());

  describe('structure', () => {
    it('is a grid named by the month and year, with Monday-first column headings', async () => {
      await open();
      expect(titleText()).toBe('October 2026');
      expect(grid()).toHaveAccessibleName('October 2026');
      const headings = within(grid()).getAllByRole('columnheader');
      expect(headings.map((h) => h.textContent?.trim())).toEqual([
        'Mon',
        'Tue',
        'Wed',
        'Thu',
        'Fri',
        'Sat',
        'Sun',
      ]);
      expect(headings[0]).toHaveAttribute('abbr', 'Monday');
      expect(headings[6]).toHaveAttribute('abbr', 'Sunday');
    });

    it('shows every day of the month as a button with the full date as its name', async () => {
      await open();
      const buttons = within(grid()).getAllByRole('button');
      expect(buttons).toHaveLength(31);
      expect(dayButton('2026-10-21')).toHaveAccessibleName(label('Wednesday', 21, 'October'));
      expect(dayButton('2026-10-01')).toHaveAccessibleName(label('Thursday', 1, 'October'));
      expect(dayButton('2026-10-31')).toHaveAccessibleName(label('Saturday', 31, 'October'));
      for (const b of buttons) {
        expect(b.getAttribute('aria-label')).toMatch(/2026$/);
      }
      expect(new Set(buttons.map((b) => b.getAttribute('aria-label'))).size).toBe(31);
    });

    it('leaves the days of the adjacent months empty', async () => {
      await open();
      const cells = within(grid()).getAllByRole('gridcell');
      expect(cells).toHaveLength(35); // 28 September to 1 November
      expect(cells.filter((c) => c.querySelector('button'))).toHaveLength(31);
    });
  });

  describe('the booking window', () => {
    it('enables only today and the 13 days after it', async () => {
      await open();
      const enabled = within(grid())
        .getAllByRole('button')
        .filter((b) => !(b as HTMLButtonElement).disabled)
        .map((b) => b.dataset['date']);
      expect(enabled).toEqual(
        Array.from({ length: 14 }, (_, i) => `2026-10-${String(4 + i).padStart(2, '0')}`),
      );
      expect(dayButton('2026-10-03')).toBeDisabled();
      expect(dayButton('2026-10-18')).toBeDisabled();
    });

    it('starts on the branch-zone today, not the browser date (Sydney-like user, New York branch)', async () => {
      // 2026-10-04T10:00Z: New York is still Sunday 4 October; the test process zone (UTC+14) is on the 5th.
      await open({ branch: BRANCH_IDS.newYork });
      expect(dayButton('2026-10-04')).toHaveAccessibleName(label('Sunday', 4, 'October', true));
      expect(dayButton('2026-10-04')).not.toBeDisabled();
      expect(dayButton('2026-10-03')).toBeDisabled();
    });

    it('marks today with aria-current="date" and the selected day as selected', async () => {
      await open({ date: '2026-10-07' });
      expect(dayButton('2026-10-04')).toHaveAttribute('aria-current', 'date');
      expect(dayButton('2026-10-07')).not.toHaveAttribute('aria-current');
      const selected = within(grid())
        .getAllByRole('gridcell')
        .filter((c) => c.getAttribute('aria-selected') === 'true');
      expect(selected).toHaveLength(1);
      expect(within(selected[0]).getByRole('button')).toBe(dayButton('2026-10-07'));
      expect(dayButton('2026-10-07')).toHaveClass('bg-primary', 'text-primary-foreground');
      expect(dayButton('2026-10-04')).toHaveClass('ring-2');
    });

    it('uses today as the default date', async () => {
      const view = await open();
      expect(dateInUrl(view.router.url)).toBe('2026-10-04');
      expect(dayButton('2026-10-04').closest('td')).toHaveAttribute('aria-selected', 'true');
    });
  });

  describe('month navigation', () => {
    it('disables both arrows when the window sits in one month', async () => {
      await open();
      expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
    });

    it('moves across the two months of a window and stops at both ends', async () => {
      await open({ nowMs: TWO_MONTHS });
      const user = userEvent.setup();
      expect(titleText()).toBe('October 2026');
      expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Next month' })).toBeEnabled();

      await user.click(screen.getByRole('button', { name: 'Next month' }));
      expect(titleText()).toBe('November 2026');
      expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Previous month' })).toBeEnabled();
      const enabled = within(grid())
        .getAllByRole('button')
        .filter((b) => !(b as HTMLButtonElement).disabled)
        .map((b) => b.dataset['date']);
      expect(enabled).toHaveLength(11); // 1 to 11 November
      expect(enabled[0]).toBe('2026-11-01');

      await user.click(screen.getByRole('button', { name: 'Previous month' }));
      expect(titleText()).toBe('October 2026');
    });

    it('has the first bookable day as the tab stop in a month with no selection', async () => {
      await open({ nowMs: TWO_MONTHS });
      await userEvent.setup().click(screen.getByRole('button', { name: 'Next month' }));
      const stops = within(grid())
        .getAllByRole('button')
        .filter((b) => b.tabIndex === 0);
      expect(stops).toEqual([dayButton('2026-11-01')]);
    });

    it('opens on the month of the selected date', async () => {
      await open({ nowMs: TWO_MONTHS, date: '2026-11-05' });
      expect(titleText()).toBe('November 2026');
    });
  });

  describe('selection', () => {
    it('a click selects the day: the date is pushed and the slot cleared', async () => {
      const view = await open({ date: '2026-10-05' });
      await userEvent.setup().click(dayButton('2026-10-06'));
      await vi.waitFor(() => expect(dateInUrl(view.router.url)).toBe('2026-10-06'));
      expect(view.router.url).not.toContain('slot=');
      expect(dayButton('2026-10-06').closest('td')).toHaveAttribute('aria-selected', 'true');
      expect(dayButton('2026-10-05').closest('td')).toHaveAttribute('aria-selected', 'false');
    });

    it('does nothing for a day outside the window', async () => {
      const view = await open({ date: '2026-10-05' });
      await userEvent.setup().click(dayButton('2026-10-20'));
      expect(dateInUrl(view.router.url)).toBe('2026-10-05');
    });

    it('Enter and Space select the focused day', async () => {
      const view = await open({ date: '2026-10-05' });
      const user = userEvent.setup();
      dayButton('2026-10-08').focus();
      await user.keyboard('{Enter}');
      await vi.waitFor(() => expect(dateInUrl(view.router.url)).toBe('2026-10-08'));
      dayButton('2026-10-09').focus();
      await user.keyboard(' ');
      await vi.waitFor(() => expect(dateInUrl(view.router.url)).toBe('2026-10-09'));
    });
  });

  describe('keyboard', () => {
    it('has one tab stop, on the selected day', async () => {
      await open({ date: '2026-10-07' });
      const stops = within(grid())
        .getAllByRole('button')
        .filter((b) => b.tabIndex === 0);
      expect(stops).toEqual([dayButton('2026-10-07')]);
    });

    it('the arrows move focus by a day and a week, and focus does not select', async () => {
      const view = await open({ date: '2026-10-07' });
      const user = userEvent.setup();
      dayButton('2026-10-07').focus();
      await user.keyboard('{ArrowRight}');
      await vi.waitFor(() => expect(dayButton('2026-10-08')).toHaveFocus());
      await user.keyboard('{ArrowDown}');
      await vi.waitFor(() => expect(dayButton('2026-10-15')).toHaveFocus());
      await user.keyboard('{ArrowLeft}');
      await vi.waitFor(() => expect(dayButton('2026-10-14')).toHaveFocus());
      await user.keyboard('{ArrowUp}');
      await vi.waitFor(() => expect(dayButton('2026-10-07')).toHaveFocus());
      expect(dateInUrl(view.router.url)).toBe('2026-10-07');
      expect(dayButton('2026-10-07')).toHaveClass('bg-primary');
      // The roving tab stop follows the focus.
      expect(dayButton('2026-10-07').tabIndex).toBe(0);
      dayButton('2026-10-10').focus();
      await vi.waitFor(() => expect(dayButton('2026-10-10').tabIndex).toBe(0));
      expect(dayButton('2026-10-07').tabIndex).toBe(-1);
    });

    it('the arrows skip the disabled days: they stop at the first and last bookable day', async () => {
      await open({ date: '2026-10-05' });
      const user = userEvent.setup();
      dayButton('2026-10-04').focus();
      await user.keyboard('{ArrowLeft}');
      expect(dayButton('2026-10-04')).toHaveFocus();
      await user.keyboard('{ArrowUp}');
      expect(dayButton('2026-10-04')).toHaveFocus();

      dayButton('2026-10-14').focus();
      await user.keyboard('{ArrowDown}'); // 21 October is outside: stops at the last day
      await vi.waitFor(() => expect(dayButton('2026-10-17')).toHaveFocus());
      await user.keyboard('{ArrowRight}');
      expect(dayButton('2026-10-17')).toHaveFocus();
      await user.keyboard('{ArrowDown}');
      expect(dayButton('2026-10-17')).toHaveFocus();
    });

    it('Home and End go to the first and last bookable day of the week', async () => {
      await open({ date: '2026-10-07' });
      const user = userEvent.setup();
      dayButton('2026-10-07').focus(); // Wednesday
      await user.keyboard('{End}');
      await vi.waitFor(() => expect(dayButton('2026-10-11')).toHaveFocus()); // Sunday
      await user.keyboard('{Home}');
      await vi.waitFor(() => expect(dayButton('2026-10-05')).toHaveFocus()); // Monday
      // The first week starts on Sunday 4 October's Monday (28 September), which is not bookable.
      dayButton('2026-10-04').focus();
      await user.keyboard('{Home}');
      expect(dayButton('2026-10-04')).toHaveFocus();
      // The last week ends on 18 October, which is not bookable.
      dayButton('2026-10-14').focus();
      await user.keyboard('{End}');
      await vi.waitFor(() => expect(dayButton('2026-10-17')).toHaveFocus());
    });

    it('Page Up and Page Down do nothing when the window has no adjacent month', async () => {
      await open({ date: '2026-10-07' });
      const user = userEvent.setup();
      dayButton('2026-10-07').focus();
      await user.keyboard('{PageDown}');
      expect(dayButton('2026-10-07')).toHaveFocus();
      expect(titleText()).toBe('October 2026');
      await user.keyboard('{PageUp}');
      expect(dayButton('2026-10-07')).toHaveFocus();
      expect(titleText()).toBe('October 2026');
    });

    it('Page Down and Page Up move to the adjacent month, clamped to the window', async () => {
      const view = await open({ nowMs: TWO_MONTHS, date: '2026-10-30' });
      const user = userEvent.setup();
      dayButton('2026-10-30').focus();
      await user.keyboard('{PageDown}'); // 30 November is outside: the last day, 11 November
      await vi.waitFor(() => expect(titleText()).toBe('November 2026'));
      await vi.waitFor(() => expect(dayButton('2026-11-11')).toHaveFocus());
      await user.keyboard('{PageDown}');
      expect(dayButton('2026-11-11')).toHaveFocus();
      await user.keyboard('{PageUp}'); // 11 October is before the window: the first day, 29 October
      await vi.waitFor(() => expect(titleText()).toBe('October 2026'));
      await vi.waitFor(() => expect(dayButton('2026-10-29')).toHaveFocus());
      expect(dateInUrl(view.router.url)).toBe('2026-10-30'); // still not selected
    });

    it('the month switches when focus crosses a month boundary', async () => {
      await open({ nowMs: TWO_MONTHS, date: '2026-10-31' });
      const user = userEvent.setup();
      dayButton('2026-10-31').focus();
      await user.keyboard('{ArrowRight}');
      await vi.waitFor(() => expect(titleText()).toBe('November 2026'));
      await vi.waitFor(() => expect(dayButton('2026-11-01')).toHaveFocus());
      await user.keyboard('{ArrowLeft}');
      await vi.waitFor(() => expect(titleText()).toBe('October 2026'));
      await vi.waitFor(() => expect(dayButton('2026-10-31')).toHaveFocus());
      // A week down from the last Monday-to-Sunday row of October lands in November.
      await user.keyboard('{ArrowDown}');
      await vi.waitFor(() => expect(titleText()).toBe('November 2026'));
      await vi.waitFor(() => expect(dayButton('2026-11-07')).toHaveFocus());
    });

    it('leaves other keys alone', async () => {
      const view = await open({ date: '2026-10-07' });
      dayButton('2026-10-07').focus();
      await userEvent.setup().keyboard('a');
      expect(dayButton('2026-10-07')).toHaveFocus();
      expect(dateInUrl(view.router.url)).toBe('2026-10-07');
    });
  });

  describe('time', () => {
    it('rolls over at the branch midnight: today moves and a past selection becomes today', async () => {
      // 23:59:30 BST on Monday 5 October.
      const view = await open({ nowMs: utc('2026-10-05T22:59:30Z'), date: '2026-10-05' });
      expect(dayButton('2026-10-05')).toHaveAccessibleName(label('Monday', 5, 'October', true));
      view.clock.advance(30_000);
      await vi.waitFor(() => expect(dateInUrl(view.router.url)).toBe('2026-10-06'));
      await vi.waitFor(() =>
        expect(dayButton('2026-10-06')).toHaveAccessibleName(label('Tuesday', 6, 'October', true)),
      );
      expect(dayButton('2026-10-06').closest('td')).toHaveAttribute('aria-selected', 'true');
      expect(dayButton('2026-10-05')).toBeDisabled();
    });
  });

  describe('the zone line', () => {
    it('is shown when the branch zone differs from the browser zone', async () => {
      await renderBook({ url: base(BRANCH_IDS.newYork) });
      expect(await screen.findByText('Times are shown in New York time')).toBeTruthy();
    });

    it('is omitted when the zones agree', async () => {
      const backend = createBookingBackend();
      const london = backend.state.branches.find((b) => b.id === BRANCH_IDS.london)!;
      london.timeZoneId = 'Pacific/Kiritimati'; // the process zone of the tests
      await renderBook({ url: base(BRANCH_IDS.london), backend });
      await screen.findByRole('grid');
      expect(screen.queryByText(/Times are shown in/)).toBeNull();
    });
  });
});
