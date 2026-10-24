import { computed, effect, inject, untracked } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import { BookingApiService } from '../../../core/api/booking-api.service';
import type { MyAppointmentsPage } from '../../../core/api/models';
import { AppError } from '../../../core/http/app-error';
import { OutageState } from '../../../core/http/outage-state';
import type { AppointmentResponse } from './appointment.model';
import { dedupeById } from './dedupe-by-id';
import { toListQuery, type TabParams } from './tab-params';

export const PAGE_SIZE = 20;
export const MAX_REFRESH = 100;

export type ListStatus =
  'idle' | 'loading-first' | 'ready' | 'loading-more' | 'refreshing' | 'error' | 'more-error';

export interface ListState {
  filter: TabParams;
  /** De-duplicated, in server order. */
  items: AppointmentResponse[];
  /** The last page loaded. */
  page: number;
  totalCount: number | null;
  status: ListStatus;
  error: AppError | null;
  /** Appointments with a cancel in flight (the optimistic "Cancelling..." badge). */
  pending: Record<string, true>;
  /** Cancelled, but the confirming re-GET failed (Req 6.4); the next list load corrects it. */
  notRefreshed: Record<string, true>;
  /** The one polite message for the last "Load more" (Req 10.4). */
  announcement: string;
}

const initialState: ListState = {
  filter: { tab: 'upcoming', showCancelled: false, pastStatus: 'all' },
  items: [],
  page: 0,
  totalCount: null,
  status: 'idle',
  error: null,
  pending: {},
  notRefreshed: {},
  announcement: '',
};

function sameFilter(a: TabParams, b: TabParams): boolean {
  return a.tab === b.tab && a.showCancelled === b.showCancelled && a.pastStatus === b.pastStatus;
}

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

function without(record: Record<string, true>, id: string): Record<string, true> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => key !== id)) as Record<
    string,
    true
  >;
}

function toAppError(e: unknown): AppError {
  return e instanceof AppError
    ? e
    : new AppError(500, 'Something went wrong. Please try again.', 'http');
}

/** A body without `items` is an error, never an empty list (Req 2.7). */
function checked(page: MyAppointmentsPage): MyAppointmentsPage {
  if (!page || !Array.isArray(page.items)) {
    throw new AppError(500, 'We could not read your appointments. Please try again.', 'http');
  }
  return page;
}

/**
 * The list of the active tab: paging, de-duplication, the quiet refresh and the cancel flags
 * the detail sets. Provided on the page, not root. The tab and "Show cancelled" live in the URL;
 * the page feeds them to `setFilter` and the store never keeps them as a second source.
 */
