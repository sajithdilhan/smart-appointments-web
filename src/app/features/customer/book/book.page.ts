import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BranchStepComponent } from './components/branch-step.component';
import { DateTimeStepComponent } from './components/date-time-step.component';
import { ReviewStepComponent } from './components/review-step.component';
import { ServiceStepComponent } from './components/service-step.component';
import { SuccessStepComponent } from './components/success-step.component';
import { StepIndicatorComponent } from './components/step-indicator.component';
import { BookingWizardStore } from './wizard.store';

/**
 * The booking wizard page (Req 1): the one `<h1>`, the step indicator, the out-of-date note
 * and exactly one step. The step comes from the store, which derives it from the URL. Each
 * step slides in (`book-step`, opacity and transform only, off under reduced motion).
 */
@Component({
  selector: 'app-book-page',
  imports: [
    BranchStepComponent,
    DateTimeStepComponent,
    ReviewStepComponent,
    ServiceStepComponent,
    RouterLink,
    StepIndicatorComponent,
    SuccessStepComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
      <h1 class="text-3xl font-semibold tracking-tight">Book an appointment</h1>
      <app-step-indicator
        [step]="store.step()"
        [disabled]="store.confirming()"
        (goTo)="store.goTo($event)"
      />
      <p
        id="book-notice"
        role="status"
        class="text-sm text-muted-foreground empty:hidden"
        [textContent]="store.notice()"
      ></p>
      @if (store.savedHint() && (store.step() === 'branch' || store.step() === 'datetime')) {
        <p role="status" class="rounded-lg border bg-card px-4 py-3 text-sm">
          Your appointment is saved. Find it in
          <a routerLink="/appointments" class="underline underline-offset-2">My appointments</a>.
        </p>
      }
      @switch (store.step()) {
        @case ('branch') {
          <app-branch-step />
        }
        @case ('service') {
          <app-service-step />
        }
        @case ('datetime') {
          <app-date-time-step />
        }
        @case ('review') {
          <app-review-step />
        }
        @case ('success') {
          <app-success-step />
        }
      }
    </div>
  `,
})
export class BookPage {
  protected readonly store = inject(BookingWizardStore);
}
