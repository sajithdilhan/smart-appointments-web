import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink, RouterOutlet } from '@angular/router';
import { HlmButton } from '@app/shared/ui/button';
import { HlmSkeleton } from '@app/shared/ui/skeleton';
import { HlmTableImports } from '@app/shared/ui/table';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLoaderCircle } from '@ng-icons/lucide';
import { map } from 'rxjs';
import type { StaffAccount } from '../../../core/api/models';
import { ViewportService } from '../../../core/util/viewport.service';
import { FocusHeadingDirective } from '../../../shared/a11y/focus-heading.directive';
import { BranchesStore } from '../data/branches.store';
import { reloadOnRecovery } from '../data/reload-on-recovery';
import { StaffAccountsStore } from '../data/staff-accounts.store';
import { StatusBadge } from '../shared/status-badge.component';
import { StaffRowActions } from './staff-actions';
import { StaffRowMenu, type StaffMenuEvent } from './staff-row-menu.component';
import {
  fullName,
  parseBranchParam,
  parseStatusParam,
  registeredLabel,
  sameStaffFilter,
  toFilter,
} from './staff-view';

const SELECT =
  'h-9 rounded-md border border-input bg-background px-2.5 text-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none';

/**
 * All staff accounts as a table (cards below 640 px) with server-side branch and status filters
 * kept in `?branch=` and `?status=`, Load more, and a row actions menu. The create and edit
 * drawers are child routes rendered in the outlet at the end, so this page stays mounted, with
 * its filters, behind them.
 */
