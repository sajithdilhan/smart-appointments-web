import type { AbstractControl } from '@angular/forms';

/** Per field name, how to normalise a string value (the code, the phone number, a time). */
export type Normalisers = Record<string, (value: string) => string>;

function canon(value: unknown, normalisers: Normalisers, key?: string): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return key && normalisers[key] ? normalisers[key](trimmed) : trimmed;
  }
  if (Array.isArray(value)) return value.map((v) => canon(v, normalisers));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canon((value as Record<string, unknown>)[k], normalisers, k)]),
    );
  }
  return value;
}

/**
 * A stable string of a form's meaningful value: strings trimmed, keys sorted, named fields
 * normalised. Two values that differ only cosmetically (case of a code, spaces in a phone number,
 * seconds in a time) give the same snapshot, so typing and deleting back is pristine again.
 */
export function formSnapshot(
  source: AbstractControl | unknown,
  normalisers: Normalisers = {},
): string {
  const value =
    source && typeof (source as AbstractControl).getRawValue === 'function'
      ? (source as AbstractControl).getRawValue()
      : source;
  return JSON.stringify(canon(value, normalisers));
}
