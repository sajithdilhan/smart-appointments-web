import { computed, effect, inject, untracked, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { todayInZone } from '../../core/time';
import { CLOCK } from '../../core/util/clock';
import type { BranchDayContext } from './branch-day-context';
import { parseDayParams, type StatusFilter } from './day-params';

export interface DayUrlState {
  /** The branch-zone calendar day shown (`yyyy-MM-dd`), already normalised. */
  date: Signal<string>;
  status: Signal<StatusFilter>;
  /** Today in the branch zone, as of the last change of the zone or the URL. */
  today: Signal<string>;
  /** Adds a history entry, so Back returns to the previous day (Req 2.2). */
  setDate(date: string): Promise<boolean>;
  setStatus(status: StatusFilter): Promise<boolean>;
  goToday(): Promise<boolean>;
  /** Clears `date`; the next parse gives today in the then-current zone (branch change). */
  resetDate(): Promise<boolean>;
}

/**
 * The router <-> `{date, status}` bridge of a day page (Req 2.1, 2.2, 2.5). Call it once, in an
 * injection context. A missing or malformed `date` is replaced (no history entry) by today in
 * the branch zone, but only once a branch is known: without one nothing is written.
 */
export function createDayUrlState(ctx: Pick<BranchDayContext, 'branchId' | 'zone'>): DayUrlState {
  const route = inject(ActivatedRoute);
  const router = inject(Router);
  const clock = inject(CLOCK);

  const query = toSignal(route.queryParamMap, { initialValue: route.snapshot.queryParamMap });
  const today = computed(() => todayInZone(ctx.zone(), clock.now()));
  const parsed = computed(() => {
    const q = query();
    return parseDayParams({ date: q.get('date'), status: q.get('status') }, today());
  });

  effect(() => {
    const p = parsed();
    if (!p.dateWasInvalid || !ctx.branchId()) return;
    untracked(() => {
      void router.navigate([], {
        relativeTo: route,
        queryParams: { date: p.date },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    });
  });

  const go = (queryParams: Record<string, string | null>, replaceUrl = false) =>
    router.navigate([], {
      relativeTo: route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl,
    });

  return {
    date: computed(() => parsed().date),
    status: computed(() => parsed().status),
    today,
    setDate: (date) => (date === parsed().date ? Promise.resolve(true) : go({ date })),
    setStatus: (status) =>
      status === parsed().status
        ? Promise.resolve(true)
        : go({ status: status === 'all' ? null : status }),
    goToday: () => (today() === parsed().date ? Promise.resolve(true) : go({ date: today() })),
    resetDate: () => go({ date: null }, true),
  };
}
