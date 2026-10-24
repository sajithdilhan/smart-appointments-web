import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLoaderCircle } from '@ng-icons/lucide';
import { HlmButton } from '@app/shared/ui/button';
import { fromEpochMs, longDateLabel, todayInZone, zonedParts } from '../../core/time';
import type { MarkKind } from './branch-day.store';
import type { BranchDayRow } from './day-row';

let nextId = 0;

/** "Available from 10:30" today, "Available from Sat 25 Oct, 10:30" on another day. */
export function availableFromText(row: BranchDayRow, zone: string, nowMs: number): string {
  const rowDate = zonedParts(zone, fromEpochMs(row.startMs)).date;
  if (rowDate === todayInZone(zone, nowMs)) return `Available from ${row.startLabel}`;
  const [weekday, day, month] = longDateLabel(rowDate).split(' ');
  return `Available from ${weekday.slice(0, 3)} ${day} ${month.slice(0, 3)}, ${row.startLabel}`;
}

/**
 * Complete and No-show for one Booked row (Req 3.1, 3.2, 3.6). Presentational: both buttons are
 * disabled until the start has passed (`nowMs` moves only when a start passes) or while a mark
 * of this row is in flight; the visible hint is their `aria-describedby`.
 */
@Component({
  selector: 'app-row-actions',
  imports: [HlmButton, NgIcon],
  providers: [provideIcons({ lucideLoaderCircle })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (row().canMark) {
      <div class="flex flex-col items-start gap-1">
        <div class="flex flex-wrap gap-2">
          <button
            hlmBtn
            size="sm"
            variant="outline"
            type="button"
            [disabled]="disabled()"
            [attr.aria-label]="'Complete ' + who()"
            [attr.aria-describedby]="notStarted() ? hintId : null"
            [attr.aria-busy]="marking() === 'complete' ? 'true' : null"
            (click)="complete.emit()"
          >
            @if (marking() === 'complete') {
              <ng-icon
                name="lucideLoaderCircle"
                size="16"
                aria-hidden="true"
                class="motion-safe:animate-spin"
              />
            }
            Complete
          </button>
          <button
            hlmBtn
            size="sm"
            variant="outline"
            type="button"
            [disabled]="disabled()"
            [attr.aria-label]="'No-show ' + who()"
            [attr.aria-describedby]="notStarted() ? hintId : null"
            [attr.aria-busy]="marking() === 'no-show' ? 'true' : null"
            (click)="noShow.emit()"
          >
            @if (marking() === 'no-show') {
              <ng-icon
                name="lucideLoaderCircle"
                size="16"
                aria-hidden="true"
                class="motion-safe:animate-spin"
              />
            }
            No-show
          </button>
        </div>
        @if (notStarted()) {
          <span [id]="hintId" class="text-xs text-muted-foreground">{{ hint() }}</span>
        }
      </div>
    }
  `,
})
export class RowActions {
  readonly row = input.required<BranchDayRow>();
  /** The mark of this row in flight, if any. */
  readonly marking = input<MarkKind | null>(null);
  /** The clock, in ms since the epoch (`BranchDayStore.nowMs`). */
  readonly nowMs = input.required<number>();
  readonly zone = input.required<string>();
  readonly complete = output<void>();
  readonly noShow = output<void>();

  protected readonly hintId = `row-avail-${nextId++}`;
  protected readonly notStarted = computed(() => this.row().startMs > this.nowMs());
  protected readonly disabled = computed(() => this.notStarted() || this.marking() !== null);
  protected readonly hint = computed(() =>
    availableFromText(this.row(), this.zone(), this.nowMs()),
  );
  protected readonly who = computed(
    () => `${this.row().customerName ?? 'appointment'} at ${this.row().startLabel}`,
  );
}
