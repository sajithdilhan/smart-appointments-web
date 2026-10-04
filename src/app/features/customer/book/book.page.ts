import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { StepHeadingDirective } from './step-heading.directive';
import { BookingWizardStore } from './wizard.store';

/**
 * The booking wizard page (Req 1): the one `<h1>`, the out-of-date note and exactly one step.
 * The step comes from the store, which derives it from the URL.
 */
@Component({
  selector: 'app-book-page',
  imports: [StepHeadingDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
      <h1 class="text-3xl font-semibold tracking-tight">Book an appointment</h1>
      <p
        role="status"
        class="text-sm text-muted-foreground empty:hidden"
        [textContent]="store.notice()"
      ></p>
      @switch (store.step()) {
        @case ('branch') {
          <h2 appStepHeading class="text-xl font-semibold">Choose a branch</h2>
        }
        @case ('service') {
          <h2 appStepHeading class="text-xl font-semibold">Choose a service</h2>
        }
        @case ('datetime') {
          <h2 appStepHeading class="text-xl font-semibold">Choose a date and time</h2>
        }
        @case ('review') {
          <h2 appStepHeading class="text-xl font-semibold">Review and confirm</h2>
        }
        @case ('success') {
          <h2 appStepHeading class="text-xl font-semibold">You're booked</h2>
        }
      }
    </div>
  `,
})
export class BookPage {
  protected readonly store = inject(BookingWizardStore);
}
