import type { StaffAccount } from '../../../core/api/models';
import { formatInZone } from '../../../core/time';
import { isGuid } from '../data/resolvers';
import type { StaffFilter } from '../data/staff-accounts.store';

export type StaffStatusParam = 'all' | 'active' | 'inactive';

export const fullName = (a: Pick<StaffAccount, 'firstName' | 'lastName'>): string =>
  `${a.firstName} ${a.lastName}`;

/** The registration date in the viewer's own zone. */
export function registeredLabel(registeredAtUtc: string): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return formatInZone(registeredAtUtc, zone, { style: 'date' });
}

/** Anything but `active` or `inactive` (a hand-edited URL) means All. */
export function parseStatusParam(value: string | null | undefined): StaffStatusParam {
  return value === 'active' || value === 'inactive' ? value : 'all';
}

const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';

/** A branch id is kept only when it is a GUID (not the empty one); anything else means All. */
export function parseBranchParam(value: string | null | undefined): string | null {
  return isGuid(value) && value !== EMPTY_GUID ? value : null;
}

export function toFilter(branch: string | null | undefined, status: string | null | undefined) {
  const parsedStatus = parseStatusParam(status);
  const filter: StaffFilter = {
    branchId: parseBranchParam(branch),
    isActive: parsedStatus === 'all' ? null : parsedStatus === 'active',
  };
  return filter;
}

export const sameStaffFilter = (a: StaffFilter, b: StaffFilter): boolean =>
  a.branchId === b.branchId && a.isActive === b.isActive;
