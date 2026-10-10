# F3 Booking Wizard — Design

## Overview

F3 is one lazy route (`/book`) with a store, five step components and a set of small pure modules. The approach: every rule that can be a pure function is one (URL parsing and repair, branch-zone calendar maths, day parts, duration text, `409` classification, confirm-error mapping, the request budget, the slot cache, `buildIcs`), and the stateful parts (the store, the idempotency-key store, the reference-data store) are thin and tested with the F1 MSW and fake-timer patterns. Decisions that are not obvious:

1. **The URL is the only source of the user's selections; the store derives, it does not own.** `BookingWizardStore` reads `queryParamMap` and _resolves_ it against loaded data (`branch`, `service`, `date`, `slot` objects, `step`). Navigation (push) is the only way to move; repair of an invalid URL is a `replaceUrl` navigation computed by one pure function, `repairParams()`. A selected-but-not-confirmed slot chip is store-only; "Continue to review" is what writes `slot` (Req 1.3, 1.4, 6.4).
2. **Success is a view over `done=1` plus an in-memory booking, not a route.** On `201` the step-4 history entry is replaced with `?branch&service&date&done=1`, so the browser Back button lands on step 3 without `slot`, and a reload (memory gone) drops `done` (Req 9.6, 9.7).
3. **One `Idempotency-Key` per slot, persisted in `sessionStorage` as `sa.idem.<slotId>`** behind `IdempotencyKeyStore`, with a memory mirror so blocked storage still reuses the key for the page's life. It is removed on success, slot change and `422` (Req 7.2, 7.3, 8.6).
4. **The confirm flow is an explicit state machine** (`ConfirmState`), fed by a pure `mapConfirmError(AppError)`; the double-submit guard is a synchronous field, not a disabled attribute (Req 7.6, 8).
5. **`409` text matching lives in one module, `conflict-map.ts`,** with the backend's verbatim strings and one test per string; unknown text falls through to "refresh slots and return to step 3" (Req 8.2).
6. **Slot search is a debounced, cached, budgeted stream.** One `SlotSearchService` owns the cache, the 25-per-minute budget and the in-flight request (`switchMap` cancels the superseded HTTP call). Components only read signals (Req 5).
7. **Reference data (branches, services) and `buildIcs` are F3 deliverables placed for F4** in `features/customer/shared/` (resolved decision 6). `core/` still imports no feature.
8. **The confetti is about 60 lines of hand-written canvas code in its own lazy chunk,** not a library: the particle cap, 2 s lifetime, `aria-hidden` and reduced-motion rules are easier to guarantee than to configure, and a library (about 3 kB gzip plus a dependency to audit) buys nothing for 60 particles (Req 9.2, 9.3, 13.5).
9. **No `@angular/forms`.** The search box is one signal-bound `<input>`; radio groups are a directive, so the wizard chunk avoids the forms library F2's chunk pays for (Req 13.5).
10. **Two small seams are added to the requirements while designing:** the step-4 entry is created by "Continue to review" writing `slot` (not by chip selection), and success uses `done=1` and a `sessionStorage` marker (both folded into the requirements, 1.3, 6.4, 9.6, 9.7).

