import { diffDays } from '../../../core/time';

/** Pure slot-generation rules. Dates are `yyyy-MM-dd` calendar dates in the branch's zone. */

export const CAPACITY_MIN = 1;
export const CAPACITY_MAX = 100;
/** The backend rejects `toDate - fromDate >= 31`, so at most 30 days apart (31 dates). */
export const MAX_DAYS_APART = 30;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isDateString(value: string): boolean {
  return DATE_PATTERN.test(value);
}

export function dateRequiredError(value: string): 'required' | null {
  return isDateString(value) ? null : 'required';
}

/** `order` when `to < from`, `span` when more than 30 days apart; `null` while either date is missing. */
export function dateRangeError(from: string, to: string): 'order' | 'span' | null {
  if (!isDateString(from) || !isDateString(to)) return null;
  const apart = diffDays(from, to);
  if (apart < 0) return 'order';
  return apart > MAX_DAYS_APART ? 'span' : null;
}

export function capacityError(value: number): 'range' | null {
  return Number.isInteger(value) && value >= CAPACITY_MIN && value <= CAPACITY_MAX ? null : 'range';
}
