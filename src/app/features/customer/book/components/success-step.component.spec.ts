import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { BRANCH_IDS, SERVICE_IDS } from '../../../../../testing/booking-backend';
import { firstSlot, renderBook, type RenderedBook } from '../../../../../testing/render-book';

const DATE = '2026-10-05';
const step3 = `/book?branch=${BRANCH_IDS.london}&service=${SERVICE_IDS.checkup}&date=${DATE}`;
const heading = (name: string) => screen.getByRole('heading', { level: 2, name });
const reference = (view: RenderedBook) =>
  view.backend.bookedFor(firstSlot(view.backend, { date: DATE }).id)[0].id;

/** Books the first slot through the UI: chip, Continue to review, Confirm booking. */
async function bookFirstSlot() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('radio', { name: /^09:00 to 09:30/ }));
  await user.click(screen.getByRole('button', { name: 'Continue to review' }));
  const confirm = await screen.findByRole('button', { name: 'Confirm booking' });
  await vi.waitFor(() => expect(confirm).toBeEnabled());
  await user.click(confirm);
  await screen.findByRole('heading', { level: 2, name: 'Booking confirmed!' });
  return user;
}

/** `matchMedia` where the user prefers reduced motion and the viewport is wide. */
function reducedMotionStub() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    media: query,
    matches: /prefers-reduced-motion: reduce/.test(query) || /min-width/.test(query),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

