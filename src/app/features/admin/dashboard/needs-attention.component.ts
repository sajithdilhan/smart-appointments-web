import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Branch } from '../../../core/api/models';

/** Active branches that generation is blocked for: no time zone or an empty weekly schedule. */
export function needsAttention(branches: readonly Branch[]): Branch[] {
  return branches.filter((b) => b.isActive && (!b.timeZoneId || b.workingHours.length === 0));
}

@Component({
  selector: 'app-needs-attention',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="needs-attention-title" class="rounded-xl border bg-card p-4">
      <h2 id="needs-attention-title" class="text-lg font-semibold">Needs attention</h2>
      @if (branches().length === 0) {
        <p class="mt-2 text-sm text-muted-foreground">Every active branch has a schedule.</p>
      } @else {
        <p class="mt-1 text-sm text-muted-foreground">
          These active branches have no schedule, so no slots can be generated for them.
        </p>
        <ul class="mt-3 divide-y">
          @for (b of branches(); track b.id) {
            <li class="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {{ b.name }} <span class="text-muted-foreground">({{ b.code }})</span>
              </span>
              <a
                [routerLink]="['/admin/branches', b.id, 'schedule']"
                [attr.aria-label]="'Set schedule for ' + b.name"
                class="inline-flex min-h-10 items-center rounded-md px-2 font-medium text-primary underline underline-offset-4 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                Set schedule
              </a>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class NeedsAttention {
  readonly branches = input.required<readonly Branch[]>();
}
