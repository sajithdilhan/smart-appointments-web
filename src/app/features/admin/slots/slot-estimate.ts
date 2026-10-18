import {
  eachDate,
  localToUtc,
  todayInZone,
  weekdayOf,
  zoneOffsetMinutes,
  type DayName,
} from '../../../core/time';
import { minutesOf, normaliseTime } from '../validation/schedule-rules';

export interface Estimate {
  /** Calendar dates in the range. */
  days: number;
  /** Slots the backend would create before overlap checks. */
  slots: number;
  closedDays: number;
  /** Candidates dropped because they start at or before now. */
  droppedPast: number;
}

export interface EstimateInput {
  timeZoneId: string;
  hours: readonly { dayOfWeek: DayName; opensAt: string; closesAt: string }[];
  durationMinutes: number;
  fromDate: string;
  toDate: string;
  nowMs: number;
}

/** True when the zone's offset at the start of the local day differs from the end of it. */
function isTransitionDay(timeZoneId: string, date: string): boolean {
  const start = localToUtc(timeZoneId, date, 0).utcMs;
  const end = localToUtc(timeZoneId, date, 24 * 60 - 1).utcMs;
  return zoneOffsetMinutes(timeZoneId, start) !== zoneOffsetMinutes(timeZoneId, end);
}

/**
 * A port of the backend's `SlotPlanner.Plan`: what generation would create before the overlap
 * check. Same loop bounds (`start + duration <= closes`, no wrap past midnight). On an ordinary
 * future day the count is the closed form `floor((closes - opens) / duration)`; the exact,
 * per-candidate path (a gap is skipped, a start at or before now is dropped) runs only on days
 * where the answer can differ: today and earlier in the branch zone, and clock-change days.
 * It is an estimate: it does not know existing slots or the server's clock.
 */
export function estimateSlots(i: EstimateInput): Estimate {
  const byDay = new Map<DayName, { opens: number; closes: number }>();
  for (const h of i.hours) {
    byDay.set(h.dayOfWeek, {
      opens: minutesOf(normaliseTime(h.opensAt)),
      closes: minutesOf(normaliseTime(h.closesAt)),
    });
  }
  const dates = eachDate(i.fromDate, i.toDate);
  const result: Estimate = { days: dates.length, slots: 0, closedDays: 0, droppedPast: 0 };
  if (dates.length === 0) return result;
  const today = todayInZone(i.timeZoneId, i.nowMs);
  const duration = i.durationMinutes;

  for (const date of dates) {
    const h = byDay.get(weekdayOf(date));
    if (!h) {
      result.closedDays++;
      continue;
    }
    if (duration <= 0) continue;
    const exact = date <= today || isTransitionDay(i.timeZoneId, date);
    if (!exact) {
      result.slots += Math.max(0, Math.floor((h.closes - h.opens) / duration));
      continue;
    }
    for (let start = h.opens; start + duration <= h.closes; start += duration) {
      const local = localToUtc(i.timeZoneId, date, start);
      if (local.gap) continue; // a time skipped by a clock change does not exist
      if (local.utcMs <= i.nowMs) {
        result.droppedPast++;
        continue;
      }
      result.slots++;
    }
  }
  return result;
}
