import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowLeft, lucideArrowRight, lucideLoaderCircle } from '@ng-icons/lucide';
import { HlmButtonImports } from '@app/shared/ui/button';
import { InlineAlert } from '@app/shared/ui/inline-alert';
import { RateLimitNotice } from '@app/shared/ui/rate-limit-notice';
import { HlmSkeletonImports } from '@app/shared/ui/skeleton';
import { SessionStore } from '../../../../core/auth/session.store';
import { createConfirmFlow, NO_SECURE_RANDOM_MESSAGE } from '../confirm.machine';
import { IdempotencyKeyStore, NoSecureRandomError } from '../idempotency-key.store';
import { StepHeadingDirective } from '../step-heading.directive';
import { BookingWizardStore } from '../wizard.store';
import { ActionBarComponent } from './action-bar.component';
import { ReviewCardComponent, loadProfileIfIdle, reviewContact } from './review-card.component';

export const OVERLAP_MESSAGE = 'You already have an appointment at that time.';
export const IN_PROGRESS_MESSAGE = 'Your booking is still being processed.';
export const RETRYABLE_MESSAGE =
  'We could not confirm your booking. It may or may not have gone through. Try again; you will not be booked twice.';

/**
 * Step 4 (Req 7, 8): the summary and Confirm. The idempotency key for the slot is acquired on
 * entry (created once, reused on Back, reload and retry), the Confirm flow is the state machine
 * of `confirm.machine.ts`, and each state shows its own message and next action. The review
 * does not claim the slot is still free.
 */
@Component({
  selector: 'app-review-step',
  imports: [
    ActionBarComponent,
    HlmButtonImports,
    HlmSkeletonImports,
    InlineAlert,
    NgIcon,
    RateLimitNotice,
    ReviewCardComponent,
    RouterLink,
    StepHeadingDirective,
  ],
  providers: [provideIcons({ lucideArrowLeft, lucideArrowRight, lucideLoaderCircle })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'book-step flex flex-col gap-4' },
  template: `
    <h2 appStepHeading class="text-xl font-semibold">Review and confirm</h2>

    @if (store.branch(); as branch) {
      @if (store.service(); as service) {
        @if (store.slot(); as slot) {
          <app-review-card
            [branch]="branch"
            [service]="service"
            [slot]="slot"
            [branchZone]="store.branchZone() ?? 'UTC'"
            [editable]="!busy()"
            [contact]="contact()"
            (edit)="store.goTo($event)"
          />
        } @else {
          <div hlmSkeleton class="h-48" aria-hidden="true"></div>
        }
      }
    } @else {
      <div hlmSkeleton class="h-48" aria-hidden="true"></div>
    }

    @if (noSecureRandom()) {
      <app-inline-alert tone="error"
        ><p>{{ noSecureRandomMessage }}</p></app-inline-alert
      >
    }

    @switch (state().s) {
      @case ('overlap') {
        <app-inline-alert tone="error">
          <p>{{ overlapMessage }}</p>
          <p>
            <a routerLink="/appointments" class="underline underline-offset-2">
              View my appointments
            </a>
          </p>
        </app-inline-alert>
      }
      @case ('in-progress') {
        <app-inline-alert tone="info">
          <p>{{ inProgressMessage }}</p>
        </app-inline-alert>
      }
      @case ('retryable') {
        <app-inline-alert tone="error">
          <p>{{ retryableMessage }}</p>
        </app-inline-alert>
      }
      @case ('failed') {
        <app-inline-alert tone="error">
          <p>{{ failedMessage() }}</p>
        </app-inline-alert>
      }
    }

    <app-action-bar>
      <button
        hlmBtn
        variant="outline"
        type="button"
        [disabled]="busy()"
        (click)="store.goTo('datetime')"
      >
        <ng-icon name="lucideArrowLeft" aria-hidden="true" />
        Back
      </button>
      @switch (state().s) {
        @case ('rate-limited') {
          <div class="flex flex-col items-end gap-1">
            <app-rate-limit-notice [countdown]="flow.countdown" />
          </div>
        }
        @case ('overlap') {
          <button hlmBtn type="button" (click)="chooseAnotherTime()">Choose another time</button>
        }
        @case ('in-progress') {
          <button hlmBtn type="button" (click)="flow.retry()">Check again</button>
        }
        @case ('retryable') {
          <button hlmBtn type="button" (click)="flow.retry()">Try again</button>
        }
        @default {
          <button
            hlmBtn
            type="button"
            [disabled]="busy() || !canConfirm()"
            [attr.aria-busy]="busy()"
            (click)="flow.submit()"
          >
            @if (busy()) {
              <ng-icon
                name="lucideLoaderCircle"
                class="animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            }
            Confirm booking
            @if (!busy()) {
              <ng-icon name="lucideArrowRight" aria-hidden="true" />
            }
          </button>
        }
      }
    </app-action-bar>
  `,
})
export class ReviewStepComponent {
  protected readonly store = inject(BookingWizardStore);
  private readonly keys = inject(IdempotencyKeyStore);
  private readonly session = inject(SessionStore);
  protected readonly flow = createConfirmFlow();

  protected readonly overlapMessage = OVERLAP_MESSAGE;
  protected readonly inProgressMessage = IN_PROGRESS_MESSAGE;
  protected readonly retryableMessage = RETRYABLE_MESSAGE;
  protected readonly noSecureRandomMessage = NO_SECURE_RANDOM_MESSAGE;

  protected readonly state = this.flow.state;
  protected readonly busy = computed(() => this.state().s === 'submitting');
  protected readonly noSecureRandom = signal(false);
  protected readonly canConfirm = computed(() => this.flow.canSubmit() && !this.noSecureRandom());
  protected readonly failedMessage = computed(() => {
    const s = this.state();
    return s.s === 'failed' ? s.message : '';
  });

  protected readonly contact = computed(() => reviewContact(this.session));

  constructor() {
    loadProfileIfIdle(this.session);

    // The key is created on entering step 4 and for no other step; keys of other slots go.
    effect(() => {
      const slot = this.store.slot();
      if (!slot) return;
      untracked(() => {
        this.keys.pruneExcept(slot.id);
        try {
          this.keys.acquire(slot.id);
          this.noSecureRandom.set(false);
        } catch (e) {
          if (!(e instanceof NoSecureRandomError)) throw e;
          this.noSecureRandom.set(true);
        }
      });
    });
  }

  protected chooseAnotherTime(): void {
    this.flow.reset();
    this.store.goTo('datetime');
  }
}
