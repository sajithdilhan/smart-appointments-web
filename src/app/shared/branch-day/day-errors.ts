import type { AppErrorShape } from '../../core/http/app-error';

export const DAY_FORBIDDEN_TEXT = 'You can only see your own branch.';
export const DAY_ZONE_UNAVAILABLE_TEXT =
  "The branch's time zone could not be loaded. Try again shortly.";

/** The inline text of a failed day list (Req 2.10): `403` and `503` are fixed, others are F1's. */
export function dayErrorText(error: AppErrorShape): string {
  if (error.kind === 'http' || error.kind === 'unavailable') {
    if (error.status === 403) return DAY_FORBIDDEN_TEXT;
    if (error.status === 503) return DAY_ZONE_UNAVAILABLE_TEXT;
  }
  return error.message;
}
