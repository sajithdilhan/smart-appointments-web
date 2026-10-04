import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { EmptyState } from '@app/shared/ui/empty-state';
import { HlmButtonImports } from '@app/shared/ui/button';
import { InlineAlert } from '@app/shared/ui/inline-alert';
import { HlmInputImports } from '@app/shared/ui/input';
import { HlmLabelImports } from '@app/shared/ui/label';
import { HlmSkeletonImports } from '@app/shared/ui/skeleton';
import {
  RadioItemDirective,
  RovingRadioGroupDirective,
} from '../../../../shared/a11y/roving-radio-group.directive';
import type { BranchResponse } from '../../../../core/api/models';
import type { AppError } from '../../../../core/http/app-error';
import { ToastService } from '../../../../core/notify/toast.service';
import { hasSchedule } from '../../shared/branch-schedule';
import { ReferenceDataStore } from '../../shared/reference-data/reference-data.store';
import { StepHeadingDirective } from '../step-heading.directive';
import { BookingWizardStore } from '../wizard.store';
import { BranchCardComponent } from './branch-card.component';

export const SEARCH_DEBOUNCE_MS = 150;

/** Lower case with the accents removed, so "zurich" finds "Zürich". */
export function normaliseText(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function isOutageError(e: AppError): boolean {
  return e.kind === 'unavailable' || e.kind === 'network' || e.kind === 'timeout';
}

/**
 * Step 1 (Req 2): the branches from the shared reference data as a radio group of cards, with a
 * search over name, code and address (150 ms debounce, no API call), skeletons while loading,
 * and the empty and error states. Choosing a branch navigates to step 2 (arrow keys only move
 * focus here, so a key press never changes the page).
 */
@Component({
  selector: 'app-branch-step',
  imports: [
    BranchCardComponent,
    EmptyState,
    HlmButtonImports,
    HlmInputImports,
    HlmLabelImports,
    HlmSkeletonImports,
    InlineAlert,
    RadioItemDirective,
    RovingRadioGroupDirective,
    StepHeadingDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'book-step flex flex-col gap-4' },
  template: `
    <h2 appStepHeading class="text-xl font-semibold">Choose a branch</h2>

    @if (error(); as e) {
      <app-inline-alert tone="error">
        <p>
          {{ isOutage(e) ? 'We could not load the branches. Check your connection.' : e.message }}
        </p>
        <div>
          <button hlmBtn variant="outline" type="button" (click)="reference.ensureBranches()">
            Try again
          </button>
        </div>
      </app-inline-alert>
    } @else if (branches() === null) {
      <div
        class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        aria-busy="true"
        aria-label="Loading branches"
      >
        @for (n of skeletons; track n) {
          <div hlmSkeleton class="h-40"></div>
        }
      </div>
    } @else if (branches()!.length === 0) {
      <app-empty-state title="There are no branches available for online booking yet." />
    } @else {
      <div class="flex max-w-md flex-col gap-1.5">
        <label hlmLabel for="branch-search">Search branches</label>
        <input
          hlmInput
          id="branch-search"
          type="search"
          autocomplete="off"
          [value]="store.searchText()"
          (input)="onSearch($event)"
        />
      </div>
      <p role="status" class="sr-only">{{ countText() }}</p>

      @if (filtered().length === 0) {
        <app-empty-state [title]="'No branches match &quot;' + query() + '&quot;'">
          <div actions>
            <button hlmBtn variant="outline" type="button" (click)="clearSearch()">
              Clear search
            </button>
          </div>
        </app-empty-state>
      } @else {
        <div
          [appRadioGroup]="'Branch'"
          [selectOnMove]="false"
          (selected)="store.chooseBranch($event)"
          class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          @for (b of filtered(); track b.id) {
            <app-branch-card
              [appRadioItem]="b.id"
              [checked]="store.effective().branch === b.id"
              [radioDisabled]="!bookable(b)"
              [branch]="b"
              [nowMs]="store.nowMs()"
            />
          }
        </div>
      }
    }
  `,
})
export class BranchStepComponent {
  protected readonly store = inject(BookingWizardStore);
  protected readonly reference = inject(ReferenceDataStore);
  private readonly toast = inject(ToastService);
  protected readonly isOutage = isOutageError;
  protected readonly skeletons = [1, 2, 3, 4];

  protected readonly branches = this.reference.branches;
  /** The debounced search text that the list and the count follow. */
  protected readonly query = signal(this.store.searchText().trim());
  private timer: ReturnType<typeof setTimeout> | undefined;

  protected readonly filtered = computed<BranchResponse[]>(() => {
    const list = this.branches() ?? [];
    const q = normaliseText(this.query());
    if (!q) return list;
    return list.filter((b) =>
      [b.name, b.code, b.address].some((field) => normaliseText(field).includes(q)),
    );
  });

  protected readonly countText = computed(() => {
    if (!this.query()) return '';
    const n = this.filtered().length;
    return `${n} ${n === 1 ? 'branch' : 'branches'} found`;
  });

  protected readonly error = computed(() =>
    this.reference.branchesState() === 'error' && this.branches() === null
      ? this.reference.branchesError()
      : null,
  );

  constructor() {
    this.reference.ensureBranches();
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));

    // An error that is not an outage is shown inline and toasted once.
    let toasted: AppError | null = null;
    effect(() => {
      const e = this.error();
      if (e && e !== toasted && !isOutageError(e)) {
        toasted = e;
        untracked(() => this.toast.showError(e));
      }
    });
  }

  protected bookable = hasSchedule;

  protected onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.store.setSearchText(value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.query.set(value.trim()), SEARCH_DEBOUNCE_MS);
  }

  protected clearSearch(): void {
    clearTimeout(this.timer);
    this.store.setSearchText('');
    this.query.set('');
    document.getElementById('branch-search')?.focus();
  }
}
