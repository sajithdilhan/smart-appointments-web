const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a string in the 8-4-4-4-12 hexadecimal GUID form (case-insensitive). */
export function isGuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && GUID.test(value);
}
