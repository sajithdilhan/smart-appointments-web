import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmButton } from '@app/shared/ui/button';
import { HlmSkeleton } from '@app/shared/ui/skeleton';

export type CardState = 'loading' | 'error' | 'ready';

/**
 * One dashboard figure, a link to the list it counts. It reads as one phrase to a screen reader
 * ("Active branches: 3 of 4"), has its own skeleton, and its own inline error with Retry, so a
 * failed request affects only the cards that depend on it.
 */
@Component({
  selector: 'app-stat-card',
  imports: [HlmButton, HlmSkeleton, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="h-full rounded-xl border bg-card text-card-foreground"
      [attr.aria-busy]="state() === 'loading' ? 'true' : null"
    >
      @switch (state()) {
        @case ('loading') {
          <div class="space-y-2 p-4" role="status" [attr.aria-label]="'Loading ' + label()">
            <p class="text-sm text-muted-foreground">{{ label() }}</p>
            <hlm-skeleton class="block h-9 w-24" />
          </div>
        }
        @case ('error') {
          <div class="space-y-2 p-4">
            <p class="text-sm text-muted-foreground">{{ label() }}</p>
            <p role="alert" class="text-sm">
              {{ errorMessage() || 'Could not load this figure.' }}
            </p>
            <button
              hlmBtn
              variant="outline"
              size="sm"
              type="button"
              [attr.aria-label]="'Retry loading ' + label().toLowerCase()"
              (click)="retry.emit()"
            >
              Retry
            </button>
          </div>
        }
        @default {
          <a
            [routerLink]="link()"
            [queryParams]="queryParams()"
            [attr.aria-label]="label() + ': ' + value()"
            class="block rounded-xl p-4 hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <span class="block text-sm text-muted-foreground" aria-hidden="true">{{
              label()
            }}</span>
            <span class="mt-1 block text-3xl font-semibold tracking-tight" aria-hidden="true">
              {{ value() }}
            </span>
          </a>
        }
      }
    </div>
  `,
})
export class StatCard {
  readonly label = input.required<string>();
  /** "3 of 4" or "1". */
  readonly value = input.required<string>();
  readonly state = input.required<CardState>();
  readonly link = input.required<string>();
  readonly queryParams = input<Record<string, string> | null>(null);
  readonly errorMessage = input<string | null>(null);
  readonly retry = output<void>();
}
