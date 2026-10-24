import type { MyAppointmentsQuery } from '../../../core/api/booking-api.service';

export type AppointmentTab = 'upcoming' | 'past';

export type PastStatus = 'all' | 'Completed' | 'NoShow' | 'Cancelled' | 'Booked';

/** The Past tab's status filter, in the order the select offers it (Req 10.3). */
export const PAST_STATUSES: readonly { value: PastStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'Completed', label: 'Completed' },
  { value: 'NoShow', label: 'No-show' },
  { value: 'Cancelled', label: 'Cancelled' },
  { value: 'Booked', label: 'Booked' },
];

export interface TabParams {
  tab: AppointmentTab;
  showCancelled: boolean;
  /** `?pstatus=`: honoured on Past only; always `all` on Upcoming. */
  pastStatus: PastStatus;
}

/**
 * The URL state `?tab=upcoming|past&cancelled=1&pstatus=...`. An unknown or missing tab is
 * Upcoming, `cancelled=1` is honoured only on Upcoming (the switch does not exist on Past) and
 * `pstatus` only on Past, where an unknown value is All.
 */
export function parseTab(raw: {
  tab?: string | null;
  cancelled?: string | null;
  pstatus?: string | null;
}): TabParams {
  const tab: AppointmentTab = raw.tab === 'past' ? 'past' : 'upcoming';
  const known = PAST_STATUSES.find((s) => s.value === raw.pstatus);
  return {
    tab,
    showCancelled: tab === 'upcoming' && raw.cancelled === '1',
    pastStatus: tab === 'past' && known ? known.value : 'all',
  };
}

/** Exactly the request parameters of Req 1.4: no free-form keys, no `customerId`. */
export function toListQuery(
  tab: AppointmentTab,
  showCancelled: boolean,
  page: number,
  pageSize: number,
  pastStatus: PastStatus = 'all',
): MyAppointmentsQuery {
  if (tab === 'past') {
    return pastStatus === 'all'
      ? { when: 'past', page, pageSize }
      : { status: pastStatus, when: 'past', page, pageSize };
  }
  return showCancelled
    ? { when: 'upcoming', page, pageSize }
    : { status: 'Booked', when: 'upcoming', page, pageSize };
}
