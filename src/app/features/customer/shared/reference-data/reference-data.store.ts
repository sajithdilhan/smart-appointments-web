import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import type { Subscription } from 'rxjs';
import { AvailabilityApiService } from '../../../../core/api/availability-api.service';
import type { BranchResponse, ServiceTypeResponse } from '../../../../core/api/models';
import type { AppError } from '../../../../core/http/app-error';
import { SessionStore } from '../../../../core/auth/session.store';
import { OutageState } from '../../../../core/http/outage-state';
import { hasSchedule } from '../branch-schedule';

export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

/** Bookable branches first, then by name in the browser locale (Req 2.6). */
function sortBranches(list: readonly BranchResponse[]): BranchResponse[] {
  return [...list].sort(
    (a, b) => Number(hasSchedule(b)) - Number(hasSchedule(a)) || a.name.localeCompare(b.name),
  );
}

function sortServices(list: readonly ServiceTypeResponse[]): ServiceTypeResponse[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Branches and services, fetched once per session and shared by the booking wizard and (later)
 * My appointments. Concurrent first reads send one request. `refresh()` bypasses the cache,
 * `clear()` forgets everything (it runs by itself when the session leaves `authenticated`), and an
 * outage that recovers reloads only what had failed.
 */
@Injectable({ providedIn: 'root' })
export class ReferenceDataStore {
  private readonly api = inject(AvailabilityApiService);
  private readonly outage = inject(OutageState);
  private readonly session = inject(SessionStore);

  private readonly branchList = signal<BranchResponse[] | null>(null);
  private readonly serviceList = signal<ServiceTypeResponse[] | null>(null);
  private readonly branchState = signal<LoadState>('idle');
  private readonly serviceState = signal<LoadState>('idle');
  private readonly branchError = signal<AppError | null>(null);
  private readonly serviceError = signal<AppError | null>(null);

  private branchRequest?: Subscription;
  private serviceRequest?: Subscription;

  readonly branches = this.branchList.asReadonly();
  readonly services = this.serviceList.asReadonly();
  readonly branchesState = this.branchState.asReadonly();
  readonly servicesState = this.serviceState.asReadonly();
  readonly branchesError = this.branchError.asReadonly();
  readonly servicesError = this.serviceError.asReadonly();
  /** The most recent failure of either list, or `null`. */
  readonly error = computed(() => this.branchError() ?? this.serviceError());

  constructor() {
    let seen = this.outage.recovered();
    effect(() => {
      const recovered = this.outage.recovered();
      if (recovered === seen) return;
      seen = recovered;
      untracked(() => this.reloadFailed());
    });

    // A different user on the same tab must never see the previous session's lists.
    let wasAuthenticated = this.session.status() === 'authenticated';
    effect(() => {
      const authenticated = this.session.status() === 'authenticated';
      const left = wasAuthenticated && !authenticated;
      wasAuthenticated = authenticated;
      if (left) untracked(() => this.clear());
    });
  }

  /** Loads the branches unless they are loaded or loading; retries after an error. */
  ensureBranches(): void {
    const state = this.branchState();
    if (state === 'idle' || state === 'error') this.loadBranches();
  }

  ensureServices(): void {
    const state = this.serviceState();
    if (state === 'idle' || state === 'error') this.loadServices();
  }

  /** Reloads both lists whatever the cache holds (the old data stays visible meanwhile). */
  refresh(): void {
    this.loadBranches();
    this.loadServices();
  }

  /** Forgets everything and cancels in-flight loads. */
  clear(): void {
    this.branchRequest?.unsubscribe();
    this.serviceRequest?.unsubscribe();
    this.branchList.set(null);
    this.serviceList.set(null);
    this.branchState.set('idle');
    this.serviceState.set('idle');
    this.branchError.set(null);
    this.serviceError.set(null);
  }

  branchById(id: string): BranchResponse | undefined {
    return this.branchList()?.find((b) => b.id === id);
  }

  serviceById(id: string): ServiceTypeResponse | undefined {
    return this.serviceList()?.find((s) => s.id === id);
  }

  private reloadFailed(): void {
    if (this.branchState() === 'error') this.loadBranches();
    if (this.serviceState() === 'error') this.loadServices();
  }

  private loadBranches(): void {
    this.branchRequest?.unsubscribe();
    this.branchState.set('loading');
    this.branchRequest = this.api.branches().subscribe({
      next: (list) => {
        this.branchList.set(sortBranches(list));
        this.branchError.set(null);
        this.branchState.set('ready');
      },
      error: (e: AppError) => {
        this.branchError.set(e);
        this.branchState.set('error');
      },
    });
  }

  private loadServices(): void {
    this.serviceRequest?.unsubscribe();
    this.serviceState.set('loading');
    this.serviceRequest = this.api.services().subscribe({
      next: (list) => {
        this.serviceList.set(sortServices(list));
        this.serviceError.set(null);
        this.serviceState.set('ready');
      },
      error: (e: AppError) => {
        this.serviceError.set(e);
        this.serviceState.set('error');
      },
    });
  }
}
