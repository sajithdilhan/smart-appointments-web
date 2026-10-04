import type { MyAppointmentsQuery } from '../../../core/api/booking-api.service';

export type AppointmentTab = 'upcoming' | 'past';

export interface TabParams {
  tab: AppointmentTab;
  showCancelled: boolean;
}

/**
 * The URL state `?tab=upcoming|past&cancelled=1`. An unknown or missing tab is Upcoming, and
 * `cancelled=1` is honoured only on Upcoming (the switch does not exist on Past).
 */
export function parseTab(raw: { tab?: string | null; cancelled?: string | null }): TabParams {
  const tab: AppointmentTab = raw.tab === 'past' ? 'past' : 'upcoming';
  return { tab, showCancelled: tab === 'upcoming' && raw.cancelled === '1' };
}

/** Exactly the request parameters of Req 1.4: no free-form keys, no `customerId`. */
export function toListQuery(
  tab: AppointmentTab,
  showCancelled: boolean,
  page: number,
  pageSize: number,
): MyAppointmentsQuery {
  if (tab === 'past') return { when: 'past', page, pageSize };
  return showCancelled
    ? { when: 'upcoming', page, pageSize }
    : { status: 'Booked', when: 'upcoming', page, pageSize };
}
