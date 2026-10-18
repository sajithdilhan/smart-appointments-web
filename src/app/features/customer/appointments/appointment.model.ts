import type { AppointmentResponse } from '../../../core/api/models';
import type { AppointmentTab } from './tab-params';

export type { AppointmentResponse, AppointmentTab };

/**
 * What the view model needs of a branch and a service. Structural on purpose: the full
 * `Branch`/`ServiceType` shapes belong to the reference-data lookup (F3), which satisfies these.
 */
export interface BranchInfo {
  name: string;
  timeZoneId?: string | null;
}

export interface ServiceInfo {
  name: string;
}

export const UNAVAILABLE_BRANCH = 'Unavailable branch';
export const UNAVAILABLE_SERVICE = 'Unavailable service';
/** The label for times shown in the browser's zone because the branch's zone is unknown. */
export const YOUR_TIME = 'your time';

export interface AppointmentView {
  id: string;
  serviceName: string;
  branchName: string;
  status: string;
  /** "Booked", "Cancelled" or the raw value of an unknown status. */
  statusLabel: string;
  /** IANA id used for the times; null means the browser zone. */
  zone: string | null;
  zoneKnown: boolean;
  /** `yyyy-MM-dd` in `zone ?? browser`, for grouping. */
  dateKey: string;
  dateLabel: string;
  timeRange: string;
  /** "BST" style short name when the zone differs, "your time" when unknown, else null. */
  zoneLabel: string | null;
  /** "14:00 your time", only when a known zone differs from the browser's. */
  browserLine: string | null;
  isPast: boolean;
  canCancel: boolean;
  canAddToCalendar: boolean;
  a11yName: string;
}

export interface AppointmentGroup {
  dateKey: string;
  dateLabel: string;
  items: AppointmentView[];
}
