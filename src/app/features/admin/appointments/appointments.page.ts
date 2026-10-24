import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { HlmButton } from '@app/shared/ui/button';
import type { Branch } from '../../../core/api/models';
import { isGuid } from '../../../core/util/guid';
import {
  AppointmentSheet,
  BRANCH_DAY_CONTEXT,
  BranchDayStore,
  DayAnnouncer,
  DayList,
  DayNav,
  StatusFilterSelect,
  createDayUrlState,
  type BranchDayContext,
  type OpenRowEvent,
} from '../../../shared/branch-day';
import { BranchesStore } from '../data/branches.store';
import { reloadOnRecovery } from '../data/reload-on-recovery';
import { ServicesStore } from '../data/services.store';

const SELECT = 'h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm';

/** The branch picked in `?branch=`: only a GUID that names a loaded branch counts (Req 5.2). */
function branchContext(): BranchDayContext {
  const route = inject(ActivatedRoute);
  const branches = inject(BranchesStore);
  const services = inject(ServicesStore);
  const query = toSignal(route.queryParamMap, { initialValue: route.snapshot.queryParamMap });

  const branch = computed<Branch | null>(() => {
    const raw = query().get('branch');
    if (!isGuid(raw)) return null;
    const id = raw.toLowerCase();
    return branches.items().find((b) => b.id.toLowerCase() === id) ?? null;
  });

  return {
    branchId: computed(() => branch()?.id ?? null),
    zone: computed(() => branch()?.timeZoneId?.trim() || 'UTC'),
    services: computed(() => new Map(services.items().map((s) => [s.id, { name: s.name }]))),
  };
}

/** Any branch's appointments for a day, with the marks (Req 5, FR-BKG-004 and FR-BKG-006). */
@Component({
  selector: 'app-admin-appointments-page',
  imports: [AppointmentSheet, DayAnnouncer, DayList, DayNav, HlmButton, StatusFilterSelect],
  providers: [BranchDayStore, { provide: BRANCH_DAY_CONTEXT, useFactory: branchContext }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-col gap-1.5 sm:max-w-sm">
        <label for="admin-appointments-branch" class="text-sm font-medium">Branch</label>
        <select id="admin-appointments-branch" [class]="selectClass" (change)="onBranch($event)">
          <option value="" [selected]="!branchId()">Choose a branch</option>
          @for (b of branches.items(); track b.id) {
            <option [value]="b.id" [selected]="b.id === branchId()">
              {{ b.name }} ({{ b.code }}){{ b.isActive ? '' : ' (inactive)' }}
            </option>
          }
        </select>
      </div>

      @if (branchId()) {
        <app-day-nav
          [date]="url.date()"
          [today]="url.today()"
          [zoneLabel]="zoneLabel()"
          (dateChange)="url.setDate($event)"
        />
        <div class="flex flex-wrap items-end gap-3">
          <app-status-filter [value]="url.status()" (valueChange)="url.setStatus($event)" />
          <button
            hlmBtn
            variant="outline"
            type="button"
            [disabled]="busy()"
            (click)="store.refresh()"
          >
            Refresh
          </button>
        </div>
        <app-day-list (open)="onOpen($event)" />
        <app-appointment-sheet [rowId]="openId()" [opener]="opener()" (closed)="openId.set(null)" />
        <app-day-announcer />
      } @else {
        <h1 class="text-3xl font-semibold tracking-tight">Appointments</h1>
        @if (branches.status() === 'error' && branches.items().length === 0) {
          <div role="alert" class="flex flex-wrap items-center gap-3 text-sm">
            <p>Branches could not be loaded.</p>
            <button hlmBtn variant="outline" type="button" (click)="branches.load({ force: true })">
              Retry
            </button>
          </div>
        } @else {
          <p class="text-muted-foreground">Choose a branch to see its appointments.</p>
        }
      }
    </div>
  `,
})
export class AdminAppointmentsPage {
  protected readonly branches = inject(BranchesStore);
  protected readonly store = inject(BranchDayStore);
  private readonly ctx = inject(BRANCH_DAY_CONTEXT);
  private readonly services = inject(ServicesStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly selectClass = SELECT;
  protected readonly branchId = this.ctx.branchId;
  protected readonly url = createDayUrlState(this.ctx);
  protected readonly openId = signal<string | null>(null);
  protected readonly opener = signal<HTMLElement | null>(null);
  protected readonly busy = computed(
    () => this.store.load() === 'loading' || this.store.load() === 'refreshing',
  );
  protected readonly zoneLabel = computed(() => {
    const id = this.ctx.branchId();
    return id && !this.branches.byId(id)?.timeZoneId?.trim() ? 'UTC' : null;
  });

  constructor() {
    void this.branches.load();
    void this.services.load();
    reloadOnRecovery(this.branches);
    reloadOnRecovery(this.services);

    // Each change of branch, day or status opens that day; no branch clears the list (Req 5.2).
    effect(() => {
      const branchId = this.ctx.branchId();
      const date = this.url.date();
      const status = this.url.status();
      untracked(() => {
        void this.store.open(branchId ? { branchId, date, status } : null);
      });
    });

    // A sheet belongs to one branch's list: close it when the branch changes.
    effect(() => {
      this.ctx.branchId();
      untracked(() => this.openId.set(null));
    });
  }

  protected onBranch(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    // The branch and the cleared date go in one navigation: the date is then re-derived as
    // today in the new branch's zone, and the status stays (Req 5.4).
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { branch: id || null, date: null },
      queryParamsHandling: 'merge',
    });
  }

  protected onOpen(event: OpenRowEvent): void {
    this.opener.set(event.trigger);
    this.openId.set(event.id);
  }
}
