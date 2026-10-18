/** Pure schedule rules: strict 24-hour `HH:mm`, one interval per day, a time zone. */

/** Strict 24-hour time, as the backend's `TimePattern`. */
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A browser or backend may add seconds ("09:00:00"); the contract is `HH:mm`. */
export function normaliseTime(value: string): string {
  return value.slice(0, 5);
}

/** Minutes since midnight of a valid `HH:mm`. */
export function minutesOf(value: string): number {
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
}

export function timeFormatError(value: string): 'required' | 'format' | null {
  if (value === '') return 'required';
  return TIME_PATTERN.test(value) ? null : 'format';
}

/** True when both are valid times and `opens` is strictly earlier than `closes`. */
export function opensBeforeCloses(opens: string, closes: string): boolean {
  return (
    TIME_PATTERN.test(opens) && TIME_PATTERN.test(closes) && minutesOf(opens) < minutesOf(closes)
  );
}

export function zoneRequiredError(value: string): 'required' | null {
  return value.trim() === '' ? 'required' : null;
}

export type RowError =
  'opensRequired' | 'opensFormat' | 'closesRequired' | 'closesFormat' | 'order';

/**
 * The one error shown for a day row. Reported only while the day is open; a closed day keeps its
 * times but they are never validated or sent.
 */
export function scheduleRowError(row: {
  open: boolean;
  opensAt: string;
  closesAt: string;
}): RowError | null {
  if (!row.open) return null;
  const opens = timeFormatError(row.opensAt);
  if (opens) return opens === 'required' ? 'opensRequired' : 'opensFormat';
  const closes = timeFormatError(row.closesAt);
  if (closes) return closes === 'required' ? 'closesRequired' : 'closesFormat';
  return opensBeforeCloses(row.opensAt, row.closesAt) ? null : 'order';
}
