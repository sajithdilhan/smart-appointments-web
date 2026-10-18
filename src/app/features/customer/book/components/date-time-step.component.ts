import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { HlmButtonImports } from '@app/shared/ui/button';
import { fromEpochMs, zoneDiffersFromBrowser } from '../../../../core/time';
import { StepHeadingDirective } from '../step-heading.directive';
import { BookingWizardStore } from '../wizard.store';
import { ActionBarComponent } from './action-bar.component';
import { DateStripComponent } from './date-strip.component';
import { SlotsStatusComponent } from './slots-status.component';

/** "Pacific/Auckland" becomes "Auckland": the zone's city, readable in a sentence. */
export function zoneCity(zoneId: string): string {
  return (zoneId.split('/').pop() ?? zoneId).replaceAll('_', ' ');
}

/**
 * Step 3 (Req 4, 5, 6): the date strip, the zone line, the times for the chosen day and the
 * Back and "Continue to review" actions.
 */
@Component({
  selector: 'app-date-time-step',
  imports: [
    ActionBarComponent,
    DateStripComponent,
    HlmButtonImports,
    SlotsStatusComponent,
    StepHeadingDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'book-step flex flex-col gap-4' },
  template: `
    <h2 appStepHeading class="text-xl font-semibold">Choose a date and time</h2>
    <app-date-strip />
    @if (zoneLine(); as line) {
      <p class="text-sm text-muted-foreground">{{ line }}</p>
    }
    <app-slots-status />
    <app-action-bar>
      <button hlmBtn variant="outline" type="button" (click)="store.goTo('service')">Back</button>
      <button
        hlmBtn
        type="button"
        [disabled]="!store.canContinue()"
        (click)="store.continueToReview()"
      >
        Continue to review
      </button>
    </app-action-bar>
  `,
})
export class DateTimeStepComponent {
  protected readonly store = inject(BookingWizardStore);

  /** Shown only when the branch's offset on the chosen day differs from the browser's. */
  protected readonly zoneLine = computed(() => {
    const zone = this.store.branchZone();
    const date = this.store.date();
    if (!zone || !date) return null;
    const [y, m, d] = date.split('-').map(Number);
    const noon = fromEpochMs(Date.UTC(y, m - 1, d, 12));
    return zoneDiffersFromBrowser(zone, noon) ? `Times are shown in ${zoneCity(zone)} time` : null;
  });
}
