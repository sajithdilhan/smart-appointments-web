import { FormControl, FormGroup } from '@angular/forms';
import { emailValidator, fromRule } from '../../../shared/forms/validators';
import { EMAIL_MESSAGES, LOGIN_PASSWORD_MESSAGES } from '../validation/messages';

// Login applies no strength rules: only that a password was typed (spaces count).
const passwordRequired = fromRule((v) => (v === '' ? 'required' : null));

export function createLoginForm() {
  return new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [emailValidator] }),
    password: new FormControl('', { nonNullable: true, validators: [passwordRequired] }),
  });
}

export const LOGIN_MESSAGES = {
  email: EMAIL_MESSAGES,
  password: LOGIN_PASSWORD_MESSAGES,
} as const;
