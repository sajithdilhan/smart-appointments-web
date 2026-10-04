/** The text the backend returns for a cancel after the start (`AppointmentErrors.AlreadyStarted()`). */
export const ALREADY_STARTED_DETAIL =
  'The appointment has already started and can no longer be cancelled.';

export const TOO_LATE_MESSAGE =
  'This appointment has already started, so it can no longer be cancelled.';

export const GENERIC_CONFLICT_MESSAGE =
  "We couldn't cancel this appointment. Refresh and try again.";

export type CancelConflict =
  { phase: 'too-late'; message: string } | { phase: 'failed'; message: string };

/**
 * Maps the `detail` of a cancel `409` to a fixed client message. The one known text means the
 * appointment started (the button goes away); any other text is a generic failure that keeps
 * the button. The raw `detail` is never part of the result.
 */
export function cancelConflictMessage(detail: string | null | undefined): CancelConflict {
  return detail?.trim() === ALREADY_STARTED_DETAIL
    ? { phase: 'too-late', message: TOO_LATE_MESSAGE }
    : { phase: 'failed', message: GENERIC_CONFLICT_MESSAGE };
}
