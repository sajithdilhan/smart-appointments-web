import { effect, inject, untracked } from '@angular/core';
import { patchState, signalStore, withHooks, withMethods, withState } from '@ngrx/signals';
import { AuthApiService } from '../../../core/api/auth-api.service';
import type { StaffAccount, StaffPage } from '../../../core/api/models';
import { AppError } from '../../../core/http/app-error';
import { normalizeError } from '../../../core/http/normalize-error';
import { OutageState } from '../../../core/http/outage-state';

/** The page size of every request (the backend maximum), so a list is rarely more than one call. */
export const STAFF_PAGE_SIZE = 100;

export interface StaffFilter {
  branchId: string | null;
  isActive: boolean | null;
}

export type StaffListStatus = 'idle' | 'loading' | 'ready' | 'error' | 'loading-more';

export interface StaffAccountsState {
  items: StaffAccount[];
  /** The last page loaded. */
  page: number;
  totalCount: number;
  filter: StaffFilter;
  status: StaffListStatus;
  error: AppError | null;
}

const NO_FILTER: StaffFilter = { branchId: null, isActive: null };

const initialState: StaffAccountsState = {
  items: [],
  page: 0,
  totalCount: 0,
  filter: NO_FILTER,
  status: 'idle',
  error: null,
};

const sameFilter = (a: StaffFilter, b: StaffFilter): boolean =>
  a.branchId === b.branchId && a.isActive === b.isActive;

function dedupe(items: readonly StaffAccount[]): StaffAccount[] {
  const seen = new Set<string>();
  return items.filter((i) => !seen.has(i.id) && !!seen.add(i.id));
}

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

/**
 * The staff accounts list: a server-paged, server-filtered list (`GET /api/auth/staff`, oldest
 * first) with Load more. Provided by the admin routes and reset when the frame is destroyed.
 * A failed load, load more or reload keeps the items on screen (`status: 'error'`).
 */
export const StaffAccountsStore = signalStore(
  withState<StaffAccountsState>(initialState),
  withMethods((store) => {
    const api = inject(AuthApiService);

    let requestId = 0;
    let controller: AbortController | null = null;

    function begin(): { id: number; signal: AbortSignal } {
      controller?.abort(new DOMException('Superseded', 'AbortError'));
      controller = new AbortController();
      requestId += 1;
      return { id: requestId, signal: controller.signal };
    }

    function fetchPage(page: number, signal: AbortSignal): Promise<StaffPage> {
      const { branchId, isActive } = store.filter();
      return api.listStaff(
        {
          page,
          pageSize: STAFF_PAGE_SIZE,
          ...(branchId === null ? {} : { branchId }),
          ...(isActive === null ? {} : { isActive }),
        },
        { signal },
      );
    }

    async function loadFirst(): Promise<void> {
      const { id, signal } = begin();
      patchState(store, { status: 'loading', error: null });
      try {
        const result = await fetchPage(1, signal);
        if (id !== requestId) return;
        patchState(store, {
          items: dedupe(result.items),
          page: 1,
          totalCount: result.totalCount,
          status: 'ready',
        });
      } catch (e) {
        if (id !== requestId || isAbort(e)) return;
        patchState(store, { status: 'error', error: normalizeError(e) });
      }
    }

    return {
      /** Applies a filter and loads page 1. Items of another filter are dropped at once. */
      load(filter: StaffFilter = store.filter()): Promise<void> {
        if (!sameFilter(filter, store.filter())) {
          patchState(store, { filter, items: [], page: 0, totalCount: 0 });
        }
        return loadFirst();
      },

      /** Appends the next page; ignored unless the list is shown with more to load. */
      async loadMore(): Promise<void> {
        const status = store.status();
        if ((status !== 'ready' && status !== 'error') || store.page() === 0) return;
        if (store.items().length >= store.totalCount()) return;
        const { id, signal } = begin();
        const next = store.page() + 1;
        patchState(store, { status: 'loading-more', error: null });
        try {
          const result = await fetchPage(next, signal);
          if (id !== requestId) return;
          const items = dedupe([...store.items(), ...result.items]);
          patchState(store, {
            items,
            page: next,
            // An empty page ends the list even when the count promised more.
            totalCount:
              result.items.length === 0
                ? Math.min(result.totalCount, items.length)
                : result.totalCount,
            status: 'ready',
          });
        } catch (e) {
          if (id !== requestId || isAbort(e)) return;
          patchState(store, { status: 'error', error: normalizeError(e) });
        }
      },

      /** Re-requests pages 1 to `page` one after the other; the items stay on screen meanwhile. */
      async reload(): Promise<void> {
        const pages = store.page();
        if (pages === 0) return loadFirst();
        const { id, signal } = begin();
        patchState(store, { error: null });
        try {
          const collected: StaffAccount[] = [];
          let totalCount = store.totalCount();
          for (let p = 1; p <= pages; p++) {
            const result = await fetchPage(p, signal);
            if (id !== requestId) return;
            collected.push(...result.items);
            totalCount = result.totalCount;
          }
          patchState(store, {
            items: dedupe(collected),
            totalCount,
            status: 'ready',
          });
        } catch (e) {
          if (id !== requestId || isAbort(e)) return;
          patchState(store, { status: 'error', error: normalizeError(e) });
        }
      },

      byId(id: string): StaffAccount | undefined {
        return store.items().find((i) => i.id === id);
      },

      /** Drops everything and ignores any response still on its way. */
      reset(): void {
        controller?.abort(new DOMException('Reset', 'AbortError'));
        requestId += 1;
        patchState(store, initialState);
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
          const status = store.status();
          if (status === 'idle') return;
          void (store.items().length === 0 ? store.load() : store.reload());
        });
      });
    },
  }),
);
export type StaffAccountsStore = InstanceType<typeof StaffAccountsStore>;
