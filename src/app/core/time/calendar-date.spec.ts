import { addDays, diffDays, eachDate, todayInZone, weekdayOf } from './calendar-date';
import { parseUtc } from './parse-utc';
import { resetZoneWarnings } from './zone';

const ms = (iso: string) => parseUtc(iso).getTime();

describe('addDays', () => {
  it.each([
    ['2026-01-31', 1, '2026-02-01'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2028-02-29', 1, '2028-03-01'],
    ['2027-02-28', 1, '2027-03-01'],
    ['2026-03-01', -1, '2026-02-28'],
    ['2026-03-28', 2, '2026-03-30'],
    ['2026-10-24', 2, '2026-10-26'],
    ['2026-10-04', 0, '2026-10-04'],
    ['2026-10-04', 365, '2027-10-04'],
  ])('%s + %i = %s', (date, n, expected) => {
    expect(addDays(date, n)).toBe(expected);
  });
});

describe('diffDays', () => {
  it('counts calendar days across a DST week', () => {
    expect(diffDays('2026-03-25', '2026-04-01')).toBe(7);
    expect(diffDays('2026-10-22', '2026-10-29')).toBe(7);
    expect(diffDays('2026-11-01', '2026-11-08')).toBe(7);
  });
  it('is negative when to is before from and zero for the same day', () => {
    expect(diffDays('2026-10-05', '2026-10-04')).toBe(-1);
    expect(diffDays('2026-10-04', '2026-10-04')).toBe(0);
  });
});

describe('weekdayOf', () => {
  it.each([
    ['2026-10-04', 'Sunday'],
    ['2026-10-05', 'Monday'],
    ['2026-02-28', 'Saturday'],
    ['2028-02-29', 'Tuesday'],
    ['2026-01-01', 'Thursday'],
  ])('%s is a %s', (date, day) => {
    expect(weekdayOf(date)).toBe(day);
  });
});

describe('eachDate', () => {
  it('is inclusive of both bounds', () => {
    expect(eachDate('2026-02-27', '2026-03-02')).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
    ]);
    expect(eachDate('2026-10-04', '2026-10-04')).toEqual(['2026-10-04']);
  });
  it('is empty when to is before from', () => {
    expect(eachDate('2026-10-05', '2026-10-04')).toEqual([]);
  });
});

describe('todayInZone', () => {
  it('flips at local midnight for a zone ahead of UTC', () => {
    expect(todayInZone('Pacific/Auckland', ms('2026-10-04T10:59:59Z'))).toBe('2026-10-04');
    expect(todayInZone('Pacific/Auckland', ms('2026-10-04T11:00:00Z'))).toBe('2026-10-05');
  });
  it('flips at local midnight for a zone behind UTC', () => {
    expect(todayInZone('America/New_York', ms('2026-10-05T03:59:59Z'))).toBe('2026-10-04');
    expect(todayInZone('America/New_York', ms('2026-10-05T04:00:00Z'))).toBe('2026-10-05');
  });
  it('differs from the process-zone date when the zones straddle midnight', () => {
    const now = ms('2026-10-04T23:30:00Z');
    expect(todayInZone('Pacific/Kiritimati', now)).toBe('2026-10-05');
    expect(todayInZone('Pacific/Pago_Pago', now)).toBe('2026-10-04');
  });
  it('uses UTC with one warning for an invalid zone', () => {
    resetZoneWarnings();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(todayInZone('Mars/Base', ms('2026-10-04T23:30:00Z'))).toBe('2026-10-04');
    expect(todayInZone('Mars/Base', ms('2026-10-04T23:30:00Z'))).toBe('2026-10-04');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
