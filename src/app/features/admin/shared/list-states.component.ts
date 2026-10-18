import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { HlmButton } from '@app/shared/ui/button';
import { HlmSkeleton } from '@app/shared/ui/skeleton';
import type { ListState } from './list-view';

/**
 * Renders what a list shows besides its rows: skeleton rows while loading, an error with Retry, an
 * empty state with a projected call to action (`[empty]`), or "no match" with Clear filters. In the
 * `ready` state it projects the default content (the table or the cards).
 */
@Component({
  selector: 'app-list-states',
  imports: [HlmButton, HlmSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <div aria-busy="true" aria-label="Loading {{ noun() }}" role="status" class="space-y-2">
          @for (n of skeletonRows; track n) {
            <hlm-skeleton class="block h-12 w-full" />
          }
        </div>
      }
      @case ('error') {
        <div role="alert" class="flex flex-col items-start gap-3 rounded-lg border p-4">
          <p>{{ errorMessage() || 'Something went wrong.' }}</p>
          <button hlmBtn variant="outline" type="button" (click)="retry.emit()">Retry</button>
        </div>
      }
      @case ('empty') {
        <div class="flex flex-col items-start gap-3 rounded-lg border p-6">
          <p>No {{ noun() }} yet.</p>
          <ng-content select="[empty]" />
        </div>
      }
      @case ('no-match') {
        <div class="flex flex-col items-start gap-3 rounded-lg border p-6">
          <p>No {{ noun() }} match your filters.</p>
          <button hlmBtn variant="outline" type="button" (click)="clearFilters.emit()">
            Clear filters
          </button>
        </div>
      }
      @default {
        <ng-content />
      }
    }
  `,
})
export class ListStates {
  readonly state = input.required<ListState>();
  /** Plural noun for the messages: 'branches' | 'services'. */
  readonly noun = input.required<string>();
  readonly errorMessage = input<string | null>(null);
  readonly retry = output<void>();
  readonly clearFilters = output<void>();

  protected readonly skeletonRows = [1, 2, 3, 4, 5];
}
