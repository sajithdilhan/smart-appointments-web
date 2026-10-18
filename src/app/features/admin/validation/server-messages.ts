import type { AppError } from '../../../core/http/app-error';
import { splitValidationDetail } from './parse-validation-detail';

/**
 * Known backend validation texts and the form field each belongs to. `id` is the entry's id in the
 * contract fixture (`availability-contract.json`), where a test checks the text and the field.
 * `field: null` means the message cannot be tied to one input (a day row of the schedule) and goes
 * to the form's alert.
 */
export interface ServerMessage {
  readonly id: string;
  readonly message: string;
  readonly field: string | null;
}

export type ServerMessageTable = readonly ServerMessage[];

const m = (id: string, message: string, field: string | null): ServerMessage => ({
  id,
  message,
  field,
});

const NAME_DESCRIPTION = (form: 'branch' | 'service'): ServerMessage[] => [
  m(`${form}.name.required`, 'Name is required.', 'name'),
  m(`${form}.name.max`, 'Name cannot exceed 100 characters.', 'name'),
  m(`${form}.description.max`, 'Description cannot exceed 500 characters.', 'description'),
];

export const BRANCH_SERVER_MESSAGES: ServerMessageTable = [
  m('branch.code.required', 'Code is required.', 'code'),
  m(
    'branch.code.pattern',
    'Code must be 2-10 letters, digits or hyphens, and cannot start or end with a hyphen.',
    'code',
  ),
  ...NAME_DESCRIPTION('branch'),
  m('branch.address.required', 'Address is required.', 'address'),
  m('branch.address.max', 'Address cannot exceed 200 characters.', 'address'),
  m('branch.phone.required', 'Phone number is required.', 'phoneNumber'),
  m('branch.phone.pattern', 'Invalid phone number format.', 'phoneNumber'),
];

export const SERVICE_SERVER_MESSAGES: ServerMessageTable = [
  m('service.code.required', 'Code is required.', 'code'),
  m(
    'service.code.pattern',
    'Code must be 2-30 letters, digits, hyphens or underscores, and cannot start or end with a hyphen or underscore.',
    'code',
  ),
  ...NAME_DESCRIPTION('service'),
  m('service.duration.range', 'Duration must be between 5 and 480 minutes.', 'durationMinutes'),
  m('service.duration.step', 'Duration must be a multiple of 5 minutes.', 'durationMinutes'),
];

export const SCHEDULE_SERVER_MESSAGES: ServerMessageTable = [
  m(
    'schedule.zone',
    "Time zone must be an IANA time zone identifier, such as 'Asia/Colombo'.",
    'timeZoneId',
  ),
  m('schedule.dayOnce', 'A day of the week can be listed only once.', null),
  m('schedule.dayInvalid', 'Day of week is not valid.', null),
  m('schedule.opensFormat', 'Opening time must be a 24-hour time in the form HH:mm.', null),
  m('schedule.closesFormat', 'Closing time must be a 24-hour time in the form HH:mm.', null),
  m('schedule.order', 'Opening time must be before closing time.', null),
  m(
    'schedule.hoursRequired',
    'Working hours are required; use an empty list to close every day.',
    null,
  ),
];

export const GENERATION_SERVER_MESSAGES: ServerMessageTable = [
  m('generation.branchRequired', 'Branch id is required.', 'branchId'),
  m('generation.serviceRequired', 'Service type id is required.', 'serviceTypeId'),
  m('generation.order', 'From date cannot be after to date.', 'toDate'),
  m('generation.span', 'The date range cannot span more than 31 days.', 'toDate'),
  m('generation.capacity', 'Capacity must be between 1 and 100.', 'capacity'),
];

export interface MappedValidation {
  /** First message per mapped field, to show on that field. */
  fields: Record<string, string>;
  /** Everything else (unknown text, a message tied to no field) for the form alert. */
  unmapped: string[];
}

/** Maps a validation `detail` onto a form's fields using that form's table. */
export function mapServerValidation(detail: string, table: ServerMessageTable): MappedValidation {
  const known = table.map((e) => e.message);
  const fields: Record<string, string> = {};
  const unmapped: string[] = [];
  for (const text of splitValidationDetail(detail, known)) {
    const entry = table.find((e) => e.message === text);
    if (entry?.field) {
      if (!(entry.field in fields)) fields[entry.field] = text;
    } else if (!unmapped.includes(text)) {
      unmapped.push(text);
    }
  }
  return { fields, unmapped };
}

/** The outcomes every admin call can have besides its own, decided from the `AppError` alone. */
export type CommonOutcome =
  | { kind: 'offline'; message: string }
  | { kind: 'rate-limited'; message: string; retryAfterSeconds: number }
  | { kind: 'forbidden'; message: string };

export function classifyCommon(error: AppError): CommonOutcome | null {
  if (error.kind === 'network' || error.kind === 'timeout' || error.kind === 'unavailable') {
    return { kind: 'offline', message: error.message };
  }
  if (error.kind === 'rate-limited') {
    return {
      kind: 'rate-limited',
      message: error.message,
      retryAfterSeconds: error.retryAfterSeconds ?? 60,
    };
  }
  if (error.status === 403) return { kind: 'forbidden', message: error.message };
  return null;
}

/** An outcome that carries the server's own wording plus the correlation id for support. */
export interface OtherOutcome {
  kind: 'other';
  message: string;
  correlationId?: string;
}

export const other = (error: AppError): OtherOutcome => ({
  kind: 'other',
  message: error.message,
  correlationId: error.correlationId,
});
