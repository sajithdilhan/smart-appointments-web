import { AppError } from '../../../core/http/app-error';
import { mapCommonError, Outcome } from '../auth/outcome';

export const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password.';

/** Maps a failed login to what the page shows. A 401 never reads the server's `detail`. */
export function mapLoginError(error: AppError): Outcome {
  if (error.status === 401 || error.kind === 'unauthorized') {
    return { kind: 'alert', message: INVALID_CREDENTIALS_MESSAGE, focus: 'password' };
  }
  return mapCommonError(error);
}
