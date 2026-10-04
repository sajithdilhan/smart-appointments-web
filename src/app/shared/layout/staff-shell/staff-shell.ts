import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { HlmButtonImports } from '@app/shared/ui/button';
import { ThemeToggle } from '@app/shared/ui/theme-toggle';
import { SessionStore } from '../../../core/auth/session.store';
import { SkipLink } from '../skip-link';

/**
 * Minimal frame of the staff area (the workspace itself waits for its backend service): a top
 * bar with the name, the theme toggle and "Sign out". Content is projected; the router outlet
 * is the default.
 */
@Component({
  selector: 'app-staff-shell',
  imports: [HlmButtonImports, RouterLink, RouterOutlet, SkipLink, ThemeToggle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-skip-link />
    <div class="flex min-h-dvh flex-col bg-background text-foreground">
      <header class="border-b border-border">
        <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <a routerLink="/staff" class="text-lg font-semibold tracking-tight">
            Smart Appointments
          </a>
          <div class="flex items-center gap-3">
            <span class="hidden text-sm text-muted-foreground sm:inline">
              {{ session.displayName() }}
            </span>
            <app-theme-toggle />
            <button hlmBtn variant="outline" type="button" (click)="signOut()">Sign out</button>
          </div>
        </div>
      </header>
      <main id="main-content" tabindex="-1" class="flex-1 outline-none">
        <ng-content><router-outlet /></ng-content>
      </main>
    </div>
  `,
})
export class StaffShell {
  protected readonly session = inject(SessionStore);

  protected signOut(): void {
    void this.session.logout();
  }
}
