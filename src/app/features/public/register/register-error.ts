import { AppError } from '../../../core/http/app-error';
import { mapCommonError, Outcome } from '../auth/outcome';

/** The backend's fixed text for a taken email: the only signal the API gives. */
export const DUPLICATE_EMAIL_DETAIL = 'Email is already registered.';
export const EMAIL_TAKEN_MESSAGE = 'An account with this email already exists.';

/**
 * Maps a failed registration. A duplicate email is recognised by the backend's message; if that
 * wording ever changes the error degrades to the general 400 alert, which is still correct.
 */
export function mapRegisterError(error: AppError): Outcome {
  if (
    error.status === 400 &&
    error.message.trim().toLowerCase() === DUPLICATE_EMAIL_DETAIL.toLowerCase()
  ) {
    return { kind: 'field-email-taken' };
  }
  return mapCommonError(error);
}
