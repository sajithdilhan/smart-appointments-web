import { ChangeDetectionStrategy, Component, inject, viewChild } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { HlmButton } from '@app/shared/ui/button';
import { HlmTableImports } from '@app/shared/ui/table';
import type { ServiceType } from '../../../core/api/models';
import { ViewportService } from '../../../core/util/viewport.service';
import { FocusHeadingDirective } from '../../../shared/a11y/focus-heading.directive';
import { reloadOnRecovery } from '../data/reload-on-recovery';
import { ServicesStore } from '../data/services.store';
import { ListStates } from '../shared/list-states.component';
import { ListToolbar, type SortOption } from '../shared/list-toolbar.component';
import { createListView, syncQueryParams, textSorter } from '../shared/list-view';
import { SortHeader } from '../shared/sort-header.component';
import { StatusBadge } from '../shared/status-badge.component';
import { StatusConfirm } from '../shared/status-confirm.component';
import { formatDuration } from './duration';

const LINK =
  'inline-flex min-h-10 min-w-10 items-center rounded-md px-2 font-medium text-primary underline underline-offset-4 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none';

/**
 * All services as a table (cards below 768 px) with search, a status filter and sortable Code,
 * Name and Duration. The create and edit drawers are child routes rendered in the outlet at the
 * end, so this page stays mounted, with its search, filter and sort, behind them.
 */
@Component({
  selector: 'app-services-page',
  imports: [
    FocusHeadingDirective,
    HlmButton,
    HlmTableImports,
    ListStates,
    ListToolbar,
    RouterLink,
    RouterOutlet,
    SortHeader,
    StatusBadge,
    StatusConfirm,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-6xl flex-col gap-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h1 appFocusHeading class="text-3xl font-semibold tracking-tight">Services</h1>
        <a hlmBtn routerLink="/admin/services/new" queryParamsHandling="preserve">New service</a>
      </div>

      <app-list-toolbar
        searchLabel="Search services"
        [view]="view"
        [sortOptions]="isMd() ? [] : sortOptions"
      />
      <p class="sr-only" role="status">{{ view.announcement() }}</p>

      <app-list-states
        noun="services"
        [state]="view.state()"
        [errorMessage]="store.error()?.message ?? null"
        (retry)="store.load()"
        (clearFilters)="view.clearFilters()"
      >
        <a empty hlmBtn routerLink="/admin/services/new" queryParamsHandling="preserve">
          New service
        </a>

        @if (isMd()) {
          <div hlmTableContainer>
            <table hlmTable>
              <caption class="sr-only">
                Services
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
                  <th
                    appSortHeader
                    hlmTh
                    label="Duration"
                    [direction]="view.ariaSort('duration')"
                    (sortRequested)="view.cycleSort('duration')"
                  ></th>
                  <th hlmTh scope="col">Status</th>
                  <th hlmTh scope="col">Actions</th>
                </tr>
              </thead>
              <tbody hlmTBody>
                @for (s of view.rows(); track s.id) {
                  <tr hlmTr>
                    <td hlmTd class="font-mono">{{ s.code }}</td>
                    <td hlmTd class="font-medium">{{ s.name }}</td>
                    <td hlmTd>{{ duration(s) }}</td>
                    <td hlmTd><app-status-badge [active]="s.isActive" /></td>
                    <td hlmTd>
                      <div class="flex flex-wrap items-center gap-1">
                        <a
                          [class]="linkClass"
                          [routerLink]="['/admin/services', s.id]"
                          queryParamsHandling="preserve"
                          [attr.aria-label]="'Edit ' + s.name"
                          >Edit</a
                        >
                        <button
                          type="button"
                          [class]="linkClass"
                          [attr.aria-label]="(s.isActive ? 'Deactivate ' : 'Activate ') + s.name"
                          (click)="toggle(s, $event)"
                        >
                          {{ s.isActive ? 'Deactivate' : 'Activate' }}
                        </button>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <ul class="flex flex-col gap-3">
            @for (s of view.rows(); track s.id) {
              <li class="rounded-lg border bg-card p-4">
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <p class="font-medium">{{ s.name }}</p>
                    <p class="font-mono text-sm text-muted-foreground">{{ s.code }}</p>
                  </div>
                  <app-status-badge [active]="s.isActive" />
                </div>
                <dl class="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt class="text-muted-foreground">Duration</dt>
                  <dd>{{ duration(s) }}</dd>
                </dl>
                <div class="mt-3 flex flex-wrap items-center gap-1">
                  <a
                    [class]="linkClass"
                    [routerLink]="['/admin/services', s.id]"
                    queryParamsHandling="preserve"
                    [attr.aria-label]="'Edit ' + s.name"
                    >Edit</a
                  >
                  <button
                    type="button"
                    [class]="linkClass"
                    [attr.aria-label]="(s.isActive ? 'Deactivate ' : 'Activate ') + s.name"
                    (click)="toggle(s, $event)"
                  >
                    {{ s.isActive ? 'Deactivate' : 'Activate' }}
                  </button>
                </div>
              </li>
            }
          </ul>
        }
      </app-list-states>
    </div>
    <app-status-confirm />
    <router-outlet />
  `,
})
export class ServicesPage {
  protected readonly store = inject(ServicesStore);
  protected readonly isMd = inject(ViewportService).isMd;
  protected readonly linkClass = LINK;
  protected readonly duration = (s: ServiceType) => formatDuration(s.durationMinutes);

  protected readonly view = createListView<ServiceType>({
    items: this.store.items,
    status: this.store.status,
    searchText: (s) => `${s.code} ${s.name} ${s.description ?? ''}`,
    sorters: {
      code: textSorter((s) => s.code),
      name: textSorter((s) => s.name),
      duration: (a, b) => a.durationMinutes - b.durationMinutes,
    },
    noun: 'services',
    singular: 'service',
  });

  protected readonly sortOptions: readonly SortOption[] = [
    { key: 'name', dir: 'asc', label: 'Name (A to Z)' },
    { key: 'name', dir: 'desc', label: 'Name (Z to A)' },
    { key: 'code', dir: 'asc', label: 'Code (A to Z)' },
    { key: 'code', dir: 'desc', label: 'Code (Z to A)' },
    { key: 'duration', dir: 'asc', label: 'Duration (shortest first)' },
    { key: 'duration', dir: 'desc', label: 'Duration (longest first)' },
  ];

  private readonly status = viewChild.required(StatusConfirm);

  protected toggle(s: ServiceType, event: Event): void {
    void this.status().ask({
      entity: 'service',
      record: s,
      store: this.store,
      returnFocus: event.currentTarget as HTMLElement,
    });
  }

  constructor() {
    syncQueryParams(this.view);
    void this.store.load();
    reloadOnRecovery(this.store);
  }
}
