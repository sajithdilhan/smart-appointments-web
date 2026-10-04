import { InjectionToken } from '@angular/core';

/** Injectable time source for code that stores deadlines (refresh scheduler, countdown). */
export interface Clock {
  now(): number;
  /** Runs `fn` after `ms`; returns a function that cancels the timer. */
  setTimer(fn: () => void, ms: number): () => void;
}

export const CLOCK = new InjectionToken<Clock>('CLOCK', {
  providedIn: 'root',
  factory: () => ({
    now: () => Date.now(),
    setTimer: (fn, ms) => {
      const id = setTimeout(fn, ms);
      return () => clearTimeout(id);
    },
  }),
});
