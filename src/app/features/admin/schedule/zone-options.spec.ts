import { afterEach, beforeEach } from 'vitest';
import {
  FALLBACK_ZONES,
  browserZoneOption,
  buildZoneOptions,
  filterZones,
  formatOffset,
  resetZoneOptionsCache,
} from './zone-options';

const JANUARY = new Date(Date.UTC(2026, 0, 15, 12));
const JULY = new Date(Date.UTC(2026, 6, 15, 12));

beforeEach(resetZoneOptionsCache);
afterEach(resetZoneOptionsCache);

describe('formatOffset', () => {
  it.each([
    [0, 'UTC+00:00'],
    [330, 'UTC+05:30'],
    [-210, 'UTC-03:30'],
    [-480, 'UTC-08:00'],
    [840, 'UTC+14:00'],
    [345, 'UTC+05:45'],
  ])('%i -> %s', (minutes, expected) => {
    expect(formatOffset(minutes)).toBe(expected);
  });
});

describe('buildZoneOptions', () => {
  it('builds options with offsets and labels, always including UTC', () => {
    const options = buildZoneOptions(JANUARY);
    const colombo = options.find((o) => o.id === 'Asia/Colombo')!;
    expect(colombo).toMatchObject({
      offsetMinutes: 330,
      offsetLabel: 'UTC+05:30',
      label: 'Asia/Colombo, UTC+05:30',
    });
    expect(colombo.haystack).toBe('asia/colombo utc+05:30');
    expect(options.some((o) => o.id === 'UTC')).toBe(true);
    expect(options.length).toBeGreaterThan(100);
  });

  it('offsets follow daylight saving at the given instant', () => {
    const london = (d: Date) => buildZoneOptions(d).find((o) => o.id === 'Europe/London')!;
    expect(london(JANUARY).offsetLabel).toBe('UTC+00:00');
    resetZoneOptionsCache();
    expect(london(JULY).offsetLabel).toBe('UTC+01:00');
  });

  it('is memoised within the same hour and rebuilt in another', () => {
    const first = buildZoneOptions(JANUARY);
    expect(buildZoneOptions(new Date(JANUARY.getTime() + 60_000))).toBe(first);
    expect(buildZoneOptions(JULY)).not.toBe(first);
  });

  describe('without Intl.supportedValuesOf', () => {
    const original = Object.getOwnPropertyDescriptor(Intl, 'supportedValuesOf')!;
    beforeEach(() => {
      Object.defineProperty(Intl, 'supportedValuesOf', {
        value: undefined,
        configurable: true,
        writable: true,
      });
    });
    afterEach(() => Object.defineProperty(Intl, 'supportedValuesOf', original));

    it('falls back to the common-zone list', () => {
      const ids = buildZoneOptions(JANUARY).map((o) => o.id);
      expect(ids).toEqual([...new Set([...FALLBACK_ZONES])].sort());
      expect(ids.length).toBeGreaterThanOrEqual(40);
      expect(ids).toContain('Asia/Colombo');
    });
  });
});

describe('filterZones', () => {
  const options = () => buildZoneOptions(JANUARY);

  it('treats underscore and space alike', () => {
    const a = filterZones(options(), 'new york').items.map((o) => o.id);
    const b = filterZones(options(), 'new_york').items.map((o) => o.id);
    expect(a).toContain('America/New_York');
    expect(b).toEqual(a);
  });

  it('requires every word, in any order, and is case-insensitive', () => {
    expect(filterZones(options(), 'COLOMBO asia').items.map((o) => o.id)).toEqual(['Asia/Colombo']);
    expect(filterZones(options(), 'colombo europe').items).toEqual([]);
  });

  it('matches the offset text', () => {
    const ids = filterZones(options(), 'utc+05:30').items.map((o) => o.id);
    expect(ids).toContain('Asia/Colombo');
    expect(ids).not.toContain('Europe/London');
  });

  it('ranks a city prefix before other matches, then by id', () => {
    const prefixFirst = filterZones(options(), 'am').items.map((o) => o.id);
    const cityPrefix = (id: string) =>
      id
        .slice(id.lastIndexOf('/') + 1)
        .toLowerCase()
        .startsWith('am');
    const firstNonPrefix = prefixFirst.findIndex((id) => !cityPrefix(id));
    expect(prefixFirst.slice(0, firstNonPrefix).every(cityPrefix)).toBe(true);
    expect(prefixFirst.slice(firstNonPrefix).some(cityPrefix)).toBe(false);
    const head = prefixFirst.slice(0, firstNonPrefix);
    expect(head).toEqual([...head].sort());
  });

  it('caps the list and reports truncation', () => {
    const all = filterZones(options(), '', 100);
    expect(all.items).toHaveLength(100);
    expect(all.truncated).toBe(true);
    const few = filterZones(options(), 'asia/colombo');
    expect(few.truncated).toBe(false);
    expect(filterZones(options(), '', 5).items).toHaveLength(5);
  });

  it('returns nothing for a query that matches nothing', () => {
    expect(filterZones(options(), 'zzzz')).toEqual({ items: [], truncated: false });
  });
});

describe('browserZoneOption', () => {
  it('builds a labelled browser option that sorts first when the query is empty', () => {
    const browser = browserZoneOption(JANUARY, 'Asia/Colombo')!;
    expect(browser).toMatchObject({ id: 'Asia/Colombo', browser: true, offsetLabel: 'UTC+05:30' });
    expect(browser.label).toBe("Asia/Colombo, UTC+05:30 (Your browser's zone)");
    const items = filterZones([...buildZoneOptions(JANUARY), browser], '').items;
    expect(items[0].browser).toBe(true);
  });

  it('is null when the zone is unknown', () => {
    expect(browserZoneOption(JANUARY, '')).toBeNull();
  });
});
