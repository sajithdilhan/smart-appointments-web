import { DestroyRef, Signal, inject, signal } from '@angular/core';
import { CLOCK } from '../../../core/util/clock';

export const MINUTE_MS = 60_000;

/**
 * The current instant as epoch milliseconds, refreshed on every minute boundary (the first tick
 * waits only until the next boundary). It drives the "Open now" badge and the branch-day
 * rollover of the date strip (Req 2.5, 4.7). Injection context required; the timer is cleared
 * when its owner is destroyed.
 */
export function createMinuteClock(): Signal<number> {
  const clock = inject(CLOCK);
  const now = signal(clock.now());
  let cancel: (() => void) | null = null;

  const arm = (): void => {
    const wait = MINUTE_MS - (clock.now() % MINUTE_MS);
    cancel = clock.setTimer(() => {
      cancel = null;
      now.set(clock.now());
      arm();
    }, wait);
  };
  arm();
  inject(DestroyRef).onDestroy(() => cancel?.());
  return now.asReadonly();
}
