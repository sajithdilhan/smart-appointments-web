import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { ViewportService } from '../../../../core/util/viewport.service';
import { STEPS, stepNumber, type StepId } from '../steps';

/**
 * Booking progress (Req 1.2, 1.7): an ordered list with `aria-current="step"`, earlier steps
 * as buttons and later ones as plain text; under 640 px one "Step N of 4: name" line; "Booked"
 * once the booking succeeded.
 */
@Component({
  selector: 'app-step-indicator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (step() === 'success') {
      <p class="font-medium text-foreground">Booked</p>
    } @else if (!viewport.isSm()) {
      <p class="font-medium text-foreground">Step {{ number() }} of 4: {{ currentLabel() }}</p>
    } @else {
      <ol aria-label="Booking progress" class="flex flex-wrap items-center gap-2">
        @for (s of steps; track s.id; let i = $index) {
          <li
            class="flex items-center gap-2 text-sm"
            [attr.aria-current]="s.id === step() ? 'step' : null"
          >
            @if (i + 1 < number()) {
              <button
                type="button"
                class="rounded-md px-2 py-1 text-primary underline underline-offset-2 hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                [disabled]="disabled()"
                (click)="goTo.emit(s.id)"
              >
                {{ i + 1 }}. {{ s.label }}
              </button>
            } @else {
              <span
                class="px-2 py-1"
                [class]="
                  s.id === step() ? 'font-semibold text-foreground' : 'text-muted-foreground'
                "
              >
                {{ i + 1 }}. {{ s.label }}
              </span>
            }
          </li>
        }
      </ol>
    }
  `,
})
export class StepIndicatorComponent {
  protected readonly viewport = inject(ViewportService);
  protected readonly steps = STEPS;

  readonly step = input.required<StepId>();
  /** True while the booking request is in flight: the earlier steps cannot be left for (Req 7.6). */
  readonly disabled = input(false);
  /** An earlier step was chosen from the indicator. */
  readonly goTo = output<StepId>();

  protected readonly number = computed(() => stepNumber(this.step()));
  protected readonly currentLabel = computed(
    () => STEPS.find((s) => s.id === this.step())?.label ?? '',
  );
}
