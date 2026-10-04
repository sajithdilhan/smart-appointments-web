import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideTriangleAlert } from '@ng-icons/lucide';
import { HlmButton } from '@app/shared/ui/button';
import { HlmTableImports } from '@app/shared/ui/table';
import type { Branch } from '../../../core/api/models';
import { ViewportService } from '../../../core/util/viewport.service';
import { FocusHeadingDirective } from '../../../shared/a11y/focus-heading.directive';
import { BranchesStore } from '../data/branches.store';
import { reloadOnRecovery } from '../data/reload-on-recovery';
import { ListStates } from '../shared/list-states.component';
import { ListToolbar, type SortOption } from '../shared/list-toolbar.component';
import { createListView, syncQueryParams, textSorter } from '../shared/list-view';
import { SortHeader } from '../shared/sort-header.component';
import { StatusBadge } from '../shared/status-badge.component';

/** "Asia/Colombo, 5 days open", or null when the branch has no schedule yet. */
export function scheduleSummary(b: Branch): string | null {
  if (!b.timeZoneId || b.workingHours.length === 0) return null;
  const n = b.workingHours.length;
  return `${b.timeZoneId}, ${n} ${n === 1 ? 'day' : 'days'} open`;
}

const LINK =
  'inline-flex min-h-10 min-w-10 items-center rounded-md px-2 font-medium text-primary underline underline-offset-4 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none';

/**
 * All branches as a table (cards below 768 px) with search, a status filter and sortable Code and
 * Name. The create and edit drawers are child routes rendered in the outlet at the end, so this
 * page stays mounted, with its search, filter and sort, behind them.
 */
@Component({
  selector: 'app-branches-page',
  imports: [
    FocusHeadingDirective,
    HlmButton,
    HlmTableImports,
    ListStates,
    ListToolbar,
    NgIcon,
    RouterLink,
    RouterOutlet,
    SortHeader,
    StatusBadge,
  ],
  providers: [provideIcons({ lucideTriangleAlert })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-6xl flex-col gap-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h1 appFocusHeading class="text-3xl font-semibold tracking-tight">Branches</h1>
        <a hlmBtn routerLink="/admin/branches/new" queryParamsHandling="preserve">New branch</a>
      </div>

      <app-list-toolbar
        searchLabel="Search branches"
        [view]="view"
        [sortOptions]="isMd() ? [] : sortOptions"
      />
      <p class="sr-only" role="status">{{ view.announcement() }}</p>

      <app-list-states
        noun="branches"
        [state]="view.state()"
        [errorMessage]="store.error()?.message ?? null"
        (retry)="store.load()"
        (clearFilters)="view.clearFilters()"
      >
        <a empty hlmBtn routerLink="/admin/branches/new" queryParamsHandling="preserve">
          New branch
        </a>

        @if (isMd()) {
          <div hlmTableContainer>
            <table hlmTable>
              <caption class="sr-only">
                Branches
              </caption>
              <thead hlmTHead>
                <tr hlmTr>
                  <th
                    appSortHeader
                    hlmTh
                    label="Code"
                    [direction]="view.ariaSort('code')"
                    (sortRequested)="view.cycleSort('code')"
                  ></th>
                  <th
                    appSortHeader
                    hlmTh
                    label="Name"
                    [direction]="view.ariaSort('name')"
                    (sortRequested)="view.cycleSort('name')"
                  ></th>
                  <th hlmTh scope="col">Phone</th>
                  <th hlmTh scope="col">Status</th>
                  <th hlmTh scope="col">Schedule</th>
                  <th hlmTh scope="col">Actions</th>
                </tr>
              </thead>
              <tbody hlmTBody>
                @for (b of view.rows(); track b.id) {
                  <tr hlmTr>
                    <td hlmTd class="font-mono">{{ b.code }}</td>
                    <td hlmTd class="font-medium">{{ b.name }}</td>
                    <td hlmTd>{{ b.phoneNumber }}</td>
                    <td hlmTd><app-status-badge [active]="b.isActive" /></td>
                    <td hlmTd>
                      @if (summary(b); as text) {
                        {{ text }}
                      } @else {
                        <span class="inline-flex items-center gap-1">
                          <ng-icon name="lucideTriangleAlert" size="16" aria-hidden="true" />
                          Not set
                        </span>
                      }
                    </td>
                    <td hlmTd>
                      <div class="flex flex-wrap items-center gap-1">
                        <a
                          [class]="linkClass"
                          [routerLink]="['/admin/branches', b.id]"
                          queryParamsHandling="preserve"
                          [attr.aria-label]="'Edit ' + b.name"
                          >Edit</a
                        >
                        <a
                          [class]="linkClass"
                          [routerLink]="['/admin/branches', b.id, 'schedule']"
                          [attr.aria-label]="'Schedule for ' + b.name"
                          >Schedule</a
                        >
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <ul class="flex flex-col gap-3">
            @for (b of view.rows(); track b.id) {
              <li class="rounded-lg border bg-card p-4">
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <p class="font-medium">{{ b.name }}</p>
                    <p class="font-mono text-sm text-muted-foreground">{{ b.code }}</p>
                  </div>
                  <app-status-badge [active]="b.isActive" />
                </div>
                <dl class="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt class="text-muted-foreground">Phone</dt>
                  <dd>{{ b.phoneNumber }}</dd>
                  <dt class="text-muted-foreground">Schedule</dt>
                  <dd>
                    @if (summary(b); as text) {
                      {{ text }}
                    } @else {
                      <span class="inline-flex items-center gap-1">
                        <ng-icon name="lucideTriangleAlert" size="16" aria-hidden="true" />
                        Not set
                      </span>
                    }
                  </dd>
                </dl>
                <div class="mt-3 flex flex-wrap items-center gap-1">
                  <a
                    [class]="linkClass"
                    [routerLink]="['/admin/branches', b.id]"
                    queryParamsHandling="preserve"
                    [attr.aria-label]="'Edit ' + b.name"
                    >Edit</a
                  >
                  <a
                    [class]="linkClass"
                    [routerLink]="['/admin/branches', b.id, 'schedule']"
                    [attr.aria-label]="'Schedule for ' + b.name"
                    >Schedule</a
                  >
                </div>
              </li>
            }
          </ul>
        }
      </app-list-states>
    </div>
    <router-outlet />
  `,
})
export class BranchesPage {
  protected readonly store = inject(BranchesStore);
  protected readonly isMd = inject(ViewportService).isMd;
  protected readonly linkClass = LINK;
  protected readonly summary = scheduleSummary;

  protected readonly view = createListView<Branch>({
    items: this.store.items,
    status: this.store.status,
    searchText: (b) => `${b.code} ${b.name} ${b.address} ${b.phoneNumber}`,
    sorters: {
      code: textSorter((b) => b.code),
      name: textSorter((b) => b.name),
    },
    noun: 'branches',
    singular: 'branch',
  });

  protected readonly sortOptions: readonly SortOption[] = [
    { key: 'name', dir: 'asc', label: 'Name (A to Z)' },
    { key: 'name', dir: 'desc', label: 'Name (Z to A)' },
    { key: 'code', dir: 'asc', label: 'Code (A to Z)' },
    { key: 'code', dir: 'desc', label: 'Code (Z to A)' },
  ];

  constructor() {
    syncQueryParams(this.view);
    void this.store.load();
    reloadOnRecovery(this.store);
  }
}
