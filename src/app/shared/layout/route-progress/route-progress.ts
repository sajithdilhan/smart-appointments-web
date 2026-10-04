import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  NavigationStart,
  Router,
} from '@angular/router';

/** A navigation shorter than this never shows the bar. */
export const PROGRESS_DELAY_MS = 150;

/**
 * A thin bar at the top while a navigation (lazy chunk, guards) takes longer than 150 ms.
 * Decorative, so it is hidden from assistive technology; the route announcer covers the result.
 */
@Component({
  selector: 'app-route-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <div
        class="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-transparent"
        aria-hidden="true"
      >
        <div class="h-full w-1/3 animate-pulse bg-primary"></div>
      </div>
    }
  `,
})
export class RouteProgress {
  protected readonly visible = signal(false);
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const subscription = inject(Router).events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.stop();
        this.timer = setTimeout(() => this.visible.set(true), PROGRESS_DELAY_MS);
      } else if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError ||
        event instanceof NavigationSkipped
      ) {
        this.stop();
      }
    });
    inject(DestroyRef).onDestroy(() => {
      subscription.unsubscribe();
      this.stop();
    });
  }

  private stop(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.visible.set(false);
  }
}
