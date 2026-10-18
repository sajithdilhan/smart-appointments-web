import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { makeAppointment } from '../../../../testing/make-appointment';
import { groupByDate, toViewModel } from './appointment-view';
import { AppointmentCard } from './appointment-card';
import { AppointmentTabs } from './appointment-tabs';
import { AppointmentTimeline } from './appointment-timeline';
import { AppointmentsSkeleton } from './appointments-skeleton';
import { EmptyState } from './empty-state';
import { InlineError } from './inline-error';
import { LoadMore } from './load-more';
import { AppointmentStatusBadge } from './status-badge';

const NOW = new Date('2026-10-04T12:00:00Z');
const view = (start: string, over: { tab?: 'upcoming' | 'past'; zone?: string | null } = {}) =>
  toViewModel(makeAppointment({ startUtc: start }), {
    tab: over.tab ?? 'upcoming',
    now: NOW,
    locale: 'en-GB',
    branch: { name: 'London', timeZoneId: over.zone === undefined ? 'Europe/London' : over.zone },
    service: { name: 'Health check' },
  });

describe('AppointmentStatusBadge', () => {
  it('shows Booked and Cancelled as text', async () => {
    await render(AppointmentStatusBadge, { inputs: { status: 'Booked' } });
    expect(screen.getByText('Booked')).toBeTruthy();
  });

  it('a past Booked keeps "Booked" with hidden "(past)" and never "Completed"', async () => {
    await render(AppointmentStatusBadge, { inputs: { status: 'Booked', isPast: true } });
    expect(screen.getByText('Booked', { exact: false }).textContent).toContain('(past)');
    expect(screen.queryByText(/completed/i)).toBeNull();
  });

  it('Cancelled is neutral text', async () => {
    await render(AppointmentStatusBadge, { inputs: { status: 'Cancelled' } });
    expect(screen.getByText('Cancelled').getAttribute('data-variant')).toBe('secondary');
  });

  it('an unknown status renders its own text, neutral', async () => {
    await render(AppointmentStatusBadge, { inputs: { status: 'NoShow' } });
    expect(screen.getByText('NoShow').getAttribute('data-variant')).toBe('secondary');
  });

  it('the cancelling state reads "Cancelling…" and the spinner is motion-safe', async () => {
    const { container } = await render(AppointmentStatusBadge, {
      inputs: { status: 'Booked', cancelling: true },
    });
    expect(screen.getByText('Cancelling…')).toBeTruthy();
    expect(container.querySelector('ng-icon')?.className).toContain('motion-safe:animate-spin');
  });
});

describe('AppointmentCard', () => {
  it('is one link named service, branch, date and time, status, pointing at the detail', async () => {
    const v = view('2026-10-05T15:00:00Z');
    await render(AppointmentCard, { inputs: { view: v }, routes: [] });
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('aria-label')).toBe(v.a11yName);
    expect(links[0].getAttribute('href')).toBe(`/appointments/${v.id}`);
    expect(within(links[0]).queryAllByRole('button')).toHaveLength(0);
  });

  it('shows the zone label and browser line only when the zone differs', async () => {
    await render(AppointmentCard, { inputs: { view: view('2026-10-05T15:00:00Z') }, routes: [] });
    expect(screen.getByText('05:00 your time')).toBeTruthy();
  });

  it('shows no zone label when the zone matches the browser', async () => {
    const same = view('2026-10-05T15:00:00Z', { zone: 'Pacific/Kiritimati' });
    await render(AppointmentCard, { inputs: { view: same }, routes: [] });
    expect(screen.queryByText(/your time/)).toBeNull();
  });

  it('says "your time" when the zone is unknown', async () => {
    const unknown = view('2026-10-05T15:00:00Z', { zone: null });
    await render(AppointmentCard, { inputs: { view: unknown }, routes: [] });
    expect(screen.getByText('your time')).toBeTruthy();
  });
});

