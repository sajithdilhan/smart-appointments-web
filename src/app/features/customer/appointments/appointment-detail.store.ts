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
import { BookingApiService } from '../../../core/api/booking-api.service';
import { AppError } from '../../../core/http/app-error';
import { OutageState } from '../../../core/http/outage-state';
import { createRetryCountdown } from '../../../core/http/retry-countdown';
import { ToastService } from '../../../core/notify/toast.service';
import { fromEpochMs, parseUtc, toIsoUtc } from '../../../core/time';
import { CLOCK } from '../../../core/util/clock';
import type { AppointmentResponse } from './appointment.model';
import { AppointmentsStore } from './appointments.store';
import { cancelReducer, IDLE, type CancelEvent, type CancelPhase } from './cancel-reducer';

export type DetailLoad = 'loading' | 'ready' | 'not-found' | 'error';

export interface DetailState {
  id: string | null;
  appointment: AppointmentResponse | null;
  load: DetailLoad;
  error: AppError | null;
  phase: CancelPhase;
  /** The browser clock when the appointment loaded or a cancel ended (Req 6.1): no ticking timer. */
  nowMs: number;
}

const initialState: DetailState = {
  id: null,
  appointment: null,
  load: 'loading',
  error: null,
  phase: IDLE,
  nowMs: 0,
};

function toAppError(e: unknown): AppError {
  return e instanceof AppError
    ? e
    : new AppError(500, 'Something went wrong. Please try again.', 'http');
}

/**
 * One appointment and its cancel flow, provided on the detail component. The reducer
 * (`cancelReducer`) decides every transition; this store only runs the effects: the load, the
 * cancel POST and the re-GETs. After any outcome the server is read again before the UI claims
 * anything (Req 6.4, 6.7, 6.8).
 */
