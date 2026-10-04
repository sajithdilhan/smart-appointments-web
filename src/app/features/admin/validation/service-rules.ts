/** Pure service-type field rules; name and description are the branch rules. */
export { descriptionError, nameError, normaliseCode } from './branch-rules';

/** 2 to 30 letters, digits, hyphens and underscores, no hyphen or underscore at either end. */
export const SERVICE_CODE_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,28}[A-Za-z0-9])$/;

export const DURATION_MIN = 5;
export const DURATION_MAX = 480;
export const DURATION_STEP = 5;

export function serviceCodeError(value: string): 'required' | 'pattern' | null {
  if (value.trim() === '') return 'required';
  return SERVICE_CODE_PATTERN.test(value.trim()) ? null : 'pattern';
}

/**
 * `range` when not an integer or outside 5..480, otherwise `step` when not a multiple of 5. One
 * key per value (the first failing rule wins), where the backend may report both messages.
 */
export function durationError(value: number): 'range' | 'step' | null {
  if (!Number.isInteger(value) || value < DURATION_MIN || value > DURATION_MAX) return 'range';
  return value % DURATION_STEP === 0 ? null : 'step';
}
