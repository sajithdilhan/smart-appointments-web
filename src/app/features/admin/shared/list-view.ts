import { computed, effect, inject, signal, type Signal, type WritableSignal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { debounceTime, distinctUntilChanged, filter, map } from 'rxjs';
import type { CatalogStatus } from '../data/catalog-store';

export type StatusFilter = 'all' | 'active' | 'inactive';
export type SortState = { key: string; dir: 'asc' | 'desc' } | null;
export type ListState = 'loading' | 'error' | 'empty' | 'no-match' | 'ready';

export interface ListView<T> {
  readonly q: WritableSignal<string>;
  readonly status: WritableSignal<StatusFilter>;
  /** `null` is the default order (the `name` sorter when there is one, else the store order). */
  readonly sort: WritableSignal<SortState>;
  /** Filtered, then sorted. */
  readonly rows: Signal<T[]>;
  readonly total: Signal<number>;
  /** "{n} branches shown", debounced 400 ms, written only when the settled count changes. */
  readonly announcement: Signal<string>;
  readonly state: Signal<ListState>;
  /** Header click: asc, then desc, then back to the default. */
  cycleSort(key: string): void;
  ariaSort(key: string): 'ascending' | 'descending' | 'none';
  clearFilters(): void;
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/** A sorter over a text field: base-sensitivity, numeric-aware, so "Branch 2" < "Branch 10". */
export function textSorter<T>(get: (item: T) => string): (a: T, b: T) => number {
  return (a, b) => collator.compare(get(a), get(b));
}

/** An unknown `status` value (a hand-edited URL) means "all". */
export function parseStatus(value: string | null | undefined): StatusFilter {
  return value === 'active' || value === 'inactive' ? value : 'all';
}

/**
 * Search, status filter and sort over a catalog's items, as signals. Call in an injection context
 * (the announcement is a debounced signal).
 */
export function createListView<T extends { isActive: boolean }>(opts: {
  items: Signal<readonly T[]>;
  status: Signal<CatalogStatus>;
  /** Lower-cased haystack: code, name, address, phone. */
  searchText: (item: T) => string;
  sorters: Record<string, (a: T, b: T) => number>;
  /** 'branches' | 'services', for the announcement. */
  noun: string;
  /** Used for a count of one ('branch'); defaults to `noun`. */
  singular?: string;
}): ListView<T> {
  const q = signal('');
  const status = signal<StatusFilter>('all');
  const sort = signal<SortState>(null);

  const total = computed(() => opts.items().length);

  const rows = computed(() => {
    const words = q().toLowerCase().split(/\s+/).filter(Boolean);
    const wanted = status();
    const filtered = opts
      .items()
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => {
        if (wanted === 'active' && !item.isActive) return false;
        if (wanted === 'inactive' && item.isActive) return false;
        if (words.length === 0) return true;
        const haystack = opts.searchText(item).toLowerCase();
        return words.every((w) => haystack.includes(w));
      });
    const current = sort();
    const sorter = current ? opts.sorters[current.key] : opts.sorters['name'];
    if (sorter) {
      const sign = current?.dir === 'desc' ? -1 : 1;
      // Array.prototype.sort is stable; the store order is the explicit tiebreaker anyway.
      filtered.sort((a, b) => sign * sorter(a.item, b.item) || a.index - b.index);
    }
    return filtered.map((x) => x.item);
  });

  const state = computed<ListState>(() => {
    const hasItems = opts.items().length > 0;
    if (!hasItems) {
      const s = opts.status();
      if (s === 'error') return 'error';
      if (s === 'idle' || s === 'loading') return 'loading';
      return 'empty';
    }
    return rows().length === 0 ? 'no-match' : 'ready';
  });

  /** The count worth announcing, or null while there is nothing settled to announce. */
  const settledCount = computed(() => {
    const s = state();
    return s === 'loading' || s === 'error' ? null : rows().length;
  });

  const announcement = toSignal(
    toObservable(settledCount).pipe(
      filter((n): n is number => n !== null),
      debounceTime(400),
      distinctUntilChanged(),
      map((n) => `${n} ${n === 1 ? (opts.singular ?? opts.noun) : opts.noun} shown`),
    ),
    { initialValue: '' },
  );

  return {
    q,
    status,
    sort,
    rows,
    total,
    announcement,
    state,
    cycleSort(key) {
      const current = sort();
      if (current?.key !== key) sort.set({ key, dir: 'asc' });
      else sort.set(current.dir === 'asc' ? { key, dir: 'desc' } : null);
    },
    ariaSort(key) {
      const current = sort();
      if (current?.key !== key) return 'none';
      return current.dir === 'asc' ? 'ascending' : 'descending';
    },
    clearFilters() {
      q.set('');
      status.set('all');
    },
  };
}

/**
 * Mirrors `q` and `status` in the URL (sort is not). The query string is read once, at call time;
 * later changes are written with `replaceUrl`, debounced 150 ms, merged with other parameters.
 * Call in an injection context.
 */
export function syncQueryParams(view: Pick<ListView<unknown>, 'q' | 'status'>): void {
  const router = inject(Router);
  const route = inject(ActivatedRoute);
  const params = route.snapshot.queryParamMap;
  view.q.set(params.get('q') ?? '');
  view.status.set(parseStatus(params.get('status')));

  let first = true;
  effect((onCleanup) => {
    const q = view.q().trim();
    const status = view.status();
    if (first) {
      first = false;
      return;
    }
    const timer = setTimeout(() => {
      void router.navigate([], {
        relativeTo: route,
        queryParams: { q: q || null, status: status === 'all' ? null : status },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }, 150);
    onCleanup(() => clearTimeout(timer));
  });
}
