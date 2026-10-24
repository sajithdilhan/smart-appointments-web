import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { BrandMark } from '@app/shared/ui/brand-mark';
import { HlmButtonImports } from '@app/shared/ui/button';
import { ThemeToggle } from '@app/shared/ui/theme-toggle';
import { SessionStore } from '../../../core/auth/session.store';
import { StaffBranchStore } from '../../../core/branch/staff-branch.store';
import { SkipLink } from '../skip-link';

/**
 * Frame of the staff area: a top bar with the branch ("{name} ({code})" once it is loaded,
 * Req 1.2), the name, the theme toggle and "Sign out". Content is projected; the router outlet
 * is the default.
 */
@Component({
  selector: 'app-staff-shell',
  imports: [BrandMark, HlmButtonImports, RouterLink, RouterOutlet, SkipLink, ThemeToggle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-skip-link />
    <div class="flex min-h-dvh flex-col bg-background text-foreground">
      <header class="border-b border-border">
        <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <a routerLink="/staff" class="text-lg"><app-brand-mark [collapseOnPhone]="true" /></a>
          <div class="flex items-center gap-3">
            @if (branchLabel(); as label) {
              <span class="text-sm font-medium">{{ label }}</span>
            }
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
  private readonly branch = inject(StaffBranchStore);

  protected readonly branchLabel = computed(() => {
    const branch = this.branch.branch();
    return this.branch.status() === 'ready' && branch ? `${branch.name} (${branch.code})` : '';
  });

  protected signOut(): void {
    void this.session.logout();
  }
}
