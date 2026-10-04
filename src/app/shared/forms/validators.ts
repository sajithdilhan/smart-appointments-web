import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { email, FieldRule, maxTrimmed, phone, requiredTrimmed } from './field-rules';

/** Wraps a rule as a `ValidatorFn` reporting `{ [key]: true }`. */
export function fromRule(rule: FieldRule): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    const key = rule(typeof value === 'string' ? value : '');
    return key === null ? null : { [key]: true };
  };
}

/** Runs the rules in order and reports only the first failure, so a field shows one message. */
export function firstFailing(...rules: FieldRule[]): ValidatorFn {
  return fromRule((v) => {
    for (const rule of rules) {
      const key = rule(v);
      if (key !== null) return key;
    }
    return null;
  });
}

export const requiredValidator = fromRule(requiredTrimmed);
export const maxLengthValidator = (max: number): ValidatorFn =>
  firstFailing(requiredTrimmed, maxTrimmed(max));
export const emailValidator = firstFailing(requiredTrimmed, email);
export const phoneValidator = firstFailing(requiredTrimmed, phone);
