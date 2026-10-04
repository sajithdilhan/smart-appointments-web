import { resolveZone } from './zone';

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

function offsetFormatter(zone: string): Intl.DateTimeFormat {
  let f = offsetFormatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    offsetFormatters.set(zone, f);
  }
  return f;
}

/**
 * The UTC offset of `timeZoneId` at an instant, in minutes east of UTC. Rebuilds the zone's
 * wall clock from `formatToParts` (works in every browser, no `longOffset`). An invalid zone
 * is UTC (0), consistent with `formatInZone`. Accepts epoch milliseconds for the callers
 * that do arithmetic.
 */
export function zoneOffsetMinutes(timeZoneId: string, at: Date | number): number {
  const ms = typeof at === 'number' ? at : at.getTime();
  const seconds = Math.floor(ms / 1000) * 1000;
  const parts = offsetFormatter(resolveZone(timeZoneId)).formatToParts(seconds);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((wall - seconds) / 60_000);
}

/** True when the zone's offset at `at` differs from the browser's (offset, not identifier). */
export function zoneDiffersFromBrowser(timeZoneId: string, at: Date): boolean {
  return zoneOffsetMinutes(timeZoneId, at) !== -at.getTimezoneOffset();
}
