/** Removes the separators people type (spaces, dashes, parentheses). */
export const normalizePhone = (raw: string): string => raw.replace(/[\s\-()]/g, '');

/** E.164: an optional plus, a non-zero first digit and 2 to 15 digits in total. */
export const isE164 = (s: string): boolean => /^\+?[1-9]\d{1,14}$/.test(s);
