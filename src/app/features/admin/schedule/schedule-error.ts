import type { AppError } from '../../../core/http/app-error';
import {
  SCHEDULE_SERVER_MESSAGES,
  classifyCommon,
  mapServerValidation,
  other,
  type CommonOutcome,
  type OtherOutcome,
} from '../validation/server-messages';

export type ScheduleOutcome =
  | CommonOutcome
  | OtherOutcome
  /** `400`: the zone message goes on the zone field; a day-row message cannot name its day, so it goes to the alert. */
  | { kind: 'validation'; fields: Record<string, string>; alert: string[] }
  | { kind: 'not-found' };

/** Pure `AppError` to outcome mapping for the schedule save. */
export function mapScheduleError(error: AppError): ScheduleOutcome {
  const common = classifyCommon(error);
  if (common) return common;
  if (error.status === 404) return { kind: 'not-found' };
  if (error.status === 400) {
    const { fields, unmapped } = mapServerValidation(error.message, SCHEDULE_SERVER_MESSAGES);
    return { kind: 'validation', fields, alert: unmapped };
  }
  return other(error);
}
