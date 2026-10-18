import { computed, signal } from '@angular/core';
import { firstValueFrom, type Observable } from 'rxjs';
import { AppError } from '../../../core/http/app-error';
import { normalizeError } from '../../../core/http/normalize-error';

export type CatalogStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface CatalogOptions<T> {
  /** `GET …?includeInactive=true`. */
  list: () => Observable<T[]>;
  get: (id: string) => Observable<T>;
  /** Text the list is kept sorted by (compared with a base-sensitivity, numeric collator). */
  sortKey: (item: T) => string;
  now?: () => number;
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/**
 * The whole list of one catalog (branches or services), loaded once with `includeInactive=true`
 * and shared by the dashboard, the lists, the pickers and the palette. Plain signals (see the
 * design deviations: `@ngrx/signals` is not installed here); the surface is the one the design
 * names, so swapping the implementation changes no caller.
 *
 * - `load` deduplicates an in-flight load and is stale-while-revalidate: items stay while the
 *   status is `loading`, and a failed refresh keeps them (status `error`, items intact).
 * - `ensure(id)` serves from the store, else fetches one record; a `404` gives `null`.
 * - Mutations write the server's response back (`upsert`, `setActive`).
 */
export class CatalogStore<T extends { id: string; isActive: boolean }> {
  readonly items = signal<T[]>([]);
  readonly status = signal<CatalogStatus>('idle');
  readonly error = signal<AppError | null>(null);
  readonly loadedAt = signal<number | null>(null);

  readonly active = computed(() => this.items().filter((i) => i.isActive));
  readonly inactive = computed(() => this.items().filter((i) => !i.isActive));

  private inFlight: Promise<void> | null = null;
  private readonly pending = new Map<string, Promise<T | null>>();
  /** Bumped by `reset`, so a response that arrives afterwards is ignored. */
  private epoch = 0;

  constructor(private readonly options: CatalogOptions<T>) {}

  byId(id: string): T | undefined {
    return this.items().find((i) => i.id === id);
  }

  load(opts: { force?: boolean } = {}): Promise<void> {
    void opts; // a load is always a refresh; `force` is accepted for call-site clarity
    if (this.inFlight) return this.inFlight;
    const epoch = this.epoch;
    this.status.set('loading');
    this.error.set(null);
    const run = (async () => {
      try {
        const items = await firstValueFrom(this.options.list());
        if (epoch !== this.epoch) return;
        this.items.set(this.sorted(items));
        this.status.set('loaded');
        this.loadedAt.set((this.options.now ?? Date.now)());
      } catch (e) {
        if (epoch !== this.epoch) return;
        this.error.set(normalizeError(e));
        this.status.set('error');
      } finally {
        if (epoch === this.epoch) this.inFlight = null;
      }
    })();
    this.inFlight = run;
    return run;
  }

  /** The record from the store, else from `GET /{id}` (upserted); `null` when it does not exist. */
  async ensure(id: string, opts: { force?: boolean } = {}): Promise<T | null> {
    if (!opts.force) {
      const hit = this.byId(id);
      if (hit) return hit;
    }
    const existing = this.pending.get(id);
    if (existing) return existing;
    const epoch = this.epoch;
    const run = (async () => {
      try {
        const item = await firstValueFrom(this.options.get(id));
        if (epoch === this.epoch) this.upsert(item);
        return item;
      } catch (e) {
        const error = normalizeError(e);
        if (error.status === 404) return null;
        throw error;
      } finally {
        this.pending.delete(id);
      }
    })();
    this.pending.set(id, run);
    return run;
  }

  /** After a create, update, schedule or activate response: replace by id, or add, keeping the order. */
  upsert(item: T): void {
    const rest = this.items().filter((i) => i.id !== item.id);
    this.items.set(this.sorted([...rest, item]));
  }

  /** After a `204` (no body to read back): set `isActive` from the intent. The next `load` reconciles. */
  setActive(id: string, isActive: boolean): void {
    this.items.update((items) => items.map((i) => (i.id === id ? { ...i, isActive } : i)));
  }

  reset(): void {
    this.epoch++;
    this.inFlight = null;
    this.pending.clear();
    this.items.set([]);
    this.status.set('idle');
    this.error.set(null);
    this.loadedAt.set(null);
  }

  private sorted(items: T[]): T[] {
    const key = this.options.sortKey;
    return items
      .map((item, index) => ({ item, index }))
      .sort((a, b) => collator.compare(key(a.item), key(b.item)) || a.index - b.index)
      .map((x) => x.item);
  }
}

/** The design's `createCatalogStore` factory. */
export function createCatalogStore<T extends { id: string; isActive: boolean }>(
  options: CatalogOptions<T>,
): CatalogStore<T> {
  return new CatalogStore(options);
}
