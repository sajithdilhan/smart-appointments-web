import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { merge } from 'rxjs';
import { HlmInput } from '@app/shared/ui/input';
import { HlmSwitch } from '@app/shared/ui/switch';
import { ViewportService } from '../../../core/util/viewport.service';
import { MESSAGES } from '../validation/messages';
import { scheduleRowError } from '../validation/schedule-rules';
import { setDayOpen, type DayGroup } from './schedule.form';

/**
 * One day of the weekly grid: an "Open on {day}" switch and, while open, "{day} opens" and
 * "{day} closes" time inputs, with one error line linked by `aria-describedby`. A grid row from
 * 768 px up, a card below.
 */
@Component({
  selector: 'app-schedule-day-row',
  imports: [ReactiveFormsModule, HlmInput, HlmSwitch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      [class]="
        isMd()
          ? 'grid grid-cols-[8rem_auto_1fr_1fr] items-start gap-4 border-b py-3'
          : 'space-y-3 rounded-lg border p-4'
      "
      [attr.data-layout]="isMd() ? 'row' : 'card'"
      (focusout)="bump()"
    >
      <span class="pt-2 font-medium">{{ day() }}</span>
      <div class="flex min-h-9 items-center gap-2">
        <hlm-switch
          [formControl]="row().controls.open"
          [aria-label]="'Open on ' + day()"
          (checkedChange)="onToggle($event)"
        />
        @if (!open()) {
          <span class="text-sm text-muted-foreground">Closed</span>
        }
      </div>
      @if (open()) {
        <label class="flex flex-col gap-1 text-sm">
          <span class="sr-only">{{ day() }} opens</span>
          <span aria-hidden="true" class="text-muted-foreground">Opens</span>
          <input
            hlmInput
            type="time"
            step="300"
            [formControl]="row().controls.opensAt"
            [attr.aria-label]="day() + ' opens'"
            [attr.aria-invalid]="showError() ? 'true' : null"
            [attr.aria-describedby]="showError() ? errorId() : null"
          />
        </label>
        <label class="flex flex-col gap-1 text-sm">
          <span class="sr-only">{{ day() }} closes</span>
          <span aria-hidden="true" class="text-muted-foreground">Closes</span>
          <input
            hlmInput
            type="time"
            step="300"
            [formControl]="row().controls.closesAt"
            [attr.aria-label]="day() + ' closes'"
            [attr.aria-invalid]="showError() ? 'true' : null"
            [attr.aria-describedby]="showError() ? errorId() : null"
          />
        </label>
        @if (showError()) {
          <p [id]="errorId()" class="text-sm text-destructive" [class.col-span-4]="isMd()">
            {{ errorText() }}
          </p>
        }
      }
    </div>
  `,
})
export class ScheduleDayRow {
  readonly row = input.required<DayGroup>();
  /** Show errors before the row is touched (after a failed Save). */
  readonly submitAttempted = input(false);

  protected readonly isMd = inject(ViewportService).isMd;

  protected readonly day = computed(() => this.row().controls.day.value);
  /** Forms are not signals: bumped on every value, status and focus change so the computeds re-run. */
  protected readonly version = signal(0);
  protected readonly bump = () => this.version.update((n) => n + 1);

  constructor() {
    effect((onCleanup) => {
      const r = this.row();
      const sub = merge(r.valueChanges, r.statusChanges).subscribe(this.bump);
      onCleanup(() => sub.unsubscribe());
    });
  }

  protected readonly open = computed(() => (this.version(), this.row().controls.open.value));
  protected readonly errorId = computed(() => `schedule-error-${this.day().toLowerCase()}`);
  protected readonly errorKey = computed(
    () => (this.version(), scheduleRowError(this.row().getRawValue())),
  );
  protected readonly showError = computed(
    () =>
      (this.version(), this.errorKey() !== null) &&
      (this.submitAttempted() || this.row().touched || this.row().dirty),
  );
  protected readonly errorText = computed(() => {
    const key = this.errorKey();
    return key ? MESSAGES.schedule.row[key] : '';
  });

  protected onToggle(open: boolean): void {
    setDayOpen(this.row(), open);
  }
}
