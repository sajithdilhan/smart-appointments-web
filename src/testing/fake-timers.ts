import { vi } from 'vitest';

/**
 * Fake timers for the F1 specs: timers and `Date` are faked, while `queueMicrotask`, `nextTick`
 * and `setImmediate` stay real so MSW and promises still resolve. Advance with
 * `vi.advanceTimersByTimeAsync`.
 */
export function useFakeTimers(): void {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  });
}
