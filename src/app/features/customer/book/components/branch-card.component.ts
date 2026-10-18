import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCircleCheck,
  lucideCircleX,
  lucideClock,
  lucideMapPin,
  lucidePhone,
} from '@ng-icons/lucide';
import { HlmBadgeImports } from '@app/shared/ui/badge';
import type { BranchResponse } from '../../../../core/api/models';
import { fromEpochMs, isOpenNow, todaysHours } from '../../../../core/time';
import { toSchedule } from '../../shared/branch-schedule';
import { formatClock } from '../clock-text';

/**
 * One branch as a radio card (the host carries `appRadioItem` in the step). The accessible name
 * is the branch name; address, hours and status are its description. Hours and the Open/Closed
 * badge use the branch's own zone and the injected "now" (Req 2.2, 2.4 to 2.6); a branch with no
 * schedule shows "Online booking not available", is dimmed and keeps its place in the tab order.
 */
@Component({
  selector: 'app-branch-card',
  imports: [NgIcon, HlmBadgeImports],
  providers: [
    provideIcons({ lucideCircleCheck, lucideCircleX, lucideClock, lucideMapPin, lucidePhone }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'group flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border border-input bg-card p-4 text-start text-card-foreground hover:bg-accent aria-checked:border-primary aria-checked:bg-accent/50 aria-checked:ring-1 aria-checked:ring-primary aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-disabled:hover:bg-card',
    '[attr.aria-labelledby]': 'nameId()',
    '[attr.aria-describedby]': 'describedBy()',
  },
  template: `
    <span
      aria-hidden="true"
      class="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2 border-input group-aria-checked:border-primary"
    >
      <span class="size-2 rounded-full group-aria-checked:bg-primary"></span>
    </span>
    <span class="flex min-w-0 flex-1 flex-col gap-2">
      <span [id]="nameId()" class="text-base font-semibold">{{ branch().name }}</span>
      <span [id]="addressId()" class="flex items-start gap-1.5 text-sm text-muted-foreground">
        <ng-icon name="lucideMapPin" size="16" class="mt-0.5 shrink-0" aria-hidden="true" />
        {{ branch().address }}
      </span>
      @if (branch().description) {
        <span class="line-clamp-2 text-sm text-muted-foreground">{{ branch().description }}</span>
      }
      <span class="flex items-center gap-1.5 text-sm text-muted-foreground">
        <ng-icon name="lucidePhone" size="16" class="shrink-0" aria-hidden="true" />
        {{ branch().phoneNumber }}
      </span>
      @if (schedule(); as s) {
        <span [id]="hoursId()" class="flex items-center gap-1.5 text-sm">
          <ng-icon name="lucideClock" size="16" class="shrink-0" aria-hidden="true" />
          <span>{{ hoursText() }}</span>
        </span>
      } @else {
        <span hlmBadge variant="outline" class="self-start">Online booking not available</span>
        <span [id]="reasonId()" class="sr-only">
          This branch cannot be booked online yet, so it cannot be selected.
        </span>
      }
    </span>
    @if (schedule()) {
      <span [id]="statusId()" hlmBadge [variant]="open() ? 'success' : 'muted'" class="shrink-0">
        <ng-icon [name]="open() ? 'lucideCircleCheck' : 'lucideCircleX'" aria-hidden="true" />
        {{ open() ? 'Open now' : 'Closed' }}
      </span>
    }
  `,
})
export class BranchCardComponent {
  readonly branch = input.required<BranchResponse>();
  /** Epoch milliseconds "now"; the step refreshes it once a minute. */
  readonly nowMs = input.required<number>();

  protected readonly schedule = computed(() => toSchedule(this.branch()));
  private readonly at = computed(() => fromEpochMs(this.nowMs()));

  protected readonly hoursText = computed(() => {
    const s = this.schedule();
    if (!s) return '';
    const hours = todaysHours(s, this.at());
    return typeof hours === 'string'
      ? 'Closed today'
      : `Today ${formatClock(hours.opens)} to ${formatClock(hours.closes)}`;
  });
  protected readonly open = computed(() => {
    const s = this.schedule();
    return s !== null && isOpenNow(s, this.at());
  });

  protected readonly nameId = computed(() => `branch-${this.branch().id}-name`);
  protected readonly addressId = computed(() => `branch-${this.branch().id}-address`);
  protected readonly hoursId = computed(() => `branch-${this.branch().id}-hours`);
  protected readonly statusId = computed(() => `branch-${this.branch().id}-status`);
  protected readonly reasonId = computed(() => `branch-${this.branch().id}-reason`);
  protected readonly describedBy = computed(() =>
    this.schedule()
      ? `${this.addressId()} ${this.hoursId()} ${this.statusId()}`
      : `${this.addressId()} ${this.reasonId()}`,
  );
}
