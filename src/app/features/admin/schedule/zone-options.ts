import { zoneOffsetMinutes } from '../../../core/time';

export interface ZoneOption {
  id: string;
  offsetMinutes: number;
  /** "UTC+05:30". */
  offsetLabel: string;
  /** What the input shows: "Asia/Colombo, UTC+05:30". */
  label: string;
  /** Lower-case id with `_` as a space, `/` kept, plus the offset text, for matching. */
  haystack: string;
  /** The browser's own zone, offered first and never preselected. */
  browser?: boolean;
}

/** Used when `Intl.supportedValuesOf` is missing: about forty common zones. */
export const FALLBACK_ZONES: readonly string[] = [
  'UTC',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'Africa/Nairobi',
  'America/Anchorage',
  'America/Argentina/Buenos_Aires',
  'America/Bogota',
  'America/Chicago',
  'America/Denver',
  'America/Halifax',
  'America/Los_Angeles',
  'America/Mexico_City',
  'America/New_York',
  'America/Phoenix',
  'America/Sao_Paulo',
  'America/Toronto',
  'Asia/Bangkok',
  'Asia/Colombo',
  'Asia/Dhaka',
  'Asia/Dubai',
  'Asia/Hong_Kong',
  'Asia/Jakarta',
  'Asia/Karachi',
  'Asia/Kathmandu',
  'Asia/Kolkata',
  'Asia/Manila',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Tehran',
  'Asia/Tokyo',
  'Atlantic/Reykjavik',
  'Australia/Adelaide',
  'Australia/Brisbane',
  'Australia/Perth',
  'Australia/Sydney',
  'Europe/Amsterdam',
  'Europe/Berlin',
  'Europe/Dublin',
  'Europe/Istanbul',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Moscow',
  'Europe/Paris',
  'Pacific/Auckland',
  'Pacific/Honolulu',
];

export function formatOffset(minutes: number): string {
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `UTC${minutes < 0 ? '-' : '+'}${hh}:${mm}`;
}

/** Lower-case, `_` as a space, runs of whitespace collapsed. */
function normalise(text: string): string {
  return text.toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

const HOUR_MS = 3_600_000;
let cache: { bucket: number; options: ZoneOption[] } | null = null;

export function resetZoneOptionsCache(): void {
  cache = null;
}

function zoneIds(): string[] {
  const supported = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  const ids =
    typeof supported === 'function' ? [...supported.call(Intl, 'timeZone')] : [...FALLBACK_ZONES];
  if (!ids.includes('UTC')) ids.push('UTC');
  return ids.sort();
}

function toOption(id: string, at: Date): ZoneOption {
  const offsetMinutes = zoneOffsetMinutes(id, at);
  const offsetLabel = formatOffset(offsetMinutes);
  return {
    id,
    offsetMinutes,
    offsetLabel,
    label: `${id}, ${offsetLabel}`,
    haystack: `${normalise(id)} ${offsetLabel.toLowerCase()}`,
  };
}

/**
 * Every zone with its offset at `now` (so daylight saving is reflected). Memoised per hour: the
 * list is built on first use, not at startup, and then reused by the page.
 */
export function buildZoneOptions(now: Date): ZoneOption[] {
  const bucket = Math.floor(now.getTime() / HOUR_MS);
  if (cache?.bucket === bucket) return cache.options;
  const options = zoneIds().map((id) => toOption(id, now));
  cache = { bucket, options };
  return options;
}

/** The browser's zone as an option to offer first, or `null` when it cannot be determined. */
export function browserZoneOption(
  now: Date,
  browserZoneId: string | undefined = Intl.DateTimeFormat().resolvedOptions().timeZone,
): ZoneOption | null {
  if (!browserZoneId) return null;
  const option = toOption(browserZoneId, now);
  return {
    ...option,
    label: `${option.label} (Your browser's zone)`,
    browser: true,
  };
}

/**
 * Every query word must be a substring of the haystack (`_` and space are alike). Ranking: a
 * query that starts the city part first, then by id. At most `limit` items; `truncated` says more
 * matched.
 */
export function filterZones(
  options: readonly ZoneOption[],
  query: string,
  limit = 100,
): { items: ZoneOption[]; truncated: boolean } {
  const q = normalise(query);
  const words = q.split(' ').filter(Boolean);
  const matched = options
    .filter((o) => words.every((w) => o.haystack.includes(w)))
    .map((o) => {
      const city = normalise(o.id.slice(o.id.lastIndexOf('/') + 1));
      return { o, rank: q !== '' && city.startsWith(q) ? 0 : 1 };
    })
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        Number(!!b.o.browser) - Number(!!a.o.browser) ||
        (a.o.id < b.o.id ? -1 : a.o.id > b.o.id ? 1 : 0),
    )
    .map((x) => x.o);
  return { items: matched.slice(0, limit), truncated: matched.length > limit };
}
