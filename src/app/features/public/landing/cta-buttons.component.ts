import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowRight } from '@ng-icons/lucide';
import { RouterLink } from '@angular/router';
import { HlmButton } from '@app/shared/ui/button';
import { landingCtas } from '../../../core/auth/landing-cta';

/**
 * The call-to-action buttons of the hero and the closing band. They read F1's `landingCtas()`,
 * so they always agree with the public header: sign-up and log-in for a visitor, a dashboard
 * link for a signed-in user.
 */
@Component({
  selector: 'app-cta-buttons',
  imports: [RouterLink, HlmButton, NgIcon],
  providers: [provideIcons({ lucideArrowRight })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-3 sm:flex-row">
      <a hlmBtn class="h-11 gap-2 px-6 text-base" [routerLink]="ctas().primary.href"
        >{{ ctas().primary.label }}<ng-icon name="lucideArrowRight" size="18" aria-hidden="true"
      /></a>
      @if (ctas().secondary; as secondary) {
        <a hlmBtn variant="outline" class="h-11 gap-2 px-6 text-base" [routerLink]="secondary.href"
          >{{ secondary.label }}<ng-icon name="lucideArrowRight" size="18" aria-hidden="true"
        /></a>
      }
    </div>
  `,
})
export class CtaButtonsComponent {
  protected readonly ctas = landingCtas();
}
