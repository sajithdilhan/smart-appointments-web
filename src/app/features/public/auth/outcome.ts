import { AppError } from '../../../core/http/app-error';

/** What a page does with a failed submit. Pure data: the page applies it. */
export type Outcome =
  | {
      kind: 'alert';
      message: string;
      reference?: string;
      focus: 'password' | 'alert' | 'none';
    }
  | { kind: 'countdown'; seconds: number }
  | { kind: 'field-email-taken' }; // register only

export const UNAVAILABLE_MESSAGE = 'Service temporarily unavailable. Please try again in a moment.';
const DEFAULT_RETRY_SECONDS = 60;

/** The rows login and register share: 429, outage, network, timeout, 5xx and anything else. */
export function mapCommonError(error: AppError): Outcome {
  switch (error.kind) {
    case 'rate-limited':
      return { kind: 'countdown', seconds: error.retryAfterSeconds ?? DEFAULT_RETRY_SECONDS };
    case 'unavailable':
      return { kind: 'alert', message: UNAVAILABLE_MESSAGE, focus: 'none' };
    case 'network':
    case 'timeout':
      return { kind: 'alert', message: error.message, focus: 'none' };
    default:
      break;
  }
  if (error.status >= 500) {
    return {
      kind: 'alert',
      message: error.message,
      ...(error.correlationId ? { reference: error.correlationId } : {}),
      focus: 'none',
    };
  }
  return { kind: 'alert', message: error.message, focus: 'alert' };
}

/** Narrows a caught value to an `AppError`; anything else becomes a generic one. */
export function toAppError(e: unknown): AppError {
  return e instanceof AppError ? e : new AppError(0, 'Something went wrong.', 'http');
}
