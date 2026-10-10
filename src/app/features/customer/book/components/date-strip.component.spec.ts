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
/** The full label's punctuation follows the runtime locale ("Monday, 5 October"). */
const day = (text: string) => new RegExp(text.replace(/(\w+) (\d)/, '$1,? $2') + '$');
const days = () => within(screen.getByRole('radiogroup', { name: 'Choose a date' }));

describe('DateStripComponent', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('starts on the branch-zone today, not the browser date (Sydney-like user, New York branch)', async () => {
    // 2026-10-04T10:00Z: New York is still Sunday 4 October; the test process zone (UTC+14) is on the 5th.
    await renderBook({ url: base(BRANCH_IDS.newYork) });
    const radios = await days().findAllByRole('radio');
    expect(radios).toHaveLength(14);
    expect(radios[0]).toHaveAccessibleName(day('Today, Sunday 4 October'));
    expect(within(radios[0]).getByText('Today')).toBeTruthy();
    expect(within(radios[0]).getByText(/Sun\s+4/)).toBeTruthy();
    expect(radios[13]).toHaveAccessibleName(day('Saturday 17 October'));
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
  });

  it('shows the month on the first day and on the first of a month', async () => {
    await renderBook({ url: base(BRANCH_IDS.london), nowMs: utc('2026-10-29T12:00:00Z') });
    const radios = await days().findAllByRole('radio');
    expect(within(radios[0]).getByText('Oct')).toBeTruthy();
    expect(radios[3]).toHaveAccessibleName(day('Sunday 1 November'));
    expect(within(radios[3]).getByText('Nov')).toBeTruthy();
    expect(within(radios[1]).queryByText('Oct')).toBeNull();
  });

  it('sets today as the default date with replaceUrl', async () => {
    const view = await renderBook({ url: base(BRANCH_IDS.newYork) });
    await vi.waitFor(() => expect(view.router.url).toContain('date=2026-10-04'));
  });

  describe('keyboard', () => {
    it('arrow keys select the next day, Home and End jump to the ends', async () => {
      const view = await renderBook({ url: `${base(BRANCH_IDS.london)}&date=2026-10-04` });
      const user = userEvent.setup();
      const radios = await days().findAllByRole('radio');
      radios[0].focus();
      await user.keyboard('{ArrowRight}');
      await vi.waitFor(() => expect(view.router.url).toContain('date=2026-10-05'));
      expect(radios[1]).toHaveFocus();
      await user.keyboard('{End}');
      await vi.waitFor(() => expect(view.router.url).toContain('date=2026-10-17'));
      expect(radios[13]).toHaveFocus();
      await user.keyboard('{Home}');
      await vi.waitFor(() => expect(view.router.url).toContain('date=2026-10-04'));
      expect(radios[0]).toHaveFocus();
      await user.keyboard('{ArrowLeft}');
      await vi.waitFor(() => expect(view.router.url).toContain('date=2026-10-17'));
    });

    it('has one tab stop, on the selected day', async () => {
      await renderBook({ url: `${base(BRANCH_IDS.london)}&date=2026-10-07` });
      const radios = await days().findAllByRole('radio');
      expect(radios.filter((r) => r.tabIndex === 0)).toEqual([radios[3]]);
    });
  });

  it('selecting a day pushes the date and clears the slot', async () => {
    const view = await renderBook({ url: `${base(BRANCH_IDS.london)}&date=2026-10-05` });
    await userEvent
      .setup()
      .click(await screen.findByRole('radio', { name: day('Tuesday 6 October') }));
    await vi.waitFor(() => expect(view.router.url).toContain('date=2026-10-06'));
    expect(view.router.url).not.toContain('slot=');
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
      await days().findAllByRole('radio');
      expect(screen.queryByText(/Times are shown in/)).toBeNull();
    });
  });

  it('rolls over at the branch midnight: the strip moves and a past selection becomes today', async () => {
    // 23:59:30 BST on Monday 5 October.
    const view = await renderBook({
      url: `${base(BRANCH_IDS.london)}&date=2026-10-05`,
      nowMs: utc('2026-10-05T22:59:30Z'),
    });
    expect((await days().findAllByRole('radio'))[0]).toHaveAccessibleName(
      day('Today, Monday 5 October'),
    );
    view.clock.advance(30_000);
    await vi.waitFor(() => expect(view.router.url).toContain('date=2026-10-06'));
    const radios = await days().findAllByRole('radio');
    expect(radios[0]).toHaveAccessibleName(day('Today, Tuesday 6 October'));
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
  });
});
