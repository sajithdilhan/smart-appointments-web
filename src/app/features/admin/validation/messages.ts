import type { ValidationErrors } from '@angular/forms';

/**
 * Every user-visible validation string, in one place. Where the backend has a message the client
 * wording equals it, verbatim (`MIRRORED` lists each, keyed by its contract-fixture id, and a test
 * compares them). The exceptions are the phone number, which keeps a friendlier client text, and
 * rules the backend has no message for (a picker left empty, a required time).
 */
export const MESSAGES = {
  branch: {
    code: {
      required: 'Code is required.',
      pattern:
        'Code must be 2-10 letters, digits or hyphens, and cannot start or end with a hyphen.',
    },
    name: { required: 'Name is required.', max: 'Name cannot exceed 100 characters.' },
    description: { max: 'Description cannot exceed 500 characters.' },
    address: { required: 'Address is required.', max: 'Address cannot exceed 200 characters.' },
    phoneNumber: {
      required: 'Phone number is required.',
      pattern: 'Enter a phone number with the country code, for example +14155550123.',
    },
  },
  service: {
    code: {
      required: 'Code is required.',
      pattern:
        'Code must be 2-30 letters, digits, hyphens or underscores, and cannot start or end with a hyphen or underscore.',
    },
    name: { required: 'Name is required.', max: 'Name cannot exceed 100 characters.' },
    description: { max: 'Description cannot exceed 500 characters.' },
    durationMinutes: {
      range: 'Duration must be between 5 and 480 minutes.',
      step: 'Duration must be a multiple of 5 minutes.',
    },
  },
  schedule: {
    timeZoneId: { required: 'Choose a time zone.' },
    row: {
      opensRequired: 'Enter an opening time.',
      opensFormat: 'Opening time must be a 24-hour time in the form HH:mm.',
      closesRequired: 'Enter a closing time.',
      closesFormat: 'Closing time must be a 24-hour time in the form HH:mm.',
      order: 'Opening time must be before closing time.',
    },
  },
  generation: {
    branchId: { required: 'Choose a branch.' },
    serviceTypeId: { required: 'Choose a service.' },
    fromDate: { required: 'Choose a start date.' },
    toDate: {
      required: 'Choose an end date.',
      order: 'From date cannot be after to date.',
      span: 'The date range cannot span more than 31 days.',
    },
    capacity: { range: 'Capacity must be between 1 and 100.' },
  },
} as const;

/** Client messages that must equal a backend message: contract-fixture id to client text. */
export const MIRRORED: Readonly<Record<string, string>> = {
  'branch.code.required': MESSAGES.branch.code.required,
  'branch.code.pattern': MESSAGES.branch.code.pattern,
  'branch.name.required': MESSAGES.branch.name.required,
  'branch.name.max': MESSAGES.branch.name.max,
  'branch.description.max': MESSAGES.branch.description.max,
  'branch.address.required': MESSAGES.branch.address.required,
  'branch.address.max': MESSAGES.branch.address.max,
  'branch.phone.required': MESSAGES.branch.phoneNumber.required,
  'service.code.required': MESSAGES.service.code.required,
  'service.code.pattern': MESSAGES.service.code.pattern,
  'service.name.required': MESSAGES.service.name.required,
  'service.name.max': MESSAGES.service.name.max,
  'service.description.max': MESSAGES.service.description.max,
  'service.duration.range': MESSAGES.service.durationMinutes.range,
  'service.duration.step': MESSAGES.service.durationMinutes.step,
  'schedule.opensFormat': MESSAGES.schedule.row.opensFormat,
  'schedule.closesFormat': MESSAGES.schedule.row.closesFormat,
  'schedule.order': MESSAGES.schedule.row.order,
  'generation.order': MESSAGES.generation.toDate.order,
  'generation.span': MESSAGES.generation.toDate.span,
  'generation.capacity': MESSAGES.generation.capacity.range,
};

/** The message of the first key in `table` that is present in `errors`, or `null`. */
export function firstMessage(
  table: Readonly<Record<string, string>>,
  errors: ValidationErrors | null | undefined,
): string | null {
  if (!errors) return null;
  const key = Object.keys(table).find((k) => k in errors);
  return key ? table[key] : null;
}
