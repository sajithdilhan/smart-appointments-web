import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';

/**
 * A visually hidden polite live region that says the new page title after each navigation, so
 * a screen reader user learns that the page changed. The title strategy runs right after
 * `NavigationEnd`, so the title is read one microtask later.
 */
@Component({
  selector: 'app-route-announcer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="sr-only" role="status" aria-live="polite">{{ text() }}</div>`,
})
export class RouteAnnouncer {
  private readonly document = inject(DOCUMENT);
  protected readonly text = signal('');

  constructor() {
    const subscription = inject(Router).events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        queueMicrotask(() => this.text.set(this.document.title));
      }
    });
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }
}
