import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck } from '@ng-icons/lucide';
import type { SlotResponse } from '../../../../core/api/models';
import { hhmm } from '../../../../core/time';
import { capacityHint } from '../day-parts';

/**
 * One free time as a radio chip (the group puts `appRadioItem` on the host). The label is the
 * branch-local start time; the accessible name carries the end time and the spots left. A
 * chosen chip shows a check mark as well as the fill, and a scarce one shows "N left" as text
 * with a small meter (never the total capacity).
 */
@Component({
  selector: 'app-slot-chip',
  imports: [NgIcon],
  providers: [provideIcons({ lucideCheck })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'flex min-h-11 min-w-11 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border border-input bg-card px-3 py-2 text-sm text-card-foreground hover:bg-accent aria-checked:border-primary aria-checked:bg-primary aria-checked:text-primary-foreground',
    '[attr.aria-label]': 'name()',
  },
  template: `
    <span class="flex items-center gap-1 font-medium">
      @if (checked()) {
        <ng-icon name="lucideCheck" size="14" aria-hidden="true" />
      }
      {{ start() }}
    </span>
    @if (hint(); as h) {
      <span class="flex items-center gap-1 text-xs" aria-hidden="true">
        <span class="inline-block h-1 w-6 overflow-hidden rounded-full bg-muted-foreground/30">
          <span class="block h-full bg-current" [style.width.%]="meter()"></span>
        </span>
        {{ h }}
      </span>
    }
  `,
})
export class SlotChipComponent {
  readonly slot = input.required<SlotResponse>();
  /** Mirrors the radio item's `checked`, to draw the check mark. */
  readonly checked = input(false);

  protected readonly start = computed(() => hhmm(this.slot().localStartTime));
  protected readonly hint = computed(() => capacityHint(this.slot().availableCapacity));
  protected readonly meter = computed(() =>
    Math.round((this.slot().availableCapacity / Math.max(1, this.slot().capacity)) * 100),
  );
  protected readonly name = computed(() => {
    const s = this.slot();
    const n = s.availableCapacity;
    const spots = capacityHint(n) ? `, ${n} ${n === 1 ? 'spot' : 'spots'} left` : '';
    return `${hhmm(s.localStartTime)} to ${hhmm(s.localEndTime)}${spots}`;
  });
}
