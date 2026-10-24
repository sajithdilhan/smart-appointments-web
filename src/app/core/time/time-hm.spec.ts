import { parseUtc } from './parse-utc';
import { longDateLabel, timeHm } from './time-hm';
import { resetZoneWarnings } from './zone';

describe('timeHm', () => {
  it('formats 24-hour HH:mm in Europe/London in summer and winter', () => {
    expect(timeHm('2026-07-01T09:30:00Z', 'Europe/London')).toBe('10:30');
    expect(timeHm('2026-12-01T09:30:00Z', 'Europe/London')).toBe('09:30');
  });

  it('pads single digits and reads midnight as 00:00, not 24:00', () => {
    expect(timeHm('2026-10-04T23:00:00Z', 'Europe/London')).toBe('00:00');
    expect(timeHm('2026-12-01T05:05:00Z', 'UTC')).toBe('05:05');
    expect(timeHm('2026-12-01T13:07:00Z', 'UTC')).toBe('13:07');
  });

  it('follows the clocks across the autumn change (25 October 2026, 01:00 UTC)', () => {
    expect(timeHm('2026-10-25T00:30:00Z', 'Europe/London')).toBe('01:30'); // BST
    expect(timeHm('2026-10-25T01:30:00Z', 'Europe/London')).toBe('01:30'); // GMT again
    expect(timeHm('2026-10-25T02:00:00Z', 'Europe/London')).toBe('02:00');
  });

  it('skips the missing hour in spring (29 March 2026, 01:00 UTC)', () => {
    expect(timeHm('2026-03-29T00:59:00Z', 'Europe/London')).toBe('00:59');
    expect(timeHm('2026-03-29T01:00:00Z', 'Europe/London')).toBe('02:00');
  });

  it('works for a zone ahead of and a zone behind UTC', () => {
    expect(timeHm('2026-10-04T11:30:00Z', 'Pacific/Auckland')).toBe('00:30');
    expect(timeHm('2026-07-01T09:30:00Z', 'America/Los_Angeles')).toBe('02:30');
  });

  it('accepts a Date as well as a string', () => {
    expect(timeHm(parseUtc('2026-07-01T09:30:00Z'), 'Europe/London')).toBe('10:30');
  });

  it('uses UTC for an invalid zone', () => {
    resetZoneWarnings();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(timeHm('2026-07-01T09:30:00Z', 'Not/AZone')).toBe('09:30');
    warn.mockRestore();
    resetZoneWarnings();
  });
});

describe('longDateLabel', () => {
  it('writes the weekday, day, month and year in English', () => {
    expect(longDateLabel('2026-10-24')).toBe('Saturday 24 October 2026');
    expect(longDateLabel('2026-10-23')).toBe('Friday 23 October 2026');
    expect(longDateLabel('2026-01-05')).toBe('Monday 5 January 2026');
    expect(longDateLabel('2026-12-31')).toBe('Thursday 31 December 2026');
  });

  it('is identical under browsers far ahead of and behind UTC', () => {
    const original = process.env['TZ'];
    try {
      const labels = ['Pacific/Kiritimati', 'Pacific/Pago_Pago'].map((tz) => {
        process.env['TZ'] = tz;
        return longDateLabel('2026-10-24');
      });
      expect(labels[0]).toBe('Saturday 24 October 2026');
      expect(labels[1]).toBe(labels[0]);
    } finally {
      process.env['TZ'] = original;
    }
  });
});
