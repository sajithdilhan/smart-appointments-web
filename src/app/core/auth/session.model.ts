/** The single definition of the roles; the generated schema types are not trusted for guards. */
export const ROLES = ['Customer', 'Staff', 'Admin'] as const;
export type Role = (typeof ROLES)[number];

export type SessionStatus = 'unknown' | 'anonymous' | 'authenticated';

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
  firstName?: string;
  lastName?: string;
  /** The Staff member's branch (the `branch_id` claim); never set for Customer or Admin. */
  branchId?: string;
}