export const AppointmentDetailStore = signalStore(
  withState<DetailState>(initialState),
  /** Rate-limit countdown for the Cancel button (Req 6.9). */
  withProps(() => ({ countdown: createRetryCountdown() })),
  withComputed(({ appointment, phase, nowMs }) => ({
    /** Cancel is offered for a `Booked` appointment that starts later (the server's 409 decides). */
    canCancel: computed(() => {
      const a = appointment();
      return (
        a !== null &&
        a.status === 'Booked' &&
        parseUtc(a.startUtc).getTime() > nowMs() &&
        phase().kind !== 'too-late' &&
        phase().kind !== 'cancelling'
      );
    }),
    /** A `Booked` appointment that has started, or a 409 said so (Req 6.1, 6.6). */
    hasStarted: computed(() => {
      const a = appointment();
      if (phase().kind === 'too-late') return true;
      return a !== null && a.status === 'Booked' && parseUtc(a.startUtc).getTime() <= nowMs();
    }),
    isCancelling: computed(() => phase().kind === 'cancelling'),
    /** The polite live-region text; it changes only when the phase kind does (Req 10.4). */
    announcement: computed(() => {
      switch (phase().kind) {
        case 'cancelling':
          return 'Cancelling appointment…';
        case 'cancelled':
          return 'Appointment cancelled.';
        default:
          return '';
      }
    }),
  })),
  withMethods((store) => {
    const api = inject(BookingApiService);
    const toast = inject(ToastService);
    const clock = inject(CLOCK);
    const list = inject(AppointmentsStore, { optional: true });
    const countdown = store.countdown;

    let loadId = 0;

    function dispatch(event: CancelEvent): void {
      patchState(store, { phase: cancelReducer(store.phase(), event) });
    }

    function stamp(): void {
      patchState(store, { nowMs: clock.now() });
    }

    async function load(background: boolean): Promise<void> {
      const id = store.id();
      if (id === null) return;
      loadId += 1;
      const mine = loadId;
      if (!background) patchState(store, { load: 'loading', error: null });
      try {
        const appointment = await api.getAppointment(id);
        if (mine !== loadId) return;
        // A cancel in flight owns the appointment: its own re-GET will apply the result.
        if (store.phase().kind !== 'cancelling') patchState(store, { appointment });
        patchState(store, { load: 'ready', error: null });
        stamp();
      } catch (e) {
        if (mine !== loadId) return;
        const error = toAppError(e);
        if (error.status === 404) patchState(store, { load: 'not-found', appointment: null });
        else if (!background) patchState(store, { load: 'error', error });
        // A failed background refresh keeps what the list gave us.
      }
    }

    function setPending(on: boolean): void {
      const id = store.id();
      if (id !== null) list?.setPending(id, on);
    }

    function notFound(): void {
      patchState(store, { load: 'not-found', appointment: null, phase: IDLE });
      setPending(false);
      void list?.quietRefresh();
    }

    /** Re-reads after a cancel outcome and lets the reducer decide the phase (Req 6.4, 6.7). */
    async function reGet(after: 'ok' | 'unconfirmed'): Promise<void> {
      const id = store.id()!;
      const optimistic = store.appointment()!;
      let result: AppointmentResponse | AppError;
      try {
        result = await api.getAppointment(id);
      } catch (e) {
        result = toAppError(e);
      }
      dispatch({ type: 'reGetResult', after, result });
      if (result instanceof AppError && result.status === 404) return notFound();

      const phase = store.phase();
      if (phase.kind === 'cancelled') {
        const updated: AppointmentResponse =
          !(result instanceof AppError) && phase.refreshed
            ? result
            : {
                ...optimistic,
                status: 'Cancelled',
                cancelledAtUtc: toIsoUtc(fromEpochMs(clock.now())),
              };
        patchState(store, { appointment: updated });
        toast.showSuccess('Appointment cancelled.');
        if (!phase.refreshed) list?.markNotRefreshed(id);
        void list?.applyCancelled(updated);
      } else if (!(result instanceof AppError)) {
        patchState(store, { appointment: result });
      }
      setPending(false);
      stamp();
    }

    /** After a 409: read the appointment and the list again, silently (Req 6.6). */
    async function refreshAfterConflict(): Promise<void> {
      try {
        const appointment = await api.getAppointment(store.id()!);
        patchState(store, { appointment });
      } catch {
        /* the inline message already says what happened */
      }
      setPending(false);
      stamp();
      void list?.quietRefresh();
    }

    async function runCancel(): Promise<void> {
      const id = store.id()!;
      setPending(true);
      countdown.cancel();
      try {
        await api.cancelAppointment(id);
        dispatch({ type: 'ok204' });
        await reGet('ok');
      } catch (e) {
        const error = toAppError(e);
        dispatch({ type: 'err', error });
        const kind = store.phase().kind;
        if (kind === 'cancelling') return reGet('unconfirmed');
        if (error.status === 404) return notFound();
        if (kind === 'rate-limited') countdown.startFrom(error);
        if (error.status === 409) return refreshAfterConflict();
        setPending(false);
        stamp();
      }
    }

    return {
      /** Starts on an appointment id: the list's copy shows at once and is refreshed behind. */
      init(id: string): Promise<void> {
        const seed = list?.byId(id) ?? null;
        loadId += 1;
        countdown.cancel();
        patchState(store, {
          ...initialState,
          id,
          appointment: seed,
          load: seed ? 'ready' : 'loading',
          nowMs: clock.now(),
        });
        return load(seed !== null);
      },
      /** "Try again" after a failed load. */
      reload(): Promise<void> {
        return load(false);
      },
      openCancel(): void {
        dispatch({ type: 'open' });
      },
      keep(): void {
        dispatch({ type: 'keep' });
      },
      /** One POST per decision: a `confirm` outside `confirming` does nothing (Req 6.3). */
      confirm(): Promise<void> {
        if (store.phase().kind !== 'confirming') return Promise.resolve();
        dispatch({ type: 'confirm' });
        return runCancel();
      },
      /** "Try again" after a 503 that left the appointment `Booked`. */
      retryCancel(): Promise<void> {
        if (store.phase().kind !== 'retryable') return Promise.resolve();
        dispatch({ type: 'retry' });
        return runCancel();
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
          if (store.load() === 'error') void store.reload();
        });
      });
    },
  }),
);

export type AppointmentDetailStoreType = InstanceType<typeof AppointmentDetailStore>;
