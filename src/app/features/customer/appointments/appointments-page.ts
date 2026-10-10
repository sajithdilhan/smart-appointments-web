import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink, RouterOutlet } from '@angular/router';
import { HlmButtonImports } from '@app/shared/ui/button';
import { SessionStore } from '../../../core/auth/session.store';
import { landingRouteFor } from '../../../core/auth/landing';
import { fromEpochMs } from '../../../core/time';
import { CLOCK } from '../../../core/util/clock';
import { ReferenceDataStore } from '../shared/reference-data/reference-data.store';
import { AppointmentTabs } from './appointment-tabs';
import { AppointmentTimeline } from './appointment-timeline';
import { groupByDate, toViewModel } from './appointment-view';
import { AppointmentsSkeleton } from './appointments-skeleton';
import { AppointmentsStore } from './appointments.store';
import { DetailHost } from './detail-host';
import { EmptyState } from './empty-state';
import { InlineError } from './inline-error';
import { LoadMore } from './load-more';
import { parseTab, type AppointmentTab } from './tab-params';

/**
 * `/appointments`: the tabs (URL state), the timeline of the active tab and its paging. The
 * detail (task 9) is a child route rendered in the outlet below.
 */
@Component({
  selector: 'app-appointments-page',
  imports: [
    RouterLink,
    RouterOutlet,
    HlmButtonImports,
    AppointmentTabs,
    AppointmentTimeline,
    AppointmentsSkeleton,
    EmptyState,
    InlineError,
    LoadMore,
  ],
  providers: [AppointmentsStore, DetailHost],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (host.presentation() !== 'page') {
      <div class="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h1
            id="appointments-heading"
            tabindex="-1"
            class="text-3xl font-semibold tracking-tight outline-none"
          >
            My appointments
          </h1>
          <a hlmBtn routerLink="/book">Book an appointment</a>
        </div>

        <app-appointment-tabs
          [tab]="filter().tab"
          [showCancelled]="filter().showCancelled"
          (tabChange)="selectTab($event)"
          (showCancelledChange)="selectShowCancelled($event)"
        />

        <p role="status" class="text-sm text-muted-foreground">{{ countText() }}</p>

        @if (lookupFailed()) {
          <app-inline-error message="Some names could not be loaded." (retry)="retryLookup()" />
        }

        <div
          role="tabpanel"
          id="appointments-panel"
          [attr.aria-labelledby]="'appointments-tab-' + filter().tab"
          [attr.aria-busy]="showSkeleton() ? 'true' : null"
          class="flex flex-col gap-4"
        >
          @if (showSkeleton()) {
            <app-appointments-skeleton />
          } @else if (store.status() === 'error') {
            <app-inline-error
              [message]="store.error()?.message ?? ''"
              (retry)="store.loadFirst()"
            />
            @if (store.error()?.status === 403) {
              <a [routerLink]="landing()" class="text-sm font-medium text-primary underline">
                Go to your home page
              </a>
            }
          } @else if (store.isEmpty()) {
            <app-empty-state [tab]="filter().tab" />
          } @else {
            <app-appointment-timeline [groups]="groups()" [pendingIds]="pendingIds()" />
            @if (store.status() === 'more-error') {
              <app-inline-error
                [message]="store.error()?.message ?? ''"
                (retry)="store.retryMore()"
              />
            } @else if (store.hasMore()) {
              <div class="flex justify-center">
                <app-load-more [loading]="store.status() === 'loading-more'" (more)="loadMore()" />
              </div>
            }
          }
          <p class="sr-only" role="status">{{ store.announcement() }}</p>
        </div>
      </div>
    }
    <router-outlet />
  `,
})
export class AppointmentsPage {
  protected readonly store = inject(AppointmentsStore);
  protected readonly host = inject(DetailHost);
  private readonly reference = inject(ReferenceDataStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly session = inject(SessionStore);
  private readonly clock = inject(CLOCK);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);

  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  protected readonly filter = computed(() =>
    parseTab({ tab: this.query().get('tab'), cancelled: this.query().get('cancelled') }),
  );

  protected readonly landing = computed(() => {
    const role = this.session.role();
    return role ? landingRouteFor(role) : '/';
  });

  private readonly lookupSettled = computed(() => {
    const states = [this.reference.branchesState(), this.reference.servicesState()];
    return states.every((s) => s === 'ready' || s === 'error');
  });
  protected readonly lookupFailed = computed(
    () => this.reference.branchesState() === 'error' || this.reference.servicesState() === 'error',
  );

  /** Skeletons stay until the first page and the lookup have both settled (Req 2.1, 4.1). */
  protected readonly showSkeleton = computed(() => {
    const status = this.store.status();
    if (status === 'idle' || status === 'loading-first') return true;
    return status !== 'error' && !this.lookupSettled();
  });

  protected readonly groups = computed(() => {
    const tab = this.filter().tab;
    const now = fromEpochMs(this.clock.now());
    return groupByDate(
      this.store.items().map((item) =>
        toViewModel(item, {
          tab,
          now,
          branch: this.reference.branchById(item.branchId),
          service: this.reference.serviceById(item.serviceTypeId),
        }),
      ),
    );
  });

  protected readonly pendingIds = computed(() => Object.keys(this.store.pending()));

  /** "N appointments" for the active tab, set once a load has finished. */
  protected readonly countText = computed(() => {
    const status = this.store.status();
    const total = this.store.totalCount();
    if (total === null || status === 'idle' || status === 'loading-first' || status === 'error') {
      return '';
    }
    return total === 1 ? '1 appointment' : `${total} appointments`;
  });

  constructor() {
    this.reference.ensureBranches();
    this.reference.ensureServices();
    effect(() => {
      const filter = this.filter();
      untracked(() => void this.store.setFilter(filter));
    });
    afterNextRender(() => this.document.getElementById('appointments-heading')?.focus(), {
      injector: this.injector,
    });
  }

  protected selectTab(tab: AppointmentTab): void {
    void this.navigate({
      tab,
      cancelled: tab === 'upcoming' && this.filter().showCancelled ? '1' : null,
    });
  }

  protected selectShowCancelled(on: boolean): void {
    void this.navigate({ tab: 'upcoming', cancelled: on ? '1' : null });
  }

  protected retryLookup(): void {
    this.reference.ensureBranches();
    this.reference.ensureServices();
  }

  /** Keeps focus on "Load more", or moves it to the first new item when the button goes away. */
  protected async loadMore(): Promise<void> {
    const before = this.store.items().length;
    await this.store.loadMore();
    afterNextRender(
      () => {
        const active = this.document.activeElement;
        const button = this.document.querySelector<HTMLElement>('app-load-more button');
        if (button && (active === null || active === this.document.body || active === button)) {
          button.focus();
          return;
        }
        if (!button) {
          const first = this.store.items()[before];
          if (first) {
            this.document
              .querySelector<HTMLElement>(`a[href="/appointments/${first.id}"]`)
              ?.focus();
          }
        }
      },
      { injector: this.injector },
    );
  }

  private navigate(queryParams: Record<string, string | null>) {
    return this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
