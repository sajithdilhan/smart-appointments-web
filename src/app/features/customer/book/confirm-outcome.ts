import type { AppError } from '../../../core/http/app-error';
import { classifyConflict } from './conflict-map';

export type ConfirmOutcome =
  | { kind: 'overlap' }
  | { kind: 'in-progress' }
  | { kind: 'slot-gone' }
  /** `422`: the key was used with another body. */
  | { kind: 'key-mismatch' }
  /** `unavailable`, `network` or `timeout`: the booking may or may not have happened. */
  | { kind: 'retryable' }
  | { kind: 'rate-limited'; seconds: number }
  /** `401` after F1's refresh: F1 owns the redirect. */
  | { kind: 'session-ended' }
  /** `400`, `403` and anything else: show the normalised message. */
  | { kind: 'failed'; message: string };

const DEFAULT_RETRY_SECONDS = 60;

/** Decision order: `kind` first, then `status`, then the `409` text (Req 8). */
export function mapConfirmError(e: AppError): ConfirmOutcome {
  switch (e.kind) {
    case 'rate-limited':
      return { kind: 'rate-limited', seconds: e.retryAfterSeconds ?? DEFAULT_RETRY_SECONDS };
    case 'unavailable':
    case 'network':
    case 'timeout':
      return { kind: 'retryable' };
    case 'unauthorized':
      return { kind: 'session-ended' };
  }
  switch (e.status) {
    case 404:
      return { kind: 'slot-gone' };
    case 409: {
      const cls = classifyConflict(e.message);
      return cls === 'overlap' || cls === 'in-progress' ? { kind: cls } : { kind: 'slot-gone' };
    }
    case 422:
      return { kind: 'key-mismatch' };
    default:
      return { kind: 'failed', message: e.message };
  }
}
