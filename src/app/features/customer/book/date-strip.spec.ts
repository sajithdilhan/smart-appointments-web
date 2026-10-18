import { todayInZone, zonedParts } from '../../../core/time';
import { dayStrip } from './date-strip';

const NEAR_MIDNIGHT = Date.UTC(2026, 9, 4, 10, 30); // 2026-10-04T10:30Z

describe('dayStrip', () => {
  it('has 14 consecutive days starting today', () => {
    const strip = dayStrip('2026-10-04');
    expect(strip).toHaveLength(14);
    expect(strip[0]).toMatchObject({ date: '2026-10-04', isToday: true, day: 4 });
    expect(strip[13].date).toBe('2026-10-17');
  });

  it('crosses a month boundary and labels the first of the month', () => {
    const strip = dayStrip('2026-10-28');
    expect(strip.map((d) => d.date).slice(3, 5)).toEqual(['2026-10-31', '2026-11-01']);
    expect(strip[4].monthShort).not.toBeNull();
    expect(strip[3].monthShort).toBeNull();
  });

  it('is not shifted by a DST change inside the window', () => {
    // US clocks go back on 2026-11-01; London on 2026-10-25.
    const us = dayStrip('2026-10-30');
    expect(us.map((d) => d.day)).toEqual([30, 31, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const uk = dayStrip('2026-10-24');
    expect(uk.map((d) => d.day).slice(0, 3)).toEqual([24, 25, 26]);
  });

  it('starts at the branch-zone date under a process zone that is a day away', () => {
    // The process zone (Pacific/Kiritimati, UTC+14) is already on 2026-10-05.
    expect(zonedParts('Pacific/Kiritimati', new Date(NEAR_MIDNIGHT)).date).toBe('2026-10-05');
    const cases: [string, string][] = [
      ['America/New_York', '2026-10-04'],
      ['Europe/London', '2026-10-04'],
      ['Pacific/Auckland', '2026-10-04'],
      ['Pacific/Kiritimati', '2026-10-05'],
    ];
    for (const [zone, expected] of cases) {
      const today = todayInZone(zone, NEAR_MIDNIGHT);
      expect(today).toBe(expected);
      // The date sent to the backend is the first day of the strip itself.
      expect(dayStrip(today)[0].date).toBe(expected);
    }
    // One hour later Auckland has rolled over too.
    expect(todayInZone('Pacific/Auckland', NEAR_MIDNIGHT + 3_600_000)).toBe('2026-10-05');
  });
});
