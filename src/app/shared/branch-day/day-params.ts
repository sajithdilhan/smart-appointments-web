import type { AppointmentStatus } from '../../core/api/models';
import { addDays } from '../../core/time';

export type StatusFilter = 'all' | AppointmentStatus;

export const STATUS_FILTERS: readonly { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'Booked', label: 'Booked' },
  { value: 'Completed', label: 'Completed' },
  { value: 'NoShow', label: 'No-show' },
  { value: 'Cancelled', label: 'Cancelled' },
];

export interface DayParams {
  date: string;
  status: StatusFilter;
  /** The raw `date` was absent or not a real calendar date, so the URL should be normalised. */
  dateWasInvalid: boolean;
}

/** `yyyy-MM-dd` that names a real calendar day (2026-02-30 is not one). */
export function isCalendarDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && addDays(value, 0) === value;
}

/** A known status, else All (Req 2.5). */
export function parseStatusFilter(raw: string | null | undefined): StatusFilter {
  return STATUS_FILTERS.find((f) => f.value !== 'all' && f.value === raw)?.value ?? 'all';
}

/**
 * The URL state `?date=yyyy-MM-dd&status=`. A missing or malformed date is `today` (Req 2.1) and
 * an unknown status is All (Req 2.5). Pure; `today` is the caller's "today in the branch zone".
 */
export function parseDayParams(
  raw: { date?: string | null; status?: string | null },
  today: string,
): DayParams {
  const valid = typeof raw.date === 'string' && isCalendarDate(raw.date);
  return {
    date: valid ? (raw.date as string) : today,
    status: parseStatusFilter(raw.status),
    dateWasInvalid: !valid,
  };
}

/** The request parameters of a day: `status` is left out for All (Req 2.3). */
export function toQuery(
  date: string,
  status: StatusFilter,
): { date: string; status?: AppointmentStatus } {
  return status === 'all' ? { date } : { date, status };
}

/** "No appointments on this day." or "No Booked appointments on this day." (Req 2.6). */
export function emptyDayText(status: StatusFilter): string {
  if (status === 'all') return 'No appointments on this day.';
  const label = STATUS_FILTERS.find((f) => f.value === status)?.label ?? status;
  return `No ${label} appointments on this day.`;
}
