import { FieldRule } from '../../../shared/forms/field-rules';
import { firstFailing } from '../../../shared/forms/validators';
import { passwordIsValid } from './password-rules';

/** The password rule: 'weak' when any requirement is unmet. Empty passes (pair with required). */
export const password: FieldRule = (v) => (v === '' || passwordIsValid(v) ? null : 'weak');

const passwordRequired: FieldRule = (v) => (v === '' ? 'required' : null);

/** Register's password validator: required first, then strength. Spaces count as characters. */
export const strongPasswordValidator = firstFailing(passwordRequired, password);
