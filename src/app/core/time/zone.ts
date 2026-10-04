const validity = new Map<string, boolean>();
const warned = new Set<string>();

/** True when `Intl.DateTimeFormat` accepts `timeZoneId` as an IANA identifier. */
export function isValidZone(timeZoneId: string): boolean {
  let ok = validity.get(timeZoneId);
  if (ok === undefined) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timeZoneId });
      ok = true;
    } catch {
      ok = false;
    }
    validity.set(timeZoneId, ok);
  }
  return ok;
}

/**
 * The zone to compute with: `timeZoneId` when valid, otherwise `'UTC'` with one console
 * warning per distinct identifier (Req 13.3). Never throws.
 */
export function resolveZone(timeZoneId: string): string {
  if (isValidZone(timeZoneId)) return timeZoneId;
  if (!warned.has(timeZoneId)) {
    warned.add(timeZoneId);
    console.warn(`Invalid time zone "${timeZoneId}"; falling back to UTC.`);
  }
  return 'UTC';
}

/** Test seam: forget which invalid identifiers were already reported. */
export function resetZoneWarnings(): void {
  warned.clear();
}
