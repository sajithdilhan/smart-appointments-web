import { parseUtc } from './parse-utc';
import { isValidZone, resolveZone } from './zone';

export type TimeStyle = 'date' | 'time' | 'datetime';

export interface FormatOptions {
  style?: TimeStyle;
  /** Append the short zone name, for example "BST". */
  showZoneName?: boolean;
  locale?: string;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(
  locale: string | undefined,
  zone: string,
  style: TimeStyle,
  showZoneName: boolean,
): Intl.DateTimeFormat {
  const key = `${locale ?? ''}|${zone}|${style}|${showZoneName}`;
  let f = formatters.get(key);
  if (!f) {
    const options: Intl.DateTimeFormatOptions = { timeZone: zone };
    if (style !== 'time') {
      Object.assign(options, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    }
    if (style !== 'date') Object.assign(options, { hour: '2-digit', minute: '2-digit' });
    if (showZoneName) options.timeZoneName = 'short';
    f = new Intl.DateTimeFormat(locale, options);
    formatters.set(key, f);
  }
  return f;
}

/**
 * Formats an instant in an explicit IANA zone, for the browser's locale (12 or 24 hour clock
 * follows the locale). An invalid zone falls back to UTC, appends " UTC" and warns once.
 */
export function formatInZone(
  value: Date | string,
  timeZoneId: string,
  options: FormatOptions = {},
): string {
  const date = typeof value === 'string' ? parseUtc(value) : value;
  const valid = isValidZone(timeZoneId);
  const zone = resolveZone(timeZoneId);
  const text = formatterFor(
    options.locale,
    zone,
    options.style ?? 'datetime',
    options.showZoneName ?? false,
  ).format(date);
  return valid ? text : `${text} UTC`;
}
