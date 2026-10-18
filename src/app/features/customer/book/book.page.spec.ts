import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { BRANCH_IDS, SERVICE_IDS } from '../../../../testing/booking-backend';
import { firstSlot, renderBook } from '../../../../testing/render-book';

const LONDON = BRANCH_IDS.london;
const CHECKUP = SERVICE_IDS.checkup;
const UNKNOWN = '00000000-0000-4000-8000-0000000000aa';

async function settle(view: { harness: { fixture: { whenStable(): Promise<void> } } }) {
  await view.harness.fixture.whenStable();
  await new Promise((r) => setTimeout(r, 0));
  await view.harness.fixture.whenStable();
}

const notice = () => document.getElementById('book-notice')!;
const heading = (name: string) => screen.getByRole('heading', { level: 2, name });

/** Records whether each wizard navigation replaced the history entry. */
function recordReplace(into: boolean[]) {
  return (router: Router) => {
    const original = router.navigate.bind(router);
    router.navigate = ((...args: Parameters<Router['navigate']>) => {
      into.push(args[1]?.replaceUrl === true);
      return original(...args);
    }) as Router['navigate'];
  };
}

describe('BookPage and BookingWizardStore', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('renders one h1 and the first step for /book', async () => {
    await renderBook();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Book an appointment' })).toBeTruthy();
    expect(heading('Choose a branch')).toBeTruthy();
  });

  it.each([
    ['branch only', `?branch=${LONDON}`, 'Choose a service'],
    ['branch and service', `?branch=${LONDON}&service=${CHECKUP}`, 'Choose a date and time'],
  ])('derives the step from the URL: %s', async (_name, query, expected) => {
    await renderBook({ url: `/book${query}` });
    await vi.waitFor(() => expect(heading(expected)).toBeTruthy());
  });

  it('sets the default date with replaceUrl when step 3 opens without one', async () => {
    const replace: boolean[] = [];
    const view = await renderBook({
      url: `/book?branch=${LONDON}&service=${CHECKUP}`,
      beforeNavigate: recordReplace(replace),
    });
    await vi.waitFor(() => expect(view.router.url).toContain('date=2026-10-04'));
    expect(replace).toEqual([true]);
  });

  it('derives the review step for a valid slot', async () => {
    const view = await renderBook();
    const slot = firstSlot(view.backend, { date: '2026-10-05' });
    await view.go(`/book?branch=${LONDON}&service=${CHECKUP}&date=2026-10-05&slot=${slot.id}`);
    await vi.waitFor(() => expect(heading('Review and confirm')).toBeTruthy());
    expect(view.router.url).toContain(`slot=${slot.id}`);
  });

  it('pushes history entries on step moves, so Back returns to the earlier step', async () => {
    const view = await renderBook();
    await settle(view);
    // A bare TestBed has no bootstrap listener, so nothing hears the browser's popstate.
    view.router.setUpLocationChangeListener();
    view.store().chooseBranch(LONDON);
    await vi.waitFor(() => expect(heading('Choose a service')).toBeTruthy());
    TestBed.inject(Location).back();
    await vi.waitFor(() => expect(heading('Choose a branch')).toBeTruthy());
    expect(view.router.url).toBe('/book');
    TestBed.inject(Location).forward();
    await vi.waitFor(() => expect(heading('Choose a service')).toBeTruthy());
  });

  describe('step indicator', () => {
    it('lists the steps, and an earlier step returns to it with the later parameters dropped', async () => {
      const view = await renderBook({
        url: `/book?branch=${LONDON}&service=${CHECKUP}&date=2026-10-05`,
      });
      await vi.waitFor(() => expect(heading('Choose a date and time')).toBeTruthy());
      const list = screen.getByRole('list', { name: 'Booking progress' });
      expect(list.querySelector('[aria-current="step"]')).toHaveTextContent('3. Date and time');
      await userEvent.setup().click(screen.getByRole('button', { name: '2. Service' }));
      await vi.waitFor(() => expect(heading('Choose a service')).toBeTruthy());
      expect(view.router.url).toBe(`/book?branch=${LONDON}`);
    });

    it('collapses to "Step N of 4" under 640 px', async () => {
      await renderBook({ url: `/book?branch=${LONDON}`, width: 400 });
      await vi.waitFor(() => expect(screen.getByText('Step 2 of 4: Service')).toBeTruthy());
      expect(screen.queryByRole('list', { name: 'Booking progress' })).toBeNull();
    });
  });

  describe('repair', () => {
    it('removes an unknown branch with replaceUrl, shows the note, never echoes the value', async () => {
      const replace: boolean[] = [];
      const view = await renderBook({
        url: `/book?branch=${UNKNOWN}&service=${CHECKUP}`,
        beforeNavigate: recordReplace(replace),
      });
      await vi.waitFor(() => expect(view.router.url).toBe('/book'));
      expect(replace).toEqual([true]);
      expect(notice()).toHaveTextContent('That link is out of date. Choose again.');
      expect(heading('Choose a branch')).toBeTruthy();
      expect(document.body.textContent).not.toContain(UNKNOWN);
    });

    it('repairs a malformed id too, without echoing it', async () => {
      const view = await renderBook({ url: '/book?branch=%3Cscript%3Ex' });
      await vi.waitFor(() => expect(view.router.url).toBe('/book'));
      expect(notice()).toHaveTextContent('out of date');
      expect(document.body.textContent).not.toContain('<script>');
    });

    it('drops a branch without a schedule, a date out of range and a stale slot', async () => {
      const view = await renderBook({
        url: `/book?branch=${BRANCH_IDS.noSchedule}&service=${CHECKUP}`,
      });
      await vi.waitFor(() => expect(view.router.url).toBe('/book'));

      await view.go(`/book?branch=${LONDON}&service=${CHECKUP}&date=2026-10-30`);
      await vi.waitFor(() => expect(view.router.url).toContain('date=2026-10-04'));

      const stale = '00000000-0000-4000-8000-0000000000bb';
      await view.go(`/book?branch=${LONDON}&service=${CHECKUP}&date=2026-10-05&slot=${stale}`);
      await vi.waitFor(() =>
        expect(view.router.url).toBe(`/book?branch=${LONDON}&service=${CHECKUP}&date=2026-10-05`),
      );
      expect(heading('Choose a date and time')).toBeTruthy();
      expect(notice()).toHaveTextContent('out of date');
    });

    it('drops done without a booking silently', async () => {
      const view = await renderBook({
        url: `/book?branch=${LONDON}&service=${CHECKUP}&date=2026-10-05&done=1`,
      });
      await vi.waitFor(() =>
        expect(view.router.url).toBe(`/book?branch=${LONDON}&service=${CHECKUP}&date=2026-10-05`),
      );
      expect(heading('Choose a date and time')).toBeTruthy();
      expect(notice()).toBeEmptyDOMElement();
    });

    it('clears the note on the next user navigation', async () => {
      const view = await renderBook({ url: `/book?branch=${UNKNOWN}` });
      await vi.waitFor(() => expect(notice()).toHaveTextContent('out of date'));
      view.store().chooseBranch(LONDON);
      await vi.waitFor(() => expect(notice().textContent?.trim()).toBe(''));
    });
  });

  describe('titles', () => {
    it.each([
      ['/book', 'Book an appointment | Smart Appointments'],
      [`/book?branch=${LONDON}`, 'Service | Book an appointment | Smart Appointments'],
      [
        `/book?branch=${LONDON}&service=${CHECKUP}&date=2026-10-05`,
        'Date and time | Book an appointment | Smart Appointments',
      ],
    ])('%s has the title %s', async (url, title) => {
      await renderBook({ url });
      await vi.waitFor(() => expect(TestBed.inject(Title).getTitle()).toBe(title));
    });

    it('names the review step', async () => {
      const view = await renderBook();
      const slot = firstSlot(view.backend, { date: '2026-10-05' });
      await view.go(`/book?branch=${LONDON}&service=${CHECKUP}&date=2026-10-05&slot=${slot.id}`);
      await vi.waitFor(() =>
        expect(TestBed.inject(Title).getTitle()).toBe(
          'Review | Book an appointment | Smart Appointments',
        ),
      );
    });
  });

  describe('focus', () => {
    it('does not move focus on the first render, and does on a later step change', async () => {
      const view = await renderBook();
      await settle(view);
      expect(document.activeElement).toBe(document.body);
      view.store().chooseBranch(LONDON);
      await vi.waitFor(() => expect(document.activeElement).toBe(heading('Choose a service')));
    });
  });

  describe('session and storage', () => {
    it('sends no slot search before the session is authenticated', async () => {
      const view = await renderBook({
        url: `/book?branch=${LONDON}&service=${CHECKUP}&date=2026-10-05`,
        status: 'unknown',
      });
      await settle(view);
      await new Promise((r) => setTimeout(r, 400));
      expect(view.backend.state.counters.search).toBe(0);
      view.session.status.set('authenticated');
      await vi.waitFor(() => expect(view.backend.state.counters.search).toBe(1));
    });

    it('writes nothing to web storage while navigating', async () => {
      const view = await renderBook();
      view.store().chooseBranch(LONDON);
      await settle(view);
      expect(localStorage.length).toBe(0);
      expect(sessionStorage.length).toBe(0);
    });
  });
});