export const AppointmentsStore = signalStore(
  withState<ListState>(initialState),
  withComputed(({ items, totalCount, status }) => ({
    hasMore: computed(() => totalCount() !== null && items().length < totalCount()!),
    isEmpty: computed(() => status() === 'ready' && items().length === 0),
  })),
  withMethods((store) => {
    const api = inject(BookingApiService);

    let requestId = 0;
    let controller: AbortController | null = null;

    /** Starts a request, cancelling the previous one; returns its id and signal. */
    function begin(): { id: number; signal: AbortSignal } {
      controller?.abort(new DOMException('Superseded', 'AbortError'));
      controller = new AbortController();
      requestId += 1;
      return { id: requestId, signal: controller.signal };
    }

    async function loadFirst(): Promise<void> {
      const { id, signal } = begin();
      patchState(store, { status: 'loading-first', error: null });
      const { tab, showCancelled, pastStatus } = store.filter();
      try {
        const page = checked(
          await api.listMyAppointments(toListQuery(tab, showCancelled, 1, PAGE_SIZE, pastStatus), {
            signal,
          }),
        );
        if (id !== requestId) return;
        patchState(store, {
          items: dedupeById(page.items),
          page: 1,
          totalCount: page.totalCount,
          status: 'ready',
        });
      } catch (e) {
        if (id !== requestId || isAbort(e)) return;
        patchState(store, { status: 'error', error: toAppError(e) });
      }
    }

    async function fetchMore(next: number): Promise<void> {
      const { id, signal } = begin();
      patchState(store, { status: 'loading-more', error: null });
      const { tab, showCancelled, pastStatus } = store.filter();
      try {
        const page = checked(
          await api.listMyAppointments(
            toListQuery(tab, showCancelled, next, PAGE_SIZE, pastStatus),
            {
              signal,
            },
          ),
        );
        if (id !== requestId) return;
        const before = store.items().length;
        const items = dedupeById([...store.items(), ...page.items]);
        const added = items.length - before;
        patchState(store, {
          items,
          page: next,
          // An empty page ends the list even when the count promised more (Req 2.3).
          totalCount:
            page.items.length === 0 ? Math.min(page.totalCount, items.length) : page.totalCount,
          status: 'ready',
          announcement:
            added > 0 ? `Loaded ${added} more ${added === 1 ? 'appointment' : 'appointments'}` : '',
        });
      } catch (e) {
        if (id !== requestId || isAbort(e)) return;
        patchState(store, { status: 'more-error', error: toAppError(e) });
      }
    }

    async function quietRefresh(): Promise<void> {
      const status = store.status();
      if (status === 'idle' || status === 'loading-first') return;
      const count = store.items().length;
      if (count === 0) return loadFirst();

      const { id, signal } = begin();
      patchState(store, { status: 'refreshing' });
      const { tab, showCancelled, pastStatus } = store.filter();
      // Up to 100 loaded: one request for exactly that many. Beyond: restart at page 1.
      const pageSize = count > MAX_REFRESH ? PAGE_SIZE : count;
      try {
        const page = checked(
          await api.listMyAppointments(toListQuery(tab, showCancelled, 1, pageSize, pastStatus), {
            signal,
          }),
        );
        if (id !== requestId) return;
        const items = dedupeById(page.items);
        patchState(store, {
          items,
          page: Math.max(1, Math.ceil(items.length / PAGE_SIZE)),
          totalCount: page.totalCount,
          status: 'ready',
          notRefreshed: {},
        });
      } catch (e) {
        if (id !== requestId || isAbort(e)) return;
        // Silent: the list stays as it was and the next user action retries.
        patchState(store, { status: 'ready' });
      }
    }

    return {
      /** Applies the URL's filter; the same filter is a no-op once something has loaded. */
      setFilter(filter: TabParams): Promise<void> {
        if (sameFilter(filter, store.filter()) && store.status() !== 'idle') {
          return Promise.resolve();
        }
        patchState(store, {
          filter,
          items: [],
          page: 0,
          totalCount: null,
          error: null,
          announcement: '',
        });
        return loadFirst();
      },
      loadFirst,
      /** Ignored unless the list is `ready` with more to load: the double-activation guard. */
      loadMore(): Promise<void> {
        if (
          store.status() !== 'ready' ||
          !(store.totalCount() !== null && store.items().length < store.totalCount()!)
        ) {
          return Promise.resolve();
        }
        return fetchMore(store.page() + 1);
      },
      /** Repeats the page that failed. */
      retryMore(): Promise<void> {
        return store.status() === 'more-error' ? fetchMore(store.page() + 1) : Promise.resolve();
      },
      quietRefresh,
      /** Replaces the item; a quiet refresh then drops it from a list that no longer matches. */
      applyCancelled(updated: AppointmentResponse): Promise<void> {
        const pending = without(store.pending(), updated.id);
        patchState(store, {
          items: store.items().map((i) => (i.id === updated.id ? updated : i)),
          pending,
        });
        return quietRefresh();
      },
      setPending(id: string, on: boolean): void {
        const rest = without(store.pending(), id);
        patchState(store, { pending: on ? { ...rest, [id]: true } : rest });
      },
      markNotRefreshed(id: string): void {
        patchState(store, { notRefreshed: { ...store.notRefreshed(), [id]: true } });
      },
      byId(id: string): AppointmentResponse | undefined {
        return store.items().find((i) => i.id === id);
      },
      /** Cancels what is in flight (the page is leaving). */
      abort(): void {
        controller?.abort(new DOMException('Disposed', 'AbortError'));
        requestId += 1;
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
        untracked(() => {
          // A failed first page reloads; a shown list refreshes quietly.
          if (store.status() === 'error') void store.loadFirst();
          else void store.quietRefresh();
        });
      });
    },
    onDestroy(store) {
      store.abort();
    },
  }),
);

export type AppointmentsStoreType = InstanceType<typeof AppointmentsStore>;
