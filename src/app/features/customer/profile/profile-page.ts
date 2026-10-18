import { ChangeDetectionStrategy, Component, effect, inject, untracked } from '@angular/core';
import { HlmButtonImports } from '@app/shared/ui/button';
import { HlmSkeleton } from '@app/shared/ui/skeleton';
import { OutageState } from '../../../core/http/outage-state';
import { SessionStore } from '../../../core/auth/session.store';
import { InlineError } from '../appointments/inline-error';
import { ThemePicker } from './theme-picker';

@Component({
  selector: 'app-profile-page',
  imports: [HlmButtonImports, HlmSkeleton, InlineError, ThemePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-6">
      <h1 class="text-3xl font-semibold tracking-tight">Profile</h1>

      <section aria-labelledby="account-heading" class="flex flex-col gap-4">
        <h2 id="account-heading" class="text-xl font-semibold">Account</h2>
        @if (session.profileStatus() === 'error') {
          <app-inline-error
            message="We couldn't load your profile."
            (retry)="session.reloadProfile()"
          />
        }
        <dl class="grid gap-4 sm:grid-cols-[10rem_1fr]">
          <dt class="text-sm text-muted-foreground">Name</dt>
          <dd>
            @if (loading()) {
              <div hlmSkeleton class="h-5 w-48" aria-hidden="true"></div>
              <span class="sr-only">Loading</span>
            } @else {
              {{ name() || 'Not provided' }}
            }
          </dd>
          <dt class="text-sm text-muted-foreground">Email</dt>
          <dd class="break-all">{{ email() || 'Not provided' }}</dd>
          <dt class="text-sm text-muted-foreground">Phone number</dt>
          <dd>
            @if (loading()) {
              <div hlmSkeleton class="h-5 w-36" aria-hidden="true"></div>
              <span class="sr-only">Loading</span>
            } @else {
              {{ session.profile()?.phoneNumber || 'Not provided' }}
            }
          </dd>
        </dl>
      </section>

      <section aria-labelledby="appearance-heading" class="flex flex-col gap-4">
        <h2 id="appearance-heading" class="text-xl font-semibold">Appearance</h2>
        <app-theme-picker />
      </section>

      <div>
        <button hlmBtn variant="outline" type="button" (click)="session.logout()">Sign out</button>
      </div>
    </div>
  `,
})
export class ProfilePage {
  protected readonly session = inject(SessionStore);
  private readonly outage = inject(OutageState);

  protected readonly loading = () =>
    this.session.profileStatus() === 'idle' || this.session.profileStatus() === 'loading';
  protected readonly name = () => {
    const p = this.session.profile();
    return p ? `${p.firstName} ${p.lastName}`.trim() : '';
  };
  protected readonly email = () => this.session.profile()?.email || this.session.user()?.email;

  constructor() {
    let seen = this.outage.recovered();
    effect(() => {
      const recovered = this.outage.recovered();
      if (recovered === seen) return;
      seen = recovered;
      untracked(() => {
        if (this.session.profileStatus() === 'error') void this.session.reloadProfile();
      });
    });
  }
}
