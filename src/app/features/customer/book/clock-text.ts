/**
 * A branch-local wall-clock time ("09:30" or "09:30:00") for display: seconds removed, the 12 or
 * 24 hour clock following the browser locale. The value is a time of day, not an instant, so it
 * is formatted as UTC noon-independent minutes since midnight and never goes through a zone.
 */
export function formatClock(time: string, locale?: string): string {
  const [h, m] = time.slice(0, 5).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time.slice(0, 5);
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    hour: 'numeric',
    minute: '2-digit',
  }).format(Date.UTC(2000, 0, 1, h, m));
}
