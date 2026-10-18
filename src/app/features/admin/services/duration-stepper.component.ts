import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { NG_VALUE_ACCESSOR, type ControlValueAccessor } from '@angular/forms';
import { HlmInput } from '@app/shared/ui/input';
import { DURATION_MAX, DURATION_MIN, DURATION_STEP } from '../validation/service-rules';
import { formatDuration } from './duration';

export const DURATION_PRESETS: readonly number[] = [15, 30, 45, 60, 90, 120];

/**
 * A duration in minutes: a numeric text input with Decrease and Increase buttons (steps of 5,
 * clamped to 5..480, disabled at the bounds), ArrowUp and ArrowDown as the same steps, a visible
 * unit, an echo in hours and preset chips. A typed value is never rounded: a value that is not a
 * multiple of 5 stays as typed and the control's validator reports it. An unparsable text gives
 * `NaN`, which the validator reports as out of range.
 */
@Component({
  selector: 'app-duration-stepper',
  imports: [HlmInput],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DurationStepper), multi: true },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-2">
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="inline-flex size-10 items-center justify-center rounded-md border border-input text-lg hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
          aria-label="Decrease duration"
          [disabled]="isLocked() || atMin()"
          (click)="step(-1)"
        >
          <span aria-hidden="true">−</span>
        </button>
        <input
          hlmInput
          type="text"
          inputmode="numeric"
          autocomplete="off"
          class="w-24 text-center"
          aria-required="true"
          [id]="inputId()"
          [attr.aria-describedby]="describedBy()"
          [attr.aria-invalid]="invalid() ? 'true' : null"
          [value]="text()"
          [readOnly]="isLocked()"
          (input)="onType($any($event.target).value)"
          (keydown)="onKeydown($event)"
          (blur)="onTouched()"
        />
        <button
          type="button"
          class="inline-flex size-10 items-center justify-center rounded-md border border-input text-lg hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
          aria-label="Increase duration"
          [disabled]="isLocked() || atMax()"
          (click)="step(1)"
        >
          <span aria-hidden="true">+</span>
        </button>
        <span class="text-sm text-muted-foreground">minutes</span>
        <span class="text-sm text-muted-foreground" aria-live="off">{{ echo() }}</span>
      </div>
      <div role="group" aria-label="Common durations" class="flex flex-wrap gap-2">
        @for (preset of presets; track preset) {
          <button
            type="button"
            class="inline-flex min-h-9 items-center rounded-full border border-input px-3 text-sm hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
            [attr.aria-pressed]="value() === preset"
            [disabled]="isLocked()"
            (click)="set(preset)"
          >
            {{ preset }} min
          </button>
        }
      </div>
    </div>
  `,
})
export class DurationStepper implements ControlValueAccessor {
  readonly inputId = input<string | undefined>(undefined);
  readonly describedBy = input<string | null>(null);
  readonly invalid = input(false);
  /** Fields are locked while a save is pending. */
  readonly locked = input(false);

  protected readonly presets = DURATION_PRESETS;
  protected readonly value = signal<number>(NaN);
  protected readonly text = signal('');
  protected readonly disabled = signal(false);

  protected readonly isLocked = computed(() => this.disabled() || this.locked());
  private readonly finite = computed(() => Number.isFinite(this.value()));
  protected readonly atMin = computed(() => this.finite() && this.value() <= DURATION_MIN);
  protected readonly atMax = computed(() => this.finite() && this.value() >= DURATION_MAX);
  protected readonly echo = computed(() =>
    Number.isInteger(this.value()) && this.value() >= 0 ? formatDuration(this.value()) : '',
  );

  private onChange: (value: number) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  protected step(direction: 1 | -1): void {
    const current = this.value();
    const base = Number.isFinite(current)
      ? current
      : direction === 1
        ? 0
        : DURATION_MIN + DURATION_STEP;
    const next = Math.min(DURATION_MAX, Math.max(DURATION_MIN, base + direction * DURATION_STEP));
    this.set(next);
  }

  protected set(next: number): void {
    this.text.set(String(next));
    this.value.set(next);
    this.onChange(next);
  }

  protected onType(raw: string): void {
    this.text.set(raw);
    const parsed = /^\s*\d+\s*$/.test(raw) ? Number(raw) : NaN;
    this.value.set(parsed);
    this.onChange(parsed);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    this.step(event.key === 'ArrowUp' ? 1 : -1);
  }

  writeValue(value: number | null): void {
    const v = typeof value === 'number' ? value : NaN;
    this.value.set(v);
    this.text.set(Number.isFinite(v) ? String(v) : '');
  }

  registerOnChange(fn: (value: number) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}
