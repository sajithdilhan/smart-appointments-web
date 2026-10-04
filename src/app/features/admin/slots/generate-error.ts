import type { AppError } from '../../../core/http/app-error';
import {
  GENERATION_SERVER_MESSAGES,
  classifyCommon,
  mapServerValidation,
  other,
  type CommonOutcome,
  type OtherOutcome,
} from '../validation/server-messages';

/** A router link offered next to an inline error. */
export interface FixLink {
  label: string;
  commands: string[];
  queryParams?: Record<string, string>;
}

export type GenerateOutcome =
  | CommonOutcome
  | OtherOutcome
  | { kind: 'no-schedule'; message: string; link: FixLink }
  | { kind: 'branch-inactive'; message: string; link: FixLink }
  | { kind: 'service-inactive'; message: string; link: FixLink }
  /** Another generation for the same branch and service ran at once; the admin retries by hand. */
  | { kind: 'concurrent'; message: string; actionLabel: 'Try again' }
  /** `404`: the picker's record is gone; the pickers reload. */
  | { kind: 'branch-not-found'; message: string }
  | { kind: 'service-not-found'; message: string }
  /** Any other `409`: the server's own text. */
  | { kind: 'conflict'; message: string }
  | { kind: 'validation'; fields: Record<string, string>; alert: string[] };

/** The backend's `SlotErrors` / `BranchErrors` texts, anchored (see the contract fixture). */
export const GENERATE_PATTERNS = {
  noWorkingHours: /has no working hours\.$/,
  branchInactive: /^Branch '.*' is inactive\.$/,
  serviceInactive: /^Service type '.*' is inactive\.$/,
  concurrent: /concurrent request/,
  branchNotFound: /^Branch /,
  serviceNotFound: /^Service type /,
} as const;

/**
 * Pure `AppError` to outcome mapping for slot generation. The ids in the links come from the form
 * values at submit time (`sent`), never from the `detail`.
 */
export function mapGenerateError(error: AppError, sent: { branchId: string }): GenerateOutcome {
  const common = classifyCommon(error);
  if (common) return common;
  const detail = error.message;
  if (error.status === 409) {
    if (GENERATE_PATTERNS.noWorkingHours.test(detail)) {
      return {
        kind: 'no-schedule',
        message: 'This branch has no schedule',
        link: {
          label: 'Set a schedule',
          commands: ['/admin', 'branches', sent.branchId, 'schedule'],
        },
      };
    }
    if (GENERATE_PATTERNS.branchInactive.test(detail)) {
      return {
        kind: 'branch-inactive',
        message: 'This branch is inactive',
        link: {
          label: 'Activate it',
          commands: ['/admin', 'branches'],
          queryParams: { status: 'inactive' },
        },
      };
    }
    if (GENERATE_PATTERNS.serviceInactive.test(detail)) {
      return {
        kind: 'service-inactive',
        message: 'This service is inactive',
        link: {
          label: 'Activate it',
          commands: ['/admin', 'services'],
          queryParams: { status: 'inactive' },
        },
      };
    }
    if (GENERATE_PATTERNS.concurrent.test(detail)) {
      return {
        kind: 'concurrent',
        message:
          'Another generation for this branch and service was running at the same time. Check the result and try again.',
        actionLabel: 'Try again',
      };
    }
    return { kind: 'conflict', message: detail };
  }
  if (error.status === 404) {
    if (GENERATE_PATTERNS.branchNotFound.test(detail)) {
      return { kind: 'branch-not-found', message: 'That branch no longer exists' };
    }
    if (GENERATE_PATTERNS.serviceNotFound.test(detail)) {
      return { kind: 'service-not-found', message: 'That service no longer exists' };
    }
    return other(error);
  }
  if (error.status === 400) {
    const { fields, unmapped } = mapServerValidation(detail, GENERATION_SERVER_MESSAGES);
    return { kind: 'validation', fields, alert: unmapped };
  }
  return other(error);
}
