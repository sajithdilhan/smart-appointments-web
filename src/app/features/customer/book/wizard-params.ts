import type { ParamMap } from '@angular/router';
import type { BranchResponse, ServiceTypeResponse, SlotResponse } from '../../../core/api/models';
import { addDays, diffDays } from '../../../core/time';
import { hasSchedule } from '../shared/branch-schedule';

export interface WizardParams {
  branch?: string;
  service?: string;
  date?: string;
  slot?: string;
  done?: true;
}

/** What the URL is resolved against; `null` means "not loaded yet", so its rules are skipped. */
export interface Resolution {
  branches: readonly BranchResponse[] | null;
  services: readonly ServiceTypeResponse[] | null;
  slots: readonly SlotResponse[] | null;
  /** Today's calendar date in the selected branch's zone, once the branch is resolved. */
  todayInBranch: string | null;
  branchZone: string | null;
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;
/** The strip shows today and the 13 days after it. */
export const LAST_DAY_OFFSET = 13;

/** Trims, keeps only the known keys, and drops ids that are not GUIDs. */
export function parseParams(q: ParamMap): WizardParams {
  const result: WizardParams = {};
  const read = (key: string) => q.get(key)?.trim() || undefined;
  const branch = read('branch');
  const service = read('service');
  const date = read('date');
  const slot = read('slot');
  if (branch && GUID.test(branch)) result.branch = branch;
  if (service && GUID.test(service)) result.service = service;
  if (date) result.date = date;
  if (slot && GUID.test(slot)) result.slot = slot;
  if (read('done') === '1') result.done = true;
  return result;
}

/** A real `yyyy-MM-dd` calendar date (rejects 2026-02-30 and 2026-13-01). */
export function isCalendarDate(value: string): boolean {
  return DATE_SHAPE.test(value) && addDays(value, 0) === value;
}

/**
 * The ordered repair cascade (Req 1.4): each rule that fails drops its parameter and every
 * later one (`branch`, `service`, `date`, then `slot` and `done`), so Back never loops and the
 * earliest still-valid step shows. A parameter whose predecessor is absent is dropped as well
 * (a `service` with no `branch`). Rules whose data is `null` (not loaded) are skipped.
 */
export function repairParams(
  p: WizardParams,
  r: Resolution,
  hasBooking: boolean,
): { params: WizardParams; changed: boolean } {
  const params: WizardParams = {};

  const branchOk =
    p.branch !== undefined &&
    (r.branches === null || r.branches.some((b) => b.id === p.branch && hasSchedule(b)));
  if (!branchOk) return finish(p, params);
  params.branch = p.branch;

  const serviceOk =
    p.service !== undefined && (r.services === null || r.services.some((s) => s.id === p.service));
  if (!serviceOk) return finish(p, params);
  params.service = p.service;

  const dateOk =
    p.date !== undefined &&
    isCalendarDate(p.date) &&
    (r.todayInBranch === null ||
      (diffDays(r.todayInBranch, p.date) >= 0 &&
        diffDays(r.todayInBranch, p.date) <= LAST_DAY_OFFSET));
  if (!dateOk) return finish(p, params);
  params.date = p.date;

  if (p.slot !== undefined) {
    if (r.slots !== null && !r.slots.some((s) => s.id === p.slot)) return finish(p, params);
    params.slot = p.slot;
  }
  if (p.done && hasBooking) params.done = true;
  return finish(p, params);
}

function finish(
  original: WizardParams,
  repaired: WizardParams,
): { params: WizardParams; changed: boolean } {
  const keys: (keyof WizardParams)[] = ['branch', 'service', 'date', 'slot', 'done'];
  const changed = keys.some((k) => original[k] !== repaired[k]);
  return { params: repaired, changed };
}

/** The full query object for a navigation: never merged, so a stale parameter cannot leak. */
export function buildParams(p: WizardParams): Record<string, string> {
  const query: Record<string, string> = {};
  if (p.branch) query['branch'] = p.branch;
  if (p.service) query['service'] = p.service;
  if (p.date) query['date'] = p.date;
  if (p.slot) query['slot'] = p.slot;
  if (p.done) query['done'] = '1';
  return query;
}
