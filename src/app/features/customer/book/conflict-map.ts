/**
 * The one place that knows backend wording for a `409` (Req 8.2). The backend sends no error
 * codes, so a conflict is told apart by its normalised `detail` (trimmed, lower case).
 *
 * Verbatim sources: Booking `AppointmentErrors.Overlap` and `KeyInProgress`; Availability
 * `SlotErrors.Full`, `AlreadyStarted`, `BranchInactive`, `ServiceTypeInactive` and
 * `NoWorkingHours`, passed through by Booking; Booking `AvailabilityClient` fallback
 * "The slot cannot be reserved." for an unreadable Availability `409`.
 */
export type ConflictClass = 'overlap' | 'in-progress' | 'slot-gone' | 'unknown';

const EXACT: ReadonlyMap<string, ConflictClass> = new Map([
  ['you already have an appointment at that time.', 'overlap'],
  ['a request with this idempotency-key is still being processed.', 'in-progress'],
  ['slot is full.', 'slot-gone'],
  ['slot has already started.', 'slot-gone'],
  ['the slot cannot be reserved.', 'slot-gone'],
]);

const PATTERNS: readonly (readonly [RegExp, ConflictClass])[] = [
  [/^branch '.+' is inactive\.$/, 'slot-gone'],
  [/^service type '.+' is inactive\.$/, 'slot-gone'],
  [/^branch '.+' has no working hours\.$/, 'slot-gone'],
];

export function classifyConflict(detail: string | undefined): ConflictClass {
  const text = detail?.trim().toLowerCase();
  if (!text) return 'unknown';
  const exact = EXACT.get(text);
  if (exact) return exact;
  for (const [pattern, cls] of PATTERNS) {
    if (pattern.test(text)) return cls;
  }
  return 'unknown';
}
