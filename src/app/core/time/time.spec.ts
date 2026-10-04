import {
  formatInZone,
  fromEpochMs,
  parseUtc,
  toIsoUtc,
  zoneDiffersFromBrowser,
  zoneOffsetMinutes,
} from './index';
import { resetZoneWarnings } from './zone';

describe('process time zone', () => {
  it('is fixed to a zone no test uses (Pacific/Kiritimati, UTC+14)', () => {
    expect(-new Date(Date.UTC(2026, 5, 1)).getTimezoneOffset()).toBe(14 * 60);
  });
});

describe('parseUtc', () => {
  it.each([
    ['2026-10-04T13:00:00Z', '2026-10-04T13:00:00.000Z'],
    ['2026-10-04T15:00:00+02:00', '2026-10-04T13:00:00.000Z'],
    ['2026-10-04T13:00:00', '2026-10-04T13:00:00.000Z'],
    ['2026-10-04T13:00', '2026-10-04T13:00:00.000Z'],
    ['2026-10-04T13:00:00.123456', '2026-10-04T13:00:00.123Z'],
    ['2026-10-04T13:00:00.5Z', '2026-10-04T13:00:00.500Z'],
    ['  2026-10-04T13:00:00  ', '2026-10-04T13:00:00.000Z'],
  ])('reads %s as %s', (input, expected) => {
    expect(toIsoUtc(parseUtc(input))).toBe(expected);
  });

  it.each(['', '   ', 'not a date', '2026-13-45T00:00:00'])(
    'throws a RangeError naming %j',
    (input) => {
      expect(() => parseUtc(input)).toThrow(RangeError);
      expect(() => parseUtc(input)).toThrow(new RegExp(`"${input}"`));
    },
  );

  it('fromEpochMs and toIsoUtc round-trip', () => {
    expect(toIsoUtc(fromEpochMs(0))).toBe('1970-01-01T00:00:00.000Z');
  });
});

describe('formatInZone', () => {
  const instant = '2026-10-04T13:00:00Z';

  it('formats the same instant in different zones (24 hour locale)', () => {
    const t = (zone: string) => formatInZone(instant, zone, { style: 'time', locale: 'en-GB' });
    expect(t('Europe/London')).toBe('14:00');
    expect(t('America/New_York')).toBe('09:00');
    expect(t('Asia/Kolkata')).toBe('18:30');
    expect(t('Pacific/Auckland')).toBe('02:00');
  });

  it('formats a date in the zone, which can differ from the UTC date', () => {
    expect(formatInZone(instant, 'Pacific/Auckland', { style: 'date', locale: 'en-GB' })).toMatch(
      /Mon,? 5 Oct 2026/,
    );
    expect(formatInZone(instant, 'America/New_York', { style: 'date', locale: 'en-GB' })).toMatch(
      /Sun,? 4 Oct 2026/,
    );
  });

  it('formats a datetime like "Sun 4 Oct 2026, 15:00"', () => {
    const text = formatInZone(new Date('2026-10-04T14:00:00Z'), 'Europe/London', {
      locale: 'en-GB',
      showZoneName: true,
    });
    expect(text).toMatch(/Sun,? 4 Oct 2026,? 15:00 (BST|GMT\+1)/);
  });

  it('follows the locale for the 12 or 24 hour clock', () => {
    expect(formatInZone(instant, 'Asia/Kolkata', { style: 'time', locale: 'en-US' })).toMatch(
      /06:30\s?PM/,
    );
  });

  it('uses the DST offset on each side of the Europe/London boundaries', () => {
    const t = (iso: string) =>
      formatInZone(iso, 'Europe/London', { style: 'time', locale: 'en-GB' });
    expect(t('2026-03-29T00:59:59Z')).toBe('00:59');
    expect(t('2026-03-29T01:00:00Z')).toBe('02:00');
    expect(t('2026-10-25T00:59:59Z')).toBe('01:59');
    expect(t('2026-10-25T01:00:00Z')).toBe('01:00');
  });

  it('falls back to UTC for an invalid zone, appends UTC and warns once per id', () => {
    resetZoneWarnings();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const a = formatInZone(instant, 'Mars/Olympus', { style: 'time', locale: 'en-GB' });
    const b = formatInZone(instant, 'Mars/Olympus', { style: 'time', locale: 'en-GB' });
    formatInZone(instant, 'Narnia/Cair', { style: 'time', locale: 'en-GB' });
    expect(a).toBe('13:00 UTC');
    expect(b).toBe('13:00 UTC');
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0][0]).toContain('Mars/Olympus');
    warn.mockRestore();
  });

  it('accepts a string without a zone designator as UTC', () => {
    expect(
      formatInZone('2026-10-04T13:00:00', 'Europe/London', { style: 'time', locale: 'en-GB' }),
    ).toBe('14:00');
  });
});

describe('zoneOffsetMinutes', () => {
  it.each([
    ['Europe/London', '2026-01-15T12:00:00Z', 0],
    ['Europe/London', '2026-07-15T12:00:00Z', 60],
    ['Asia/Kolkata', '2026-07-15T12:00:00Z', 330],
    ['Asia/Kathmandu', '2026-07-15T12:00:00Z', 345],
    ['Pacific/Auckland', '2026-10-04T13:00:00Z', 780],
    ['Pacific/Auckland', '2026-07-04T13:00:00Z', 720],
    ['America/New_York', '2026-10-04T13:00:00Z', -240],
    ['America/New_York', '2026-12-04T13:00:00Z', -300],
    ['Europe/London', '2026-03-29T00:59:59Z', 0],
    ['Europe/London', '2026-03-29T01:00:00Z', 60],
    ['Nope/Zone', '2026-07-15T12:00:00Z', 0],
  ])('%s at %s is %i minutes', (zone, iso, expected) => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(zoneOffsetMinutes(zone, parseUtc(iso))).toBe(expected);
    expect(zoneOffsetMinutes(zone, parseUtc(iso).getTime())).toBe(expected);
    spy.mockRestore();
  });

  it('ignores the sub-second part of the instant', () => {
    expect(zoneOffsetMinutes('Europe/London', parseUtc('2026-03-29T00:59:59.999Z'))).toBe(0);
  });
});

describe('zoneDiffersFromBrowser', () => {
  const at = parseUtc('2026-07-15T12:00:00Z');
  it('is true for a zone whose offset differs from the process zone', () => {
    expect(zoneDiffersFromBrowser('Europe/London', at)).toBe(true);
  });
  it('is false for a zone with the same offset (compared by offset, not identifier)', () => {
    expect(zoneDiffersFromBrowser('Pacific/Kiritimati', at)).toBe(false);
    expect(zoneDiffersFromBrowser('Etc/GMT-14', at)).toBe(false);
  });
});
