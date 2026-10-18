import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck } from '@ng-icons/lucide';
import { ViewportService } from '../../../../core/util/viewport.service';
import { STEPS, stepNumber, type StepId } from '../steps';

/**
 * Booking progress (Req 6.1): from 640 px an ordered list of numbered circles joined by a line,
 * the label under each; completed steps show a check, the current one is filled and carries
 * `aria-current="step"`, later ones are muted. Earlier steps are buttons (never on success, where
 * all four show as completed). Under 640 px one "Step N of 4: name" line, or "Booked".
 */
@Component({
  selector: 'app-step-indicator',
  imports: [NgIcon],
  providers: [provideIcons({ lucideCheck })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!viewport.isSm()) {
      @if (step() === 'success') {
        <p class="font-medium text-foreground">Booked</p>
      } @else {
        <p class="font-medium text-foreground">Step {{ number() }} of 4: {{ currentLabel() }}</p>
      }
    } @else {
      <ol aria-label="Booking progress" class="flex items-start">
        @for (s of steps; track s.id; let i = $index) {
          <li
            class="relative flex flex-1 flex-col items-center gap-1.5 text-sm"
            [attr.aria-current]="s.id === step() ? 'step' : null"
          >
            @if (i > 0) {
              <span
                aria-hidden="true"
                class="absolute end-1/2 top-4 h-0.5 w-full -translate-y-1/2"
                [class]="i + 1 <= number() ? 'bg-primary' : 'bg-border'"
              ></span>
            }
            @if (i + 1 < number() && step() !== 'success') {
              <button
                type="button"
                class="group relative z-10 flex flex-col items-center gap-1.5 rounded-md px-2 py-1 disabled:pointer-events-none disabled:opacity-50"
                [disabled]="disabled()"
                [attr.aria-describedby]="'step-done-' + s.id"
                (click)="goTo.emit(s.id)"
              >
                <span
                  class="flex size-8 items-center justify-center rounded-full border-2 border-primary bg-card text-primary group-hover:bg-accent"
                >
                  <ng-icon name="lucideCheck" size="16" aria-hidden="true" />
                </span>
                <span
                  aria-hidden="true"
                  class="font-medium text-primary underline-offset-2 group-hover:underline"
                  >{{ s.label }}</span
                >
                <span class="sr-only">{{ i + 1 }}. {{ s.label }}</span>
              </button>
              <span [id]="'step-done-' + s.id" class="sr-only">Completed</span>
            } @else if (i + 1 < number()) {
              <span class="relative z-10 flex flex-col items-center gap-1.5 px-2 py-1">
                <span
                  class="flex size-8 items-center justify-center rounded-full border-2 border-primary bg-card text-primary"
                >
                  <ng-icon name="lucideCheck" size="16" aria-hidden="true" />
                </span>
                <span aria-hidden="true" class="font-medium text-foreground">{{ s.label }}</span>
                <span class="sr-only">{{ i + 1 }}. {{ s.label }} (completed)</span>
              </span>
            } @else {
              <span class="relative z-10 flex flex-col items-center gap-1.5 px-2 py-1">
                <span
                  class="flex size-8 items-center justify-center rounded-full border-2 font-semibold"
                  [class]="
                    s.id === step()
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-muted-foreground'
                  "
                >
                  <span aria-hidden="true">{{ i + 1 }}</span>
                </span>
                <span
                  aria-hidden="true"
                  [class]="
                    s.id === step() ? 'font-bold text-primary' : 'font-medium text-muted-foreground'
                  "
                  >{{ s.label }}</span
                >
                <span class="sr-only">{{ i + 1 }}. {{ s.label }}</span>
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
