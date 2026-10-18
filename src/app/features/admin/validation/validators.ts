import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import {
  addressError,
  branchCodeError,
  descriptionError,
  nameError,
  phoneError,
} from './branch-rules';
import { capacityError, dateRangeError, dateRequiredError } from './generation-rules';
import { scheduleRowError, zoneRequiredError } from './schedule-rules';
import { durationError, serviceCodeError } from './service-rules';

/**
 * `ValidatorFn` wrappers over the pure rules. A failing rule becomes `{ [key]: true }`; because
 * each rule returns only its first failing key, a control reports one message at a time.
 */
export function fromRule<V>(rule: (value: V) => string | null): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const key = rule(control.value as V);
    return key ? { [key]: true } : null;
  };
}

export const branchValidators = {
  code: fromRule<string>(branchCodeError),
  name: fromRule<string>(nameError),
  description: fromRule<string>(descriptionError),
  address: fromRule<string>(addressError),
  /** `normalise` is the form's phone normaliser (F2's `normalizePhone`); identity by default. */
  phoneNumber: (normalise: (value: string) => string = (v) => v): ValidatorFn =>
    fromRule<string>((v) => phoneError(normalise(v))),
};

export const serviceValidators = {
  code: fromRule<string>(serviceCodeError),
  name: fromRule<string>(nameError),
  description: fromRule<string>(descriptionError),
  /** A control whose value is not a number (an emptied stepper input) reports `range`. */
  durationMinutes: fromRule<number>((v) => durationError(typeof v === 'number' ? v : NaN)),
};

export const scheduleValidators = {
  timeZoneId: fromRule<string>(zoneRequiredError),
  /** Group validator for a day row `{ open, opensAt, closesAt }`; one error key per row. */
  row: fromRule<{ open: boolean; opensAt: string; closesAt: string }>(scheduleRowError),
};

export const generationValidators = {
  dateRequired: fromRule<string>(dateRequiredError),
  /** Group validator for `{ fromDate, toDate }`; the error belongs to `toDate`. */
  dateRange: fromRule<{ fromDate: string; toDate: string }>((v) =>
    dateRangeError(v.fromDate, v.toDate),
  ),
  capacity: fromRule<number>((v) => capacityError(typeof v === 'number' ? v : NaN)),
};
