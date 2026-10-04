import type { AppError } from '../../../core/http/app-error';
import {
  SERVICE_SERVER_MESSAGES,
  classifyCommon,
  mapServerValidation,
  other,
  type CommonOutcome,
  type OtherOutcome,
} from '../validation/server-messages';
import { normaliseCode } from '../validation/service-rules';

export type ServiceOutcome =
  | CommonOutcome
  | OtherOutcome
  | { kind: 'duplicate-code'; field: 'code'; message: string }
  | { kind: 'validation'; fields: Record<string, string>; alert: string[] }
  | { kind: 'not-found' };

/** Pure `AppError` to outcome mapping for service create and update. */
export function mapServiceError(error: AppError, sent: { code?: string } = {}): ServiceOutcome {
  const common = classifyCommon(error);
  if (common) return common;
  if (error.status === 404) return { kind: 'not-found' };
  if (error.status === 409 && sent.code !== undefined) {
    return {
      kind: 'duplicate-code',
      field: 'code',
      message: `A service with code ${normaliseCode(sent.code)} already exists.`,
    };
  }
  if (error.status === 400) {
    const { fields, unmapped } = mapServerValidation(error.message, SERVICE_SERVER_MESSAGES);
    return { kind: 'validation', fields, alert: unmapped };
  }
  return other(error);
}
