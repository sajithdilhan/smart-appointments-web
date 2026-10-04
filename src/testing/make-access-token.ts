import type { Role } from '../app/core/auth/session.model';

export interface AccessTokenOptions {
  sub: string;
  email: string;
  role: Role;
  expiresInSeconds: number;
  /** Issue time; defaults to `Date.now()` (which fake timers control). */
  nowMs?: number;
}

function base64Url(json: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(json));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A structurally valid JWT with a fixed fake signature: enough to exercise decode and expiry. */
export function makeAccessToken(options: AccessTokenOptions): string {
  const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: options.sub,
    email: options.email,
    role: options.role,
    iat: nowSeconds,
    jti: crypto.randomUUID(),
    exp: nowSeconds + options.expiresInSeconds,
  };
  return `${base64Url(header)}.${base64Url(payload)}.test-signature`;
}
