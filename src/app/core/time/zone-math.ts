import { zoneOffsetMinutes } from './zone-offset';

const DAY_MS = 86_400_000;

/**
 * The instant of a wall-clock time in a zone. `gap` is true when the wall time does not exist
 * (a DST gap; callers skip it, as the backend's slot planner does). A time that occurs twice
 * (a DST fold) resolves to the standard-time (smaller offset) occurrence, as .NET's
 * `TimeZoneInfo.ConvertTimeToUtc` does.
 */
export function localToUtc(
  timeZoneId: string,
  date: string,
  minuteOfDay: number,
): { gap: boolean; utcMs: number } {
  const [y, m, d] = date.split('-').map(Number);
  // The wall time read as if it were UTC.
  const local = Date.UTC(y, m - 1, d, 0, minuteOfDay);
  const before = zoneOffsetMinutes(timeZoneId, local - DAY_MS);
  const after = zoneOffsetMinutes(timeZoneId, local + DAY_MS);
  const candidates = [...new Set([before, after])]
    .map((offset) => ({ offset, utcMs: local - offset * 60_000 }))
    // A candidate is real when the zone really is at that offset at that instant.
    .filter((c) => zoneOffsetMinutes(timeZoneId, c.utcMs) === c.offset);
  if (candidates.length === 0) return { gap: true, utcMs: local - before * 60_000 };
  // Fold: both are real; the smaller offset (standard time) is the later instant.
  candidates.sort((a, b) => a.offset - b.offset);
  return { gap: false, utcMs: candidates[0].utcMs };
}
