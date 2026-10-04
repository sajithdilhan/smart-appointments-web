import {
  dayStrip,
  hhmm,
  isOpenNow,
  todaysHours,
  zonedParts,
  type BranchSchedule,
} from './branch-time';
import { parseUtc } from './parse-utc';
import { resetZoneWarnings } from './zone';

const london: BranchSchedule = {
  timeZoneId: 'Europe/London',
  workingHours: [
    { dayOfWeek: 'Monday', opensAt: '09:00:00', closesAt: '17:00:00' },
    { dayOfWeek: 2, opensAt: '10:00:00', closesAt: '14:30:00' },
  ],
};

describe('zonedParts', () => {
  it('returns the branch-local date, weekday and minutes', () => {
    expect(zonedParts('Europe/London', parseUtc('2026-10-05T08:00:00Z'))).toEqual({
      date: '2026-10-05',
      weekday: 'Monday',
      minutes: 9 * 60,
    });
    expect(zonedParts('Pacific/Auckland', parseUtc('2026-10-04T11:30:00Z'))).toEqual({
      date: '2026-10-05',
      weekday: 'Monday',
      minutes: 30,
    });
  });
  it('reads midnight as 0, not 24 hours', () => {
    expect(zonedParts('Europe/London', parseUtc('2026-10-04T23:00:00Z')).minutes).toBe(0);
  });
});

describe('hhmm', () => {
  it('trims seconds', () => {
    expect(hhmm('09:30:00')).toBe('09:30');
    expect(hhmm('09:30')).toBe('09:30');
  });
});

describe('isOpenNow', () => {
  it('is open at opensAt and closed at closesAt', () => {
    expect(isOpenNow(london, parseUtc('2026-10-05T07:59:00Z'))).toBe(false);
    expect(isOpenNow(london, parseUtc('2026-10-05T08:00:00Z'))).toBe(true);
    expect(isOpenNow(london, parseUtc('2026-10-05T15:59:00Z'))).toBe(true);
    expect(isOpenNow(london, parseUtc('2026-10-05T16:00:00Z'))).toBe(false);
  });
  it('is closed on a day with no hours and for no schedule', () => {
    expect(isOpenNow(london, parseUtc('2026-10-07T12:00:00Z'))).toBe(false);
    const blank = { timeZoneId: '', workingHours: london.workingHours };
    expect(isOpenNow(blank, parseUtc('2026-10-05T12:00:00Z'))).toBe(false);
    const empty = { timeZoneId: 'Europe/London', workingHours: [] };
    expect(isOpenNow(empty, parseUtc('2026-10-05T12:00:00Z'))).toBe(false);
  });
  it('honours a numeric dayOfWeek (0 = Sunday, so 2 = Tuesday)', () => {
    expect(isOpenNow(london, parseUtc('2026-10-06T10:00:00Z'))).toBe(true);
  });
});

describe('todaysHours', () => {
  const noon = parseUtc('2026-10-05T12:00:00Z');
  it('returns trimmed hours, closed-today or no-schedule', () => {
    expect(todaysHours(london, noon)).toEqual({ opens: '09:00', closes: '17:00' });
    expect(todaysHours(london, parseUtc('2026-10-04T12:00:00Z'))).toBe('closed-today');
    expect(todaysHours({ timeZoneId: ' ', workingHours: london.workingHours }, noon)).toBe(
      'no-schedule',
    );
    expect(todaysHours({ timeZoneId: 'Europe/London', workingHours: [] }, noon)).toBe(
      'no-schedule',
    );
  });
  it('uses the branch zone to pick the day (23:30 UTC Sunday is Monday in London)', () => {
    expect(todaysHours(london, parseUtc('2026-10-04T23:30:00Z'))).toEqual({
      opens: '09:00',
      closes: '17:00',
    });
  });
  it('falls back to UTC with a single warning for an invalid zone', () => {
    resetZoneWarnings();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const bad: BranchSchedule = { timeZoneId: 'Mars/Base', workingHours: london.workingHours };
    todaysHours(bad, noon);
    todaysHours(bad, noon);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('dayStrip', () => {
  it('has 14 items from today, with month labels on the first and on the 1st', () => {
    const strip = dayStrip('2026-10-30');
    expect(strip).toHaveLength(14);
    expect(strip[0]).toMatchObject({ date: '2026-10-30', day: 30, isToday: true });
    expect(strip[0].monthShort).toMatch(/Oct/);
    expect(strip[1].monthShort).toBeNull();
    expect(strip[2]).toMatchObject({ date: '2026-11-01', day: 1, isToday: false });
    expect(strip[2].monthShort).toMatch(/Nov/);
    expect(strip[13].date).toBe('2026-11-12');
    expect(strip[0].fullLabel).toMatch(/30/);
    expect(strip.filter((i) => i.isToday)).toHaveLength(1);
  });
});
