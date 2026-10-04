import { DAY_NAMES, addDays, weekdayOf, type DayName } from './calendar-date';
import { fromEpochMs } from './parse-utc';
import { resolveZone } from './zone';

export type Weekday = DayName;

export interface BranchSchedule {
  timeZoneId: string;
  /** `dayOfWeek` may be a name or the .NET enum number (0 = Sunday). */
  workingHours: { dayOfWeek: DayName | number; opensAt: string; closesAt: string }[];
}

export interface ZonedParts {
  date: string;
  weekday: DayName;
  /** Minutes since local midnight. */
  minutes: number;
}

export interface DayStripItem {
  date: string;
  weekdayShort: string;
  day: number;
  /** Set on the first item and on the first of a month, otherwise null. */
  monthShort: string | null;
  isToday: boolean;
  fullLabel: string;
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(zone: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    partsFormatters.set(zone, f);
  }
  return f;
}

/** Date, weekday and minutes since midnight of an instant in a zone (UTC for an invalid zone). */
export function zonedParts(zoneId: string, at: Date): ZonedParts {
  const parts = partsFormatter(resolveZone(zoneId)).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  return {
    date,
    weekday: weekdayOf(date),
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

/** A time such as 09:30:00 becomes 09:30. */
export function hhmm(t: string): string {
  return t.slice(0, 5);
}

function minutesOf(t: string): number {
  const [h, m] = hhmm(t).split(':').map(Number);
  return h * 60 + m;
}

function dayNameOf(value: DayName | number): DayName | undefined {
  return typeof value === 'number' ? DAY_NAMES[value] : value;
}

function hasSchedule(b: BranchSchedule): boolean {
  return b.timeZoneId.trim() !== '' && b.workingHours.length > 0;
}

function hoursFor(b: BranchSchedule, weekday: DayName) {
  return b.workingHours.find((h) => dayNameOf(h.dayOfWeek) === weekday);
}

export function todaysHours(
  b: BranchSchedule,
  at: Date,
): { opens: string; closes: string } | 'closed-today' | 'no-schedule' {
  if (!hasSchedule(b)) return 'no-schedule';
  const hours = hoursFor(b, zonedParts(b.timeZoneId, at).weekday);
  return hours ? { opens: hhmm(hours.opensAt), closes: hhmm(hours.closesAt) } : 'closed-today';
}

/** `opensAt <= minutes < closesAt` in the branch's zone. */
export function isOpenNow(b: BranchSchedule, at: Date): boolean {
  if (!hasSchedule(b)) return false;
  const parts = zonedParts(b.timeZoneId, at);
  const hours = hoursFor(b, parts.weekday);
  return (
    !!hours &&
    parts.minutes >= minutesOf(hours.opensAt) &&
    parts.minutes < minutesOf(hours.closesAt)
  );
}

/** Fourteen days from the branch's today; labels are built at noon UTC so they never shift. */
export function dayStrip(todayInBranch: string): DayStripItem[] {
  const short = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', weekday: 'short' });
  const month = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', month: 'short' });
  const full = new Intl.DateTimeFormat(undefined, {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return Array.from({ length: 14 }, (_, i) => {
    const date = addDays(todayInBranch, i);
    const [y, m, d] = date.split('-').map(Number);
    const noon = fromEpochMs(Date.UTC(y, m - 1, d, 12));
    return {
      date,
      weekdayShort: short.format(noon),
      day: d,
      monthShort: i === 0 || d === 1 ? month.format(noon) : null,
      isToday: i === 0,
      fullLabel: full.format(noon),
    };
  });
}
