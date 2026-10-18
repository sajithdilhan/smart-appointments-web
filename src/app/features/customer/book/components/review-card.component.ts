import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCalendar, lucideClock, lucideMapPin, lucidePhone } from '@ng-icons/lucide';
import type {
  BranchResponse,
  ServiceTypeResponse,
  SlotResponse,
} from '../../../../core/api/models';
import { formatInZone, hhmm, parseUtc, zoneDiffersFromBrowser } from '../../../../core/time';
import { formatLongDate } from '../clock-text';
import { formatDuration } from '../duration';

/**
 * The summary of what is about to be booked (Req 7.1): branch with address and a phone link,
 * service with duration, and the date and time range in the branch's own wall clock. When the
 * branch's zone differs from the browser's it adds the zone and the start in the customer's
 * zone. It does not claim the slot is still free: the server decides at Confirm (Req 7.8).
 */
@Component({
  selector: 'app-review-card',
  imports: [NgIcon],
  providers: [provideIcons({ lucideCalendar, lucideClock, lucideMapPin, lucidePhone })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-3 rounded-xl border bg-card p-5 text-card-foreground' },
  template: `
    <dl class="flex flex-col gap-3">
      <div class="flex flex-col gap-0.5">
        <dt class="text-sm text-muted-foreground">Branch</dt>
        <dd class="font-medium">{{ branch().name }}</dd>
        <dd class="flex items-start gap-1.5 text-sm text-muted-foreground">
          <ng-icon name="lucideMapPin" size="16" class="mt-0.5 shrink-0" aria-hidden="true" />
          {{ branch().address }}
        </dd>
        <dd class="flex items-center gap-1.5 text-sm">
          <ng-icon name="lucidePhone" size="16" class="shrink-0" aria-hidden="true" />
          <a class="text-primary underline underline-offset-2" [href]="phoneHref()">
            {{ branch().phoneNumber }}
          </a>
        </dd>
      </div>
      <div class="flex flex-col gap-0.5">
        <dt class="text-sm text-muted-foreground">Service</dt>
        <dd class="font-medium">{{ service().name }}</dd>
        <dd class="text-sm text-muted-foreground">{{ duration() }}</dd>
      </div>
      <div class="flex flex-col gap-0.5">
        <dt class="text-sm text-muted-foreground">When</dt>
        <dd class="flex items-start gap-1.5 font-medium">
          <ng-icon name="lucideCalendar" size="16" class="mt-1 shrink-0" aria-hidden="true" />
          {{ when() }}
        </dd>
        @if (zoneNote(); as note) {
          <dd class="text-sm text-muted-foreground">{{ note.zone }}</dd>
          <dd class="flex items-center gap-1.5 text-sm">
            <ng-icon name="lucideClock" size="16" class="shrink-0" aria-hidden="true" />
            {{ note.yours }}
          </dd>
        }
      </div>
    </dl>
    <p class="text-sm text-muted-foreground">
      You can cancel this appointment from My appointments.
    </p>
  `,
})
export class ReviewCardComponent {
  readonly branch = input.required<BranchResponse>();
  readonly service = input.required<ServiceTypeResponse>();
  readonly slot = input.required<SlotResponse>();
  readonly branchZone = input.required<string>();

  protected readonly duration = computed(() => formatDuration(this.service().durationMinutes));
  protected readonly phoneHref = computed(
    () => `tel:${this.branch().phoneNumber.replace(/[^\d+]/g, '')}`,
  );
  protected readonly when = computed(() => {
    const s = this.slot();
    return `${formatLongDate(s.date)}, ${hhmm(s.localStartTime)} to ${hhmm(s.localEndTime)}`;
  });
  protected readonly zoneNote = computed(() => {
    const s = this.slot();
    const start = parseUtc(s.startAtUtc);
    if (!zoneDiffersFromBrowser(this.branchZone(), start)) return null;
    const mine = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return {
      zone: `${this.branchZone()} time`,
      yours: `${formatInZone(start, mine, { style: 'time' })} your time`,
    };
  });
}
