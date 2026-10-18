import { screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import {
  BRANCH_IDS,
  SERVICE_IDS,
  createBookingBackend,
} from '../../../../../testing/booking-backend';
import { firstSlot, renderBook } from '../../../../../testing/render-book';

const LONDON = BRANCH_IDS.london;
const MONDAY = '2026-10-05';
const url = (date: string) => `/book?branch=${LONDON}&service=${SERVICE_IDS.checkup}&date=${date}`;
const group = () => screen.findByRole('radiogroup', { name: 'Available times' });

describe('slot chips (SlotGroupsComponent)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('groups by part of the day with headings and omits the empty group', async () => {
    await renderBook({ url: url(MONDAY) });
    await group();
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Morning',
      'Afternoon',
    ]);
  });

  it('lays the times out in two to three columns as outlined buttons', async () => {
    await renderBook({ url: url(MONDAY) });
    const radios = within(await group()).getAllByRole('radio');
    const grid = radios[0].parentElement!;
    expect(grid).toHaveClass('grid-cols-2', 'sm:grid-cols-3');
    expect(radios[0]).toHaveClass('rounded-lg', 'border', 'aria-checked:bg-primary');
  });

  it('shows an Evening group for a 17:00 start', async () => {
    const backend = createBookingBackend();
    const slot = firstSlot(backend, { date: MONDAY });
    slot.localStartTime = '17:00:00';
    slot.localEndTime = '17:30:00';
    await renderBook({ url: url(MONDAY), backend });
    await group();
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toContain(
      'Evening',
    );
    expect(screen.getByRole('radio', { name: /^17:00 to 17:30/ })).toBeTruthy();
  });

  it('names a chip from start, end and the capacity hint (1 and 3 shown, 4 hidden)', async () => {
    const backend = createBookingBackend();
    const slots = [...backend.state.slots.values()]
      .filter(
        (s) =>
          s.branchId === LONDON && s.serviceTypeId === SERVICE_IDS.checkup && s.date === MONDAY,
      )
      .sort((a, b) => a.startMs - b.startMs);
    slots[0].availableCapacity = 1;
    slots[1].availableCapacity = 3;
    slots[2].availableCapacity = 4;
    slots[2].capacity = 4;
    await renderBook({ url: url(MONDAY), backend });
    await group();
    const one = screen.getByRole('radio', { name: '09:00 to 09:30, 1 spot left' });
    expect(within(one).getByText('1 left')).toBeTruthy();
    const three = screen.getByRole('radio', { name: '09:30 to 10:00, 3 spots left' });
    expect(within(three).getByText('3 left')).toBeTruthy();
    const four = screen.getByRole('radio', { name: '10:00 to 10:30' });
    expect(within(four).queryByText(/left/)).toBeNull();
  });

  it('has one tab stop and arrows move across groups in visual order', async () => {
    await renderBook({ url: url(MONDAY) });
    const chips = within(await group()).getAllByRole('radio');
    expect(chips.filter((c) => c.tabIndex === 0)).toHaveLength(1);
    const lastMorning = chips
      .filter((c) => /^1[01]:|^09:/.test(c.getAttribute('aria-label')!))
      .at(-1)!;
    const firstAfternoon = chips.find((c) => /^12:00/.test(c.getAttribute('aria-label')!))!;
    lastMorning.focus();
    await userEvent.setup().keyboard('{ArrowRight}');
    expect(firstAfternoon).toHaveFocus();
  });

  describe('selection and Continue to review', () => {
    it('is disabled until a chip is chosen, then writes slot to the URL', async () => {
      const view = await renderBook({ url: url(MONDAY) });
      const user = userEvent.setup();
      const cont = await screen.findByRole('button', { name: 'Continue to review' });
      expect(cont).toBeDisabled();
      const chip = await screen.findByRole('radio', { name: /^09:00 to 09:30/ });
      await user.click(chip);
      expect(chip).toHaveAttribute('aria-checked', 'true');
      expect(view.router.url).not.toContain('slot=');
      expect(cont).toBeEnabled();
      await user.click(cont);
      const expected = firstSlot(view.backend, { date: MONDAY });
      await vi.waitFor(() => expect(view.router.url).toContain(`slot=${expected.id}`));
    });

    it('clears the selection when the date changes', async () => {
      await renderBook({ url: url(MONDAY) });
      const user = userEvent.setup();
      await user.click(await screen.findByRole('radio', { name: /^09:00 to 09:30/ }));
      await user.click(screen.getByRole('button', { name: /Tuesday,? (6 October|October 6)/ }));
      await screen.findByRole('radio', { name: /^09:00 to 09:30/ });
      await vi.waitFor(() =>
        expect(screen.getByRole('button', { name: 'Continue to review' })).toBeDisabled(),
      );
      for (const c of within(await group()).getAllByRole('radio')) {
        expect(c).toHaveAttribute('aria-checked', 'false');
      }
    });

    it('clears a selection that a refresh removed and toasts once', async () => {
      const view = await renderBook({ url: url(MONDAY) });
      const user = userEvent.setup();
      const slot = firstSlot(view.backend, { date: MONDAY });
      await user.click(await screen.findByRole('radio', { name: /^09:00 to 09:30/ }));
      view.backend.state.slots.delete(slot.id);
      await user.click(screen.getByRole('button', { name: 'Refresh times' }));
      await vi.waitFor(() =>
        expect(view.toast.showInfo).toHaveBeenCalledWith(
          'The time you picked is no longer available.',
        ),
      );
      expect(view.toast.showInfo).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'Continue to review' })).toBeDisabled();
    });
  });
});
