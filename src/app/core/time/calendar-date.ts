import { fromEpochMs } from './parse-utc';
import { resolveZone } from './zone';

/** The single weekday type of the app. */
export type DayName =
  'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

/** Index by `getUTCDay()` (0 = Sunday). */
export const DAY_NAMES: readonly DayName[] = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const MS_PER_DAY = 86_400_000;
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

/** UTC midnight of a `yyyy-MM-dd` calendar date. */
function utcOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** The calendar date (`yyyy-MM-dd`) in the zone at `nowMs`; UTC for an invalid zone. */
export function todayInZone(timeZoneId: string, nowMs: number): string {
  const zone = resolveZone(timeZoneId);
  let f = dateFormatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    dateFormatters.set(zone, f);
  }
  const parts = f.formatToParts(nowMs);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Pure `Date.UTC` arithmetic: a DST change can never shift the result. */
export function addDays(date: string, n: number): string {
  const d = fromEpochMs(utcOf(date) + n * MS_PER_DAY);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** `to - from` in calendar days. */
export function diffDays(from: string, to: string): number {
  return Math.round((utcOf(to) - utcOf(from)) / MS_PER_DAY);
}

export function weekdayOf(date: string): DayName {
  return DAY_NAMES[fromEpochMs(utcOf(date)).getUTCDay()];
}

/** Inclusive; empty when `to < from`. */
export function eachDate(from: string, to: string): string[] {
  const count = diffDays(from, to);
  const result: string[] = [];
  for (let i = 0; i <= count; i++) result.push(addDays(from, i));
  return result;
}
