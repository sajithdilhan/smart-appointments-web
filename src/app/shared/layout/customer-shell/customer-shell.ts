import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCalendarDays, lucideCalendarPlus, lucideUser } from '@ng-icons/lucide';
import { ThemeToggle } from '@app/shared/ui/theme-toggle';
import { ViewportService } from '../../../core/util/viewport.service';
import { SkipLink } from '../skip-link';
import { UserMenu } from '../user-menu';

interface NavItem {
  readonly label: string;
  readonly href: string;
  readonly icon: string;
}

/**
 * Frame of the customer area. From 768 px wide: a sticky top bar with the three destinations.
 * Below: a compact top bar plus a fixed bottom tab bar (44 px targets, safe-area padding). The
 * viewport decides with `@if`, so there is exactly one `<nav>`. Content is projected; the
 * router outlet is the default, which lets the 404 page render inside this shell.
 */
@Component({
  selector: 'app-customer-shell',
  imports: [NgIcon, RouterLink, RouterLinkActive, RouterOutlet, SkipLink, ThemeToggle, UserMenu],
  providers: [provideIcons({ lucideCalendarDays, lucideCalendarPlus, lucideUser })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-skip-link />
    <div class="flex min-h-dvh flex-col bg-background text-foreground">
      @if (viewport.isMd()) {
        <header class="sticky top-0 z-40 border-b border-border bg-background">
          <div class="mx-auto flex max-w-6xl items-center gap-6 px-4 py-2">
            <a routerLink="/book" class="text-lg font-semibold tracking-tight">
              Smart Appointments
            </a>
            <nav aria-label="Main" class="flex flex-1 items-center gap-1">
              @for (item of items; track item.href) {
                <a
                  [routerLink]="item.href"
                  routerLinkActive="text-primary bg-muted"
                  ariaCurrentWhenActive="page"
                  class="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted"
                >
                  {{ item.label }}
                </a>
              }
            </nav>
            <app-theme-toggle />
            <app-user-menu />
          </div>
        </header>
      } @else {
        <header class="sticky top-0 z-40 border-b border-border bg-background">
          <div class="flex items-center justify-between gap-2 px-4 py-2">
            <a routerLink="/book" class="font-semibold tracking-tight">Smart Appointments</a>
            <div class="flex items-center gap-2">
              <app-theme-toggle />
              <app-user-menu />
            </div>
          </div>
        </header>
      }

      <main
        id="main-content"
        tabindex="-1"
        class="flex-1 outline-none"
        [class.pb-[calc(4rem+env(safe-area-inset-bottom))]]="!viewport.isMd()"
      >
        <ng-content><router-outlet /></ng-content>
      </main>

      @if (!viewport.isMd()) {
        <nav
          aria-label="Main"
          class="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"
        >
          @for (item of items; track item.href) {
            <a
              [routerLink]="item.href"
              routerLinkActive="text-primary"
              ariaCurrentWhenActive="page"
              class="flex min-h-14 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 px-2 text-xs font-medium"
            >
              <ng-icon [name]="item.icon" size="20" aria-hidden="true" />
              {{ item.label }}
            </a>
          }
        </nav>
      }
    </div>
  `,
})
export class CustomerShell {
  protected readonly viewport = inject(ViewportService);

  protected readonly items: readonly NavItem[] = [
    { label: 'Book', href: '/book', icon: 'lucideCalendarPlus' },
    { label: 'My appointments', href: '/appointments', icon: 'lucideCalendarDays' },
    { label: 'Profile', href: '/profile', icon: 'lucideUser' },
  ];
}
