import type { AppErrorShape } from '../../core/http/app-error';

export const MARK_NOT_FOUND_TEXT = 'This appointment is no longer available.';

export type MarkOutcome =
  /** `409`: the server's own text, then reload so the row shows the real status. */
  | { kind: 'conflict'; message: string; reload: true }
  /** `404`: fixed text, then reload. */
  | { kind: 'not-found'; message: string; reload: true }
  /** Anything else: nothing is known to have changed, so no reload (F1 decides on a toast). */
  | { kind: 'other'; message: string; reload: false };

/** Maps a failed Complete or No-show to what the engine does about it (Req 3.5). */
export function mapMarkError(error: AppErrorShape): MarkOutcome {
  if (error.kind === 'http' && error.status === 409) {
    return { kind: 'conflict', message: error.message, reload: true };
  }
  if (error.kind === 'http' && error.status === 404) {
    return { kind: 'not-found', message: MARK_NOT_FOUND_TEXT, reload: true };
  }
  return { kind: 'other', message: error.message, reload: false };
}
