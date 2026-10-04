import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { HlmButtonImports } from '@app/shared/ui/button';
import { landingRouteFor } from '../../../core/auth/landing';
import { SessionStore } from '../../../core/auth/session.store';

/**
 * The 404 content. It never shows the requested URL, asks search engines not to index it
 * while it is displayed, and links to where the visitor belongs.
 */
@Component({
  selector: 'app-not-found',
  imports: [HlmButtonImports, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-xl flex-col items-start gap-4 p-6 py-16">
      <h1 class="text-3xl font-semibold tracking-tight">Page not found</h1>
      <p class="text-muted-foreground">
        We could not find that page. It may have moved, or the link may be out of date.
      </p>
      <a hlmBtn [routerLink]="target().href">{{ target().label }}</a>
    </div>
  `,
})
export class NotFoundPage {
  private readonly session = inject(SessionStore);

  protected readonly target = computed(() => {
    const role = this.session.role();
    return this.session.status() === 'authenticated' && role !== null
      ? { href: landingRouteFor(role), label: 'Go to my dashboard' }
      : { href: '/', label: 'Go to the home page' };
  });

  constructor() {
    const meta = inject(Meta);
    meta.addTag({ name: 'robots', content: 'noindex' });
    inject(DestroyRef).onDestroy(() => meta.removeTag('name="robots"'));
  }
}
