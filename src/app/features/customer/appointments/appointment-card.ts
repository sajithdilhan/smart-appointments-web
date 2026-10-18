import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AppointmentView } from './appointment.model';
import { AppointmentStatusBadge } from './status-badge';

/** The whole card is one link (a single focus stop); it nests no other interactive element. */
@Component({
  selector: 'app-appointment-card',
  imports: [RouterLink, AppointmentStatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a
      [routerLink]="['/appointments', view().id]"
      queryParamsHandling="preserve"
      [state]="{ fromList: true }"
      [attr.aria-label]="view().a11yName"
      class="flex min-h-11 flex-col gap-1 rounded-lg border border-border bg-card p-4 text-card-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between"
      [class.text-muted-foreground]="view().isPast"
    >
      <span class="flex flex-col gap-0.5">
        <span class="font-medium">{{ view().serviceName }}</span>
        <span class="text-sm">{{ view().branchName }}</span>
        <span class="text-sm">
          {{ view().timeRange }}
          @if (view().zoneLabel) {
            <span>{{ view().zoneLabel }}</span>
          }
        </span>
        @if (view().browserLine) {
          <span class="text-xs text-muted-foreground">{{ view().browserLine }}</span>
        }
      </span>
      <app-appointment-status-badge
        [status]="view().status"
        [isPast]="view().isPast"
        [cancelling]="cancelling()"
      />
    </a>
  `,
})
export class AppointmentCard {
  readonly view = input.required<AppointmentView>();
  readonly cancelling = input(false);
}
