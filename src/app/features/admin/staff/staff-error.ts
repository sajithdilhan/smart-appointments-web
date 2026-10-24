import type { AppError } from '../../../core/http/app-error';
import { VALIDATION_PREFIX } from '../validation/parse-validation-detail';
import {
  classifyCommon,
  mapServerValidation,
  other,
  type CommonOutcome,
  type OtherOutcome,
} from '../validation/server-messages';
import {
  BRANCH_CHECK_UNAVAILABLE_MESSAGE,
  BRANCH_INACTIVE_MESSAGE,
  EMAIL_TAKEN_MESSAGE,
  OUTAGE_MESSAGE,
  STAFF_NOT_FOUND_MESSAGE,
  STAFF_SERVER_MESSAGES,
} from './staff-messages';

export type StaffSaveMode = 'create' | 'move';
export type StaffAction = 'deactivate' | 'reactivate' | 'delete';

export type StaffOutcome =
  | CommonOutcome
  | OtherOutcome
  /** One message on one field. `reloadBranches` is set by the "branch not active" answer. */
  | { kind: 'field'; field: 'email' | 'branchId'; message: string; reloadBranches: boolean }
  /** A validation `400`: the known messages by field, the rest for the form alert. */
  | { kind: 'validation'; fields: Record<string, string>; alert: string[] }
  | { kind: 'alert'; message: string }
  | { kind: 'not-found'; message: string };

/** Pure `AppError` to outcome mapping for creating a staff account or moving one. */
export function mapStaffSaveError(error: AppError, mode: StaffSaveMode): StaffOutcome {
  if (error.status === 503) return { kind: 'alert', message: BRANCH_CHECK_UNAVAILABLE_MESSAGE };
  const common = classifyCommon(error);
  if (common) return common;
  if (error.status === 404 && mode === 'move') {
    return { kind: 'not-found', message: STAFF_NOT_FOUND_MESSAGE };
  }
  if (error.status === 422) {
    return {
      kind: 'field',
      field: 'branchId',
      message: BRANCH_INACTIVE_MESSAGE,
      reloadBranches: true,
    };
  }
  if (error.status === 400) {
    if (mode === 'create' && error.message === EMAIL_TAKEN_MESSAGE) {
      return { kind: 'field', field: 'email', message: EMAIL_TAKEN_MESSAGE, reloadBranches: false };
    }
    if (error.message.startsWith(VALIDATION_PREFIX)) {
      const { fields, unmapped } = mapServerValidation(error.message, STAFF_SERVER_MESSAGES);
      return { kind: 'validation', fields, alert: unmapped };
    }
    return { kind: 'alert', message: error.message };
  }
  return other(error);
}

export type StaffActionOutcome =
  | { kind: 'not-found'; message: string }
  /** Reactivate only: the member's branch is inactive. */
  | { kind: 'branch-inactive' }
  /** Reactivate only: Availability could not be reached. */
  | { kind: 'unavailable'; message: string }
  /** Everything else: `ToastService.handleError` applies the policy. */
  | { kind: 'generic' };

/** Pure mapping for deactivate, reactivate and delete. */
export function mapStaffActionError(error: AppError, action: StaffAction): StaffActionOutcome {
  if (error.status === 404) return { kind: 'not-found', message: STAFF_NOT_FOUND_MESSAGE };
  if (action === 'reactivate') {
    if (error.status === 422) return { kind: 'branch-inactive' };
    if (error.status === 503) return { kind: 'unavailable', message: OUTAGE_MESSAGE };
  }
  return { kind: 'generic' };
}
