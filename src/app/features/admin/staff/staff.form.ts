import { FormControl, FormGroup, Validators, type ValidatorFn } from '@angular/forms';
import type { CreateStaffBody } from '../../../core/api/models';
import {
  emailValidator,
  maxLengthValidator,
  normalizePhone,
  phoneValidator,
} from '../../../shared/forms';
import { strongPasswordValidator } from '../../../shared/forms/password-validator';
import { formSnapshot, type Normalisers } from '../shared/dirty/form-snapshot';

export const NAME_MAX = 50;

export type StaffForm = ReturnType<typeof createStaffForm>;
export type StaffValues = ReturnType<StaffForm['getRawValue']>;

/** Cosmetic differences that never make the form dirty: separators in the phone number. */
const NORMALISERS: Normalisers = { phoneNumber: normalizePhone };

/** The create form. The branch is a select, so its validator is plain `required`. */
export function createStaffForm() {
  const text = (validator: ValidatorFn) =>
    new FormControl('', { nonNullable: true, validators: validator });
  return new FormGroup({
    firstName: text(maxLengthValidator(NAME_MAX)),
    lastName: text(maxLengthValidator(NAME_MAX)),
    email: text(emailValidator),
    phoneNumber: text(phoneValidator),
    password: text(strongPasswordValidator),
    branchId: text(Validators.required),
  });
}

/**
 * What decides whether the form is dirty. The password text is never part of it (it must not
 * live in a signal or a string longer than needed): only whether one was typed.
 */
export function staffSnapshot(form: StaffForm): string {
  const { password, ...rest } = form.getRawValue();
  return formSnapshot({ ...rest, hasPassword: password !== '' }, NORMALISERS);
}

/** Reads the password once, into the request. */
export function toCreateBody(v: StaffValues): CreateStaffBody {
  return {
    firstName: v.firstName.trim(),
    lastName: v.lastName.trim(),
    email: v.email.trim(),
    phoneNumber: normalizePhone(v.phoneNumber.trim()),
    password: v.password,
    branchId: v.branchId,
  };
}
