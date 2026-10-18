import { addDays } from './calendar-date';
import { fromEpochMs } from './parse-utc';

/** One cell of the month calendar. */
export interface MonthDay {
  /** `yyyy-MM-dd`. */
  date: string;
  day: number;
  /** False for the leading and trailing days of the adjacent months. */
  inMonth: boolean;
  /** Inside the booking window, first and last day included. */
  bookable: boolean;
  isToday: boolean;
  /** For example "Wednesday, 21 October 2026" (the order follows the runtime locale). */
  fullLabel: string;
}

export interface MonthGrid {
  year: number;
  /** One-based (1 = January). */
  month: number;
  /** For example "October 2026". */
  title: string;
  /** Weeks from Monday to Sunday that cover the month. */
  weeks: MonthDay[][];
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** Noon UTC of a `yyyy-MM-dd` date, so a label never shifts with the browser's zone. */
function noonOf(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return fromEpochMs(Date.UTC(y, m - 1, d, 12));
}

/**
 * The weeks (Monday to Sunday) covering `month` (1 to 12). A day is bookable when it lies in
 * `[firstBookable, lastBookable]`; the first bookable day is today in the branch's zone.
 * Labels are formatted with `Intl` in UTC on noon instants, exactly like `dayStrip`.
 */
export function monthGrid(
  year: number,
  month: number,
  firstBookable: string,
  lastBookable: string,
): MonthGrid {
  const full = new Intl.DateTimeFormat(undefined, {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const titleFormat = new Intl.DateTimeFormat(undefined, {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  });

  const first = `${year}-${pad(month)}-01`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leading = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7; // Monday = 0
  const start = addDays(first, -leading);
  const weekCount = Math.ceil((leading + daysInMonth) / 7);
  const prefix = `${year}-${pad(month)}-`;

  const weeks: MonthDay[][] = [];
  for (let w = 0; w < weekCount; w++) {
    const week: MonthDay[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, w * 7 + d);
      week.push({
        date,
        day: Number(date.slice(8)),
        inMonth: date.startsWith(prefix),
        bookable: date >= firstBookable && date <= lastBookable,
        isToday: date === firstBookable,
        fullLabel: full.format(noonOf(date)),
      });
    }
    weeks.push(week);
  }
  return { year, month, title: titleFormat.format(noonOf(first)), weeks };
}

/** The months (as `yyyy-MM`) the window touches, in order: one or two for a 14-day window. */
export function windowMonths(firstBookable: string, lastBookable: string): string[] {
  const months: string[] = [];
  let [y, m] = firstBookable.slice(0, 7).split('-').map(Number);
  const last = lastBookable.slice(0, 7);
  for (;;) {
    const key = `${y}-${pad(m)}`;
    months.push(key);
    if (key >= last) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}