describe('SuccessStepComponent', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it('focuses the heading, shows the summary and the full reference, announces once, no toast', async () => {
    const view = await renderBook({ url: step3 });
    await bookFirstSlot();
    await vi.waitFor(() => expect(heading('Booking confirmed!')).toHaveFocus());
    expect(screen.getByText(reference(view))).toBeTruthy();
    expect(screen.getByText('10 Baker Street, London')).toBeTruthy();
    expect(screen.getByText('Check-up')).toBeTruthy();
    await vi.waitFor(() =>
      expect(
        screen.getAllByRole('status').filter((s) => /booked for/.test(s.textContent ?? '')),
      ).toHaveLength(1),
    );
    expect(
      screen.getByText(/Your appointment is booked for .*5 October 2026, 09:00 to 09:30\./),
    ).toBeTruthy();
    expect(view.toast.showSuccess).not.toHaveBeenCalled();
    expect(view.toast.showInfo).not.toHaveBeenCalled();
    expect(document.title).toBe('Appointment booked | Smart Appointments');
    expect(screen.getByRole('button', { name: /Add to calendar/ })).toBeTruthy();
  });

  it('shows the heading, the sentence, the mint reference card and the summary without Edit', async () => {
    const view = await renderBook({ url: step3 });
    await bookFirstSlot();
    expect(heading('Booking confirmed!')).toBeTruthy();
    expect(screen.getByText('Your appointment has been successfully booked.')).toBeTruthy();
    const label = screen.getByText('Booking reference');
    const card = label.parentElement!;
    expect(card).toHaveClass('bg-success-soft');
    expect(within(card).getByText(reference(view))).toHaveClass('font-mono');
    expect(within(card).getByRole('button', { name: 'Copy reference' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Booking summary' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Edit / })).toBeNull();
    expect(screen.getByRole('button', { name: /Add to calendar/ })).not.toHaveAttribute(
      'data-variant',
      'outline',
    );
  });

  it('links to the appointment detail, to the home page, and offers Book another', async () => {
    const view = await renderBook({ url: step3 });
    await bookFirstSlot();
    expect(screen.getByRole('link', { name: 'View details' })).toHaveAttribute(
      'href',
      `/appointments/${reference(view)}`,
    );
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('button', { name: 'Book another' })).toBeTruthy();
  });

  it('shows the contact from the profile once it is ready, else the session email', async () => {
    const view = await renderBook({ url: step3 });
    view.session.profile.set({
      firstName: 'Ann',
      lastName: 'Example',
      email: 'ann@example.com',
      phoneNumber: '+44 20 7946 0000',
    });
    view.session.profileStatus.set('ready');
    await bookFirstSlot();
    expect(screen.getByText('ann@example.com')).toBeTruthy();
    expect(screen.getByText('+44 20 7946 0000')).toBeTruthy();
  });

  describe('Copy reference', () => {
    it('copies and says so', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      const view = await renderBook({ url: step3 });
      const user = await bookFirstSlot();
      vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
      await user.click(screen.getByRole('button', { name: 'Copy reference' }));
      await vi.waitFor(() => expect(screen.getByText('Copied')).toBeTruthy());
      expect(writeText).toHaveBeenCalledWith(reference(view));
    });

    it('with the clipboard blocked keeps the reference visible and throws nothing', async () => {
      const view = await renderBook({ url: step3 });
      const user = await bookFirstSlot();
      vi.stubGlobal('navigator', {
        ...navigator,
        clipboard: { writeText: () => Promise.reject(new Error('denied')) },
      });
      await user.click(screen.getByRole('button', { name: 'Copy reference' }));
      expect(screen.queryByText('Copied')).toBeNull();
      expect(screen.getByText(reference(view))).toBeTruthy();
    });

    it('with no clipboard at all does not throw either', async () => {
      await renderBook({ url: step3 });
      const user = await bookFirstSlot();
      vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
      await user.click(screen.getByRole('button', { name: 'Copy reference' }));
      expect(screen.queryByText('Copied')).toBeNull();
    });
  });

  describe('confetti', () => {
    it('is not rendered under reduced motion, not even after the idle time', async () => {
      await renderBook({ url: step3, beforeNavigate: reducedMotionStub });
      await bookFirstSlot();
      await new Promise((r) => setTimeout(r, 300));
      expect(document.querySelector('canvas')).toBeNull();
    });
  });

  describe('Back from success', () => {
    it('lands on step 3 without slot, with the key gone and the success view gone', async () => {
      const view = await renderBook({ url: step3 });
      await bookFirstSlot();
      const slot = firstSlot(view.backend, { date: DATE });
      expect(view.router.url).toContain('done=1');
      expect(sessionStorage.getItem(`sa.idem.${slot.id}`)).toBeNull();
      view.router.setUpLocationChangeListener();
      const searches = view.backend.state.counters.search;
      TestBed.inject(Location).back();
      await vi.waitFor(() => expect(heading('Choose a date and time')).toBeTruthy());
      expect(view.router.url).toBe(step3);
      expect(screen.queryByRole('heading', { name: 'Booking confirmed!' })).toBeNull();
      // The cache entry was invalidated, so the day is searched again and shows less capacity.
      await vi.waitFor(() => expect(view.backend.state.counters.search).toBeGreaterThan(searches));
      await vi.waitFor(() =>
        expect(screen.getByRole('radio', { name: '09:00 to 09:30, 1 spot left' })).toBeTruthy(),
      );
    });
  });

  it('drops done=1 on a reload that has no booking and shows step 3', async () => {
    const view = await renderBook({ url: `${step3}&done=1` });
    await vi.waitFor(() => expect(heading('Choose a date and time')).toBeTruthy());
    expect(view.router.url).not.toContain('done=');
    expect(screen.queryByRole('heading', { name: 'Booking confirmed!' })).toBeNull();
  });

  describe('Book another and the saved hint', () => {
    it('resets to step 1 with no parameters and shows the hint once', async () => {
      const view = await renderBook({ url: step3 });
      const user = await bookFirstSlot();
      await user.click(screen.getByRole('button', { name: 'Book another' }));
      await vi.waitFor(() => expect(heading('Choose a branch')).toBeTruthy());
      expect(view.router.url).toBe('/book');
      expect(screen.getByText(/Your appointment is saved\. Find it in/)).toBeTruthy();
      expect(screen.getByRole('link', { name: 'My appointments' })).toHaveAttribute(
        'href',
        '/appointments',
      );
      // The marker is consumed: a fresh wizard visit does not show it again.
      TestBed.resetTestingModule();
      await renderBook({ url: '/book' });
      await screen.findByRole('heading', { level: 2, name: 'Choose a branch' });
      expect(screen.queryByText(/Your appointment is saved/)).toBeNull();
    });
  });
});
