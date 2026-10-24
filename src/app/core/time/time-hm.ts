import { zonedParts } from './branch-time';
import { weekdayOf } from './calendar-date';
import { parseUtc } from './parse-utc';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * The 24-hour `HH:mm` wall-clock time of an instant (an ISO string or a Date) in a zone, UTC for
 * an invalid zone. One format on purpose: the browser locale would give 12-hour clocks to some
 * staff and 24-hour to others on the same schedule.
 */
export function timeHm(isoOrDate: string | Date, zone: string): string {
  const at = typeof isoOrDate === 'string' ? parseUtc(isoOrDate) : isoOrDate;
  const { minutes } = zonedParts(zone, at);
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/**
 * "Friday 24 October 2026" for a `yyyy-MM-dd` calendar date. Pure calendar arithmetic on the
 * date's parts, so neither the browser's zone nor its locale can change the day or the wording.
 */
export function longDateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${weekdayOf(date)} ${d} ${MONTH_NAMES[m - 1]} ${y}`;
}