Assumptions about F1/F2 (confirm when F1's code exists): `ApiClient.get/post` with `headers`, `AppError`, `ToastService`, `RateLimitNotice` and `createRetryCountdown()`, `OutageState.down/recovered`, `SessionStore.status/role`, `CLOCK` (epoch-ms `now()`), `parseUtc`, `fromEpochMs`, `formatInZone`, `zoneDiffersFromBrowser`, F1's title strategy reading route `title` (including a function title), and F0's helm `button`, `card`, `input`, `label`. F3 adds the helm `skeleton` and `badge` through the Spartan CLI.

Verified at implementation time, not now: the generated type names for `BranchResponse`, `ServiceTypeResponse`, `SlotResponse`, `AppointmentResponse` (and the JSON form of `status`), the Spartan generator output for `skeleton` and `badge`, and whether `Intl.DateTimeFormat` hour-cycle options behave identically in jsdom.

## Architecture

Dependency direction as in F0/F1: `features → shared, core`; `shared → core`; `core` imports neither.

| Area                                                | Contents                                                                                                                                                                                            |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/core/`                                     | unchanged; F3 only consumes it, including F1's `core/time/` branch-zone helpers and `core/util/safe-storage.ts` (session variant)                                                                   |
| `src/app/core/api/`                                 | `availability-api.service.ts` gains `branches()`, `services()`, `availableSlots(params)`; `booking-api.service.ts` gains `createAppointment(slotId, idempotencyKey)` (the F1 shells, Req 1.3 of F1) |
| `src/app/shared/a11y/`                              | `roving-radio-group.directive.ts` (+ `radio-item`), reusable by F4/F5                                                                                                                               |
| `src/app/shared/ui/`                                | helm `skeleton`, `badge` (generated); app primitive `empty-state/` and `inline-alert/` only if F1 or F2 have not made them (Req 11.5 of F3)                                                         |
| `src/app/features/customer/shared/`                 | `reference-data/reference-data.store.ts`, `ics/build-ics.ts`, `ics/ics-download.ts`                                                                                                                 |
| `src/app/features/customer/book/`                   | everything below                                                                                                                                                                                    |
| `src/app/features/customer/customer.routes.ts` (F1) | the `book` entry becomes `loadChildren: () => import('./book/book.routes')`                                                                                                                         |
| `src/testing/handlers/`                             | `availability.handlers.ts`, `booking.handlers.ts`, `booking-backend.ts` (stateful model)                                                                                                            |
| `e2e/`                                              | `book.spec.ts`, `book.a11y.spec.ts`                                                                                                                                                                 |
| `scripts/size.mjs`                                  | gains `--group book`                                                                                                                                                                                |

```
src/app/features/customer/book/
  book.routes.ts                 # route, providers, title function, runGuardsAndResolvers
  book.page.ts / .html           # h1, step indicator, notice, @switch over step, sticky action bar
  steps.ts                       # STEPS, stepFromParams(), stepTitle()
  wizard-params.ts               # parseParams(), repairParams(), buildParams() (pure)
  date-strip.ts                  # dayStrip(todayInBranch): 14 labelled days (pure)
  wizard.store.ts                # BookingWizardStore (signals), resolved view, navigation methods
  slot-search.service.ts         # cache + budget + debounce + switchMap (uses slot-cache.ts, request-budget.ts)
  slot-cache.ts                  # pure SlotCache (Map, ttl)
  request-budget.ts              # pure SlidingWindowBudget
  day-parts.ts                   # partOfDay(localStartTime), groupSlots()
  duration.ts                    # formatDuration(minutes)
  conflict-map.ts                # classifyConflict(detail): ConflictClass (verbatim strings)
  confirm-outcome.ts             # mapConfirmError(AppError): ConfirmOutcome
  confirm.machine.ts             # ConfirmState, createConfirmFlow(): signals + submit()/retry()/reset()
  idempotency-key.store.ts       # acquire / clear / rotate / pruneExcept
  just-booked.marker.ts          # sa.book.justBooked read/write (try/catch)
  step-heading.directive.ts      # focus the step <h2> on step change (not on first render)
  components/
    step-indicator.component.ts
    branch-step.component.ts / branch-card.component.ts
    service-step.component.ts / service-card.component.ts
    date-time-step.component.ts
    date-strip.component.ts
    slot-groups.component.ts / slot-chip.component.ts
    slots-status.component.ts    # skeleton, empty, error, rate-limit states
    review-step.component.ts / review-card.component.ts
    success-step.component.ts
    success-check.component.ts   # animated SVG check
    confetti.component.ts        # lazy, @defer
    calendar-button.component.ts
    action-bar.component.ts      # sticky bar above the F1 bottom tab bar
```

## Components and interfaces

### Routes

| Path    | Component  | Guard                                                                 | Notes                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------- | ---------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/book` | `BookPage` | F1 `authGuard`, `roleGuard('Customer')` (on the customer shell route) | lazy (`loadChildren`); `title: (r) => stepTitle(stepFromParams(r.queryParams))` with `runGuardsAndResolvers: 'paramsOrQueryParamsChange'`, so the F1 `TitleStrategy` recomputes the title on each step change without a race against a manual `Title.setTitle` (Req 1.5). Providers on the route: `BookingWizardStore`, `SlotSearchService`, `IdempotencyKeyStore`. `ReferenceDataStore` is `providedIn: 'root'` (F4 shares it). |

`book.routes.ts`: one route `''` with `component: BookPage`, `onSameUrlNavigation: 'reload'` inherited from F1 (the outage Retry reloads the route, which rebuilds the store; selections survive because they are in the URL).

### Pure modules

**`steps.ts`**

```ts
export type StepId = 'branch' | 'service' | 'datetime' | 'review' | 'success';
export const STEPS = [
  { id: 'branch', label: 'Branch' },
  { id: 'service', label: 'Service' },
  { id: 'datetime', label: 'Date and time' },
  { id: 'review', label: 'Review' },
] as const;
export function stepFromParams(p: Params): StepId; // done=1 -> success; else by presence: branch, service, date+slot; unresolved validity is the store's job
export function stepTitle(s: StepId): string; // "Date and time | Book an appointment" (the strategy appends "| Smart Appointments"); success -> "Appointment booked"
```

The title function sees only the raw params; invalid combinations are repaired by `replaceUrl`, so the title follows the repaired URL on the next navigation (Req 1.4, 1.5).

**`wizard-params.ts`**

```ts
export interface WizardParams {
  branch?: string;
  service?: string;
  date?: string;
  slot?: string;
  done?: true;
}
export interface Resolution {
  branches: Branch[] | null;
  services: Service[] | null;
  slots: Slot[] | null;
  todayInBranch: string | null;
  branchZone: string | null;
}

export function parseParams(q: ParamMap): WizardParams; // trims, drops unknown keys and non-GUID ids
export function repairParams(
  p: WizardParams,
  r: Resolution,
  hasBooking: boolean,
): { params: WizardParams; changed: boolean };
```

`repairParams` implements Req 1.4 as an ordered cascade; each rule drops the parameter and every later one: `branch` not in `r.branches` or without schedule; `service` not in `r.services`; `date` not `^\d{4}-\d{2}-\d{2}$`, not a real calendar date, `< todayInBranch` or `> todayInBranch + 13`; `slot` not in `r.slots` (only checked when `r.slots` is loaded); `done` without `hasBooking` is dropped (Req 9.7). Rules whose data is not loaded yet (`null`) are skipped, so nothing is dropped while loading. `changed` drives the one-shot `role="status"` note.

**Branch-zone calendar maths come from F1's `core/time/`, not from F3.** F1 owns the helpers (its design is amended to include them); F3 only calls them and holds no zone maths of its own. Names as assumed here, to be matched to F1's final design before implementation: `zonedParts(zoneId, at)` (local date `yyyy-MM-dd`, English weekday name, minutes since local midnight), `todayInZone(zoneId, at): string`, `addDays(date, n): string` (UTC arithmetic, no DST error), `todaysHours(branch, at)` (`{opens, closes}`, `'closed-today'` or `'no-schedule'` when `timeZoneId` is blank or `workingHours` is empty), `isOpenNow(branch, at)` (`opensAt <= minutes < closesAt`), `hhmm(t)` (`"09:30:00"` to `"09:30"`) and `localToUtc` (not needed by F3). The only calendar code F3 keeps is `dayStrip(todayInBranch)` in `date-strip.component.ts`'s sibling `date-strip.ts` (14 labelled days built with `addDays` and `formatInZone(..., 'UTC', ...)` at noon UTC so a label never shifts a day). An invalid `timeZoneId` falls back to UTC with one warning, inside F1 (F1 Req 13.3). `new Date(<value>)` is never used in F3 (F1's ESLint rule).

**`day-parts.ts`**: `partOfDay(localStartTime): 'morning'|'afternoon'|'evening'` by the hour of the string (`00-11`, `12-16`, `17-23`; Req 6.1), `groupSlots(slots)` returns the non-empty groups sorted by `startAtUtc`, and `capacityHint(availableCapacity): string | null` (`<= 3` gives "N left", else null; Req 6.3).

**`duration.ts`**: `formatDuration(m)` returns "30 min", "1 h", "1 h 30 min" (Req 3.2).

**`conflict-map.ts`** (Req 8.2): the single place that knows backend wording.

```ts
export type ConflictClass = 'overlap' | 'in-progress' | 'slot-gone' | 'unknown';
const EXACT: ReadonlyMap<string, ConflictClass> = new Map([
  ['you already have an appointment at that time.', 'overlap'],
  ['a request with this idempotency-key is still being processed.', 'in-progress'],
  ['slot is full.', 'slot-gone'],
  ['slot has already started.', 'slot-gone'],
  ['the slot cannot be reserved.', 'slot-gone'],
]);
const PATTERNS: readonly [RegExp, ConflictClass][] = [
  [/^branch '.+' is inactive\.$/, 'slot-gone'],
  [/^service type '.+' is inactive\.$/, 'slot-gone'],
  [/^branch '.+' has no working hours\.$/, 'slot-gone'],
];
export function classifyConflict(detail: string | undefined): ConflictClass; // trim + lowercase; exact, then patterns, else 'unknown'
```

Verbatim backend sources recorded in a comment above the tables: Booking `AppointmentErrors.Overlap/KeyInProgress`, Availability `SlotErrors.Full/AlreadyStarted/BranchInactive/ServiceTypeInactive/NoWorkingHours`, Booking `AvailabilityClient` fallback. `unknown` is treated as `slot-gone` by the caller, so a reworded message degrades safely. The `AppError.message` of a `409` is `detail` (F1 Req 3.2), so this module reads `error.message`.

**`confirm-outcome.ts`**

```ts
export type ConfirmOutcome =
  | { kind: 'overlap' }
  | { kind: 'in-progress' }
  | { kind: 'slot-gone' }
  | { kind: 'key-mismatch' } // 422
  | { kind: 'retryable' } // unavailable | network | timeout
  | { kind: 'rate-limited'; seconds: number }
  | { kind: 'session-ended' } // unauthorized (F1 owns the redirect)
  | { kind: 'failed'; message: string }; // 400, 403, anything else
export function mapConfirmError(e: AppError): ConfirmOutcome;
```

Decision order: `kind` first (`rate-limited`, `unavailable`/`network`/`timeout`, `unauthorized`), then `status`: `404` gives `slot-gone`; `409` gives `classifyConflict(e.message)` mapped (`overlap`, `in-progress`, else `slot-gone`); `422` gives `key-mismatch`; everything else `failed` with `e.message` (Req 8).

