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
import { lucideArrowRight, lucideCopy } from '@ng-icons/lucide';
import { HlmButtonImports } from '@app/shared/ui/button';
import { SessionStore } from '../../../../core/auth/session.store';
import { hhmm } from '../../../../core/time';
import { ViewportService } from '../../../../core/util/viewport.service';
import { formatLongDate } from '../clock-text';
import { StepHeadingDirective } from '../step-heading.directive';
import { BookingWizardStore } from '../wizard.store';
import { CalendarButtonComponent } from './calendar-button.component';
import { ConfettiComponent } from './confetti.component';
import { ReviewCardComponent, loadProfileIfIdle, reviewContact } from './review-card.component';
import { SuccessCheckComponent } from './success-check.component';

/**
 * Step 5 (F3 Req 9, F6 Req 8.3 to 8.5): the confirmation. A view over `done=1` plus the booking held in the store,
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
  providers: [provideIcons({ lucideArrowRight, lucideCopy })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'book-step flex flex-col gap-4' },
  template: `
    <p role="status" class="sr-only">{{ announcement() }}</p>
    @if (booked(); as b) {
      <div class="flex flex-col items-center gap-3 text-center">
        <span class="flex size-20 items-center justify-center rounded-full bg-success-soft">
          <app-success-check />
        </span>
        <h2 appStepHeading class="text-2xl font-bold">Booking confirmed!</h2>
        <p class="text-muted-foreground">Your appointment has been successfully booked.</p>
      </div>

      <div
        class="mx-auto flex w-full max-w-md flex-col items-center gap-1 rounded-2xl bg-success-soft p-4 text-center text-success-soft-foreground"
      >
        <p class="text-sm font-medium">Booking reference</p>
        <div class="flex items-center justify-center gap-2">
          <code class="font-mono text-lg font-bold break-all select-all">
            {{ b.appointment.id }}
          </code>
          <button
            type="button"
            aria-label="Copy reference"
            class="flex size-9 shrink-0 items-center justify-center rounded-md hover:bg-success-soft-foreground/10"
            (click)="copy()"
          >
            <ng-icon name="lucideCopy" size="18" aria-hidden="true" />
          </button>
        </div>
        <span role="status" class="min-h-5 text-sm">{{ copied() }}</span>
      </div>

      <app-review-card
        [branch]="b.branch"
        [service]="b.service"
        [slot]="b.slot"
        [branchZone]="b.branch.timeZoneId ?? 'UTC'"
        [contact]="contact()"
      />

      <div class="flex flex-wrap items-center justify-center gap-2">
        <app-calendar-button [booked]="b" />
        <a hlmBtn variant="outline" [routerLink]="['/appointments', b.appointment.id]">
          View details
          <ng-icon name="lucideArrowRight" aria-hidden="true" />
        </a>
      </div>
      <div class="flex flex-wrap items-center justify-center gap-4 text-sm">
        <button
          type="button"
          class="rounded-sm font-medium text-primary underline underline-offset-2"
          (click)="store.bookAnother()"
        >
          Book another
        </button>
        <a routerLink="/" class="rounded-sm font-medium text-primary underline underline-offset-2">
          Back to home
        </a>
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
  private readonly session = inject(SessionStore);
  protected readonly booked = this.store.booking;
  protected readonly contact = computed(() => reviewContact(this.session));
  protected readonly announcement = signal('');
  protected readonly copied = signal('');

  private readonly text = computed(() => {
    const b = this.booked();
    if (!b) return '';
    return `Your appointment is booked for ${formatLongDate(b.slot.date)}, ${hhmm(b.slot.localStartTime)} to ${hhmm(b.slot.localEndTime)}.`;
  });

  constructor() {
    loadProfileIfIdle(this.session);
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
