import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, Injector, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiClient } from '../api/api-client';
import type { AppError } from './app-error';
import { OUTAGE_PROBE } from './http-context';

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

  // Resolved lazily: the error interceptor injects this service, so it must not need
  // HttpClient while it is being constructed.
  private readonly injector = inject(Injector);

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

  /**
   * The banner's Retry: probes `GET /healthz` (a `Healthy` or `Degraded` 200 both mean
   * reachable). On success the outage clears (through the pipeline) and the current route is
   * re-navigated so its data reloads; on failure the banner stays.
   */
  async retry(): Promise<void> {
    if (this.probing()) return;
    this.probing.set(true);
    try {
      const api = this.injector.get(ApiClient);
      const context = new HttpContext().set(OUTAGE_PROBE, true);
      await firstValueFrom(
        this.injector.get(HttpClient).get(api.url('/healthz'), { context, responseType: 'text' }),
      );
      const router = this.injector.get(Router);
      await router.navigateByUrl(router.url, { onSameUrlNavigation: 'reload' });
    } catch {
      /* still unreachable: the banner stays */
    } finally {
      this.probing.set(false);
    }
  }

  private clear(): void {
    if (!this.down()) return;
    this.down.set(false);
    this.recovered.update((n) => n + 1);
  }
}
