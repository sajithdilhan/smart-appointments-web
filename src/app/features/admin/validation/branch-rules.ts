/**
 * Pure branch field rules. Each returns the key of the first failing rule, or `null`; the wording
 * lives in `messages.ts`. They mirror the backend's validators (see the contract fixture) so the
 * client never accepts what the server rejects, nor rejects what it accepts.
 */

/** `Branch.NormaliseCode`: trim then upper-case (codes are ASCII-only, so locale cannot matter). */
export function normaliseCode(value: string): string {
  return value.trim().toUpperCase();
}

/** 2 to 10 letters, digits and hyphens, no hyphen at either end. Matched against the trimmed value. */
export const BRANCH_CODE_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,8}[A-Za-z0-9])$/;

/** E.164 as the backend checks it (`^\+?[1-9]\d{1,14}$`), on an already-normalised value. */
export const PHONE_PATTERN = /^\+?[1-9]\d{1,14}$/;

export const NAME_MAX = 100;
export const DESCRIPTION_MAX = 500;
export const ADDRESS_MAX = 200;

export function branchCodeError(value: string): 'required' | 'pattern' | null {
  if (value.trim() === '') return 'required';
  return BRANCH_CODE_PATTERN.test(value.trim()) ? null : 'pattern';
}

/** Required (not blank) and at most 100 characters, the length measured as sent (untrimmed). */
export function nameError(value: string): 'required' | 'max' | null {
  if (value.trim() === '') return 'required';
  return value.length > NAME_MAX ? 'max' : null;
}

/** At most 500 characters, untrimmed, as the backend validates before trimming. */
export function descriptionError(value: string): 'max' | null {
  return value.length > DESCRIPTION_MAX ? 'max' : null;
}

export function addressError(value: string): 'required' | 'max' | null {
  if (value.trim() === '') return 'required';
  return value.length > ADDRESS_MAX ? 'max' : null;
}

/**
 * Takes the phone number **after** the form's phone normalisation (F2's `normalizePhone`), so
 * "+1 415 555 0123" is accepted and sent as "+14155550123".
 */
export function phoneError(normalised: string): 'required' | 'pattern' | null {
  if (normalised === '') return 'required';
  return PHONE_PATTERN.test(normalised) ? null : 'pattern';
}
