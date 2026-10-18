import { isE164, normalizePhone } from './phone';

/** A generic field rule: returns an error key, or null when the value passes. */
export type FieldRule = (value: string) => string | null;

// The HTML living-standard pattern, the one Angular's Validators.email uses.
const EMAIL =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

export const requiredTrimmed: FieldRule = (v) => (v.trim() === '' ? 'required' : null);

export const maxTrimmed =
  (max: number): FieldRule =>
  (v) =>
    v.trim().length > max ? 'maxlength' : null;

/** Empty values pass: pair it with `requiredTrimmed`. */
export const email: FieldRule = (v) => (v.trim() === '' || EMAIL.test(v.trim()) ? null : 'email');

/** Checked on the normalised number. Empty values pass: pair it with `requiredTrimmed`. */
export const phone: FieldRule = (v) => {
  const n = normalizePhone(v.trim());
  return n === '' || isE164(n) ? null : 'pattern';
};
