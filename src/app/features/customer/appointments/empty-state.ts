import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmButtonImports } from '@app/shared/ui/button';
import type { AppointmentTab } from './tab-params';

/** Shown only after a successful empty response; part of the tab panel, not an alert. */
@Component({
  selector: 'app-empty-state',
  imports: [RouterLink, HlmButtonImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col items-center gap-3 py-12 text-center">
      <svg
        aria-hidden="true"
        viewBox="0 0 64 64"
        class="size-16 text-muted-foreground"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <rect x="8" y="12" width="48" height="44" rx="6" />
        <path d="M8 24h48M20 6v10M44 6v10" />
      </svg>
      <h3 class="text-lg font-semibold">{{ heading() }}</h3>
      <p class="max-w-prose text-muted-foreground">{{ sentence() }}</p>
      <a hlmBtn routerLink="/book">Book an appointment</a>
    </div>
  `,
})
export class EmptyState {
  readonly tab = input.required<AppointmentTab>();
  /** The Past status filter is set, so the list is empty because of it. */
  readonly filtered = input(false);
  protected readonly heading = computed(() =>
    this.filtered()
      ? 'No matching appointments'
      : this.tab() === 'upcoming'
        ? 'No upcoming appointments'
        : 'No past appointments',
  );
  protected readonly sentence = computed(() =>
    this.filtered()
      ? 'No past appointments have this status. Try another one.'
      : this.tab() === 'upcoming'
        ? 'When you book an appointment it will appear here.'
        : 'Appointments that have taken place will appear here.',
  );
}