**`slot-cache.ts`, `request-budget.ts`**

```ts
export class SlotCache {
  // key = `${branchId}|${serviceId}|${date}`
  get(key, now): { slots: Slot[]; fetchedAt: number; fresh: boolean } | undefined; // fresh: now - fetchedAt < 60_000
  set(key, slots, now): void;
  invalidate(key): void;
  dropBefore(date: string): void;
  clear(): void;
}
export class SlidingWindowBudget {
  // 25 in 60 s
  constructor(
    private limit = 25,
    private windowMs = 60_000,
  ) {}
  tryAcquire(now: number): { ok: true } | { ok: false; retryAfterSeconds: number }; // keeps timestamps, prunes the expired
}
```

**`idempotency-key.store.ts`** (Req 7.2, 7.3, 8.6)

```ts
@Injectable()
export class IdempotencyKeyStore {
  private readonly mem = new Map<string, string>();
  acquire(slotId: string): string; // sessionStorage `sa.idem.<slotId>` if it is a UUID, else mem, else create (crypto.randomUUID -> getRandomValues v4 fallback) and store in both
  clear(slotId: string): void; // removes from both
  rotate(slotId: string): string; // clear + acquire (422)
  pruneExcept(slotId: string | null): void; // removes other sa.idem.* keys (iterates sessionStorage keys in try/catch)
}
```

Every `sessionStorage` call goes through F1's generalised `core/util/safe-storage.ts` (its `session` variant: `safeGet`, `safeSet`, `safeRemove` and a key iterator, all try/catch), so this store has no wrapper of its own. If neither `randomUUID` nor `getRandomValues` exists, `acquire` throws a typed `NoSecureRandomError`, which the review step turns into the "Your browser cannot book appointments safely" message (Req 7.4). The `UUID_RE` check means a tampered `sessionStorage` value is replaced, never sent. `just-booked.marker.ts` is the same pattern for `sa.book.justBooked` (a timestamp; valid 10 minutes; `consume()` reads and removes).

### Reference data (shared with F4)

```ts
@Injectable({ providedIn: 'root' })
export class ReferenceDataStore {
  readonly branches: Signal<Branch[] | null>;  readonly services: Signal<Service[] | null>;
  readonly branchesState: Signal<'idle'|'loading'|'ready'|'error'>;  readonly servicesState: ...;
  readonly error: Signal<AppError | null>;
  ensureBranches(): void;  ensureServices(): void;      // idempotent: one in-flight request, cached for the session
  refresh(): void;                                      // bypass cache (Req 5.6, 2.7 "Try again")
  branchById(id: string): Branch | undefined;  serviceById(id: string): Service | undefined;   // F4 joins
}
```

It listens to `SessionStore.status` through an `effect` and clears everything when the status leaves `authenticated`, so a different user on the same tab never sees stale data; it reloads on `OutageState.recovered` only when a previous load errored. Branches sort bookable-first then by name (Req 2.6), services by `name` (`localeCompare`).

### `BookingWizardStore`

A class-based signal store (`@ngrx/signals`, `signalStore({}, withState, withComputed, withMethods)` as in F1; shown as the interface it exposes):

```ts
// state
{ selectedSlotId: string | null; booking: Booked | null; notice: string | null; initialised: boolean; searchText: string }
// derived (computed), all from the URL + reference data + slot search
params: WizardParams;   branch; service; date; slot: Slot | null;  branchZone: string | null;
step: StepId;           todayInBranch: string | null;  strip: StripDay[];  canContinue: boolean;
// methods
chooseBranch(id): void   // navigate({ branch: id })  (clears the rest)
chooseService(id): void  // navigate({ branch, service })
chooseDate(date): void   // push { ..., date }, clears slot and selectedSlotId
selectSlot(id): void     // state only (Req 6.4)
continueToReview(): void // push { ..., slot }
goTo(step: StepId): void // from the indicator and Back; drops later params
bookAnother(): void      // clears booking, navigate({})
```

`params` is `toSignal(route.queryParamMap.pipe(map(parseParams)))`. A single `effect` runs `repairParams(params, resolution, booking != null)`; WHEN `changed`, it navigates with `replaceUrl: true`, `queryParamsHandling: ''` (the full repaired set), and sets `notice` to "That link is out of date. Choose again." only if the dropped value was part of the _original_ URL (not a normal step back), tracked by comparing against `params` at entry. The notice clears on the next user navigation. All navigation goes through one private `go(params, { replace? })` that always builds the full query object from the `WizardParams` (never merges), so a stale parameter cannot leak (Req 1.3).

The route-level `done` view: `step = computed(() => params.done && booking ? 'success' : stepFromResolved(...))`. `booking` is set by the confirm flow on `201` and cleared whenever `done` is no longer in the URL (an `effect` on `params().done`), which is what makes Back leave Success (Req 9.6).

Focus and announcements: `step-heading.directive.ts` on each step's `<h2>`: in its constructor `if (store.initialised()) afterNextRender(() => el.focus({preventScroll: true}))`; `initialised` is set after the first render, so the first load does not steal focus (F1's route announcer announces the title) but every later step change, including repair returns, focuses the new heading (Req 1.5, 8.4). The `role="status"` regions (notice, result counts) are siblings rendered once; their text is a signal, not template churn (Req 12.3).

### `SlotSearchService` (Req 5)

```ts
@Injectable()
export class SlotSearchService {
  readonly state: Signal<SlotsState>; // for the current key
  load(key: SlotKey, opts?: { force?: boolean }): void; // component/store calls on every key change
  invalidate(key: SlotKey): void; // after a booking (Req 9.8)
}
type SlotsState =
  | { status: 'idle' }
  | { status: 'loading'; stale?: Slot[] }
  | { status: 'ready'; slots: Slot[]; fetchedAt: number }
  | { status: 'error'; error: AppError; kind: 'unavailable' | 'other' }
  | { status: 'rate-limited'; countdown: RetryCountdown };
```

Pipeline (one `Subject<{key, force}>` per service instance):

```text
request$ ─ debounceTime(250) ─ switchMap(({key, force}) => {
   cached = cache.get(key, now)
   if (cached?.fresh && !force)              -> of(ready(cached))                  // no request, Req 5.3
   budget = budget.tryAcquire(now)
   if (!budget.ok)                           -> if cached: of(ready(cached)) else rateLimited(budget.retryAfterSeconds)   // Req 5.5
   return api.availableSlots(key).pipe(      // switchMap unsubscribes -> the superseded HTTP call is cancelled (Req 5.2)
            map(normalise: discard wrong ids and availableCapacity <= 0, sort by startAtUtc),   // Req 5.8
            tap(slots => cache.set(key, slots, now)),
            map(ready), catchError(toStateOrRateLimited)) })
```

