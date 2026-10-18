import type { SlotResponse } from '../../../core/api/models';

export const SLOT_FRESH_MS = 60_000;

export interface CachedSlots {
  slots: SlotResponse[];
  fetchedAt: number;
  /** Younger than 60 s: served without a request. */
  fresh: boolean;
}

export interface SlotKey {
  branchId: string;
  serviceId: string;
  date: string;
}

/** `branchId|serviceId|date`, so `dropBefore` can read the date back. */
export function slotCacheKey(key: SlotKey): string {
  return `${key.branchId}|${key.serviceId}|${key.date}`;
}

/** Slot lists per (branch, service, date) with a 60 s freshness window (Req 5.3). */
export class SlotCache {
  private readonly entries = new Map<string, { slots: SlotResponse[]; fetchedAt: number }>();

  get(key: string, now: number): CachedSlots | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    return { ...entry, fresh: now - entry.fetchedAt < SLOT_FRESH_MS };
  }

  set(key: string, slots: SlotResponse[], now: number): void {
    this.entries.set(key, { slots, fetchedAt: now });
  }

  invalidate(key: string): void {
    this.entries.delete(key);
  }

  /** Drops every entry for a date before `date` (the branch day rolled over). */
  dropBefore(date: string): void {
    for (const key of [...this.entries.keys()]) {
      if (key.slice(key.lastIndexOf('|') + 1) < date) this.entries.delete(key);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}
