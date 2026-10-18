import { DestroyRef, Signal, computed, effect, inject, signal, untracked } from '@angular/core';
import { BookingApiService } from '../../../core/api/booking-api.service';
import type { AppError } from '../../../core/http/app-error';
import { createRetryCountdown, type RetryCountdown } from '../../../core/http/retry-countdown';
import { SessionStore } from '../../../core/auth/session.store';
import { ToastService } from '../../../core/notify/toast.service';
import { CLOCK } from '../../../core/util/clock';
import { mapConfirmError } from './confirm-outcome';
import { IdempotencyKeyStore, NoSecureRandomError } from './idempotency-key.store';
import { markJustBooked } from './just-booked.marker';
import { SlotSearchService } from './slot-search.service';
import { BookingWizardStore } from './wizard.store';

export type ConfirmState =
  | { s: 'idle' }
  | { s: 'submitting' }
  /** `409` "key in progress": one automatic re-send after 2 s, then "Check again". */
  | { s: 'in-progress'; autoRetried: boolean }
  /** `502`, `503`, `504`, network, timeout: the booking may or may not have happened. */
  | { s: 'retryable' }
  | { s: 'rate-limited' }
  | { s: 'overlap' }
  | { s: 'failed'; message: string }
  | { s: 'done' };

export interface ConfirmFlow {
  readonly state: Signal<ConfirmState>;
  readonly countdown: RetryCountdown;
  /** True when a Confirm can be sent: a resolved slot and a signed-in Customer. */
  readonly canSubmit: Signal<boolean>;
  submit(): void;
  /** Same code path as `submit`: the same key and body go out again. */
  retry(): void;
  reset(): void;
}

export const AUTO_RETRY_MS = 2000;
export const SLOT_GONE_MESSAGE = 'That time is no longer available. Please choose another.';
export const KEY_MISMATCH_MESSAGE = 'Something went wrong with that request. Please confirm again.';
export const NO_SECURE_RANDOM_MESSAGE =
  'Your browser cannot book appointments safely. Try a newer browser.';

/**
 * The Confirm flow (Req 7, 8) as an explicit state machine. An injection-context function
 * used by the review step. Three guarantees: a second activation is refused by a synchronous
 * `inFlight` field (and the store's `confirming` flag, which survives leaving Review), the
 * request is never cancelled when the component is destroyed (an aborted POST can leave the
 * server booked), and a retry is the same code path as the first submit with the same key.
 */
export function createConfirmFlow(): ConfirmFlow {
  const api = inject(BookingApiService);
  const keys = inject(IdempotencyKeyStore);
  const store = inject(BookingWizardStore);
  const search = inject(SlotSearchService);
  const session = inject(SessionStore);
  const toast = inject(ToastService);
  const clock = inject(CLOCK);
  const countdown = createRetryCountdown();

  const local = signal<ConfirmState>({ s: 'idle' });
  // A request started by a previous instance of Review still blocks this one.
  const state = computed<ConfirmState>(() => (store.confirming() ? { s: 'submitting' } : local()));
  const canSubmit = computed(
    () =>
      !!store.slot() &&
      !!store.branch() &&
      !!store.service() &&
      session.status() === 'authenticated' &&
      session.role() === 'Customer',
  );

  let inFlight = false;
  let autoRetried = false;
  let cancelTimer: (() => void) | null = null;

  const stopTimer = (): void => {
    cancelTimer?.();
    cancelTimer = null;
  };
  inject(DestroyRef).onDestroy(stopTimer);

  // The Confirm button returns when the countdown of a `429` ends (no automatic retry).
  effect(() => {
    const active = countdown.active();
    untracked(() => {
      if (!active && local().s === 'rate-limited') local.set({ s: 'idle' });
    });
  });

  function run(automatic: boolean): void {
    if (inFlight || store.confirming() || !canSubmit()) return;
    const slot = store.slot()!;
    const branch = store.branch()!;
    const service = store.service()!;
    const slotKey = store.slotKey();
    let key: string;
    try {
      key = keys.acquire(slot.id);
    } catch (e) {
      if (e instanceof NoSecureRandomError) {
        local.set({ s: 'failed', message: NO_SECURE_RANDOM_MESSAGE });
        return;
      }
      throw e;
    }
    stopTimer();
    inFlight = true;
    autoRetried = automatic;
    store.setConfirming(true);
    local.set({ s: 'submitting' });

    const finish = (): void => {
      inFlight = false;
      store.setConfirming(false);
    };

    // No takeUntilDestroyed on purpose: leaving Review must not abort the POST (Req 7.7).
    api.createAppointment(slot.id, key).subscribe({
      next: (appointment) => {
        keys.clear(slot.id);
        markJustBooked(clock.now());
        if (slotKey) search.invalidate(slotKey);
        local.set({ s: 'done' });
        finish();
        store.showBooked({ appointment, branch, service, slot });
      },
      error: (e: AppError) => {
        finish();
        const outcome = mapConfirmError(e);
        switch (outcome.kind) {
          case 'overlap':
            local.set({ s: 'overlap' });
            break;
          case 'in-progress':
            local.set({ s: 'in-progress', autoRetried });
            if (!autoRetried) cancelTimer = clock.setTimer(() => run(true), AUTO_RETRY_MS);
            break;
          case 'slot-gone':
            local.set({ s: 'idle' });
            keys.clear(slot.id);
            // Forget the cached day so the search that step 3 starts is a real request.
            if (slotKey) search.invalidate(slotKey);
            store.dropSlot();
            toast.showInfo(SLOT_GONE_MESSAGE);
            break;
          case 'key-mismatch':
            keys.rotate(slot.id);
            local.set({ s: 'failed', message: KEY_MISMATCH_MESSAGE });
            break;
          case 'retryable':
            local.set({ s: 'retryable' });
            break;
          case 'rate-limited':
            countdown.start(outcome.seconds);
            local.set({ s: 'rate-limited' });
            break;
          case 'session-ended':
            // F1 ends the session and returns here after sign-in; the key stays stored.
            local.set({ s: 'idle' });
            break;
          case 'failed':
            local.set({ s: 'failed', message: outcome.message });
            if (e.status === 400 || e.status === 403) toast.showError(e);
            break;
        }
      },
    });
  }

  return {
    state,
    countdown,
    canSubmit,
    submit: () => run(false),
    retry: () => run(false),
    reset: () => {
      stopTimer();
      countdown.cancel();
      local.set({ s: 'idle' });
    },
  };
}
