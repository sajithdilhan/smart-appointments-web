import { sessionSafe, type SafeStorage } from '../../../core/util/safe-storage';

export const JUST_BOOKED_KEY = 'sa.book.justBooked';
export const JUST_BOOKED_TTL_MS = 10 * 60_000;

/** Remembers, for 10 minutes, that a booking just succeeded (Req 9.7). */
export function markJustBooked(nowMs: number, storage: SafeStorage = sessionSafe): void {
  storage.set(JUST_BOOKED_KEY, String(nowMs));
}

/** True once when the marker exists and is younger than 10 minutes; always removes it. */
export function consumeJustBooked(nowMs: number, storage: SafeStorage = sessionSafe): boolean {
  const raw = storage.get(JUST_BOOKED_KEY);
  if (raw === null) return false;
  storage.remove(JUST_BOOKED_KEY);
  const at = /^\d+$/.test(raw) ? Number(raw) : NaN;
  return Number.isFinite(at) && nowMs >= at && nowMs - at < JUST_BOOKED_TTL_MS;
}
