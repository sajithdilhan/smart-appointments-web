import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { HlmButton } from '@app/shared/ui/button';
import { HlmSkeleton } from '@app/shared/ui/skeleton';
import { HlmTableImports } from '@app/shared/ui/table';
import { longDateLabel } from '../../core/time';
import { ViewportService } from '../../core/util/viewport.service';
import { AppointmentStatusBadge } from '../appointments/appointment-status-badge';
import { BranchDayStore } from './branch-day.store';
import { dayErrorText } from './day-errors';
import { emptyDayText } from './day-params';
import { NAME_UNAVAILABLE } from './day-row';

/** What the list tells the host when a row's time or name is activated (Req 4.1). */
export interface OpenRowEvent {
  id: string;
  /** The button that was activated, so the sheet can give focus back to it. */
  trigger: HTMLElement;
}

const SKELETON_ROWS = [1, 2, 3, 4, 5];

/**
 * The day's rows from the `BranchDayStore` of the page: a table at 640 px and wider, stacked
 * cards below, with the skeleton, count, empty text, customers notice, Load more and the inline
 * error (Req 2.4, 2.6, 2.7, 2.9, 2.10). One layout is rendered at a time.
 */
@Component({
  selector: 'app-day-list',
  imports: [AppointmentStatusBadge, HlmButton, HlmSkeleton, HlmTableImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-4">
      @if (store.showCustomersNotice()) {
        <p role="status" class="rounded-lg border border-input bg-muted p-3 text-sm">
          Customer names are unavailable right now. Refresh to try again.
        </p>
      }

      @switch (store.load()) {
        @case ('loading') {
          <div
            role="status"
            aria-busy="true"
            aria-label="Loading appointments"
            class="flex flex-col gap-2"
          >
            @for (n of skeletonRows; track n) {
              <div hlmSkeleton class="h-14 w-full"></div>
            }
          </div>
        }
        @case ('error') {
          <div
            role="alert"
            class="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <p>{{ errorText() }}</p>
            <button hlmBtn variant="outline" size="sm" type="button" (click)="store.retry()">
              Retry
            </button>
          </div>
        }
        @case ('idle') {}
        @default {
          @if (store.isEmpty()) {
            <p>{{ emptyText() }}</p>
          } @else {
            <p role="status" class="text-sm text-muted-foreground">{{ store.countLabel() }}</p>

            @if (viewport.isSm()) {
              <div hlmTableContainer>
                <table hlmTable>
                  <caption class="sr-only">
                    Appointments for
                    {{
                      dateLabel()
                    }}
                  </caption>
                  <thead hlmTHead>
                    <tr hlmTr>
                      <th hlmTh scope="col">Time</th>
                      <th hlmTh scope="col">Customer</th>
                      <th hlmTh scope="col">Phone</th>
                      <th hlmTh scope="col">Service</th>
                      <th hlmTh scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody hlmTBody>
                    @for (row of store.rows(); track row.id) {
                      <tr hlmTr>
                        <td hlmTd class="whitespace-nowrap">
                          <button
                            type="button"
                            tabindex="-1"
                            aria-haspopup="dialog"
                            class="rounded-sm font-medium tabular-nums underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            (click)="open.emit({ id: row.id, trigger: $any($event.currentTarget) })"
                          >
                            {{ row.timeRange }}
                          </button>
                        </td>
                        <td hlmTd>
                          <button
                            type="button"
                            aria-haspopup="dialog"
                            [attr.data-row-open]="row.id"
                            class="rounded-sm text-left font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            (click)="open.emit({ id: row.id, trigger: $any($event.currentTarget) })"
                          >
                            {{ row.customerName ?? nameUnavailable }}
                          </button>
                        </td>
                        <td hlmTd class="whitespace-nowrap">
                          @if (row.phone; as phone) {
                            <a [href]="'tel:' + phone" class="text-primary underline">{{
                              phone
                            }}</a>
                          }
                        </td>
                        <td hlmTd>{{ row.serviceName }}</td>
                        <td hlmTd>
                          <app-appointment-status-badge [status]="row.status" />
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <ul class="flex flex-col gap-3">
                @for (row of store.rows(); track row.id) {
                  <li class="flex min-w-0 flex-col gap-2 rounded-lg border p-3">
                    <div class="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        aria-haspopup="dialog"
                        [attr.data-row-open]="row.id"
                        class="min-w-0 rounded-sm text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        (click)="open.emit({ id: row.id, trigger: $any($event.currentTarget) })"
                      >
                        <span class="block font-medium tabular-nums">{{ row.timeRange }}</span>
                        <span class="sr-only">, </span>
                        <span class="block font-medium break-words">{{
                          row.customerName ?? nameUnavailable
                        }}</span>
                      </button>
                      <app-appointment-status-badge [status]="row.status" />
                    </div>
                    @if (row.phone; as phone) {
                      <a [href]="'tel:' + phone" class="text-sm break-all text-primary underline">{{
                        phone
                      }}</a>
                    }
                    <p class="text-sm break-words text-muted-foreground">{{ row.serviceName }}</p>
                  </li>
                }
              </ul>
            }

            @if (store.load() === 'more-error') {
              <div
                role="alert"
                class="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <p>{{ errorText() }}</p>
                <button
                  hlmBtn
                  variant="outline"
                  size="sm"
                  type="button"
                  (click)="store.retryMore()"
                >
                  Retry
                </button>
              </div>
            } @else if (store.hasMore()) {
              <div class="flex justify-center">
                <button
                  hlmBtn
                  variant="outline"
                  type="button"
                  [disabled]="store.load() === 'loading-more'"
                  [attr.aria-busy]="store.load() === 'loading-more' ? 'true' : null"
                  (click)="store.loadMore()"
                >
                  Load more
                </button>
              </div>
            }
          }
        }
      }
    </div>
  `,
})
export class DayList {
  protected readonly store = inject(BranchDayStore);
  protected readonly viewport = inject(ViewportService);

  /** A row's time or name was activated. */
  readonly open = output<OpenRowEvent>();

  protected readonly skeletonRows = SKELETON_ROWS;
  protected readonly nameUnavailable = NAME_UNAVAILABLE;

  protected readonly errorText = computed(() => {
    const error = this.store.error();
    return error ? dayErrorText(error) : '';
  });
  protected readonly emptyText = computed(() => emptyDayText(this.store.query()?.status ?? 'all'));
  protected readonly dateLabel = computed(() => {
    const date = this.store.query()?.date;
    return date ? longDateLabel(date) : '';
  });
}
