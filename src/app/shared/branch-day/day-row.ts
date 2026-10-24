import type { BranchAppointment } from '../../core/api/models';
import { longDateLabel, parseUtc, timeHm, zonedParts } from '../../core/time';

/** Shown when a service id cannot be resolved (the customer views use the same words). */
export const UNAVAILABLE_SERVICE = 'Unavailable service';
export const NAME_UNAVAILABLE = 'Name unavailable';

export interface RowContext {
  zone: string;
  services: ReadonlyMap<string, { name: string }>;
}

export interface BranchDayRow {
  id: string;
  status: string;
  startUtc: string;
  startMs: number;
  /** 24-hour `HH:mm` in the branch zone. */
  startLabel: string;
  endLabel: string;
  /** "10:30 to 11:00". */
  timeRange: string;
  /** "Friday 24 October 2026", the branch-zone day of the start. */
  dateLabel: string;
  durationMinutes: number;
  customerName: string | null;
  phone: string | null;
  serviceName: string;
  createdAtUtc: string;
  cancelledAtUtc: string | null;
  completedAtUtc: string | null;
  noShowAtUtc: string | null;
  /** Complete and No-show are offered only for Booked rows (Req 3.1). */
  canMark: boolean;
}

/** The one place an appointment of the day list becomes display data (Req 2.4, 2.7). */
export function toRow(item: BranchAppointment, ctx: RowContext): BranchDayRow {
  const start = parseUtc(item.startUtc);
  const end = parseUtc(item.endUtc);
  const startLabel = timeHm(start, ctx.zone);
  const endLabel = timeHm(end, ctx.zone);
  const customer = item.customer;
  return {
    id: item.id,
    status: item.status,
    startUtc: item.startUtc,
    startMs: start.getTime(),
    startLabel,
    endLabel,
    timeRange: `${startLabel} to ${endLabel}`,
    dateLabel: longDateLabel(zonedParts(ctx.zone, start).date),
    durationMinutes: Math.round((end.getTime() - start.getTime()) / 60_000),
    customerName: customer ? `${customer.firstName} ${customer.lastName}`.trim() : null,
    phone: customer?.phoneNumber ? customer.phoneNumber : null,
    serviceName: ctx.services.get(item.serviceTypeId)?.name ?? UNAVAILABLE_SERVICE,
    createdAtUtc: item.createdAtUtc,
    cancelledAtUtc: item.cancelledAtUtc ?? null,
    completedAtUtc: item.completedAtUtc ?? null,
    noShowAtUtc: item.noShowAtUtc ?? null,
    canMark: item.status === 'Booked',
  };
}
