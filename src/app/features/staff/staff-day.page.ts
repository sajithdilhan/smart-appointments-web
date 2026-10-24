import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { HlmButton } from '@app/shared/ui/button';
import { StaffBranchStore } from '../../core/branch/staff-branch.store';
import {
  AppointmentSheet,
  BRANCH_DAY_CONTEXT,
  BranchDayStore,
  createDayUrlState,
  DayAnnouncer,
  DayList,
  DayNav,
  StatusFilterSelect,
  type OpenRowEvent,
} from '../../shared/branch-day';
import { createStaffDayContext } from './staff-day-context';

/**
 * `/staff`: the branch's appointments for one branch-local day (Req 2, 3, 4). The URL owns the
 * date and the status; the page opens the store when the branch, date or status changes, and
 * resets the date to today when a refreshed token moves the staff member to another branch (1.5).
 */
@Component({
  selector: 'app-staff-day-page',
  imports: [AppointmentSheet, DayAnnouncer, DayList, DayNav, HlmButton, StatusFilterSelect],
  providers: [BranchDayStore, { provide: BRANCH_DAY_CONTEXT, useFactory: createStaffDayContext }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <app-day-nav
        [date]="url.date()"
        [today]="url.today()"
        [zoneLabel]="branch.zoneLabel()"
        (dateChange)="url.setDate($event)"
      />
      <div class="flex flex-wrap items-end gap-3">
        <app-status-filter [value]="url.status()" (valueChange)="url.setStatus($event)" />
        <button hlmBtn variant="outline" type="button" (click)="store.refresh()">Refresh</button>
      </div>
      <app-day-list (open)="onOpen($event)" />
    </div>
    <app-appointment-sheet [rowId]="openId()" [opener]="opener()" (closed)="onClosed()" />
    <app-day-announcer />
  `,
})
export class StaffDayPage {
  protected readonly branch = inject(StaffBranchStore);
  protected readonly store = inject(BranchDayStore);
  private readonly ctx = inject(BRANCH_DAY_CONTEXT);
  protected readonly url = createDayUrlState(this.ctx);

  protected readonly openId = signal<string | null>(null);
  protected readonly opener = signal<HTMLElement | null>(null);

  constructor() {
    effect(() => {
      const branchId = this.ctx.branchId();
      const date = this.url.date();
      const status = this.url.status();
      untracked(() => void this.store.open(branchId ? { branchId, date, status } : null));
    });

    // A different branch after the first one: its day starts at today in its own zone.
    let previous: string | null = null;
    effect(() => {
      const id = this.ctx.branchId();
      if (!id) return;
      const moved = previous !== null && previous !== id;
      previous = id;
      if (moved) untracked(() => void this.url.resetDate());
    });
  }

  protected onOpen(event: OpenRowEvent): void {
    this.opener.set(event.trigger);
    this.openId.set(event.id);
  }

  protected onClosed(): void {
    this.openId.set(null);
  }
}
