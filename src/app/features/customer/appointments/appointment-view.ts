import { formatInZone, parseUtc, zonedParts, zoneDiffersFromBrowser } from '../../../core/time';
import { isValidZone } from '../../../core/time/zone';
import {
  UNAVAILABLE_BRANCH,
  UNAVAILABLE_SERVICE,
  YOUR_TIME,
  type AppointmentGroup,
  type AppointmentResponse,
  type AppointmentTab,
  type AppointmentView,
  type BranchInfo,
  type ServiceInfo,
} from './appointment.model';

export interface ViewContext {
  branch?: BranchInfo | null;
  service?: ServiceInfo | null;
  /** The tab the item came from: past styling follows the server's filter, not the clock. */
  tab: AppointmentTab;
  now: Date;
  /** Test seam: the locale of the date and time text. */
  locale?: string;
}

function browserZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function shortZoneName(zone: string, at: Date, locale?: string): string {
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    timeZoneName: 'short',
  }).formatToParts(at);
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? zone;
}

/**
 * The one place an appointment becomes display data (Req 3, 4, 6.1, 7.1). Pure: all times go
 * through `parseUtc` and `formatInZone`; an unknown or invalid branch zone falls back to the
 * browser zone, labelled "your time" (never a silent UTC).
 */
export function toViewModel(a: AppointmentResponse, ctx: ViewContext): AppointmentView {
  const start = parseUtc(a.startUtc);
  const end = parseUtc(a.endUtc);
  const branchZone = ctx.branch?.timeZoneId?.trim();
  const zoneKnown = !!branchZone && isValidZone(branchZone);
  const zone = zoneKnown ? branchZone : null;
  const inZone = zone ?? browserZone();
  const options = { locale: ctx.locale };

  const differs = zone !== null && zoneDiffersFromBrowser(zone, start);
  const timeIn = (z: string, d: Date) => formatInZone(d, z, { ...options, style: 'time' });
  const timeRange = `${timeIn(inZone, start)} to ${timeIn(inZone, end)}`;
  const dateLabel = formatInZone(start, inZone, { ...options, style: 'date' });
  const statusLabel = a.status === 'NoShow' ? 'No-show' : a.status;
  const isPast = ctx.tab === 'past';
  const offerable = a.status === 'Booked' && start.getTime() > ctx.now.getTime();
  const serviceName = ctx.service?.name ?? UNAVAILABLE_SERVICE;
  const branchName = ctx.branch?.name ?? UNAVAILABLE_BRANCH;

  return {
    id: a.id,
    serviceName,
    branchName,
    status: a.status,
    statusLabel,
    zone,
    zoneKnown,
    dateKey: zonedParts(inZone, start).date,
    dateLabel,
    timeRange,
    zoneLabel: !zoneKnown ? YOUR_TIME : differs ? shortZoneName(zone, start, ctx.locale) : null,
    browserLine: differs ? `${timeIn(browserZone(), start)} ${YOUR_TIME}` : null,
    isPast,
    canCancel: offerable,
    canAddToCalendar: offerable,
    a11yName: [
      serviceName,
      branchName,
      `${dateLabel} ${timeRange}`,
      isPast && a.status === 'Booked' ? `${statusLabel} (past)` : statusLabel,
    ].join(', '),
  };
}

/**
 * Starts a new group whenever `dateKey` changes from the previous item, so the server order is
 * kept even when the same day appears twice far apart. Never sorts.
 */
export function groupByDate(views: readonly AppointmentView[]): AppointmentGroup[] {
  const groups: AppointmentGroup[] = [];
  for (const view of views) {
    const last = groups.at(-1);
    if (last && last.dateKey === view.dateKey) last.items.push(view);
    else groups.push({ dateKey: view.dateKey, dateLabel: view.dateLabel, items: [view] });
  }
  return groups;
}
