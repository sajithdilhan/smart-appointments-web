import type { Role } from './session.model';

const LANDING: Record<Role, string> = {
  Customer: '/book',
  Admin: '/admin',
  Staff: '/staff',
};

/** Where each role lands after signing in (unless a safe returnUrl exists). */
export const landingRouteFor = (role: Role): string => LANDING[role];
