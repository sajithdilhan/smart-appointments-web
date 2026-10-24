import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronLeft, lucideChevronRight } from '@ng-icons/lucide';
import { HlmButton } from '@app/shared/ui/button';
import { HlmInput } from '@app/shared/ui/input';
import { addDays, longDateLabel } from '../../core/time';
import { FocusHeadingDirective } from '../a11y/focus-heading.directive';
import { isCalendarDate } from './day-params';

let nextId = 0;

/**
 * The heading, the date written out and the controls that change it (Req 2.2). Presentational:
 * the host connects `dateChange` to the URL state, which adds a history entry per change.
 */
@Component({
  selector: 'app-day-nav',
  imports: [FocusHeadingDirective, HlmButton, HlmInput, NgIcon],
  providers: [provideIcons({ lucideChevronLeft, lucideChevronRight })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-3">
      <div class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 appFocusHeading id="appointments-heading" class="text-3xl font-semibold tracking-tight">
          Appointments
        </h1>
        <p class="text-lg font-medium">{{ longDate() }}</p>
        @if (zoneLabel(); as zone) {
          <p class="text-sm text-muted-foreground">Times in {{ zone }}</p>
        }
      </div>
      <div class="flex flex-wrap items-end gap-2">
        <button hlmBtn variant="outline" type="button" (click)="dateChange.emit(previous())">
          <ng-icon name="lucideChevronLeft" size="18" aria-hidden="true" />
          Previous day
        </button>
        <button hlmBtn variant="outline" type="button" (click)="dateChange.emit(next())">
          Next day
          <ng-icon name="lucideChevronRight" size="18" aria-hidden="true" />
        </button>
        <button
          hlmBtn
          variant="outline"
          type="button"
          [disabled]="date() === today()"
          (click)="dateChange.emit(today())"
        >
          Today
        </button>
        <div class="flex flex-col gap-1">
          <label [for]="inputId" class="text-sm font-medium">Go to date</label>
          <input hlmInput type="date" [id]="inputId" [value]="date()" (change)="onPick($event)" />
        </div>
      </div>
    </div>
  `,
})
export class DayNav {
  /** The day shown, `yyyy-MM-dd`. */
  readonly date = input.required<string>();
  /** Today in the branch zone: the Today button is disabled on it. */
  readonly today = input.required<string>();
  /** "UTC" when the branch has no time zone, else null. */
  readonly zoneLabel = input<string | null>(null);
  readonly dateChange = output<string>();

  protected readonly inputId = `day-nav-date-${nextId++}`;
  protected readonly longDate = computed(() => longDateLabel(this.date()));
  protected readonly previous = computed(() => addDays(this.date(), -1));
  protected readonly next = computed(() => addDays(this.date(), 1));

  protected onPick(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    // An empty or half-typed value is ignored; the field snaps back to the shown day.
    if (isCalendarDate(value) && value !== this.date()) this.dateChange.emit(value);
    else (event.target as HTMLInputElement).value = this.date();
  }
}
