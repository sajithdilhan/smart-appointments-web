import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmButtonImports } from '@app/shared/ui/button';
import { EmptyState } from '@app/shared/ui/empty-state';
import { InlineAlert } from '@app/shared/ui/inline-alert';
import { RateLimitNotice } from '@app/shared/ui/rate-limit-notice';
import { HlmSkeletonImports } from '@app/shared/ui/skeleton';
import { SlotSearchService } from '../slot-search.service';
import { BookingWizardStore } from '../wizard.store';
import { SlotGroupsComponent } from './slot-groups.component';

/**
 * The slot region of step 3 (Req 5, 6): a skeleton with `aria-busy` while loading, the chips,
 * the empty state ("Check the next day" and "Choose another branch"), the error with "Try
 * again" and the rate-limit countdown with a manual retry. "N times available" is announced
 * once per completed search through one polite status region.
 */
@Component({
  selector: 'app-slots-status',
  imports: [
    EmptyState,
    HlmButtonImports,
    HlmSkeletonImports,
    InlineAlert,
    RateLimitNotice,
    RouterLink,
    SlotGroupsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p role="status" class="sr-only">{{ announcement() }}</p>
    <div [attr.aria-busy]="loading()">
      @switch (state().status) {
        @case ('ready') {
          @if (slots().length === 0) {
            <app-empty-state [title]="'No times available on ' + dayLabel() + '.'">
              <div actions>
                @if (next(); as n) {
                  <button hlmBtn variant="outline" type="button" (click)="store.chooseDate(n.date)">
                    Check {{ n.fullLabel }}
                  </button>
                }
                <a hlmBtn variant="outline" routerLink="/book">Choose another branch</a>
              </div>
            </app-empty-state>
          } @else {
            <app-slot-groups [slots]="slots()" />
            <div class="mt-3">
              <button hlmBtn variant="ghost" size="sm" type="button" (click)="reload()">
                Refresh times
              </button>
            </div>
          }
        }
        @case ('error') {
          <app-inline-alert tone="error">
            <p>We could not load the times. Check your connection and try again.</p>
            <div>
              <button hlmBtn variant="outline" type="button" (click)="reload()">Try again</button>
            </div>
          </app-inline-alert>
        }
        @case ('rate-limited') {
          <app-inline-alert tone="info">
            <app-rate-limit-notice [countdown]="search.countdown" />
            @if (!search.countdown.active()) {
              <div>
                <button hlmBtn variant="outline" type="button" (click)="reload()">Try again</button>
              </div>
            }
          </app-inline-alert>
        }
        @default {
          <div class="flex flex-col gap-4" aria-label="Loading times">
            @for (n of placeholders; track n) {
              <div class="flex flex-col gap-2" aria-hidden="true">
                <div hlmSkeleton class="h-4 w-24"></div>
                <div class="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                  @for (c of chips; track c) {
                    <div hlmSkeleton class="h-11"></div>
                  }
                </div>
              </div>
            }
          </div>
        }
      }
    </div>
  `,
})
export class SlotsStatusComponent {
  protected readonly store = inject(BookingWizardStore);
  protected readonly search = inject(SlotSearchService);
  protected readonly state = this.search.state;
  protected readonly placeholders = [1, 2];
  protected readonly chips = [1, 2, 3, 4, 5, 6];

  protected readonly loading = computed(() => {
    const s = this.state().status;
    return s === 'idle' || s === 'loading' || s === 'not-found';
  });
  protected readonly slots = computed(() => {
    const s = this.state();
    return s.status === 'ready' ? s.slots : [];
  });
  private readonly dayIndex = computed(() =>
    this.store.strip().findIndex((d) => d.date === this.store.date()),
  );
  protected readonly dayLabel = computed(
    () => this.store.strip()[this.dayIndex()]?.fullLabel ?? '',
  );
  protected readonly next = computed(() => this.store.strip()[this.dayIndex() + 1] ?? null);

  protected readonly announcement = signal('');

  constructor() {
    let last = '';
    effect(() => {
      const s = this.state();
      if (s.status !== 'ready') return;
      const id = `${s.key}|${s.fetchedAt}`;
      if (id === last) return;
      last = id;
      untracked(() => {
        const n = s.slots.length;
        this.announcement.set(
          n === 0 ? 'No times available' : `${n} ${n === 1 ? 'time' : 'times'} available`,
        );
      });
    });
  }

  protected reload(): void {
    const key = this.store.slotKey();
    if (key) this.search.load(key, { force: true });
  }
}
