import { computed, effect, inject, untracked } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withProps,
  withState,
} from '@ngrx/signals';
import { BookingApiService } from '../../core/api/booking-api.service';
import type { BranchAppointment, BranchAppointmentsPage } from '../../core/api/models';
import { AppError } from '../../core/http/app-error';
import { OutageState } from '../../core/http/outage-state';
import { ToastService } from '../../core/notify/toast.service';
import { CLOCK } from '../../core/util/clock';
import { createNowSignal } from '../../core/util/now-signal';
import { BRANCH_DAY_CONTEXT } from './branch-day-context';
import { toQuery, type StatusFilter } from './day-params';
import { toRow, type BranchDayRow } from './day-row';
import { mapMarkError } from './mark-error';

export const DAY_PAGE_SIZE = 100;
export const ANNOUNCEMENT_MS = 5_000;

export type MarkKind = 'complete' | 'no-show';

export type DayLoadStatus =
  'idle' | 'loading' | 'ready' | 'refreshing' | 'loading-more' | 'error' | 'more-error';

export interface DayQuery {
  branchId: string;
  date: string;
  status: StatusFilter;
}

export interface BranchDayState {
  query: DayQuery | null;
  items: BranchAppointment[];
  page: number;
  totalCount: number | null;
  customersUnavailable: boolean;
  load: DayLoadStatus;
  error: AppError | null;
  marking: Record<string, MarkKind>;
  announcement: string;
}

const initialState: BranchDayState = {
  query: null,
  items: [],
  page: 0,
  totalCount: null,
  customersUnavailable: false,
  load: 'idle',
  error: null,
  marking: {},
  announcement: '',
};

export type MarkResult =
  | { ok: true }
  | { ok: false; reloaded: boolean; error: AppError }
  /** Another mark of the same row was in flight; nothing was sent. */
  | { ok: 'ignored' };

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

function toAppError(e: unknown): AppError {
  return e instanceof AppError
    ? e
    : new AppError(500, 'Something went wrong. Please try again.', 'http');
}

function dedupe(items: readonly BranchAppointment[]): BranchAppointment[] {
  const seen = new Set<string>();
  const out: BranchAppointment[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function checked(page: BranchAppointmentsPage): BranchAppointmentsPage {
  if (!page || !Array.isArray(page.items)) {
    throw new AppError(500, 'We could not read the appointments. Please try again.', 'http');
  }
  return page;
}

function withoutKey<T>(record: Record<string, T>, id: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => key !== id));
}

/**
 * One branch-local day of appointments: paging, the quiet refresh, the marks. Provided on the
 * page (it dies with it) next to a `BRANCH_DAY_CONTEXT`. The host calls `open` when the branch,
 * date or status changes. After a mark the list is reloaded from the server, never patched.
 */
