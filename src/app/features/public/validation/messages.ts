/** F2's user-visible validation strings; keys are the error keys from the shared rules. */
export type Messages = Record<string, string>;

export const FIRST_NAME_MESSAGES: Messages = {
  required: 'First name is required.',
  maxlength: 'First name cannot exceed 50 characters.',
};
export const LAST_NAME_MESSAGES: Messages = {
  required: 'Last name is required.',
  maxlength: 'Last name cannot exceed 50 characters.',
};
export const EMAIL_MESSAGES: Messages = {
  required: 'Email is required.',
  email: 'Enter a valid email address.',
};
export const PHONE_MESSAGES: Messages = {
  required: 'Phone number is required.',
  pattern: 'Enter the number in international format, for example +14155550123.',
};
export const REGISTER_PASSWORD_MESSAGES: Messages = {
  required: 'Password is required.',
  weak: 'Password does not meet all the requirements.',
};
export const LOGIN_PASSWORD_MESSAGES: Messages = {
  required: 'Password is required.',
};
