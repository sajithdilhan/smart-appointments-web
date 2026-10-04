import { ROLES, type Role } from './session.model';

export interface AccessClaims {
  sub: string;
  email: string;
  role: Role;
  /** Expiry in seconds since the epoch, exactly as in the token. */
  exp: number;
}

/**
 * Reads the four claims the SPA needs from an access token. The signature is NOT verified (the
 * server does that), so the result is untrusted display and routing data only. Tolerates a
 * missing base64 padding and non-ASCII characters (UTF-8). Returns null for anything malformed,
 * lacking `sub`, `email` or `exp`, or carrying a role other than Customer, Staff or Admin.
 */
export function decodeAccessToken(token: string): AccessClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
    const { sub, email, exp, role } = payload;
    if (typeof sub !== 'string' || typeof email !== 'string' || typeof exp !== 'number') {
      return null;
    }
    if (!(ROLES as readonly unknown[]).includes(role)) return null;
    return { sub, email, role: role as Role, exp };
  } catch {
    return null;
  }
}
