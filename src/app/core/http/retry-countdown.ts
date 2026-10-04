import { DestroyRef, Signal, computed, inject, signal } from '@angular/core';
import { CLOCK } from '../util/clock';

const TICK_MS = 250;
const DEFAULT_SECONDS = 60;

export interface RetryCountdown {
  /** Whole seconds left (ceil), 0 when idle. */
  readonly remaining: Signal<number>;
  readonly active: Signal<boolean>;
  /** Starts, or replaces, the countdown. A non-positive or non-numeric value is ignored. */
  start(seconds: number): void;
  cancel(): void;
  /** Starts from `retryAfterSeconds` when the error is a rate limit; otherwise does nothing. */
  startFrom(error: unknown): void;
}

/**
 * A deadline-based countdown for a rate-limited action. Remaining time is computed from the
 * clock, not by counting ticks, so a throttled background tab shows the right value when it
 * returns. The 250 ms tick runs only while a deadline is set. Injection context required
 * (it uses `CLOCK` and `DestroyRef`).
 */
export function createRetryCountdown(): RetryCountdown {
  const clock = inject(CLOCK);
  const deadline = signal<number | null>(null);
  const now = signal(clock.now());
  let cancelTimer: (() => void) | null = null;

  const remaining = computed(() => {
    const d = deadline();
    return d === null ? 0 : Math.max(0, Math.ceil((d - now()) / 1000));
  });
  const active = computed(() => deadline() !== null && remaining() > 0);

  function stopTimer(): void {
    cancelTimer?.();
    cancelTimer = null;
  }

  function arm(): void {
    stopTimer();
    cancelTimer = clock.setTimer(tick, TICK_MS);
  }

  function tick(): void {
    cancelTimer = null;
    const t = clock.now();
    now.set(t);
    const d = deadline();
    if (d !== null && t < d) arm();
    else deadline.set(null);
  }

  function start(seconds: number): void {
    const whole = Math.floor(seconds);
    if (!Number.isFinite(whole) || whole < 1) return;
    now.set(clock.now());
    deadline.set(clock.now() + whole * 1000);
    arm();
  }

  function cancel(): void {
    stopTimer();
    deadline.set(null);
  }

  inject(DestroyRef).onDestroy(stopTimer);

  return {
    remaining,
    active,
    start,
    cancel,
    startFrom(error: unknown): void {
      if (typeof error !== 'object' || error === null) return;
      const e = error as { kind?: unknown; retryAfterSeconds?: unknown };
      if (e.kind !== 'rate-limited') return;
      start(typeof e.retryAfterSeconds === 'number' ? e.retryAfterSeconds : DEFAULT_SECONDS);
    },
  };
}
