import { AppError } from '../../../core/http/app-error';
import type { AppointmentResponse } from './appointment.model';
import { cancelConflictMessage } from './cancel-conflict';

export type CancelPhase =
  | { kind: 'idle' }
  | { kind: 'confirming' }
  | { kind: 'cancelling' } // optimistic
  | { kind: 'cancelled'; refreshed: boolean; slotMayBeDelayed: boolean }
  | { kind: 'too-late' } // 409, the known "already started" text
  | { kind: 'retryable' } // 503/5xx/network and the re-GET says Booked (or failed)
  | { kind: 'rate-limited' } // 429
  | { kind: 'failed'; error: AppError }; // 403, an unknown 409 and anything else

/** Why the store re-read the appointment: after a `204`, or because the outcome is unknown. */
export type ReGetReason = 'ok' | 'unconfirmed';

export type CancelEvent =
  | { type: 'open' }
  | { type: 'keep' }
  | { type: 'confirm' }
  | { type: 'retry' }
  | { type: 'ok204' }
  | { type: 'err'; error: AppError }
  | { type: 'reGetResult'; after: ReGetReason; result: AppointmentResponse | AppError };

export const IDLE: CancelPhase = { kind: 'idle' };

/** A `503`, any 5xx, a network error or a timeout: the server may or may not have cancelled. */
export function isUnconfirmed(error: AppError): boolean {
  return (
    error.status >= 500 ||
    error.kind === 'unavailable' ||
    error.kind === 'network' ||
    error.kind === 'timeout'
  );
}

function fromError(error: AppError): CancelPhase {
  if (error.status === 409) {
    const conflict = cancelConflictMessage(error.message);
    if (conflict.phase === 'too-late') return { kind: 'too-late' };
    return {
      kind: 'failed',
      error: new AppError(409, conflict.message, 'http', error.correlationId),
    };
  }
  if (error.kind === 'rate-limited' || error.status === 429) return { kind: 'rate-limited' };
  // A 404 is shown by the detail's load state (not-found), not by the cancel region.
  if (error.status === 404) return IDLE;
  return { kind: 'failed', error };
}

/**
 * The cancel state machine as a pure function (Req 6.3 to 6.10). The store runs the effects
 * (POST, re-GET) and feeds the outcomes back. An event that does not apply to the current
 * phase returns the same object, so a repeated `confirm` can never start a second request.
 *
 * A `503`, network error or timeout (`isUnconfirmed`) never moves the phase by itself: it
 * stays `cancelling` until the re-GET result decides (Req 6.7, 6.8).
 */
export function cancelReducer(phase: CancelPhase, event: CancelEvent): CancelPhase {
  switch (event.type) {
    case 'open':
      return phase.kind === 'idle' || phase.kind === 'failed' || phase.kind === 'rate-limited'
        ? { kind: 'confirming' }
        : phase;
    case 'keep':
      return phase.kind === 'confirming' ? IDLE : phase;
    case 'confirm':
      return phase.kind === 'confirming' ? { kind: 'cancelling' } : phase;
    case 'retry':
      return phase.kind === 'retryable' ? { kind: 'cancelling' } : phase;
    case 'ok204':
      return phase; // still optimistic: the store re-GETs and reports `reGetResult`
    case 'err':
      if (phase.kind !== 'cancelling') return phase;
      return isUnconfirmed(event.error) ? phase : fromError(event.error);
    case 'reGetResult': {
      if (phase.kind !== 'cancelling') return phase;
      const { result, after } = event;
      if (result instanceof AppError) {
        if (result.status === 404) return IDLE;
        return after === 'ok'
          ? { kind: 'cancelled', refreshed: false, slotMayBeDelayed: false }
          : { kind: 'retryable' };
      }
      if (result.status === 'Cancelled') {
        return { kind: 'cancelled', refreshed: true, slotMayBeDelayed: after === 'unconfirmed' };
      }
      return after === 'ok'
        ? { kind: 'cancelled', refreshed: false, slotMayBeDelayed: false }
        : { kind: 'retryable' };
    }
  }
}
