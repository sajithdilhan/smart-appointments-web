import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronDown, lucideUser } from '@ng-icons/lucide';
import { HlmButtonImports } from '@app/shared/ui/button';
import { HlmDropdownMenuImports } from '@app/shared/ui/dropdown-menu';
import { SessionStore } from '../../../core/auth/session.store';

/**
 * The account menu of every signed-in shell: the person's name, a Profile link for customers
 * and "Sign out". Escape closes it and returns focus to the trigger (CDK menu behaviour).
 */
@Component({
  selector: 'app-user-menu',
  imports: [HlmButtonImports, HlmDropdownMenuImports, NgIcon, RouterLink],
  providers: [provideIcons({ lucideChevronDown, lucideUser })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      hlmBtn
      variant="outline"
      type="button"
      aria-label="Account menu"
      [hlmDropdownMenuTrigger]="menu"
      align="end"
    >
      <ng-icon name="lucideUser" aria-hidden="true" />
      <span class="max-w-40 truncate">{{ session.displayName() }}</span>
      <ng-icon name="lucideChevronDown" aria-hidden="true" />
    </button>

    <ng-template #menu>
      <div hlmDropdownMenu class="w-48">
        @if (session.role() === 'Customer') {
          <a hlmDropdownMenuItem routerLink="/profile">Profile</a>
        }
        <button hlmDropdownMenuItem type="button" (triggered)="signOut()">Sign out</button>
      </div>
    </ng-template>
  `,
})
export class UserMenu {
  protected readonly session = inject(SessionStore);

  protected signOut(): void {
    void this.session.logout();
  }
}