export const BranchDayStore = signalStore(
  withState<BranchDayState>(initialState),
  withProps(() => ({ context: inject(BRANCH_DAY_CONTEXT) })),
  withComputed((store) => ({
    rows: computed<BranchDayRow[]>(() => {
      const ctx = { zone: store.context.zone(), services: store.context.services() };
      return store.items().map((item) => toRow(item, ctx));
    }),
    hasMore: computed(
      () => store.totalCount() !== null && store.items().length < store.totalCount()!,
    ),
    countLabel: computed(() => {
      const n = store.totalCount();
      if (n === null) return '';
      return `${n} ${n === 1 ? 'appointment' : 'appointments'}`;
    }),
    isEmpty: computed(() => store.load() === 'ready' && store.items().length === 0),
    showCustomersNotice: computed(() => store.customersUnavailable()),
  })),
  withProps((store) => {
    // One timer for the next start time still ahead: the "Available from" hints flip exactly then.
    const clock = createNowSignal();
    clock.watch(
      computed(() =>
        store
          .rows()
          .filter((r) => r.canMark)
          .map((r) => r.startMs),
      ),
    );
    return { nowMs: clock.now };
  }),
  withMethods((store) => {
    const api = inject(BookingApiService);
    const toast = inject(ToastService);
    const clock = inject(CLOCK);

    let requestId = 0;
    let controller: AbortController | null = null;
    let cancelAnnouncement: (() => void) | null = null;

    function begin(): { id: number; signal: AbortSignal } {
      controller?.abort(new DOMException('Superseded', 'AbortError'));
      controller = new AbortController();
      requestId += 1;
      return { id: requestId, signal: controller.signal };
    }

    function fetchPage(query: DayQuery, page: number, signal: AbortSignal) {
      return api
        .listBranchAppointments(
          query.branchId,
          { ...toQuery(query.date, query.status), page, pageSize: DAY_PAGE_SIZE },
          { signal },
        )
        .then(checked);
    }

    function announce(message: string): void {
      cancelAnnouncement?.();
      patchState(store, { announcement: message });
      cancelAnnouncement = clock.setTimer(() => {
        cancelAnnouncement = null;
        patchState(store, { announcement: '' });
      }, ANNOUNCEMENT_MS);
    }

    async function loadFirst(): Promise<void> {
      const query = store.query();
      if (!query) return;
      const { id, signal } = begin();
      patchState(store, { load: 'loading', error: null });
      try {
        const page = await fetchPage(query, 1, signal);
        if (id !== requestId) return;
        patchState(store, {
          items: dedupe(page.items),
          page: 1,
          totalCount: page.totalCount,
          customersUnavailable: page.customersUnavailable === true,
          load: 'ready',
        });
      } catch (e) {
        if (id !== requestId || isAbort(e)) return;
        patchState(store, { load: 'error', error: toAppError(e) });
      }
    }

    async function refresh(): Promise<void> {
      const query = store.query();
      const state = store.load();
      if (!query || state === 'idle') return;
      if (state === 'loading' || state === 'error' || store.page() === 0) {
        return loadFirst();
      }
      const pages = store.page();
      const { id, signal } = begin();
      patchState(store, { load: 'refreshing', error: null });
      try {
        let items: BranchAppointment[] = [];
        let last: BranchAppointmentsPage | null = null;
        for (let p = 1; p <= pages; p += 1) {
          last = await fetchPage(query, p, signal);
          if (id !== requestId) return;
          items = items.concat(last.items);
        }
        patchState(store, {
          items: dedupe(items),
          page: pages,
          totalCount: last!.totalCount,
          customersUnavailable: last!.customersUnavailable === true,
          load: 'ready',
        });
      } catch (e) {
        if (id !== requestId || isAbort(e)) return;
        // The rows stay as they were; the user sees why and can press Refresh again.
        patchState(store, { load: 'ready' });
        toast.handleError(toAppError(e));
      }
    }

    async function fetchMore(): Promise<void> {
      const query = store.query();
      if (!query) return;
      const next = store.page() + 1;
      const { id, signal } = begin();
      patchState(store, { load: 'loading-more', error: null });
      try {
        const page = await fetchPage(query, next, signal);
        if (id !== requestId) return;
        const items = dedupe([...store.items(), ...page.items]);
        patchState(store, {
          items,
          page: next,
          // An empty page ends the list even when the count promised more.
          totalCount:
            page.items.length === 0 ? Math.min(page.totalCount, items.length) : page.totalCount,
          customersUnavailable: store.customersUnavailable() || page.customersUnavailable === true,
          load: 'ready',
        });
      } catch (e) {
        if (id !== requestId || isAbort(e)) return;
        patchState(store, { load: 'more-error', error: toAppError(e) });
      }
    }

    return {
      /** Starts loading a day (cancelling what is in flight). A null query clears the list. */
      open(query: DayQuery | null): Promise<void> {
        patchState(store, {
          query,
          items: [],
          page: 0,
          totalCount: null,
          customersUnavailable: false,
          error: null,
          announcement: '',
          load: 'idle',
        });
        if (!query) {
          begin();
          return Promise.resolve();
        }
        return loadFirst();
      },
      loadMore(): Promise<void> {
        if (store.load() !== 'ready' || !store.hasMore()) return Promise.resolve();
        return fetchMore();
      },
      /** Repeats the page that failed. */
      retryMore(): Promise<void> {
        return store.load() === 'more-error' ? fetchMore() : Promise.resolve();
      },
      /** The first page again after a failed load. */
      retry(): Promise<void> {
        return loadFirst();
      },
      refresh,
      /**
       * Marks one appointment. A second call for the same row while one is in flight sends
       * nothing. Success, `409` and `404` toast and reload; any other failure toasts through F1
       * (unless `quietFailure`: the caller shows it itself) and does not reload.
       */
      async mark(
        id: string,
        kind: MarkKind,
        options: { quietFailure?: boolean } = {},
      ): Promise<MarkResult> {
        if (store.marking()[id]) return { ok: 'ignored' };
        const row = store.rows().find((r) => r.id === id);
        patchState(store, { marking: { ...store.marking(), [id]: kind } });
        try {
          if (kind === 'complete') await api.completeAppointment(id);
          else await api.markNoShow(id);
        } catch (e) {
          const error = toAppError(e);
          const outcome = mapMarkError(error);
          if (outcome.kind === 'conflict') {
            toast.showError(error);
          } else if (outcome.kind === 'not-found') {
            toast.showError(new AppError(404, outcome.message, 'http', error.correlationId));
          } else if (!options.quietFailure) {
            toast.handleError(error);
          }
          if (outcome.reload) await refresh();
          patchState(store, { marking: withoutKey(store.marking(), id) });
          return { ok: false, reloaded: outcome.reload, error };
        }
        const what = kind === 'complete' ? 'completed' : 'no-show';
        const name = row?.customerName ?? null;
        toast.showSuccess(name ? `${name} marked as ${what}.` : `Appointment marked as ${what}.`);
        announce(
          [name, row?.startLabel, `marked as ${what}`].filter((p): p is string => !!p).join(', '),
        );
        await refresh();
        patchState(store, { marking: withoutKey(store.marking(), id) });
        return { ok: true };
      },
      /** Cancels what is in flight (the page is leaving). */
      abort(): void {
        controller?.abort(new DOMException('Disposed', 'AbortError'));
        requestId += 1;
        cancelAnnouncement?.();
      },
    };
  }),
  withHooks({
    onInit(store) {
      const outage = inject(OutageState);
      let seen = outage.recovered();
      effect(() => {
        const recovered = outage.recovered();
        if (recovered === seen) return;
        seen = recovered;
        // A failed first page reloads; a shown list refreshes quietly (Req 2.8).
        untracked(() => void (store.load() === 'error' ? store.retry() : store.refresh()));
      });
    },
    onDestroy(store) {
      store.abort();
    },
  }),
);

export type BranchDayStoreType = InstanceType<typeof BranchDayStore>;
