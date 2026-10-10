import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCopy } from '@ng-icons/lucide';
import { HlmButtonImports } from '@app/shared/ui/button';
import { hhmm } from '../../../../core/time';
import { ViewportService } from '../../../../core/util/viewport.service';
import { formatLongDate } from '../clock-text';
import { StepHeadingDirective } from '../step-heading.directive';
import { BookingWizardStore } from '../wizard.store';
import { CalendarButtonComponent } from './calendar-button.component';
import { ConfettiComponent } from './confetti.component';
import { ReviewCardComponent } from './review-card.component';
import { SuccessCheckComponent } from './success-check.component';

/**
 * Step 5 (Req 9): the confirmation. A view over `done=1` plus the booking held in the store,
 * never a deep link. The heading takes focus, one polite status announces the booking, the
 * check draws itself, and the confetti (its own lazy chunk) is not even loaded under reduced
 * motion. The reference is shown in full and selectable; Copy never throws.
 */
@Component({
  selector: 'app-success-step',
  imports: [
    CalendarButtonComponent,
    ConfettiComponent,
    HlmButtonImports,
    NgIcon,
    ReviewCardComponent,
    RouterLink,
    StepHeadingDirective,
    SuccessCheckComponent,
  ],
  providers: [provideIcons({ lucideCopy })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'book-step flex flex-col gap-4' },
  template: `
    <p role="status" class="sr-only">{{ announcement() }}</p>
    @if (booked(); as b) {
      <div class="flex items-center gap-3">
        <app-success-check />
        <h2 appStepHeading class="text-xl font-semibold">You're booked</h2>
      </div>

      <app-review-card
        [branch]="b.branch"
        [service]="b.service"
        [slot]="b.slot"
        [branchZone]="b.branch.timeZoneId ?? 'UTC'"
      />

      <div class="flex flex-col gap-2 rounded-xl border bg-card p-5">
        <p class="text-sm text-muted-foreground">Booking reference</p>
        <div class="flex flex-wrap items-center gap-2">
          <code class="rounded bg-muted px-2 py-1 text-sm break-all select-all">
            {{ b.appointment.id }}
          </code>
          <button hlmBtn variant="outline" size="sm" type="button" (click)="copy()">
            <ng-icon name="lucideCopy" aria-hidden="true" />
            Copy reference
          </button>
          <span role="status" class="text-sm text-muted-foreground">{{ copied() }}</span>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <app-calendar-button [booked]="b" />
        <a hlmBtn variant="outline" routerLink="/appointments">View my appointments</a>
        <button hlmBtn type="button" (click)="store.bookAnother()">Book another</button>
      </div>

      @if (!viewport.prefersReducedMotion()) {
        @defer (on idle) {
          <app-confetti />
        }
      }
    }
  `,
})
export class SuccessStepComponent {
  protected readonly store = inject(BookingWizardStore);
  protected readonly viewport = inject(ViewportService);
  protected readonly booked = this.store.booking;
  protected readonly announcement = signal('');
  protected readonly copied = signal('');

  private readonly text = computed(() => {
    const b = this.booked();
    if (!b) return '';
    return `Your appointment is booked for ${formatLongDate(b.slot.date)}, ${hhmm(b.slot.localStartTime)} to ${hhmm(b.slot.localEndTime)}.`;
  });

  constructor() {
    // Written after the first render so the live region announces a change, once.
    afterNextRender(() => this.announcement.set(this.text()));
  }

  protected async copy(): Promise<void> {
    const id = this.booked()?.appointment.id;
    if (!id) return;
    try {
      await navigator.clipboard.writeText(id);
      this.copied.set('Copied');
    } catch {
      // Blocked or unsupported: the reference stays visible and selectable.
      this.copied.set('');
    }
  }
}