- A cache hit is also resolved _synchronously_ by `load()` before the debounce (a `computed` over the cache signal tick), so Back into step 3 and re-visiting a day show data with no 250 ms wait. Only a network path goes through `debounceTime`.
- _Stale-while-revalidate_ (Req 5.3): an entry older than 60 s sets `ready(stale)` immediately and sends the request with `state` staying `ready`; the result replaces `slots` only when `sameSlots(a, b)` (ids and `availableCapacity` equal) is false, otherwise nothing re-renders. If the selected slot is absent from the new list, the store clears `selectedSlotId` and calls `ToastService.showInfo("The time you picked is no longer available.")` (Req 6.7).
- Errors: `rate-limited` starts a `createRetryCountdown()` from `retryAfterSeconds` (F1 `retryCountdownFrom`) and sets `{status:'rate-limited'}`; the slots region shows `RateLimitNotice` and, when `countdown.active()` ends, a "Try again" button which calls `load(key, {force:true})`. While rate-limited, `chooseDate` still navigates but cached days render and uncached days show the notice (Req 5.4). `404` calls `ReferenceDataStore.refresh()`, and `repairParams` then removes the dead selection once the lists are reloaded; the toast of Req 5.6 is shown once. `unavailable`, `network`, `timeout` set `error` (the F1 banner is raised by the interceptor, not here) and an effect on `OutageState.recovered` re-issues `load(key)` when `status === 'error'`.
- The service starts no timer of its own; the budget and cache take `now` from `CLOCK`.

### Components

