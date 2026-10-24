import { DestroyRef, Injector, effect, inject, signal, type Signal } from '@angular/core';
import { CLOCK, type Clock } from './clock';

export interface NowSignal {
  /** The clock time (ms since the epoch) as of the last deadline that passed or the last change of the deadlines. */
  readonly now: Signal<number>;
  /**
   * Follows `deadlines` (ms since the epoch). One timer is kept, for the smallest deadline still
   * in the future; when it fires `now` moves to the clock time and the timer is re-armed for the
   * next one. No timer runs when there is no future deadline. Call it once, in an injection
   * context.
   */
  watch(deadlines: Signal<readonly number[]>): void;
}

/**
 * A `now` that only changes when something that depends on it can change: a start time passes.
 * It never polls. Built on the injected `CLOCK`, so tests drive it with `ManualClock`.
 */
export function createNowSignal(clock: Clock = inject(CLOCK)): NowSignal {
  const injector = inject(Injector);
  const destroyRef = inject(DestroyRef);
  const now = signal(clock.now());
  let cancel: (() => void) | null = null;

  const disarm = () => {
    cancel?.();
    cancel = null;
  };

  const arm = (deadlines: readonly number[]) => {
    disarm();
    const current = clock.now();
    now.set(current);
    let next = Infinity;
    for (const d of deadlines) if (d > current && d < next) next = d;
    if (next === Infinity) return;
    cancel = clock.setTimer(() => {
      cancel = null;
      arm(deadlines);
    }, next - current);
  };

  destroyRef.onDestroy(disarm);

  return {
    now: now.asReadonly(),
    watch(deadlines) {
      effect(() => arm(deadlines()), { injector });
    },
  };
}
