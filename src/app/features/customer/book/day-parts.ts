import type { SlotResponse } from '../../../core/api/models';

export type DayPart = 'morning' | 'afternoon' | 'evening';

export interface SlotGroup {
  part: DayPart;
  heading: string;
  slots: SlotResponse[];
}

const HEADINGS: Record<DayPart, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};
const ORDER: readonly DayPart[] = ['morning', 'afternoon', 'evening'];

/** By the hour of the branch-local time string ("09:30:00"), never recomputed from UTC. */
export function partOfDay(localStartTime: string): DayPart {
  const hour = Number(localStartTime.slice(0, 2));
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

/** Non-empty groups in day order; slots inside a group are sorted by `startAtUtc`. */
export function groupSlots(slots: readonly SlotResponse[]): SlotGroup[] {
  const sorted = [...slots].sort((a, b) => a.startAtUtc.localeCompare(b.startAtUtc));
  return ORDER.map((part) => ({
    part,
    heading: HEADINGS[part],
    slots: sorted.filter((s) => partOfDay(s.localStartTime) === part),
  })).filter((g) => g.slots.length > 0);
}

/** "N left" for 3 or fewer free places; nothing above that (the total is never shown). */
export function capacityHint(availableCapacity: number): string | null {
  return availableCapacity >= 1 && availableCapacity <= 3 ? `${availableCapacity} left` : null;
}
