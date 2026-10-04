import type { CanMatchFn } from '@angular/router';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isGuid(value: string): boolean {
  return GUID.test(value);
}

/** Matches `:id` only when the segment is a GUID, so anything else falls to the not-found child. */
export const guidIdMatcher: CanMatchFn = (_route, segments) =>
  segments.length > 0 && isGuid(segments[0].path);
