import { afterNextRender, computed, effect, inject, Injector, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withProps,
  withState,
} from '@ngrx/signals';
import type {
  AppointmentResponse,
  BranchResponse,
  ServiceTypeResponse,
  SlotResponse,
} from '../../../core/api/models';
import { SessionStore } from '../../../core/auth/session.store';
import { ToastService } from '../../../core/notify/toast.service';
import { CLOCK } from '../../../core/util/clock';
import { dayStrip, diffDays, todayInZone } from '../../../core/time';
import { hasSchedule, toSchedule } from '../shared/branch-schedule';
import { ReferenceDataStore } from '../shared/reference-data/reference-data.store';
import { consumeJustBooked } from './just-booked.marker';
import { createMinuteClock } from './minute-clock';
import { slotCacheKey, type SlotKey } from './slot-cache';
import { SlotSearchService } from './slot-search.service';
import { stepFromParams, type StepId } from './steps';
import {
  LAST_DAY_OFFSET,
  buildParams,
  isCalendarDate,
  parseParams,
  repairParams,
  type WizardParams,
} from './wizard-params';

export const OUT_OF_DATE_NOTICE = 'That link is out of date. Choose again.';
export const SLOT_REMOVED_MESSAGE = 'The time you picked is no longer available.';

/** Captured at success so the screen and the `.ics` do not depend on the lists still loading. */
export interface Booked {
  appointment: AppointmentResponse;
  branch: BranchResponse;
  service: ServiceTypeResponse;
  slot: SlotResponse;
}

interface WizardState {
  /** A chosen but not yet confirmed chip; only "Continue to review" writes it to the URL. */
  selectedSlotId: string | null;
  booking: Booked | null;
  notice: string | null;
  searchText: string;
  /** A Confirm request is in flight; survives leaving Review, so a return stays disabled. */
  confirming: boolean;
  /** A booking was made in this tab in the last 10 minutes (the marker was consumed). */
  savedHint: boolean;
  /** True after the first render, so the first step heading does not steal focus. */
  initialised: boolean;
}

const initialState: WizardState = {
  selectedSlotId: null,
  booking: null,
  notice: null,
  searchText: '',
  confirming: false,
  savedHint: false,
  initialised: false,
};

/** The keys whose presence with an unusable value means the URL needs repairing. */
const KEYS = ['branch', 'service', 'date', 'slot'] as const;

const sameKey = (a: SlotKey | null, b: SlotKey | null): boolean =>
  a === b || (a !== null && b !== null && slotCacheKey(a) === slotCacheKey(b));

/** Only the `done` parameter differs: a dropped `done` is silent (Req 9.7). */
function onlyDoneDropped(raw: WizardParams, repaired: WizardParams): boolean {
  return (
    raw.done === true &&
    repaired.done !== true &&
    raw.branch === repaired.branch &&
    raw.service === repaired.service &&
    raw.date === repaired.date &&
    raw.slot === repaired.slot
  );
}

/**
 * The wizard's state (Req 1). The URL is the only source of the selections: this store
 * derives (`branch`, `service`, `date`, `slot`, `step`) from the query parameters resolved
 * against the reference data and the slot search, and every move is a router navigation built
 * from the full parameter set. An invalid URL is repaired by one pure function with `replaceUrl`.
 */
