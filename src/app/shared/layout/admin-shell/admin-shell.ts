import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBuilding2,
  lucideCalendarRange,
  lucideLayoutDashboard,
  lucideListChecks,
  lucideMenu,
  lucidePanelLeft,
  lucideSearch,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@app/shared/ui/button';
import { HlmSheet, HlmSheetImports } from '@app/shared/ui/sheet';
import { ThemeToggle } from '@app/shared/ui/theme-toggle';
import { PaletteLauncher } from '../../../core/ui/palette-launcher';
import { safeGet, safeSet } from '../../../core/util/safe-storage';
import { ViewportService } from '../../../core/util/viewport.service';
import { BreadcrumbTrail } from '../breadcrumb-trail';
import { SkipLink } from '../skip-link';
import { UserMenu } from '../user-menu';

/** `localStorage` key of the collapsed-sidebar preference (`"1"` collapsed, `"0"` expanded). */
export const SIDEBAR_KEY = 'sa.admin.sidebar';

interface NavItem {
  readonly label: string;
  readonly href: string;
  readonly icon: string;
  readonly exact: boolean;
}

function platformIsApple(): boolean {
  const nav = globalThis.navigator as Navigator & { userAgentData?: { platform?: string } };
  return /mac|iphone|ipad/i.test(nav?.userAgentData?.platform ?? nav?.platform ?? '');
}

/**
 * Frame of the admin area: a collapsible sidebar from 1024 px (the choice persists), an
 * off-canvas sheet below, a top bar with breadcrumbs, the optional palette button, the theme
 * toggle and the user menu. Content is projected; the router outlet is the default.
 */
@Component({
  selector: 'app-admin-shell',
  imports: [
    BreadcrumbTrail,
    HlmButtonImports,
    HlmSheetImports,
    NgIcon,
    NgTemplateOutlet,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    SkipLink,
    ThemeToggle,
    UserMenu,
  ],
  providers: [
    provideIcons({
      lucideBuilding2,
      lucideCalendarRange,
      lucideLayoutDashboard,
      lucideListChecks,
      lucideMenu,
      lucidePanelLeft,
      lucideSearch,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-skip-link />

    <ng-template #links let-compact="compact">
      <nav aria-label="Admin" class="flex flex-col gap-1 p-2">
        @for (item of items; track item.href) {
          <a
            [routerLink]="item.href"
            routerLinkActive="bg-muted text-primary"
            [routerLinkActiveOptions]="{ exact: item.exact }"
            ariaCurrentWhenActive="page"
            class="flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-medium hover:bg-muted"
            [attr.aria-label]="compact ? item.label : null"
            [attr.title]="compact ? item.label : null"
          >
            <ng-icon [name]="item.icon" size="18" aria-hidden="true" class="shrink-0" />
            @if (!compact) {
              <span>{{ item.label }}</span>
            }
          </a>
        }
      </nav>
    </ng-template>

    <div class="flex min-h-dvh bg-background text-foreground">
      @if (viewport.isLg()) {
        <aside
          id="admin-sidebar"
          class="sticky top-0 flex h-dvh shrink-0 flex-col border-r border-border bg-background"
          [class.w-60]="!collapsed()"
          [class.w-14]="collapsed()"
        >
          <a
            routerLink="/admin"
            class="flex h-14 items-center truncate px-4 text-lg font-semibold tracking-tight"
            [attr.aria-label]="collapsed() ? 'Smart Appointments admin' : null"
          >
            {{ collapsed() ? 'SA' : 'Smart Appointments' }}
          </a>
          <ng-container *ngTemplateOutlet="links; context: { compact: collapsed() }" />
        </aside>
      }

      <div class="flex min-w-0 flex-1 flex-col">
        <header
          class="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background px-4"
        >
          @if (viewport.isLg()) {
            <button
              hlmBtn
              variant="ghost"
              size="icon"
              type="button"
              aria-label="Toggle sidebar"
              aria-controls="admin-sidebar"
              [attr.aria-expanded]="!collapsed()"
              (click)="toggleCollapsed()"
            >
              <ng-icon name="lucidePanelLeft" aria-hidden="true" />
            </button>
          } @else {
            <hlm-sheet side="left">
              <button
                hlmBtn
                hlmSheetTrigger
                variant="ghost"
                size="icon"
                type="button"
                aria-label="Open navigation menu"
              >
                <ng-icon name="lucideMenu" aria-hidden="true" />
              </button>
              <hlm-sheet-content
                *hlmSheetPortal="let ctx"
                class="w-64 p-0"
                [showCloseButton]="true"
              >
                <hlm-sheet-header class="px-4 pt-4">
                  <h2 hlmSheetTitle>Smart Appointments</h2>
                </hlm-sheet-header>
                <ng-container *ngTemplateOutlet="links; context: { compact: false }" />
              </hlm-sheet-content>
            </hlm-sheet>
          }

          <app-breadcrumb-trail class="min-w-0 flex-1" />

          @if (launcher.available()) {
            @if (viewport.isSm()) {
              <button hlmBtn variant="outline" type="button" (click)="launcher.request()">
                <ng-icon name="lucideSearch" aria-hidden="true" />
                Search or jump to…
                <kbd class="rounded border border-border px-1.5 text-xs text-muted-foreground">
                  {{ shortcutLabel }}
                </kbd>
              </button>
            } @else {
              <button
                hlmBtn
                variant="outline"
                size="icon"
                type="button"
                aria-label="Search or jump to"
                (click)="launcher.request()"
              >
                <ng-icon name="lucideSearch" aria-hidden="true" />
              </button>
            }
          }
          <app-theme-toggle />
          <app-user-menu />
        </header>

        <main id="main-content" tabindex="-1" class="flex-1 p-4 outline-none md:p-6">
          <ng-content><router-outlet /></ng-content>
        </main>
      </div>
    </div>
  `,
})
export class AdminShell {
  protected readonly viewport = inject(ViewportService);
  protected readonly launcher = inject(PaletteLauncher);
  private readonly sheet = viewChild(HlmSheet);

  protected readonly collapsed = signal(safeGet(SIDEBAR_KEY) === '1');
  protected readonly shortcutLabel = platformIsApple() ? '⌘ K' : 'Ctrl K';

  protected readonly items: readonly NavItem[] = [
    { label: 'Dashboard', href: '/admin', icon: 'lucideLayoutDashboard', exact: true },
    { label: 'Branches', href: '/admin/branches', icon: 'lucideBuilding2', exact: false },
    { label: 'Services', href: '/admin/services', icon: 'lucideListChecks', exact: false },
    { label: 'Slot generation', href: '/admin/slots', icon: 'lucideCalendarRange', exact: false },
  ];

  constructor() {
    const subscription = inject(Router).events.subscribe((event) => {
      if (event instanceof NavigationEnd) this.sheet()?.close();
    });
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }

  protected toggleCollapsed(): void {
    const next = !this.collapsed();
    this.collapsed.set(next);
    safeSet(SIDEBAR_KEY, next ? '1' : '0');
  }
}
