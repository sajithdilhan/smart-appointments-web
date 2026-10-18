import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { BrandMark } from '@app/shared/ui/brand-mark';
import { HlmButtonImports } from '@app/shared/ui/button';
import { ThemeToggle } from '@app/shared/ui/theme-toggle';
import { landingCtas } from '../../../core/auth/landing-cta';
import { SessionStore } from '../../../core/auth/session.store';
import { SkipLink } from '../skip-link';

/**
 * Frame of the pages anyone may open: header (name, theme toggle, the sign-in calls to
 * action), the main landmark and a footer. Content is projected; the router outlet is the
 * default, which lets the 404 page render inside this shell.
 */
@Component({
  selector: 'app-public-shell',
  imports: [BrandMark, HlmButtonImports, RouterLink, RouterOutlet, SkipLink, ThemeToggle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-skip-link />
    <div class="flex min-h-dvh flex-col bg-background text-foreground">
      <header class="border-b border-border">
        <div
          class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
        >
          <a routerLink="/" class="text-lg"><app-brand-mark [collapseOnPhone]="true" /></a>
          <div class="flex flex-wrap items-center gap-3">
            <app-theme-toggle />
            <nav aria-label="Account" class="flex items-center gap-2">
              @for (link of links(); track link.href) {
                <a hlmBtn [variant]="link.variant" [routerLink]="link.href">{{ link.label }}</a>
              }
            </nav>
          </div>
        </div>
      </header>
      <main id="main-content" tabindex="-1" class="flex-1 outline-none">
        <ng-content><router-outlet /></ng-content>
      </main>
      <footer class="border-t border-border">
        <p class="mx-auto max-w-6xl px-4 py-4 text-sm text-muted-foreground">
          Smart Appointments. A portfolio project.
        </p>
      </footer>
    </div>
  `,
})
export class PublicShell {
  private readonly session = inject(SessionStore);
  private readonly ctas = landingCtas();

  /** Anonymous: "Sign in" and "Create account". Signed in: the dashboard link only. */
  protected readonly links = computed(() => {
    const { primary, secondary } = this.ctas();
    return this.session.status() === 'authenticated' || secondary === null
      ? [{ label: primary.label, href: primary.href, variant: 'default' as const }]
      : [
          { label: 'Sign in', href: secondary.href, variant: 'outline' as const },
          { label: 'Create account', href: primary.href, variant: 'default' as const },
        ];
  });
}
