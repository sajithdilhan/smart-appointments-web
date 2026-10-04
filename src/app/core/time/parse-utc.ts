const NO_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

/**
 * Parses a backend timestamp as an instant. A date-time without a zone designator is read as
 * UTC (some serializations omit the `Z`), never as browser-local time. Throws a `RangeError`
 * naming the value when it is empty or unparsable.
 */
export function parseUtc(value: string): Date {
  const s = value.trim();
  // The one place allowed to call new Date(string).
  const d = new Date(NO_ZONE.test(s) ? s + 'Z' : s);
  if (!s || Number.isNaN(d.getTime())) throw new RangeError(`Invalid date-time: "${value}"`);
  return d;
}

/** The instant at `ms` since the epoch (so no other code needs `new Date(<number>)`). */
export function fromEpochMs(ms: number): Date {
  return new Date(ms);
}

export function toIsoUtc(d: Date): string {
  return d.toISOString();
}
