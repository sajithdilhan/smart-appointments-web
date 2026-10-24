import { computed, effect, inject, untracked } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import type { Subscription } from 'rxjs';
import { AvailabilityApiService } from '../api/availability-api.service';
import type { Branch } from '../api/models';
import { SessionStore } from '../auth/session.store';
import type { AppError } from '../http/app-error';

export type StaffBranchStatus = 'idle' | 'loading' | 'ready' | 'not-linked' | 'error';

interface StaffBranchState {
  /** The id the current `status` and `branch` belong to. */
  branchId: string | null;
  status: StaffBranchStatus;
  /** The loaded branch; kept (stale) while another one loads so the workspace does not unmount. */
  branch: Branch | null;
  error: AppError | null;
}

const initialState: StaffBranchState = {
  branchId: null,
  status: 'idle',
  branch: null,
  error: null,
};

/**
 * The staff member's branch: the token's `branch_id` turned into `{name, code, timeZoneId}`
 * through `GET /api/branches/{id}`, once per session and branch (Req 1.2 to 1.6). No claim or a
 * `404` is `not-linked` (and requests nothing further); a network or `5xx` failure is `error`.
 * It follows the claim by itself (a refreshed token with another branch loads that branch) and
 * resets when the session leaves `authenticated`.
 */
export const StaffBranchStore = signalStore(
  { providedIn: 'root' },
  withState<StaffBranchState>(initialState),
  withComputed((store) => ({
    timeZoneId: computed(() => store.branch()?.timeZoneId ?? null),
    /** The branch the workspace may query: only once it is loaded (never while it loads). */
    activeBranchId: computed(() =>
      store.status() === 'ready' ? (store.branch()?.id ?? null) : null,
    ),
  })),
  withComputed((store) => ({
    /** The IANA zone of every date shown; 'UTC' when the branch has none (Req 1.6). */
    zone: computed(() => store.timeZoneId() ?? 'UTC'),
  })),
  withComputed((store) => ({
    /** 'UTC' when the branch has no zone (so the UI says so), else null. */
    zoneLabel: computed(() => (store.branch() && store.timeZoneId() === null ? 'UTC' : null)),
  })),
  withMethods((store) => {
    const api = inject(AvailabilityApiService);
    const session = inject(SessionStore);
    let request: Subscription | undefined;

    function cancel(): void {
      request?.unsubscribe();
      request = undefined;
    }

    return {
      /**
       * Loads the claim's branch unless it is loaded or loading; retries after an error. No claim
       * is `not-linked` without a request.
       */
      ensure(): void {
        const id = session.user()?.branchId ?? null;
        if (!id) {
          cancel();
          patchState(store, { branchId: null, status: 'not-linked', branch: null, error: null });
          return;
        }
        const { branchId, status } = store;
        if (branchId() === id && (status() === 'ready' || status() === 'loading')) return;
        if (branchId() === id && status() === 'not-linked') return;
        cancel();
        patchState(store, { branchId: id, status: 'loading', error: null });
        request = api.getBranch(id).subscribe({
          next: (branch) => {
            if (store.branchId() !== id) return;
            patchState(store, { status: 'ready', branch, error: null });
          },
          error: (e: AppError) => {
            if (store.branchId() !== id) return;
            if (e.status === 404) {
              patchState(store, { status: 'not-linked', branch: null, error: null });
            } else {
              patchState(store, { status: 'error', error: e });
            }
          },
        });
      },

      /** Forgets everything and cancels the request (sign-out). */
      reset(): void {
        cancel();
        patchState(store, initialState);
      },
    };
  }),
  withHooks({
    onInit(store) {
      const session = inject(SessionStore);
      const claim = computed(() => session.user()?.branchId ?? null);
      const authenticated = computed(() => session.status() === 'authenticated');
      effect(() => {
        claim();
        const signedIn = authenticated();
        untracked(() => (signedIn ? store.ensure() : store.reset()));
      });
    },
  }),
);
