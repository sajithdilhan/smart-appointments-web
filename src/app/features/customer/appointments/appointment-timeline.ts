import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { AppointmentGroup } from './appointment.model';
import { AppointmentCard } from './appointment-card';

/** Date headings (`h2` under the page `h1`) over lists of cards, in the server order. */
@Component({
  selector: 'app-appointment-timeline',
  imports: [AppointmentCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (group of groups(); track group.dateKey + ':' + $index) {
      <section class="mb-6">
        <h2 class="mb-2 text-base font-semibold">{{ group.dateLabel }}</h2>
        <ul class="flex flex-col gap-2">
          @for (item of group.items; track item.id) {
            <li>
              <app-appointment-card [view]="item" [cancelling]="pendingIds().includes(item.id)" />
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class AppointmentTimeline {
  readonly groups = input.required<readonly AppointmentGroup[]>();
  readonly pendingIds = input<readonly string[]>([]);
}