`BookPage` (`book.page.ts`): `<h1>Book an appointment</h1>` (F2's `appFocusHeading` is _not_ used: the step `<h2>` receives focus), `<app-step-indicator>`, the notice (`role="status"`), then `@switch (store.step())` rendering exactly one step component inside a container with the slide transition (CSS `@starting-style` or an `animate` class, 250 ms, opacity and transform only; the media query `prefers-reduced-motion: reduce` removes it, Req 1.5). The sticky `action-bar` is an `ng-content` slot filled by each step (Back, primary action). A Tailwind `lg` two-column layout puts the `ReviewCard` summary beside the step on 1024 px and wider (Req 12.6).

`StepIndicatorComponent`: `<ol aria-label="Booking progress">`; per step `<li>` with a `<button>` when the step index is below the current and reachable, plain text otherwise; `aria-current="step"` on the current `<li>`; under 640 px the list is replaced by `<p>Step N of 4: name</p>` rendered with `@if (viewport.narrow())` (the F1 `ViewportService`, so jsdom tests can drive it and one landmark exists). Success shows "Booked" (Req 1.2, 1.7).

`RovingRadioGroupDirective` (`shared/a11y/`): `[appRadioGroup]` sets `role="radiogroup"` and `aria-label` from an input; items are `[appRadioItem]` with `role="radio"`, `aria-checked`, and a roving `tabindex` (`0` on the checked item, or the first enabled item when none is checked, `-1` elsewhere). Keydown handling: ArrowRight/ArrowDown next, ArrowLeft/ArrowUp previous (wrapping across the DOM order of items, which includes slot groups since the directive queries `contentChildren(RadioItem, {descendants: true})`), Home/End, Space/Enter select. `aria-disabled` items stay in the order and focusable but ignore selection (the no-schedule branch, Req 2.6). The directive emits `(selected)` with the item value. It is used by branches, services, the date strip and the slot chips so the four groups cannot drift (Req 12.1).

`BranchStep`: skeleton (`@for` of 4 `hlm-skeleton` cards) while `branchesState() === 'loading'`; a search `<input type="search">` bound to `store.searchText` with `debounce` via a 150 ms `rxjs` stream into a `searchQuery` signal; `filtered = computed(...)` using `normalise(s) = s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()` over name, code and address; the result-count `role="status"` text is a signal updated from the _debounced_ query only (Req 2.3). Each `BranchCard` is `[appRadioItem]` and shows name, address, a `tel:` link (a link inside a radio is an a11y problem, so the phone is shown as plain text in the card and the `tel:` link appears on the Review and Success steps; Open question 4), hours text and the Open/Closed `hlm-badge` with an icon (`lucide` `clock`, `circle-check`, `circle-x`). Hours and badge come from `todaysHours` / `isOpenNow` with `now = clockMinute()`, a `signal` refreshed by `interval(60_000)` (also drives Req 4.7). A no-schedule card has `aria-disabled="true"`, the "Online booking not available" badge, and `aria-describedby` pointing at a hidden explanatory sentence.

`ServiceStep`: same structure; the compact branch summary with "Change" (`store.goTo('branch')`) above; `formatDuration` pill.

`DateTimeStep` = `DateStrip` + `SlotsStatus` + `SlotGroups` + the "Times are shown in ..." line. `DateStrip`: `store.strip()` (14 items) in a `role="radiogroup"`; the container is `overflow-x-auto` with `scroll-snap-type: x proximity` (not mandatory: no scroll-jacking); after render, `scrollIntoView({inline:'center', block:'nearest', behavior: reducedMotion ? 'auto' : 'smooth'})` for the checked item. Selecting calls `chooseDate`; arrow-key movement inside the group _selects_ (WAI-ARIA radio pattern), which is what the 250 ms debounce and the 25-request budget protect against (Req 4.2, 5.2).

`SlotGroups`: `groupSlots(slots)` into three `<section>`s with `<h3>`; one radio group wraps all sections; each `SlotChip` is `[appRadioItem]` showing `hhmm(localStartTime)` and the `capacityHint`, with the accessible name `` `${hhmm(start)} to ${hhmm(end)}${hint ? ', ' + hint : ''}` `` (hint rendered as "2 spots left" for the name and "2 left" visibly via `aria-label`). `SlotsStatus` renders the skeleton (three placeholder chip rows), the empty state with "Check <next day>" and "Choose another branch", the error with "Try again", and the `RateLimitNotice`. The "N times available" announcer is a signal set once per completed search.

`ReviewStep` + `ReviewCard`: summary built as in Req 7.1: `hhmm`/`formatLocalDate(slot.date)` for the branch-local lines, and when `zoneDiffersFromBrowser(branchZone, parseUtc(slot.startAtUtc))`, a second line `formatInZone(slot.startAtUtc, browserZone, {style:'time', showZoneName:true})` labelled "your time" (the browser zone from `Intl.DateTimeFormat().resolvedOptions().timeZone`). The branch phone is shown as a `tel:` link here. Confirm button states come from `ConfirmFlow` (below).

`SuccessStep`: `SuccessCheck` is an inline SVG path with `stroke-dasharray` and a CSS `@keyframes` draw (600 ms) disabled under reduced motion; the summary; `<app-copy-reference>` (button + selectable value; clipboard in try/catch with the F1 fallback); actions Add to calendar, View my appointments (`routerLink="/appointments"`), Book another. Confetti is `@defer (on idle; when !reducedMotion()) { <app-confetti /> }`, so its chunk loads only on success and never when reduced motion is on (Req 9.2, 9.3, 13.5).

### Confirm state machine (Req 7, 8)

```ts
export type ConfirmState =
  | { s: 'idle' }
  | { s: 'submitting' }
  | { s: 'in-progress'; autoRetried: boolean } // 409 key in progress
  | { s: 'retryable' } // 5xx / network / timeout: "may or may not have gone through"
  | { s: 'rate-limited' } // countdown owns the Confirm button
  | { s: 'overlap' } // Confirm replaced by "Choose another time"
  | { s: 'failed'; message: string } // 400, 403, 422 message
  | { s: 'done' };
```

`createConfirmFlow()` (an injection-context function used by `ReviewStep`, so it dies with the component) exposes `state`, `countdown`, `submit()`, `retry()` (same as `submit` from `retryable`, `in-progress`, `failed`, `rate-limited`-after-countdown), `reset()`.

```ts
private inFlight = false;                       // the synchronous guard (Req 7.6)
submit() {
  if (this.inFlight || !this.canSubmit()) return;   // canSubmit: slot resolved, role Customer, session authenticated (Req 11.4)
  this.inFlight = true; this.state.set({ s: 'submitting' });
  const key = keys.acquire(slot.id);                // never created before step 4: acquire happens here and on entering Review
  api.createAppointment(slot.id, key).subscribe({ next: ok, error: e => fail(mapConfirmError(e)), complete: () => this.inFlight = false })
}
```

The request is not tied to the component's lifetime for cancellation (`takeUntilDestroyed` is deliberately _not_ used): Req 7.7 says navigating away must not abort a POST. The result is applied to the store (`booking`) rather than component state so a returned-to Review shows the right state. `inFlight` is reset in `finalize`.

| From                                    | Event                        | To           | Side effects                                                                                                         |
| --------------------------------------- | ---------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------- |
| idle / retryable / failed / in-progress | `submit()`                   | submitting   | `inFlight = true`; key acquired (reused)                                                                             |
| submitting                              | `201`                        | done         | clear key, record `justBooked`, `cache.invalidate`, store `booking`, `replaceUrl` to `done=1`, announce              |
| submitting                              | outcome `overlap`            | overlap      | key kept; link to `/appointments`                                                                                    |
| submitting                              | `in-progress`                | in-progress  | key kept; if `!autoRetried`, `timer(2000)` then one automatic `submit()` with `autoRetried=true`                     |
| submitting                              | `slot-gone` (409 other, 404) | idle         | key cleared; `slotSearch.load(key, {force:true})`; `go(step 3, replaceUrl, slot removed)`; `showInfo`; focus heading |
| submitting                              | `key-mismatch` (422)         | failed       | `rotate` key; message "Something went wrong with that request. Please confirm again."                                |
| submitting                              | `retryable`                  | retryable    | key kept; the F1 banner is already up                                                                                |
| submitting                              | `rate-limited`               | rate-limited | `countdown.start(seconds)`; key kept; when the countdown ends the state returns to idle                              |
| submitting                              | `session-ended`              | idle         | nothing (F1 navigates to `/login?returnUrl=<wizard url>`)                                                            |
| submitting                              | `failed`                     | failed       | message inline; `showError` for 403 and 400 (once)                                                                   |
| overlap                                 | user: "Choose another time"  | idle         | `go(step 3)`; slot stays selectable                                                                                  |

`state` drives the template: Confirm is `[disabled]="state().s === 'submitting' || state().s === 'rate-limited'"` with `aria-busy`, and _also_ the guard in code. The same-key retry is therefore the same code path as the first submit, which is what makes Requirement 8.10 true by construction.

### API calls

| Call                                               | Service method                                                       | Notes                                                                                                                                                                 |
| -------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/branches`                                | `AvailabilityApiService.branches()`                                  | via `ReferenceDataStore`                                                                                                                                              |
| `GET /api/services`                                | `AvailabilityApiService.services()`                                  | via `ReferenceDataStore`                                                                                                                                              |
| `GET /api/slots/available?branchId&serviceId&date` | `AvailabilityApiService.availableSlots({branchId, serviceId, date})` | `date` is the strip's `yyyy-MM-dd` (Req 4.6); params object keeps all three required in the type                                                                      |
| `POST /api/appointments`                           | `BookingApiService.createAppointment(slotId, key)`                   | `ApiClient.post(path, { slotId }, { headers: { 'Idempotency-Key': key } })`; returns the generated `AppointmentResponse`; the body has exactly one property (Req 7.5) |

### `buildIcs` (Req 10)

```ts
export interface IcsInput {
  appointmentId: string;
  startUtc: Date;
  endUtc: Date;
  serviceName: string;
  branchName: string;
  branchAddress: string;
  branchPhone: string;
  localStart: string /* "09:30" */;
  zoneId: string;
}
export function buildIcs(input: IcsInput, now: Date): string;
export function icsFileName(branchCode: string, startUtc: Date): string;
export function downloadIcs(text: string, fileName: string): void; // Blob + object URL + <a download>, revoked after click; try/catch -> ToastService.showError
```

Implementation notes. `fmtUtc(d)` formats `yyyyMMddTHHmmssZ` from `getUTC*` (no `Date` string parsing). `escapeText(s)` removes control characters except `\n`, then replaces `\` with `\\`, `;` with `\;`, `,` with `\,` and newline with `\n`, in that order. `fold(line)` splits a content line into chunks of at most 75 octets using `TextEncoder`, never breaking inside a code point (it walks by code point and accumulates `encode(cp).length`), joins with `\r\n `, and the whole file joins with `\r\n` and ends with a final CRLF. Lines: `BEGIN:VCALENDAR`, `VERSION:2.0`, `PRODID:-//Smart Appointments//Web//EN`, `CALSCALE:GREGORIAN`, `METHOD:PUBLISH`, `BEGIN:VEVENT`, `UID:<id>@smartappointments`, `DTSTAMP`, `DTSTART`, `DTEND`, `SUMMARY`, `LOCATION`, `DESCRIPTION`, `STATUS:CONFIRMED`, `END:VEVENT`, `END:VCALENDAR`. The generator imports nothing from Angular (a pure module in `features/customer/shared/ics/`); `calendar-button.component.ts` loads it with `import('...')` on first click, so it is its own lazy chunk and F4 gets the same chunk. The calendar button's accessible name is "Add to calendar" with a hidden "download .ics file" suffix.

### Confetti (Req 9.2, 9.3)

`ConfettiComponent` renders `<canvas aria-hidden="true" class="pointer-events-none fixed inset-0 h-full w-full">`. On `afterNextRender`: size the canvas to the viewport (device pixel ratio capped at 2), create 60 particles (position near the check icon, random velocity, gravity, rotation, five colours read from theme CSS variables), and step them with `requestAnimationFrame` using elapsed time; the loop stops and the canvas is removed at 2000 ms or on destroy (`DestroyRef`), and also if `document.hidden`. It adds no listeners other than `visibilitychange`, takes no focus (`tabindex` absent), and is only instantiated by the `@defer` block when `window.matchMedia('(prefers-reduced-motion: reduce)')` is false (evaluated through the F1 `ViewportService`/`matchMedia` signal so a test can flip it). No library: the whole component is about 60 lines (about 1 kB gzip); `canvas-confetti` would add a dependency and a worker/global it creates itself, and its `disableForReducedMotion` option would still have to be tested by us.

## State and data model

| State                                                              | Where                                                  | Lifetime                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------ | ---------------------------------------- |
| Selections `branch`, `service`, `date`, `slot`, `done`             | URL query params                                       | navigation history                       |
| `selectedSlotId`, `notice`, `searchText`, `booking`, `initialised` | `BookingWizardStore` (route providers)                 | the wizard visit                         |
| Branches and services                                              | `ReferenceDataStore` (root)                            | the signed-in session; cleared on logout |
| Slot lists                                                         | `SlotCache` inside `SlotSearchService`                 | the wizard visit, 60 s freshness         |
| Request budget                                                     | `SlidingWindowBudget` inside `SlotSearchService`       | the wizard visit (one tab)               |
| Idempotency key                                                    | `sessionStorage` `sa.idem.<slotId>` plus memory mirror | until success, slot change or `422`      |
| "Just booked" marker                                               | `sessionStorage` `sa.book.justBooked` (timestamp)      | 10 minutes, consumed once                |

View models: `Booked = { appointment: AppointmentResponse; branch: Branch; service: Service; slot: Slot }` (captured at success so the screen and the `.ics` do not depend on the lists still being loaded); `StripDay`, `SlotGroup = { part: DayPart; heading: string; slots: Slot[] }`.

Nothing is written to `localStorage`; the wizard stores no personal data.

## Error handling

| Condition                                                                                                                                                                                                           | `AppError`                            | UI result                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branches or services: empty list                                                                                                                                                                                    | n/a                                   | empty-state text (Req 2.7, 3.1)                                                                                                                               |
| Branches, services or slots: `unavailable`, `network`, `timeout`                                                                                                                                                    | `unavailable` / `network` / `timeout` | F1 banner (interceptor); inline error with "Try again"; auto reload on `OutageState.recovered`                                                                |
| Branches or services: other error                                                                                                                                                                                   | `http`                                | message inline; `ToastService.showError` once                                                                                                                 |
| Slots: `404`                                                                                                                                                                                                        | 404                                   | `ReferenceDataStore.refresh()`, repair URL to the earliest valid step, `showInfo` once (Req 5.6)                                                              |
| Slots: `429`                                                                                                                                                                                                        | 429 `rate-limited`                    | `RateLimitNotice`; no auto retry; "Try again" after the countdown (Req 5.4)                                                                                   |
| Slots: client budget exhausted                                                                                                                                                                                      | n/a                                   | the same notice, request not sent (Req 5.5)                                                                                                                   |
| Confirm: `201` or replayed `201`                                                                                                                                                                                    | n/a                                   | Success view (Req 9)                                                                                                                                          |
| Confirm: `409` overlap (`You already have an appointment at that time.`)                                                                                                                                            | 409 `http`                            | inline alert, link to `/appointments`, "Choose another time" (Req 8.3)                                                                                        |
| Confirm: `409` `A request with this Idempotency-Key is still being processed.`                                                                                                                                      | 409                                   | "Your booking is still being processed.", one auto retry after 2 s, then "Check again", same key (Req 8.4)                                                    |
| Confirm: `409` `Slot is full.`, `Slot has already started.`, `Branch '..' is inactive.`, `Service type '..' is inactive.`, `Branch '..' has no working hours.`, `The slot cannot be reserved.`, or any unknown text | 409                                   | refresh slots, back to step 3 without `slot`, key cleared, `showInfo("That time is no longer available. Please choose another.")`                             |
| Confirm: `404` `Slot not found.`                                                                                                                                                                                    | 404                                   | same as the line above                                                                                                                                        |
| Confirm: `422` `This Idempotency-Key was already used with a different request.`                                                                                                                                    | 422                                   | rotate key, message "Something went wrong with that request. Please confirm again.", Confirm enabled                                                          |
| Confirm: `502`, `503` (`The availability service is unavailable. Try again later.`), `504`, network, timeout                                                                                                        | `unavailable` / `network` / `timeout` | F1 banner; "We could not confirm your booking. It may or may not have gone through. Try again; you will not be booked twice."; same key; user-initiated retry |
| Confirm: `429`                                                                                                                                                                                                      | 429 `rate-limited`                    | `RateLimitNotice` replacing Confirm; same key (Req 8.8)                                                                                                       |
| Confirm: `401`                                                                                                                                                                                                      | `unauthorized`                        | F1 session end; `returnUrl` is the wizard URL (includes `slot`); a key for that slot persists in `sessionStorage`, so it is reused on return (Req 8.9)        |
| Confirm: `403`, `400`                                                                                                                                                                                               | `http`                                | message inline; `showError` once                                                                                                                              |
| `.ics` creation fails                                                                                                                                                                                               | n/a                                   | `showError("We could not create the calendar file.")` once                                                                                                    |
| `sessionStorage` blocked                                                                                                                                                                                            | n/a                                   | memory mirror; no message (Req 7.2)                                                                                                                           |

## Accessibility summary (Req 1.2, 1.5, 6, 12)

- Step indicator `<ol>` with `aria-current="step"`; on narrow screens the "Step N of 4" paragraph keeps the same semantics.
- One `RovingRadioGroupDirective` for branch, service, date and slot groups; one tab stop each; arrows select; visible labels; disabled branch cards are `aria-disabled` and focusable.
- Focus: step `<h2>` receives focus on step changes (not on first load); the sticky action bar uses `scroll-padding-bottom` on `html` so a focused item is not hidden (WCAG 2.4.11).
- Live regions: one polite `role="status"` per concern (notice, result count, booking announcement), written once per change; errors `role="alert"`; countdown only through `RateLimitNotice`.
- Never colour alone: badges carry text and icon; the capacity hint is text; selected state is `aria-checked` plus a check icon.
- Motion: slide, check, shimmer and confetti all behind `@media (prefers-reduced-motion: no-preference)`; the confetti is not even instantiated under reduce.
- Touch targets: chips and cards at least 44 by 44 on narrow screens.

## Chunk budget (Req 13.5)

No forms library, no new runtime dependency. Estimate, gzip: `BookPage`, store, search, steps and cards about 22 kB; `RovingRadioGroupDirective` and helm `skeleton`/`badge` about 3 kB; `lucide` icons (about 10) about 4 kB; `date-strip`, params, conflict map, outcome mapping, budget and cache about 5 kB; `ReferenceDataStore` about 1 kB. Wizard group about 35 kB against the **60 kB** budget. `confetti` (about 1 kB) and `ics` (about 2 kB) are separate lazy chunks outside the group count and are reported separately. `pnpm size --group book` sums `features/customer/book/**` entry chunks plus non-initial chunks they statically import (the shared chunk counted once) and exits 1 above `MAX_GZIP_KB_BOOK` (default 60); the measured figure is recorded here at implementation. The initial bundle is unaffected: `app.routes.ts` reaches the wizard only through `import()`.

## Testing strategy

Vitest plus Angular Testing Library (queries by role and name), Vitest fake timers (no `fakeAsync`, F1's `toFake` list), MSW with `onUnhandledRequest: 'error'`, and a process time zone different from every zone under test (F1 Req 13.5 pattern). The stateful MSW model is `createBookingBackend()` in `src/testing/booking-backend.ts`:

```ts
interface BookingBackendState {
  branches: Branch[]; // Auckland, London, New York, and one with no schedule
  services: Service[];
  slots: Map<string, Slot & { startAt: number }>; // generated relative to a fixed clock, capacity decremented on booking
  appointments: Appointment[]; // per customer, for the overlap rule
  idempotency: Map<string, { bodyHash: string; status: number; body: unknown } | 'in-progress'>;
  counters: { branches: number; services: number; search: number; create: number };
  flags: {
    searchRateLimitAfter: number | null;
    createRateLimited: boolean;
    unavailableNext: number;
    dropResponseAfterBookingNext: boolean;
    inProgressNext: boolean;
  };
}
```

Rules: `Idempotency-Key` missing gives `400 The Idempotency-Key header is required.`; same key and body replays the first status and body; same key with another body gives `422` with the verbatim text; overlap gives `409 You already have an appointment at that time.`; full, started and inactive slots give the verbatim `409` strings of Req 8.2; unknown slot gives `404 Slot not found.`; `unavailableNext` gives `503` with the verbatim text; `dropResponseAfterBookingNext` records the booking and then returns `HttpResponse.error()`; search `404` for an unknown or inactive branch or service, `[]` for no schedule, and `429` with `Retry-After: 60` after `searchRateLimitAfter` calls. Every response echoes `X-Correlation-ID` and errors are `{status, detail}` `application/problem+json`.

| Requirement      | Test                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1.1 to 1.4       | `wizard-params.spec.ts` (table: parse, repair cascade, every drop rule, `done` without booking); `book.page.spec.ts` (step from URL, Back/forward with the Angular `Location` testing harness, notice text); `steps.spec.ts` (title)                                                                                                                                                                                                                               |
| 1.5, 12.2        | `book.page.spec.ts` (focus on the new `<h2>`, none on first render), `step-heading.directive.spec.ts`                                                                                                                                                                                                                                                                                                                                                              |
| 1.6, 7.2         | `idempotency-key.store.spec.ts` (create once, reuse, UUID validation of a tampered value, blocked storage via a throwing stub, prune, no `localStorage` write); wizard store spec asserts `localStorage`/`sessionStorage` writes are only `sa.idem.*` and `sa.book.justBooked`                                                                                                                                                                                     |
| 1.7, 12.6        | `step-indicator.spec.ts` with a stubbed `matchMedia` (`ViewportService`)                                                                                                                                                                                                                                                                                                                                                                                           |
| 2.1 to 2.7       | `branch-step.spec.ts` (loading skeleton, search with fake timers, no API call on search, disabled card not selectable by click/Enter/Space but focusable, empty and error states); `reference-data.store.spec.ts` (one request per session, concurrent first read sends one, cleared on logout, refresh)                                                                                                                                                           |
| 2.8, 2.4, 2.5    | F1's time-helper specs cover (zones Auckland, London, New York under another process zone, open at `opensAt` and closed at `closesAt`, closed today, invalid zone fallback and one warning)                                                                                                                                                                                                                                                                        |
| 3.1 to 3.4       | `service-step.spec.ts`; `duration.spec.ts` (15, 30, 45, 60, 90, 120, 135)                                                                                                                                                                                                                                                                                                                                                                                          |
| 4.1 to 4.7       | `date-strip.spec.ts` (14 days, roving radio keys, Today text); `date-strip.spec.ts` (`dayStrip` and request `date` equal the branch-zone date under a zone ahead of and behind, at a fixed "now" near midnight; month rollover; DST day; day rollover while open)                                                                                                                                                                                                  |
| 5.1 to 5.8       | `slot-search.service.spec.ts` with fake timers: debounce 250 ms, a superseded request aborted, fresh cache hit sends none, stale-while-revalidate replaces only on change, 26 rapid distinct dates send at most 25 (`request-budget.spec.ts` covers the window maths), 429 gives the countdown and no auto retry, 404 refreshes reference data, outage then `recovered` re-issues, normalisation drops foreign and zero-capacity slots and sorts                   |
| 6.1 to 6.9       | `day-parts.spec.ts` (11:59, 12:00, 16:59, 17:00, 00:00, 23:59), `slot-groups.spec.ts` (headings, empty group omitted, accessible name, hint thresholds 1, 3, 4, radio keyboard across groups, selection clears on date change, empty state with next-day button and its absence on the last day); `slots-status.spec.ts`                                                                                                                                           |
| 7.1, 7.5, 7.6    | `review-step.spec.ts` (zone label only when the zone differs, exact body and header with MSW, double click, Enter plus click and `dblclick` send one request, Confirm disabled while in flight)                                                                                                                                                                                                                                                                    |
| 7.2 to 7.4       | `idempotency-key.store.spec.ts` (slot change removes the old key, same slot reload keeps it, `getRandomValues` fallback, no secure random disables Confirm)                                                                                                                                                                                                                                                                                                        |
| 7.7              | `confirm.machine.spec.ts`: destroying the component mid-flight does not abort; returning shows Confirm disabled                                                                                                                                                                                                                                                                                                                                                    |
| 8.1 to 8.11      | `conflict-map.spec.ts` (one test per verbatim string, case and whitespace variants, the three patterns with real codes, unknown text); `confirm-outcome.spec.ts` (status-by-status table); `confirm.machine.spec.ts` (every transition row: key kept or rotated or cleared, destination, toast calls, one auto retry after 2 s then manual only, 429 countdown); the replay scenario with `dropResponseAfterBookingNext` (same key sent twice, one success screen) |
| 9.1 to 9.9       | `success-step.spec.ts` (heading focus, one announcement, summary, reference and Copy with clipboard blocked, confetti absent under reduced motion via `matchMedia` stub, `done=1` replace so Back lands on step 3 without `slot`, key removed, cache invalidated, reload with `done` and no booking drops it); `just-booked.marker.spec.ts`                                                                                                                        |
| 10.1 to 10.7     | `build-ics.spec.ts`: exact `DTSTART`/`DTEND`, CRLF, folding at 75 octets with ASCII and "Zürich", escaping of `,` `;` `\` and a name with a newline, control-character stripping, UID, parse-back of the property set; `ics-download.spec.ts` (object URL revoked, failure toasts once and does not throw); `icsFileName` cases                                                                                                                                    |
| 11.1 to 11.5     | `book.page.spec.ts` (skeletons, outage `recovered` reload, no slot or booking call before `authenticated`); `reference-data.store.spec.ts`                                                                                                                                                                                                                                                                                                                         |
| 12.1, 12.3, 12.4 | `roving-radio-group.spec.ts` (one tab stop, arrows, Home/End, disabled item); component tests above assert text alternatives; `book.a11y.spec.ts` (axe, five steps, light and dark)                                                                                                                                                                                                                                                                                |
| 13.1, 13.3       | handler spec for the model itself; `booking-invariant.spec.ts`: a seeded pseudo-random action sequence (confirm, retry, drop response, 503, reload of Review, double activation) against `createBookingBackend()` asserts at most one appointment for the slot and exactly one success view                                                                                                                                                                        |
| 13.4             | `e2e/book.spec.ts` (Playwright, `page.route`): the keyboard-only booking with the downloaded `.ics`, the deep link to Review, a stale `slot`, a `409` overlap, `503` then same-key retry (request headers recorded), and `429`                                                                                                                                                                                                                                     |
| 13.5             | CI `pnpm size --group book`                                                                                                                                                                                                                                                                                                                                                                                                                                        |

`src/testing/render-with-session.ts` (F1) seeds an authenticated Customer; a `renderBook({ url, backend })` helper builds the route with `provideRouter(bookRoutes)`, the MSW handlers and a `ManualClock` at a fixed instant.

## Traceability

| Requirement                                       | Design sections                                                                                                 |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1 Wizard structure and URL state                  | Overview 1, 2, 10; Routes; `steps.ts`; `wizard-params.ts`; `BookingWizardStore`; `StepIndicator`; Accessibility |
| 2 Branch step                                     | F1 `core/time/` helpers; `ReferenceDataStore`; `BranchStep`                                                     |
| 3 Service step                                    | `duration.ts`; `ServiceStep`; `ReferenceDataStore`                                                              |
| 4 Date strip                                      | `date-strip.ts`; F1 `core/time/` (`todayInZone`, `addDays`); `DateStrip`                                        |
| 5 Slot search and caching                         | `SlotSearchService`; `slot-cache.ts`; `request-budget.ts`; API calls                                            |
| 6 Slot chips                                      | `day-parts.ts`; `SlotGroups`; `RovingRadioGroupDirective`                                                       |
| 7 Review and idempotency key                      | `ReviewStep`; `IdempotencyKeyStore`; Confirm state machine                                                      |
| 8 Outcome handling                                | `conflict-map.ts`; `confirm-outcome.ts`; Confirm state machine; Error handling table                            |
| 9 Success                                         | `SuccessStep`; Confetti; `just-booked.marker.ts`; `done=1` replace                                              |
| 10 `.ics`                                         | `buildIcs`                                                                                                      |
| 11 Loading, empty, error, session; reference data | `ReferenceDataStore`; `SlotsStatus`; Error handling                                                             |
| 12 Accessibility and responsive layout            | Accessibility summary; `RovingRadioGroupDirective`; `StepIndicator`                                             |
| 13 Tests and delivery                             | Testing strategy; Chunk budget                                                                                  |

## Open questions: resolved

Resolved by the user after design approval; the design above already reflects them.

1. **Requirement amendments accepted.** 1.3, 6.4, 9.6 and 9.7: only "Continue to review" writes `slot`; success is `?...&done=1` via `replaceUrl`; the "just booked" marker is `sessionStorage` `sa.book.justBooked`.
2. **Titles.** F1's `TitleStrategy` accepts function titles (F1 amended), so the route `title` function with `runGuardsAndResolvers: 'paramsOrQueryParamsChange'` stands.
3. **Session storage.** F1's `safe-storage` is generalised to `sessionStorage`; `IdempotencyKeyStore` and the marker use it and F3's local wrapper is dropped.
4. **Phone on cards.** Plain text on branch cards, a `tel:` link on Review and Success; Req 2.2 amended accordingly.
5. **Branch-zone helpers move to F1's `core/time/`** (F1 owns `todayInZone`, today's-hours and open-now helpers, `localToUtc`); `branch-time.ts` is removed from F3, which keeps only `dayStrip`.
6. **`CLOCK.now()` is epoch milliseconds.** Verified against the F1 design: `interface Clock { now(): number; setTimer(fn, ms): () => void }`.
7. **`gen:api` checks stay** as F1 specifies.
8. **Open at implementation:** the generated types' `AppointmentResponse.status` JSON form and `workingHours[].dayOfWeek` form (string name or number), verified at the first `pnpm gen:api`; F1's final helper names are matched to the list in "Branch-zone calendar maths".

## Implementation deviations

Recorded while building the parts that depend only on F0 and the F1 tasks 1 to 5.

- **Response types are temporary.** The generated Availability and Booking documents declare no response bodies, so `BranchResponse`, `ServiceTypeResponse`, `SlotResponse`, `AppointmentResponse` (enums as strings, `dayOfWeek` as a day name) and `SlotSearchParams` live in `core/api/models.ts` until the backend documents them. `pnpm gen:api` was not run (no gateway is started on this branch).
- **MSW files are flat.** The model is `src/testing/booking-backend.ts` with `availability.handlers.ts`, `booking.handlers.ts` and `reply.ts` beside it (F1 has `src/testing/handlers.ts` as a file, not a folder). Handlers take the model and the base URL. The model stores every completed create outcome (201, 404, 409) under its key; `503`, `429` and "in progress" are not stored.
- **`date-strip.ts` re-exports `dayStrip` from `core/time`.** F1 already ships `dayStrip` and `DayStripItem`; F3 holds no copy. The "branch zone ahead of the process zone" test case is not possible because the test process zone is UTC+14; the cases are branch zones behind it at a fixed "now" near midnight.
- **`hasSchedule` and `toSchedule` live in `features/customer/shared/branch-schedule.ts`** (used by the params repair, the reference store and later the branch step), because the generated-style branch type has an optional zone and hours while `core/time` takes a required `BranchSchedule`.
- **`IdempotencyKeyStore` has no own memory mirror.** `sessionSafe` from `core/util/safe-storage.ts` already falls back to memory, so the store uses it through an `IDEMPOTENCY_STORAGE` token (default `sessionSafe`) that tests replace. `just-booked.marker.ts` is two functions taking the storage and `now`, not a class.
- **`ReferenceDataStore` does not yet watch `SessionStore`.** It exposes `clear()`; the effect that calls it when the status leaves `authenticated` is added with F1's `SessionStore`. `ensureBranches()` and `ensureServices()` also retry from the `error` state. `error` is a computed of the two per-list errors.
- **`SlotSearchService` reports `retryAfterSeconds` in its state** (`rate-limited`, with `source` `server` or `budget`) instead of owning a `RetryCountdown`, adds a `not-found` state for `404`, and every `load()` first cancels the pending request and timer. It does not call `ToastService`. A failed background refresh keeps the stale chips.
- **`downloadIcs` returns a boolean** instead of calling `ToastService.showError`; the caller toasts.
- **Step indicator** takes the step as an input and emits `goTo`; "reachable" means every step before the current one. It uses `ViewportService.isSm` (640 px).
- **`pnpm exec ng g @spartan-ng/cli:ui skeleton|badge`** output is committed unmodified apart from Prettier; only the two path aliases the CLI adds were touched in `tsconfig.json`.
- **Confirm flow** (`confirm.machine.ts`): the in-flight guard is a local synchronous field plus a `confirming` flag in `BookingWizardStore`, so a Review component created while a request is running starts disabled (Req 7.7); the result of a request started by a destroyed component updates the store (`booking`, URL) but not the new component's local state. `showBooked` builds the `done=1` URL from the booked branch, service and slot date, not from the URL at response time. On `slot-gone` the day's cache entry is invalidated (instead of a forced load that step 3's own load would cancel) and step 3 then searches. The auto retry uses `CLOCK.setTimer`. The slot-selection effect compares with the last list seen for the key, so a forced refresh that shows a skeleton in between still clears a removed selection.
- **Success step**: the "Your appointment is saved" hint is shown by `BookPage` from a `savedHint` flag in the store, set when step 1 or 3 consumes the marker. The confetti is guarded with `@if (!prefersReducedMotion())` around `@defer (on idle)`, because `when` and `on` triggers combine with OR. `ViewportService` gained `prefersReducedMotion`.
- **Test timeout**: `src/testing/setup.ts` sets `testTimeout` to 15 s and the Testing Library `asyncUtilTimeout` to 5 s; the first render of the lazy `/book` route in each spec file timed out at 5 s when the whole suite ran in parallel.
- **Accessibility checks**: `@axe-core/playwright` was added as a dev dependency for `e2e/book.a11y.spec.ts`. The 320 px reflow check found the customer shell header overflowing by 84 px (the account button showed the display name); `UserMenu` now shows the name from 640 px only (the button keeps its `Account menu` label). Shared e2e helpers are in `e2e/book-helpers.ts` and the booking mock in `e2e/book-backend.ts`, which reuse the unit-test model `src/testing/booking-backend.ts`.
