import { landingRouteFor } from './landing';
import { safeReturnUrl } from './safe-return-url';
import type { Role } from './session.model';

/** First path segment to the only role that may open it; other segments are open to everyone. */
const AREA_ROLE: Record<string, Role> = {
  admin: 'Admin',
  staff: 'Staff',
  book: 'Customer',
  appointments: 'Customer',
  profile: 'Customer',
};

export function roleCanOpen(role: Role, url: string): boolean {
  const segment = new URL(url, 'http://app.invalid').pathname.split('/')[1] ?? '';
  const owner = AREA_ROLE[segment.toLowerCase()];
  return owner === undefined || owner === role;
}

/**
 * Where to send a user after sign-in: a safe `returnUrl` the role may open, otherwise the
 * role's landing route, so the redirect never bounces off `roleGuard` and its toast.
 */
export function resolvePostLoginTarget(role: Role, rawReturnUrl: unknown): string {
  const safe = safeReturnUrl(rawReturnUrl);
  return safe !== null && roleCanOpen(role, safe) ? safe : landingRouteFor(role);
}

/** Exposed for the route-table drift test. */
export const AREA_ROLES: Readonly<Record<string, Role>> = AREA_ROLE;
