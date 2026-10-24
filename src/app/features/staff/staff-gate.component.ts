import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SessionStore } from '../../core/auth/session.store';
import { StaffBranchStore } from '../../core/branch/staff-branch.store';
import { OutageState } from '../../core/http/outage-state';
import { HlmButton } from '@app/shared/ui/button';
import { HlmSkeleton } from '@app/shared/ui/skeleton';

export const NOT_LINKED_MESSAGE =
  'Your account is not linked to an active branch. Ask an administrator to check your branch.';

/**
 * Resolves the staff member's branch before the workspace renders (Req 1.2 to 1.4): a full-page
 * message with Sign out when there is none, the error state with Retry (and a reload when the
 * outage recovers) when the branch could not be read, the routed page once it is known. While
 * the page is up, a refreshed token for another branch keeps it mounted (the page resets its date).
 */
@Component({
  selector: 'app-staff-gate',
  imports: [HlmButton, HlmSkeleton, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (view()) {
      @case ('content') {
        <router-outlet />
      }
      @case ('not-linked') {
        <section class="mx-auto flex max-w-xl flex-col items-start gap-4 p-6">
          <h1 class="text-2xl font-semibold tracking-tight">No branch linked</h1>
          <p>{{ notLinkedMessage }}</p>
          <button hlmBtn variant="outline" type="button" (click)="signOut()">Sign out</button>
        </section>
      }
      @case ('error') {
        <section role="alert" class="mx-auto flex max-w-xl flex-col items-start gap-4 p-6">
          <h1 class="text-2xl font-semibold tracking-tight">We could not load your branch</h1>
          <p>{{ branch.error()?.message || 'Something went wrong. Please try again.' }}</p>
          <button hlmBtn variant="outline" type="button" (click)="branch.ensure()">Retry</button>
        </section>
      }
      @default {
        <div
          role="status"
          aria-busy="true"
          aria-label="Loading your branch"
          class="mx-auto flex max-w-6xl flex-col gap-3 p-6"
        >
          <hlm-skeleton class="block h-8 w-64" />
          <hlm-skeleton class="block h-12 w-full" />
          <hlm-skeleton class="block h-12 w-full" />
        </div>
      }
    }
  `,
})
export class StaffGate {
  protected readonly branch = inject(StaffBranchStore);
  private readonly session = inject(SessionStore);
  private readonly outage = inject(OutageState);

  protected readonly notLinkedMessage = NOT_LINKED_MESSAGE;

  protected readonly view = computed<'content' | 'not-linked' | 'error' | 'loading'>(() => {
    const status = this.branch.status();
    if (status === 'not-linked' || status === 'error') return status;
    if (status === 'ready' || (status === 'loading' && this.branch.branch())) return 'content';
    return 'loading';
  });

  constructor() {
    this.branch.ensure();

    let seen = this.outage.recovered();
    effect(() => {
      const recovered = this.outage.recovered();
      if (recovered === seen) return;
      seen = recovered;
      untracked(() => {
        if (this.branch.status() === 'error') this.branch.ensure();
      });
    });
  }

  protected signOut(): void {
    void this.session.logout();
  }
}
