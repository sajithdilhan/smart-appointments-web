import type { BranchResponse } from '../../../core/api/models';
import type { BranchSchedule } from '../../../core/time';

/** A branch is bookable online only with a time zone and at least one working-hours entry. */
export function hasSchedule(b: BranchResponse): boolean {
  return !!b.timeZoneId?.trim() && (b.workingHours?.length ?? 0) > 0;
}

/** The shape `core/time` takes (`todaysHours`, `isOpenNow`); `null` for a branch with no schedule. */
export function toSchedule(b: BranchResponse): BranchSchedule | null {
  return hasSchedule(b)
    ? { timeZoneId: b.timeZoneId!.trim(), workingHours: b.workingHours! }
    : null;
}