export const BookingWizardStore = signalStore(
  withState<WizardState>(initialState),
  withProps(() => {
    const route = inject(ActivatedRoute);
    const query = toSignal(route.queryParamMap, { requireSync: true });
    return {
      _route: route,
      _router: inject(Router),
      _injector: inject(Injector),
      _reference: inject(ReferenceDataStore),
      _search: inject(SlotSearchService),
      _session: inject(SessionStore),
      _toast: inject(ToastService),
      _clock: inject(CLOCK),
      /** A known key that is in the URL but did not parse (a bad id): it must be removed. */
      _dirty: computed(() => {
        const q = query();
        const parsed = parseParams(q);
        return KEYS.some((k) => !!q.get(k)?.trim() && parsed[k] === undefined);
      }),
      /** Epoch ms, refreshed each minute (the "now" of the badge and of the branch's today). */
      nowMs: createMinuteClock(),
      /** The parsed query parameters as they are in the URL, valid or not. */
      params: computed(() => parseParams(query())),
    };
  }),
  withComputed((s) => {
    const rawBranch = computed(() => {
      const id = s.params().branch;
      const found = id ? s._reference.branches()?.find((b) => b.id === id) : undefined;
      return found && hasSchedule(found) ? found : undefined;
    });
    const rawService = computed(() => {
      const id = s.params().service;
      return id ? s._reference.services()?.find((x) => x.id === id) : undefined;
    });
    const branchZone = computed(() => {
      const b = rawBranch();
      return b ? toSchedule(b)!.timeZoneId : null;
    });
    const todayInBranch = computed(() => {
      const zone = branchZone();
      return zone ? todayInZone(zone, s.nowMs()) : null;
    });
    const dateValid = computed(() => {
      const d = s.params().date;
      const today = todayInBranch();
      if (!d || !today || !isCalendarDate(d)) return false;
      const diff = diffDays(today, d);
      return diff >= 0 && diff <= LAST_DAY_OFFSET;
    });
    /** The slot search this URL asks for, once branch, service and date are all valid. */
    const slotKey = computed<SlotKey | null>(
      () => {
        const b = rawBranch();
        const sv = rawService();
        const date = s.params().date;
        return b && sv && date && dateValid() ? { branchId: b.id, serviceId: sv.id, date } : null;
      },
      { equal: sameKey },
    );
    /** The loaded slots, only when they are for the key now asked for (never a previous day's). */
    const slots = computed<readonly SlotResponse[] | null>(() => {
      const key = slotKey();
      const state = s._search.state();
      return key && state.status === 'ready' && state.key === slotCacheKey(key)
        ? state.slots
        : null;
    });
    const repaired = computed(() => {
      const result = repairParams(
        s.params(),
        {
          branches: s._reference.branches(),
          services: s._reference.services(),
          slots: slots(),
          todayInBranch: todayInBranch(),
          branchZone: branchZone(),
        },
        s.booking() !== null,
      );
      return { params: result.params, changed: result.changed || s._dirty() };
    });
    /** What the wizard shows: the URL after repair, so an invalid link never flashes a step. */
    const effective = computed(() => repaired().params);
    const step = computed<StepId>(() => stepFromParams(buildParams(effective())));
    const branch = computed(() => {
      const id = effective().branch;
      return id ? s._reference.branches()?.find((b) => b.id === id) : undefined;
    });
    const service = computed(() => {
      const id = effective().service;
      return id ? s._reference.services()?.find((x) => x.id === id) : undefined;
    });
    const slot = computed(() => {
      const id = effective().slot;
      return id ? slots()?.find((x) => x.id === id) : undefined;
    });
    return {
      branchZone,
      todayInBranch,
      slotKey,
      slots,
      /** The URL parameters after repair. */
      effective,
      step,
      branch,
      service,
      date: computed(() => effective().date ?? null),
      slot,
      strip: computed(() => {
        const today = todayInBranch();
        return today ? dayStrip(today) : [];
      }),
      canContinue: computed(
        () => s.selectedSlotId() !== null && !!slots()?.some((x) => x.id === s.selectedSlotId()),
      ),
      _repaired: repaired,
    };
  }),
  withMethods((store) => {
    function navigate(next: WizardParams, replace: boolean): void {
      void store._router.navigate([], {
        relativeTo: store._route,
        queryParams: buildParams(next),
        replaceUrl: replace,
      });
    }

    /** A user move: always builds the complete query from the parameters, never merges. */
    function go(next: WizardParams, replace = false): void {
      patchState(store, { notice: null });
      navigate(next, replace);
    }

    const current = () => store.effective();

    return {
      go,
      /** A navigation the wizard makes itself (repair, default date): the notice stays. */
      replaceWith: (next: WizardParams) => navigate(next, true),
      setConfirming: (confirming: boolean) => patchState(store, { confirming }),
      setSearchText: (text: string) => patchState(store, { searchText: text }),
      selectSlot: (id: string | null) => patchState(store, { selectedSlotId: id }),
      chooseBranch: (id: string) => go({ branch: id }),
      chooseService: (id: string) => go({ branch: current().branch, service: id }),
      chooseDate(date: string): void {
        patchState(store, { selectedSlotId: null });
        const { branch: b, service: sv } = current();
        go({ branch: b, service: sv, date });
      },
      /** "Continue to review" is what writes `slot` (Req 6.4). */
      continueToReview(): void {
        const id = store.selectedSlotId();
        if (id === null || !store.canContinue()) return;
        const { branch: b, service: sv, date } = current();
        go({ branch: b, service: sv, date, slot: id });
      },
      /** The indicator and the Back buttons: a push to an earlier step, later parameters dropped. */
      goTo(step: StepId): void {
        const p = current();
        switch (step) {
          case 'branch':
            return go({});
          case 'service':
            return go({ branch: p.branch });
          case 'datetime':
            return go({ branch: p.branch, service: p.service, date: p.date });
          default:
            return go(p);
        }
      },
      /** Back to step 3 without `slot` (after a `409` or `404` at Confirm), replacing the entry. */
      dropSlot(): void {
        const { branch: b, service: sv, date } = current();
        patchState(store, { selectedSlotId: null });
        go({ branch: b, service: sv, date }, true);
      },
      /** Success (Req 9.6): keep the booking in memory and replace the step 4 entry with `done=1`. */
      showBooked(booked: Booked): void {
        patchState(store, { booking: booked, selectedSlotId: null });
        go(
          {
            branch: booked.branch.id,
            service: booked.service.id,
            date: booked.slot.date,
            done: true,
          },
          true,
        );
      },
      bookAnother(): void {
        patchState(store, { booking: null, selectedSlotId: null, searchText: '' });
        go({});
      },
    };
  }),
  withHooks({
    onInit(store) {
      store._reference.ensureBranches();
      store._reference.ensureServices();
      afterNextRender(() => patchState(store, { initialised: true }), {
        injector: store._injector,
      });

      // The selection belongs to one (branch, service, date): a new key clears it silently, and
      // a background refresh that removes the chosen slot clears it with a toast (Req 6.7).
      let prevKey: string | null = null;
      let prevSlots: readonly SlotResponse[] | null = null;
      let prevKeyForSlots: string | null = null;
      effect(() => {
        const key = store.slotKey();
        const slots = store.slots();
        untracked(() => {
          const keyText = key ? slotCacheKey(key) : null;
          const selected = store.selectedSlotId();
          if (keyText !== prevKey) {
            if (selected !== null) patchState(store, { selectedSlotId: null });
          } else if (
            selected !== null &&
            slots &&
            prevSlots?.some((x) => x.id === selected) &&
            !slots.some((x) => x.id === selected)
          ) {
            patchState(store, { selectedSlotId: null });
            store._toast.showInfo(SLOT_REMOVED_MESSAGE);
          }
          prevKey = keyText;
          // A reload shows a skeleton (null) between two lists: compare with the last list seen.
          if (keyText !== prevKeyForSlots || slots) prevSlots = slots;
          prevKeyForSlots = keyText;
        });
      });

      // The slot search runs only for a signed-in session, on the two steps that need slots.
      effect(() => {
        const key = store.slotKey();
        const step = store.step();
        const signedIn = store._session.status() === 'authenticated';
        if (key && signedIn && (step === 'datetime' || step === 'review')) {
          untracked(() => store._search.load(key));
        }
      });

      // "Your appointment is saved" after a reload or "Book another" on step 1 or 3 (Req 9.7).
      effect(() => {
        const step = store.step();
        if (step !== 'branch' && step !== 'datetime') return;
        untracked(() => {
          if (!store.savedHint() && consumeJustBooked(store._clock.now())) {
            patchState(store, { savedHint: true });
          }
        });
      });

      // The success view lives only as long as `done=1` is in the URL (Back leaves it).
      let wasDone = false;
      effect(() => {
        const done = store.params().done === true;
        untracked(() => {
          if (wasDone && !done) patchState(store, { booking: null });
        });
        wasDone = done;
      });

      // Repair an invalid URL, set the default date, and roll the strip over at midnight.
      let prevToday: string | null = null;
      effect(() => {
        const repaired = store._repaired();
        const raw = store.params();
        const today = store.todayInBranch();
        untracked(() => {
          const previous = prevToday;
          prevToday = today;
          if (today && previous && today !== previous) store._search.dropBefore(today);
          if (repaired.changed) {
            const rolledOver =
              !!today &&
              !!previous &&
              !!raw.date &&
              isCalendarDate(raw.date) &&
              raw.date < today &&
              raw.date >= previous &&
              repaired.params.branch === raw.branch &&
              repaired.params.service === raw.service;
            if (rolledOver) {
              // The branch's day changed while the step was open: today replaces the past date.
              store.replaceWith({ branch: raw.branch, service: raw.service, date: today });
              return;
            }
            if (!onlyDoneDropped(raw, repaired.params)) {
              patchState(store, { notice: OUT_OF_DATE_NOTICE });
            }
            store.replaceWith(repaired.params);
          } else if (today && raw.branch && raw.service && !raw.date && !raw.done) {
            store.replaceWith({ branch: raw.branch, service: raw.service, date: today });
          }
        });
      });
    },
  }),
);

export type BookingWizardStoreType = InstanceType<typeof BookingWizardStore>;
