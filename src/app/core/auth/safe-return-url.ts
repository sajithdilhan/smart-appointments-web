// Matching control characters is the point of this check.
// eslint-disable-next-line no-control-regex
const CONTROL_OR_BACKSLASH = /[\u0000-\u001f\u007f\\]/;
const ONE_LEADING_SLASH = /^\/(?![/\\])/;
const AUTH_LOOP = /^\/(login|register)(?![A-Za-z0-9_-])/i;

/** Structural checks shared by the raw value and its percent-decoded form. */
function structurallySafe(value: string): boolean {
  return (
    ONE_LEADING_SLASH.test(value) && !CONTROL_OR_BACKSLASH.test(value) && !AUTH_LOOP.test(value)
  );
}

/**
 * The only code that turns a `returnUrl` query value into a navigation target. Returns the
 * input only when it is an in-app path (one leading slash, no control characters or backslash,
 * not /login or /register, same origin once resolved, also after percent-decoding); otherwise
 * null and the caller uses the role landing.
 */
export function safeReturnUrl(raw: unknown, origin: string = location.origin): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return null;
  if (!structurallySafe(raw)) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null; // malformed percent-encoding
  }
  if (!structurallySafe(decoded)) return null;
  try {
    if (new URL(raw, origin).origin !== origin) return null;
  } catch {
    return null;
  }
  return raw;
}
