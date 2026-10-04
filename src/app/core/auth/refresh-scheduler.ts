import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject } from '@angular/core';
import { CLOCK } from '../util/clock';
import { refreshDelayMs } from './refresh-schedule';

/**
 * Owns the one proactive-refresh timer. It fires the callback it was given at
 * `exp - 60 s`, recomputes from the deadline when the tab becomes visible (background tabs
 * throttle timers), and never refreshes twice within 5 seconds.
 */
@Injectable({ providedIn: 'root' })
export class RefreshScheduler {
  private readonly clock = inject(CLOCK);
  private readonly document = inject(DOCUMENT);
  private cancelTimer: (() => void) | null = null;
  private expMs: number | null = null;
  private onDue: (() => void) | null = null;
  private lastRefreshAtMs: number | null = null;

  constructor() {
    const listener = () => {
      if (this.document.visibilityState === 'visible') this.reschedule();
    };
    this.document.addEventListener('visibilitychange', listener);
    inject(DestroyRef).onDestroy(() => {
      this.document.removeEventListener('visibilitychange', listener);
      this.stop();
    });
  }

  /** Replaces any earlier timer. */
  schedule(expMs: number, onDue: () => void): void {
    this.expMs = expMs;
    this.onDue = onDue;
    this.arm(refreshDelayMs(expMs, this.clock.now(), this.lastRefreshAtMs));
  }

  /** Re-arms after a refresh that could not run yet (for example a 429 block). */
  scheduleAfter(delayMs: number): void {
    if (this.expMs === null || this.onDue === null) return;
    this.arm(Math.max(0, delayMs));
  }

  /** Records a completed refresh for the minimum-gap rule. */
  markRefreshed(): void {
    this.lastRefreshAtMs = this.clock.now();
  }

  cancel(): void {
    this.stop();
    this.expMs = null;
    this.onDue = null;
  }

  private reschedule(): void {
    if (this.expMs !== null && this.onDue !== null) this.schedule(this.expMs, this.onDue);
  }

  private arm(delayMs: number): void {
    this.stop();
    const onDue = this.onDue;
    this.cancelTimer = this.clock.setTimer(() => {
      this.cancelTimer = null;
      onDue?.();
    }, delayMs);
  }

  private stop(): void {
    this.cancelTimer?.();
    this.cancelTimer = null;
  }
}
