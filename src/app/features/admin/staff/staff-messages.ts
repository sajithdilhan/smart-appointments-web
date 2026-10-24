import type { ServerMessage, ServerMessageTable } from '../validation/server-messages';

/**
 * Every user-visible string of the staff accounts screens. Texts that mirror the backend
 * (`STAFF_SERVER_MESSAGES`) equal it verbatim; a test compares them with the MSW model, which is
 * written from the backend's validators.
 */

/** Field validation messages, by control and error key (the keys of the shared rules). */
export const STAFF_FIELD_MESSAGES = {
  firstName: {
    required: 'First name is required.',
    maxlength: 'First name cannot exceed 50 characters.',
  },
  lastName: {
    required: 'Last name is required.',
    maxlength: 'Last name cannot exceed 50 characters.',
  },
  email: { required: 'Email is required.', email: 'Enter a valid email address.' },
  phoneNumber: {
    required: 'Phone number is required.',
    pattern: 'Enter the number in international format, for example +14155550123.',
  },
  password: {
    required: 'Password is required.',
    weak: 'Password does not meet all the requirements.',
  },
  branchId: { required: 'Choose a branch.' },
} as const;

export const EMAIL_TAKEN_MESSAGE = 'Email is already registered.';
export const BRANCH_INACTIVE_MESSAGE = 'This branch is not active any more. Choose another.';
export const BRANCH_CHECK_UNAVAILABLE_MESSAGE =
  'The branch could not be checked right now. Try again shortly.';
export const STAFF_NOT_FOUND_MESSAGE = 'This staff account no longer exists.';
/** The wording of the F1 outage banner, for a `503` on an action that has no form to put it in. */
export const OUTAGE_MESSAGE = 'Service temporarily unavailable. Some features may not work.';
export const MOVE_NOTICE =
  'Moving a staff member signs them out of every device. They sign in again to work at the new branch.';

const entry = (message: string, field: string): ServerMessage => ({
  id: `staff.${field}`,
  message,
  field,
});

/** Backend validation texts of the staff create and move requests, and the field of each. */
export const STAFF_SERVER_MESSAGES: ServerMessageTable = [
  entry('First name is required.', 'firstName'),
  entry('First name cannot exceed 50 characters.', 'firstName'),
  entry('Last name is required.', 'lastName'),
  entry('Last name cannot exceed 50 characters.', 'lastName'),
  entry('Email is required.', 'email'),
  entry('Invalid email format.', 'email'),
  entry('Phone number is required.', 'phoneNumber'),
  entry('Invalid phone number format.', 'phoneNumber'),
  entry('Password is required.', 'password'),
  entry('Password must be at least 8 characters long.', 'password'),
  entry('Password must contain at least one uppercase letter.', 'password'),
  entry('Password must contain at least one lowercase letter.', 'password'),
  entry('Password must contain at least one digit.', 'password'),
  entry('Password must contain at least one special character.', 'password'),
  entry('Branch is required.', 'branchId'),
];

export const createdMessage = (first: string, last: string) => `${first} ${last} can now sign in.`;
export const movedMessage = (name: string, branch: string) => `${name} moved to ${branch}.`;
export const deactivatedMessage = (name: string) => `${name} deactivated.`;
export const reactivatedMessage = (name: string) => `${name} can sign in again.`;
export const deletedMessage = (name: string) => `${name}'s account was deleted.`;
export const reactivateBlockedMessage = (name: string) =>
  `${name}'s branch is not active. Move them to an active branch first.`;

export const deactivateWording = (name: string) => ({
  title: `Deactivate ${name}?`,
  body: `${name} will be signed out of every device and won't be able to sign in. Pages they already have open may keep working for up to an hour.`,
  confirmLabel: 'Deactivate',
});

export const deleteWording = (name: string, email: string) => ({
  title: `Delete ${name}'s staff account?`,
  body: `They will never be able to sign in again, and ${email} can't be used for a new account. This cannot be undone.`,
  confirmLabel: 'Delete account',
});
