import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AuthIllustrationComponent, AuthIllustrationVariant } from './auth-illustration.component';

/**
 * Split screen for the auth pages: the form on one side (slot `[authForm]`), a decorative panel
 * on the other from `lg` up. The panel carries no text and is hidden from assistive technology.
 */
@Component({
  selector: 'app-auth-layout',
  imports: [AuthIllustrationComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .grain::after {
      content: '';
      position: absolute;
      inset: 0;
      pointer-events: none;
      opacity: 0.07;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    }
  `,
  template: `
    <div class="grid min-h-[calc(100dvh-var(--header-h,4rem))] lg:grid-cols-2">
      <div class="flex items-center justify-center px-4 py-10 sm:px-8" data-testid="auth-form-slot">
        <div class="w-full max-w-md">
          <ng-content select="[authForm]" />
        </div>
      </div>
      <aside
        aria-hidden="true"
        class="grain relative hidden items-center justify-center overflow-hidden bg-linear-to-br from-brand-900 to-brand-950 p-12 lg:flex"
      >
        <app-auth-illustration [variant]="illustration()" class="relative w-full" />
      </aside>
    </div>
  `,
})
export class AuthLayoutComponent {
  readonly illustration = input<AuthIllustrationVariant>('login');
}
