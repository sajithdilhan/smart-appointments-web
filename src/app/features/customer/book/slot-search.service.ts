import { DestroyRef, Injectable, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, debounce, map, of, switchMap, timer } from 'rxjs';
import { AvailabilityApiService } from '../../../core/api/availability-api.service';
import type { SlotResponse } from '../../../core/api/models';
import type { AppError } from '../../../core/http/app-error';
import { OutageState } from '../../../core/http/outage-state';
import { CLOCK } from '../../../core/util/clock';
import { ReferenceDataStore } from '../shared/reference-data/reference-data.store';
import { SlidingWindowBudget } from './request-budget';
import { SlotCache, slotCacheKey, type SlotKey } from './slot-cache';

export const SEARCH_DEBOUNCE_MS = 250;

export type SlotsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; slots: SlotResponse[]; fetchedAt: number }
  | { status: 'error'; error: AppError; kind: 'unavailable' | 'other' }
  /** The gateway answered `429`, or the client budget is spent. No automatic retry. */
  | { status: 'rate-limited'; retryAfterSeconds: number; source: 'server' | 'budget' }
  /** `404`: the branch or service is gone; reference data was refreshed, the URL repairs itself. */
  | { status: 'not-found' };

interface SearchRequest {
  key: SlotKey;
}

/** Same ids with the same free capacity, in the same order. */
export function sameSlots(a: readonly SlotResponse[], b: readonly SlotResponse[]): boolean {
  return (
    a.length === b.length &&
    a.every((s, i) => s.id === b[i].id && s.availableCapacity === b[i].availableCapacity)
  );
}

/** Drops slots of another branch or service and full ones, then sorts by start (Req 5.8). */
export function normaliseSlots(key: SlotKey, slots: readonly SlotResponse[]): SlotResponse[] {
  return slots
    .filter(
      (s) =>
        s.branchId === key.branchId && s.serviceTypeId === key.serviceId && s.availableCapacity > 0,
    )
    .sort((a, b) => a.startAtUtc.localeCompare(b.startAtUtc));
}

/**
 * The slot search for the date strip (Req 5): a debounced, cached, budgeted stream. One
 * instance per wizard visit owns the cache, the 25-per-minute budget and the in-flight request
 * (`switchMap` cancels the superseded HTTP call). Components only read `state`.
 */
@Injectable()
export class SlotSearchService {
  private readonly api = inject(AvailabilityApiService);
  private readonly clock = inject(CLOCK);
  private readonly outage = inject(OutageState);
  private readonly reference = inject(ReferenceDataStore);

  private readonly cache = new SlotCache();
  private readonly budget = new SlidingWindowBudget();
  private readonly requests = new Subject<SearchRequest | null>();
  private current: SlotKey | null = null;
  private readonly stateSignal = signal<SlotsState>({ status: 'idle' });

  /** The state of the most recently requested key. */
  readonly state = this.stateSignal.asReadonly();

  constructor() {
    this.requests
      .pipe(
        // A network request waits for the user to settle; `null` (a cache hit or a reset) is
        // immediate and cancels both the pending timer and the in-flight request.
        debounce((r) => (r ? timer(SEARCH_DEBOUNCE_MS) : of(0))),
        switchMap((r) => (r ? this.fetch(r.key) : EMPTY)),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe();

    let seen = this.outage.recovered();
    effect(() => {
      const recovered = this.outage.recovered();
      if (recovered === seen) return;
      seen = recovered;
      untracked(() => {
        if (this.stateSignal().status === 'error' && this.current) this.load(this.current);
      });
    });
  }

  /**
   * Call on every key change. A fresh cache hit is shown at once with no request; a stale hit is
   * shown at once and refreshed in the background; otherwise a request is sent after 250 ms.
   * `force` bypasses the cache.
   */
  load(key: SlotKey, opts: { force?: boolean } = {}): void {
    this.current = key;
    // Cancel the superseded request and timer at once, whatever happens next.
    this.requests.next(null);
    const cached = this.cache.get(slotCacheKey(key), this.clock.now());
    if (cached?.fresh && !opts.force) {
      this.showCached(cached);
      return;
    }
    if (cached && !opts.force) {
      this.showCached(cached);
    } else {
      this.stateSignal.set({ status: 'loading' });
    }
    this.requests.next({ key });
  }

  /** Forgets one key (after a booking, Req 9.8). */
  invalidate(key: SlotKey): void {
    this.cache.invalidate(slotCacheKey(key));
  }

  /** Drops cached days before `date` (the branch day rolled over, Req 4.7). */
  dropBefore(date: string): void {
    this.cache.dropBefore(date);
  }

  /** Cancels what is pending and forgets the shown state. */
  reset(): void {
    this.current = null;
    this.requests.next(null);
    this.stateSignal.set({ status: 'idle' });
  }

  private fetch(key: SlotKey) {
    const now = this.clock.now();
    const cacheKey = slotCacheKey(key);
    const cached = this.cache.get(cacheKey, now);
    const budget = this.budget.tryAcquire(now);
    if (!budget.ok) {
      if (cached) {
        this.showCached(cached);
      } else {
        this.stateSignal.set({
          status: 'rate-limited',
          retryAfterSeconds: budget.retryAfterSeconds,
          source: 'budget',
        });
      }
      return EMPTY;
    }
    return this.api.availableSlots(key).pipe(
      map((slots) => {
        const fetched = normaliseSlots(key, slots);
        // Keep the same array when nothing changed so the chips are not re-rendered.
        const normalised = cached && sameSlots(cached.slots, fetched) ? cached.slots : fetched;
        const at = this.clock.now();
        this.cache.set(cacheKey, normalised, at);
        if (!this.isCurrent(cacheKey)) return;
        const shown = this.stateSignal();
        // A background refresh replaces the chips only when the list really differs.
        if (cached && shown.status === 'ready' && sameSlots(shown.slots, normalised)) return;
        this.stateSignal.set({ status: 'ready', slots: normalised, fetchedAt: at });
      }),
      catchError((e: AppError) => {
        if (this.isCurrent(cacheKey)) this.onError(e, cached !== undefined);
        return EMPTY;
      }),
    );
  }

  /** Shows a cached list; keeps the very same state object when it is already on screen. */
  private showCached(cached: { slots: SlotResponse[]; fetchedAt: number }): void {
    const shown = this.stateSignal();
    if (shown.status === 'ready' && shown.slots === cached.slots) return;
    this.stateSignal.set({ status: 'ready', slots: cached.slots, fetchedAt: cached.fetchedAt });
  }

  private isCurrent(cacheKey: string): boolean {
    return this.current !== null && slotCacheKey(this.current) === cacheKey;
  }

  private onError(e: AppError, hasStale: boolean): void {
    if (e.status === 404) {
      this.reference.refresh();
      this.stateSignal.set({ status: 'not-found' });
    } else if (e.kind === 'rate-limited') {
      this.stateSignal.set({
        status: 'rate-limited',
        retryAfterSeconds: e.retryAfterSeconds ?? 60,
        source: 'server',
      });
    } else if (!hasStale) {
      const unavailable = e.kind === 'unavailable' || e.kind === 'network' || e.kind === 'timeout';
      this.stateSignal.set({
        status: 'error',
        error: e,
        kind: unavailable ? 'unavailable' : 'other',
      });
    }
    // A failed background refresh keeps the stale chips on screen.
  }
}
