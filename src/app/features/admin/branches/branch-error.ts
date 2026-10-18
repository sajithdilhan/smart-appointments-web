import type { AppError } from '../../../core/http/app-error';
import { normaliseCode } from '../validation/branch-rules';
import {
  BRANCH_SERVER_MESSAGES,
  classifyCommon,
  mapServerValidation,
  other,
  type CommonOutcome,
  type OtherOutcome,
} from '../validation/server-messages';

export type BranchOutcome =
  | CommonOutcome
  | OtherOutcome
  /** `409` on create: shown on the code field, built from the code that was **sent**. */
  | { kind: 'duplicate-code'; field: 'code'; message: string }
  /** `400`: field messages plus whatever has no field (shown in the form alert). */
  | { kind: 'validation'; fields: Record<string, string>; alert: string[] }
  | { kind: 'not-found' };

/** Pure `AppError` to outcome mapping for branch create and update. */
export function mapBranchError(error: AppError, sent: { code?: string } = {}): BranchOutcome {
  const common = classifyCommon(error);
  if (common) return common;
  if (error.status === 404) return { kind: 'not-found' };
  if (error.status === 409 && sent.code !== undefined) {
    return {
      kind: 'duplicate-code',
      field: 'code',
      message: `A branch with code ${normaliseCode(sent.code)} already exists.`,
    };
  }
  if (error.status === 400) {
    const { fields, unmapped } = mapServerValidation(error.message, BRANCH_SERVER_MESSAGES);
    return { kind: 'validation', fields, alert: unmapped };
  }
  return other(error);
}