@Component({
  selector: 'app-staff-accounts-page',
  imports: [
    FocusHeadingDirective,
    HlmButton,
    HlmSkeleton,
    HlmTableImports,
    NgIcon,
    RouterLink,
    RouterOutlet,
    StaffRowMenu,
    StatusBadge,
  ],
  providers: [provideIcons({ lucideLoaderCircle }), StaffRowActions],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-6xl flex-col gap-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h1 appFocusHeading class="text-3xl font-semibold tracking-tight">Staff</h1>
        <a hlmBtn routerLink="/admin/staff/new" queryParamsHandling="preserve">New staff member</a>
      </div>

      <div class="flex flex-wrap items-end gap-3">
        <label class="flex flex-col gap-1 text-sm font-medium">
          Branch
          <select
            [class]="selectClass"
            [value]="branchValue()"
            (change)="setBranch($any($event.target).value)"
          >
            <option value="">All branches</option>
            @for (b of branches.items(); track b.id) {
              <option [value]="b.id" [selected]="b.id === branchValue()">
                {{ b.name }}{{ b.isActive ? '' : ' (inactive)' }}
              </option>
            }
            @if (unknownBranchFilter(); as id) {
              <option [value]="id" selected>Unknown branch</option>
            }
          </select>
        </label>
        <label class="flex flex-col gap-1 text-sm font-medium">
          Status
          <select
            [class]="selectClass"
            [value]="statusValue()"
            (change)="setStatus($any($event.target).value)"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
      </div>

      @if (actions.blocked(); as blocked) {
        <div
          role="alert"
          class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm"
        >
          <p>{{ blocked.message }}</p>
          <a
            class="font-medium text-primary underline underline-offset-4"
            [routerLink]="['/admin/staff', blocked.id]"
            queryParamsHandling="preserve"
            (click)="actions.dismissBlocked()"
            >Edit {{ blocked.name }}</a
          >
          <button
            hlmBtn
            variant="outline"
            size="sm"
            type="button"
            (click)="actions.dismissBlocked()"
          >
            Dismiss
          </button>
        </div>
      }

      @switch (view()) {
        @case ('loading') {
          <div aria-busy="true" aria-label="Loading staff" role="status" class="space-y-2">
            @for (n of skeletonRows; track n) {
              <hlm-skeleton class="block h-12 w-full" />
            }
          </div>
        }
        @case ('error') {
          <div role="alert" class="flex flex-col items-start gap-3 rounded-lg border p-4">
            <p>{{ store.error()?.message || 'Something went wrong.' }}</p>
            <button hlmBtn variant="outline" type="button" (click)="retry()">Retry</button>
          </div>
        }
        @case ('empty') {
          <div class="flex flex-col items-start gap-3 rounded-lg border p-6">
            <p>No staff accounts yet.</p>
            <a hlmBtn routerLink="/admin/staff/new" queryParamsHandling="preserve"
              >New staff member</a
            >
          </div>
        }
        @case ('no-match') {
          <div class="flex flex-col items-start gap-3 rounded-lg border p-6">
            <p>No staff match these filters.</p>
            <button hlmBtn variant="outline" type="button" (click)="clearFilters()">
              Clear filters
            </button>
          </div>
        }
        @default {
          @if (store.status() === 'error') {
            <div role="alert" class="flex flex-wrap items-center gap-3 rounded-lg border p-4">
              <p>{{ store.error()?.message || 'Something went wrong.' }}</p>
              <button hlmBtn variant="outline" type="button" (click)="retry()">Retry</button>
            </div>
          }
          @if (isSm()) {
            <div hlmTableContainer>
              <table hlmTable>
                <caption class="sr-only">
                  Staff accounts
                </caption>
                <thead hlmTHead>
                  <tr hlmTr>
                    <th hlmTh scope="col">Name</th>
                    <th hlmTh scope="col">Email</th>
                    <th hlmTh scope="col">Phone</th>
                    <th hlmTh scope="col">Branch</th>
                    <th hlmTh scope="col">Status</th>
                    <th hlmTh scope="col">Registered</th>
                    <th hlmTh scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody hlmTBody>
                  @for (a of store.items(); track a.id) {
                    <tr hlmTr>
                      <td hlmTd class="font-medium">{{ name(a) }}</td>
                      <td hlmTd class="break-all">{{ a.email }}</td>
                      <td hlmTd>{{ a.phoneNumber }}</td>
                      <td hlmTd>{{ branchName(a) }}</td>
                      <td hlmTd><app-status-badge [active]="a.isActive" /></td>
                      <td hlmTd>{{ registered(a) }}</td>
                      <td hlmTd>
                        <app-staff-row-menu
                          [account]="a"
                          [name]="name(a)"
                          [pending]="actions.pending().has(a.id)"
                          (deactivate)="deactivate($event)"
                          (reactivate)="reactivate($event)"
                          (remove)="remove($event)"
                        />
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <ul class="flex flex-col gap-3">
              @for (a of store.items(); track a.id) {
                <li class="rounded-lg border bg-card p-4">
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <p class="font-medium">{{ name(a) }}</p>
                      <p class="text-sm break-all text-muted-foreground">{{ a.email }}</p>
                    </div>
                    <app-status-badge [active]="a.isActive" />
                  </div>
                  <dl class="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                    <dt class="text-muted-foreground">Phone</dt>
                    <dd>{{ a.phoneNumber }}</dd>
                    <dt class="text-muted-foreground">Branch</dt>
                    <dd>{{ branchName(a) }}</dd>
                    <dt class="text-muted-foreground">Registered</dt>
                    <dd>{{ registered(a) }}</dd>
                  </dl>
                  <div class="mt-3 flex justify-end">
                    <app-staff-row-menu
                      [account]="a"
                      [name]="name(a)"
                      [pending]="actions.pending().has(a.id)"
                      (deactivate)="deactivate($event)"
                      (reactivate)="reactivate($event)"
                      (remove)="remove($event)"
                    />
                  </div>
                </li>
              }
            </ul>
          }
          @if (hasMore()) {
            <div class="flex justify-center">
              <button
                hlmBtn
                variant="outline"
                type="button"
                [disabled]="store.status() === 'loading-more'"
                [attr.aria-busy]="store.status() === 'loading-more' ? 'true' : null"
                (click)="store.loadMore()"
              >
                @if (store.status() === 'loading-more') {
                  <ng-icon name="lucideLoaderCircle" class="animate-spin" aria-hidden="true" />
                }
                Load more
              </button>
            </div>
          }
        }
      }
    </div>
    <router-outlet />
  `,
})
export class StaffAccountsPage {
  protected readonly store = inject(StaffAccountsStore);
  protected readonly actions = inject(StaffRowActions);
  protected readonly branches = inject(BranchesStore);
  protected readonly isSm = inject(ViewportService).isSm;
  protected readonly selectClass = SELECT;
  protected readonly skeletonRows = [1, 2, 3, 4, 5];

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly params = toSignal(
    this.route.queryParamMap.pipe(
      map((p) => ({ branch: p.get('branch'), status: p.get('status') })),
    ),
    { initialValue: { branch: null, status: null } },
  );
  protected readonly filter = computed(() => toFilter(this.params().branch, this.params().status), {
    equal: sameStaffFilter,
  });
  protected readonly branchValue = computed(() => this.filter().branchId ?? '');
  protected readonly statusValue = computed(() => parseStatusParam(this.params().status));
  /** A filtered branch the branches store does not know (deleted, or not loaded): kept visible. */
  protected readonly unknownBranchFilter = computed(() => {
    const id = this.filter().branchId;
    return id !== null && this.branches.status() === 'loaded' && !this.branches.byId(id)
      ? id
      : null;
  });

  protected readonly hasMore = computed(() => this.store.items().length < this.store.totalCount());
  protected readonly filtersActive = computed(
    () => this.filter().branchId !== null || this.filter().isActive !== null,
  );

  protected readonly view = computed<'loading' | 'error' | 'empty' | 'no-match' | 'list'>(() => {
    if (this.store.items().length > 0) return 'list';
    const status = this.store.status();
    if (status === 'error') return 'error';
    if (status === 'idle' || status === 'loading') return 'loading';
    return this.filtersActive() ? 'no-match' : 'empty';
  });

  constructor() {
    void this.branches.load();
    reloadOnRecovery(this.branches);
    // The store reloads itself when the backend recovers; the filter drives every other load.
    effect(() => {
      const filter = this.filter();
      untracked(() => void this.store.load(filter));
    });
  }

  protected name = fullName;
  protected registered = (a: StaffAccount): string => registeredLabel(a.registeredAtUtc);

  protected branchName(a: StaffAccount): string {
    const branch = this.branches.byId(a.branchId);
    if (branch) return branch.name;
    const status = this.branches.status();
    return status === 'idle' || status === 'loading' ? 'Loading…' : 'Unknown branch';
  }

  protected setBranch(value: string): void {
    this.navigate({ branch: parseBranchParam(value), status: this.paramStatus() });
  }

  protected setStatus(value: string): void {
    const status = parseStatusParam(value);
    this.navigate({
      branch: this.filter().branchId,
      status: status === 'all' ? null : status,
    });
  }

  protected clearFilters(): void {
    this.navigate({ branch: null, status: null });
  }

  protected retry(): void {
    void (this.store.items().length === 0 ? this.store.load() : this.store.reload());
  }

  protected deactivate(e: StaffMenuEvent): void {
    void this.actions.deactivate(e.account, e.opener);
  }

  protected reactivate(e: StaffMenuEvent): void {
    void this.actions.reactivate(e.account, e.opener);
  }

  protected remove(e: StaffMenuEvent): void {
    void this.actions.remove(e.account, e.opener);
  }

  private paramStatus(): string | null {
    const status = parseStatusParam(this.params().status);
    return status === 'all' ? null : status;
  }

  private navigate(queryParams: { branch: string | null; status: string | null }): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
