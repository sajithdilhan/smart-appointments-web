import { FormControl, FormGroup, ValidatorFn } from '@angular/forms';
import {
  emailValidator,
  maxLengthValidator,
  phoneValidator,
} from '../../../shared/forms/validators';
import {
  EMAIL_MESSAGES,
  FIRST_NAME_MESSAGES,
  LAST_NAME_MESSAGES,
  PHONE_MESSAGES,
  REGISTER_PASSWORD_MESSAGES,
} from '../validation/messages';
import { strongPasswordValidator } from '../../../shared/forms/password-validator';

const NAME_MAX = 50;

export function createRegisterForm() {
  const field = (validator: ValidatorFn) =>
    new FormControl('', { nonNullable: true, validators: [validator] });
  return new FormGroup({
    firstName: field(maxLengthValidator(NAME_MAX)),
    lastName: field(maxLengthValidator(NAME_MAX)),
    email: field(emailValidator),
    phoneNumber: field(phoneValidator),
    password: field(strongPasswordValidator),
  });
}

export const REGISTER_MESSAGES = {
  firstName: FIRST_NAME_MESSAGES,
  lastName: LAST_NAME_MESSAGES,
  email: EMAIL_MESSAGES,
  phoneNumber: PHONE_MESSAGES,
  password: REGISTER_PASSWORD_MESSAGES,
} as const;