describe('AppointmentTimeline', () => {
  it('renders a heading and a list per date group, keeping the order', async () => {
    const groups = groupByDate([
      view('2026-10-05T09:00:00Z'),
      view('2026-10-05T11:00:00Z'),
      view('2026-10-07T09:00:00Z'),
    ]);
    await render(AppointmentTimeline, { inputs: { groups }, routes: [] });
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(2);
    expect(screen.getAllByRole('list')).toHaveLength(2);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  it('marks a pending item as Cancelling', async () => {
    const v = view('2026-10-05T09:00:00Z');
    await render(AppointmentTimeline, {
      inputs: { groups: groupByDate([v]), pendingIds: [v.id] },
      routes: [],
    });
    expect(screen.getByText('Cancelling…')).toBeTruthy();
  });
});

describe('AppointmentsSkeleton', () => {
  it('is three hidden placeholders', async () => {
    const { container } = await render(AppointmentsSkeleton);
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3);
  });
});

describe('LoadMore', () => {
  it('emits on click and is disabled and busy while loading', async () => {
    const user = userEvent.setup();
    const more = vi.fn();
    const { rerender } = await render(LoadMore, {
      inputs: { loading: false },
      on: { more },
    });
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(more).toHaveBeenCalledTimes(1);
    await rerender({ inputs: { loading: true } });
    const button = screen.getByRole('button', { name: 'Load more' });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
  });
});

describe('EmptyState', () => {
  it.each([
    ['upcoming', 'No upcoming appointments'],
    ['past', 'No past appointments'],
  ] as const)('%s tab: heading and a link to /book, not an alert', async (tab, heading) => {
    await render(EmptyState, { inputs: { tab }, routes: [] });
    expect(screen.getByRole('heading', { name: heading })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Book an appointment' }).getAttribute('href')).toBe(
      '/book',
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/never booked/i)).toBeNull();
  });
});

describe('InlineError', () => {
  it('is an alert with the message and a Try again button that emits', async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    await render(InlineError, { inputs: { message: 'Service unavailable.' }, on: { retry } });
    expect(screen.getByRole('alert').textContent).toContain('Service unavailable.');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe('AppointmentTabs', () => {
  it('is a tablist with the selected tab tabbable and the others not', async () => {
    await render(AppointmentTabs, { inputs: { tab: 'past' } });
    expect(screen.getByRole('tablist')).toBeTruthy();
    const upcoming = screen.getByRole('tab', { name: 'Upcoming' });
    const past = screen.getByRole('tab', { name: 'Past' });
    expect(past.getAttribute('aria-selected')).toBe('true');
    expect(past.getAttribute('tabindex')).toBe('0');
    expect(upcoming.getAttribute('aria-selected')).toBe('false');
    expect(upcoming.getAttribute('tabindex')).toBe('-1');
  });

  it('click and arrow keys, Home and End report the tab', async () => {
    const user = userEvent.setup();
    const tabChange = vi.fn();
    await render(AppointmentTabs, { inputs: { tab: 'upcoming' }, on: { tabChange } });
    await user.click(screen.getByRole('tab', { name: 'Past' }));
    expect(tabChange).toHaveBeenLastCalledWith('past');
    screen.getByRole('tab', { name: 'Upcoming' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(tabChange).toHaveBeenLastCalledWith('past');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Past' }));
    await user.keyboard('{ArrowRight}');
    expect(tabChange).toHaveBeenLastCalledWith('upcoming');
    await user.keyboard('{End}');
    expect(tabChange).toHaveBeenLastCalledWith('past');
    await user.keyboard('{Home}');
    expect(tabChange).toHaveBeenLastCalledWith('upcoming');
    await user.keyboard('{ArrowLeft}');
    expect(tabChange).toHaveBeenLastCalledWith('past');
  });

  it('shows the Show cancelled switch only on Upcoming and reports it', async () => {
    const user = userEvent.setup();
    const showCancelledChange = vi.fn();
    const { rerender } = await render(AppointmentTabs, {
      inputs: { tab: 'upcoming', showCancelled: false },
      on: { showCancelledChange },
    });
    await user.click(screen.getByRole('switch', { name: 'Show cancelled' }));
    expect(showCancelledChange).toHaveBeenCalledWith(true);
    await rerender({ inputs: { tab: 'past' } });
    expect(screen.queryByRole('switch')).toBeNull();
  });
});
