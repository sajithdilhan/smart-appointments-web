import { Injectable, signal } from '@angular/core';
import type { AppError } from './app-error';

/**
 * Whether the backend looks unreachable. Set by 502/503/504, network failures and timeouts;
 * cleared by any later HTTP response below 500. A failed `/healthz` probe never sets it.
 */
@Injectable({ providedIn: 'root' })
export class OutageState {
  readonly down = signal(false);
  readonly probing = signal(false);
  /** Incremented each time `down` goes from true to false, so data not keyed on the router can reload. */
  readonly recovered = signal(0);

  onError(error: AppError, probe: boolean): void {
    const outage =
      error.kind === 'unavailable' || error.kind === 'network' || error.kind === 'timeout';
    if (outage) {
      if (!probe) this.down.set(true);
    } else if (error.status > 0 && error.status < 500) {
      this.clear();
    }
  }

  onResponse(status: number): void {
    if (status < 500) this.clear();
  }

  private clear(): void {
    if (!this.down()) return;
    this.down.set(false);
    this.recovered.update((n) => n + 1);
  }
}
