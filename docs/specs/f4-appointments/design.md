# F4 My appointments and Profile — Design

## Overview

F4 adds two lazy feature areas inside the F1 customer shell: `features/customer/appointments/` (list, detail, cancel) and `features/customer/profile/`. Almost everything underneath is reused: `ApiClient`/`BookingApiService` (F1), `AppError` and `ToastService` (F1), `OutageState.recovered` (F1), `SessionStore` (F1), the time utilities (F1), F3's reference-data lookup and `buildIcs`, the F0 `ThemeService`, and the MSW server.

The non-obvious parts:

- **One store, one URL.** A route-scoped `AppointmentsStore` (`@ngrx/signals`) owns the list of the active tab, paging, de-duplication, the quiet refresh and the cancel state machine. The tab and the "Show cancelled" switch live in the URL (`?tab=&cancelled=`); the store never keeps them as a second source of truth, it reacts to them (Req 1.2, 1.4).
- **The detail is a child route of the list.** `/appointments/:id` is declared as a _child_ of `/appointments`, so the list stays mounted behind it. One `AppointmentDetail` component renders either inside a helm `sheet` (viewport >= 1024 px and entered from the list) or as a page (below 1024 px, or a direct open). Switching presentation is a template switch on the same component instance, so loaded data and an open cancel dialog survive a resize (Req 5.1, 5.7).
- **The server is authoritative after every cancel.** The optimistic "Cancelling..." state is a view of the store's `cancelling` flag; every terminal outcome re-reads the appointment (`204`, `503`, network error) before the UI claims anything (Req 6.4, 6.7, 6.8).
- **Dates are branch-zone dates.** Grouping, labels and the sheet all go through one pure `toViewModel(appointment, lookup, now)` function, which uses only `parseUtc`, `formatInZone` and `zoneDiffersFromBrowser` (Req 3, 4).
- **No new HTTP plumbing and no new global state.** F4 adds two methods to the F1 `BookingApiService` shell and nothing to `core/`.

## Architecture

Dependency direction as in F0: `features -> shared, core`. Customer-area code shared by F3 and F4 sits in `features/customer/shared/` (F3's lookup and `buildIcs`; the exact paths are fixed by the F3 design, see Open questions 1).

| Area                                      | Contents                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/core/api/`                       | `booking-api.service.ts` gains `listMyAppointments(params)`, `getAppointment(id)`, `cancelAppointment(id)`; `models.ts` gains no extension (the types come from `booking.d.ts` once `pnpm gen:api` is rerun with the `/my` endpoint; until then a temporary `MyAppointmentsPage` type with a comment, Req 1.6 of F1). `auth-api.service.ts` is unchanged (`me`).                                                                       |
| `src/app/core/` (other)                   | unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/app/shared/ui/`                      | helm `tabs` is NOT added (the tab list is hand-written for URL control, see below); new CLI-generated helm: `alert-dialog`, `skeleton`, `switch`, `badge`, `radio-group` (sheet already added by F1).                                                                                                                                                                                                                                  |
| `src/app/features/customer/shared/`       | F3's `reference-data.store.ts` (branches and services, `branchById`, `serviceById`, `reload()`), F3's `ics/build-ics.ts` and `download-ics.ts`. Reused, not edited by F4 except for the additions noted in Components.                                                                                                                                                                                                                 |
| `src/app/features/customer/appointments/` | `appointments.routes.ts`, `appointments-page.ts` (+ `.html`), `appointments.store.ts`, `appointment.model.ts`, `appointment-view.ts` (`toViewModel`, `groupByDate`), `appointment-card.ts`, `appointment-timeline.ts`, `appointment-tabs.ts`, `status-badge.ts`, `appointment-detail.ts` (+ `.html`), `appointment-detail.store.ts`, `cancel-dialog.ts`, `empty-state.ts`, `appointments-skeleton.ts`, `load-more.ts`, `tab-params.ts` |
| `src/app/features/customer/profile/`      | `profile.routes.ts`, `profile-page.ts` (+ `.html`), `theme-picker.ts`                                                                                                                                                                                                                                                                                                                                                                  |
| `src/testing/`                            | `handlers/appointments.handlers.ts`, `appointments-backend.ts` (stateful model), `make-appointment.ts`                                                                                                                                                                                                                                                                                                                                 |
| `e2e/`                                    | `appointments.spec.ts`, `profile.spec.ts`, `a11y-appointments.spec.ts`                                                                                                                                                                                                                                                                                                                                                                 |
| CI                                        | `size-limit` entries for the two lazy chunks (Req 11.4)                                                                                                                                                                                                                                                                                                                                                                                |

## Components and interfaces

### Routes

Replace the F1 placeholders in `features/customer/customer.routes.ts`:

| Path                | Component                                                       | Guard                                          | Notes                                                                                                                                                                                                                                                                                                                 |
| ------------------- | --------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/appointments`     | `AppointmentsPage` (provides `AppointmentsStore`, route-scoped) | inherited `authGuard`, `roleGuard('Customer')` | title `My appointments`; `runGuardsAndResolvers: 'pathParamsOrQueryParamsChange'` NOT used, the store reacts to `queryParamMap` itself                                                                                                                                                                                |
| `/appointments/:id` | `AppointmentDetail`                                             | inherited                                      | declared as `children: [{ path: ':id', component: AppointmentDetail, canMatch: [guidIdMatcher] , title: 'Appointment' }]` of the `/appointments` route; the page renders a `<router-outlet />` after the list; non-GUID ids are matched by a second child `{ path: ':id', component: AppointmentNotFound }` (Req 5.3) |
| `/profile`          | `ProfilePage`                                                   | inherited                                      | title `Profile`                                                                                                                                                                                                                                                                                                       |

`AppointmentsPage` hides the list behind the detail only in the _page_ presentation: below 1024 px, or when the route was entered without `history.state.fromList` (a deep link), the page template renders `<router-outlet />` **instead of** the list when a child is active (`route.firstChild` non-null) and the detail renders its own "Back to my appointments" link. At >= 1024 px with `fromList`, the list stays and the child renders in the sheet. The decision is one computed: `presentation = computed(() => !hasChild() ? 'none' : isLg() && fromList() ? 'sheet' : 'page')`, using F1's `ViewportService.isLg()` and the router navigation state (`fromList` is set by the card link: `[state]="{ fromList: true }"`). Closing the sheet navigates to `/appointments` with `queryParamsHandling: 'preserve'`. A resize across 1024 px flips `presentation` without re-creating `AppointmentDetail` (the component is projected through `ng-template` + `NgTemplateOutlet` into either the sheet or the page container, Req 5.7).

`guidIdMatcher` is a `CanMatchFn` that tests `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`, so a non-GUID `:id` falls to `AppointmentNotFound` with no request (Req 5.3).

### API calls

Added to `BookingApiService` (typed from `booking.d.ts`, URL from the generated `paths` key, F1 Req 1.3 and 1.4):

```ts
listMyAppointments(q: { status?: 'Booked'; when: 'upcoming' | 'past'; page: number; pageSize: number }): Promise<MyAppointmentsPage>
getAppointment(id: string): Promise<AppointmentResponse>
cancelAppointment(id: string): Promise<void>   // POST .../cancel, no body, no Idempotency-Key
```

Each returns a promise built from `firstValueFrom` of the F1 `ApiClient` observable and takes an optional `AbortSignal` (`{ signal }`) so a tab switch cancels the in-flight list request (Req 1.3). The list method builds the query string from the typed object only (no `customerId`, no free-form keys, Req 1.5), and omits `status` when undefined.

The reference data (`GET /api/branches`, `GET /api/services`) is loaded through F3's `ReferenceDataStore`; F4 calls `ensureLoaded()` on entering the page and `reload()` on `OutageState.recovered` or "Try again" (Req 4.1, 4.2). `GET /api/auth/me` is called only by the F1 `SessionStore` (`session.reloadProfile()`, an existing F1 method per F1 Req 6.7; if absent in F1's final design, F4 asks for it, Open questions 2).

### Components, stores and services

**`tab-params.ts`** (pure): `parseTab(raw): { tab: 'upcoming'|'past'; showCancelled: boolean }` (unknown tab falls back to `upcoming`; `cancelled=1` is honoured only on `upcoming`) and `toListQuery(tab, showCancelled, page, pageSize)` returning exactly the parameters of Req 1.4. Table-driven tests.

**`AppointmentsStore`** (`signalStore`, provided on the page, not root) state:

```ts
interface ListState {
  filter: { tab: 'upcoming' | 'past'; showCancelled: boolean };
  items: AppointmentResponse[]; // de-duplicated, server order
  page: number; // last page loaded
  totalCount: number | null;
  status:
    'idle' | 'loading-first' | 'ready' | 'loading-more' | 'refreshing' | 'error' | 'more-error';
  error: AppError | null;
  cancelling: Record<string, 'pending'>; // id -> pending flag (view of the cancel machine)
  notRefreshed: Record<string, true>; // Req 6.4 (re-GET failed after a 204)
}
```

Computed: `hasMore = items.length < totalCount`, `isEmpty = status==='ready' && items.length===0`.

Methods:

- `setFilter(filter)`: if equal to the current filter, no-op; else abort the in-flight request (`AbortController`), reset `items`/`page`/`totalCount`, set `loading-first` and call `loadFirst()` (Req 1.3). A response is applied only if its `requestId` equals the latest (guards a late response, Req 1.3).
- `loadFirst()`: `listMyAppointments(toListQuery(..., 1, 20))`; on success `items = dedupe(items)`, `status = ready`; on failure `status = error` (Req 2.4, 2.7: a response without an `items` array is converted to an `AppError` of kind `http` by a runtime guard).
- `loadMore()`: ignored unless `status === 'ready'` and `hasMore` (this is the double-activation guard, Req 2.2); sets `loading-more`, requests `page + 1`, appends with `dedupeById` (a `Map` keyed by `id`, first occurrence wins, order kept, Req 2.3), increments `page` only on success; on failure `status = 'more-error'` with the list intact and `retryMore()` repeating the same page (Req 2.4). Emits a single announcement "Loaded N more appointments" through an `announce` signal (Req 10.4).
- `quietRefresh()`: if `items.length === 0` do `loadFirst()`; else one request `page=1, pageSize=min(100, items.length)` (restart at page 1 with `pageSize 20` if more than 100 were loaded), replace `items`, recompute `page = ceil(items/20)` for further paging, with `status='refreshing'` (no skeleton, scroll untouched, Req 2.6). A failure keeps the list and is silent unless the outage banner already speaks (the next user action retries).
- `applyCancelled(updated)`: replaces the item by id; if the active filter is `upcoming` without `showCancelled`, removes it after the quiet refresh confirms (Req 6.5).

An `effect` (inside the store's `withHooks`) watches `OutageState.recovered()` (skipping its initial value) and calls `quietRefresh()` and the lookup's `reload()` (Req 2.6, 4.2). `AppointmentsPage` binds the router's `queryParamMap` to `store.setFilter(parseTab(...))` with `toSignal`/`effect`.

**View models (`appointment-view.ts`, pure, no Angular):**

```ts
interface AppointmentView {
  id: string; serviceName: string; branchName: string;
  status: 'Booked' | 'Cancelled' | string;
  zone: string | null;           // IANA id used, null => browser zone
  zoneKnown: boolean;
  dateKey: string;               // yyyy-MM-dd in `zone ?? browser`, for grouping
  dateLabel: string;             // "Sunday 4 October 2026"
  timeRange: string;             // "15:00 to 15:30"
  zoneLabel: string | null;      // "BST" / "your time" / null (Req 3.2, 4.3)
  browserLine: string | null;    // "14:00 your time" only when zones differ
  isPast: boolean;               // from the tab, not the clock (Req 3.5)
  canCancel: boolean;            // Booked && start > now (Req 6.1)
  canAddToCalendar: boolean;     // same rule (Req 7.1)
  a11yName: string;
}
toViewModel(a: AppointmentResponse, ctx: { branch?: Branch; service?: ServiceType; tab: 'upcoming'|'past'; now: Date }): AppointmentView
groupByDate(views: AppointmentView[]): { dateKey; dateLabel; items: AppointmentView[] }[]  // adjacent grouping, never re-sorts (Req 3.1)
```

Rules: zone = `branch?.timeZoneId` if `Intl.DateTimeFormat` accepts it, else browser zone with `zoneLabel = 'your time'` (Req 4.3, 4.4); the missing branch/service names become "Unavailable branch"/"Unavailable service" (Req 4.4); `zoneLabel` is the short zone name only when `zoneDiffersFromBrowser(zone, start)` is true. `groupByDate` starts a new group when `dateKey` changes versus the previous item, so the server order is preserved even if two distant days repeat. "now" comes from F1's `CLOCK` token (`core/util/clock.ts`), so tests control it.

**Components (all standalone, `ChangeDetectionStrategy.OnPush`, signals):**

- `AppointmentTabs`: `role="tablist"` with two `role="tab"` buttons (roving `tabindex`, Left/Right/Home/End handler), emitting the selected tab; the "Show cancelled" helm `switch` (`aria-describedby` hint) only on `upcoming`. It writes the URL with `router.navigate([], { queryParams: { tab, cancelled }, queryParamsHandling: 'merge', replaceUrl: true })` (Req 1.2, 1.4).
- `AppointmentTimeline`: `@for (group of groups(); track group.dateKey)` rendering `<h2>` date heading then `<ul>` of `AppointmentCard` (`<li>`), with `h3`-free cards so the outline stays valid (Req 10.2); a polite `role="status"` for "N appointments" below the tabs (Req 1.6).
- `AppointmentCard`: one `<a [routerLink]="['/appointments', id]" [state]="{fromList:true}" [attr.aria-label]="view.a11yName">` containing service, branch, time range, `StatusBadge`, optional zone/browser lines; `min-h-11`; the focus ring token from F0; a past card uses `text-muted-foreground` and the hidden `(past)` text (Req 3.3, 3.4, 3.6).
- `StatusBadge`: helm `badge`; text plus icon (lucide `calendar-check`, `ban`, `loader-circle` animated unless reduced motion) so meaning is never colour-only; `"Cancelling..."` variant; an unknown status renders neutral with its own text (Req 3.4, 6.3).
- `AppointmentsSkeleton`: three `hlm-skeleton` cards with the same height as a real card, `aria-hidden`, parent `aria-busy` (Req 2.1); the pulse is `motion-safe:animate-pulse` (Req 10.6).
- `LoadMore`: a `<button hlmBtn variant="outline">` with `aria-busy`; disabled while `loading-more`.
- `EmptyState`: inline SVG (`aria-hidden`), heading, sentence and `<a hlmBtn routerLink="/book">`; text varies by tab (Req 8.1, 8.2).
- `InlineError`: reuses the shared `alert` helm with `role="alert"` and a "Try again" button; used for first-load, more-load and lookup errors (Req 2.4, 4.2).

**`AppointmentDetail`** with `AppointmentDetailStore` (`signalStore`, provided on the component):

```ts
type CancelPhase =
  | { kind: 'idle' }
  | { kind: 'confirming' }
  | { kind: 'cancelling' } // optimistic
  | { kind: 'cancelled'; refreshed: boolean } // 204, or 503/network resolved by a re-GET
  | { kind: 'too-late' } // 409
  | { kind: 'retryable' } // 503/5xx and the re-GET says Booked
  | { kind: 'rate-limited' } // 429
  | { kind: 'failed'; error: AppError }; // 403 and others
interface DetailState {
  appointment: AppointmentResponse | null;
  load: 'loading' | 'ready' | 'not-found' | 'error';
  error: AppError | null;
  phase: CancelPhase;
}
```

Initial data: if the list store holds the item (`AppointmentsStore.byId(id)`), the detail starts `ready` from it and re-GETs in the background (Req 5.2); otherwise `loading` with a skeleton. `404` gives `not-found` (no distinction, Req 5.3). It also shows a "Booked on"/"Cancelled on" using `formatInZone` in the _browser_ zone (these are account events, not branch times; zone labelled by the browser's short zone name).

The detail template shows the fields of Req 5.4 only (view model + booking reference with the F1 clipboard helper, which already has the "stays selectable" fallback, Req 5.4, 5.5), the cancel region, and "Add to calendar" (`<button>` calling F3's `downloadIcs(buildIcs(input, clock.now()))`, the missing-name rule of Req 7.2 handled by passing `undefined` for the missing branch/service so `buildIcs`'s input uses "Appointment" and omits location; this needs F3's `buildIcs` input fields to be optional, Open questions 3).

**`CancelDialog`**: helm `alert-dialog` (`role="alertdialog"`, `aria-labelledby`/`aria-describedby`); initial focus on "Keep appointment" (`cdkFocusInitial`); Escape/backdrop close with outcome `keep`; the description is built by the view model ("<service> at <branch>, <date and time zone label>"). It returns `'confirm' | 'keep'` to the detail; focus returns to the opener via the helm dialog's `restoreFocus`.

### Cancel state machine (Req 6)

```
idle --click--> confirming --keep/esc--> idle
confirming --confirm--> cancelling  (POST cancel, once; list item marked pending)
cancelling --204--> reGet --> cancelled{refreshed:true}   (toast "Appointment cancelled.")
                     reGet fails --> cancelled{refreshed:false} (no toast of error; list marks notRefreshed)
cancelling --409--> too-late (inline alert, no toast; reGet + list quiet refresh)
cancelling --503 or network/timeout--> reGetFirst
        reGetFirst: status Cancelled --> cancelled{refreshed:true}  (notice "Your appointment is cancelled. The time slot may take a moment...")
                    status Booked    --> retryable  ("We could not cancel right now. Nothing was changed. Try again in a moment.", button repeats POST)
                    reGet itself fails --> retryable (the state is unknown; message the same, the button repeats the idempotent POST)
cancelling --404--> detail load = not-found + list quiet refresh
cancelling --403--> failed (inline F1 message)
cancelling --429--> rate-limited (RateLimitNotice on the button, no auto retry)
retryable --click--> cancelling
```

Implementation notes:

- The transition table is one pure reducer `cancelReducer(phase, event)` with events `confirm`, `keep`, `ok204`, `err(AppError)`, `reGetResult(AppointmentResponse | AppError)`; the store runs the effects and feeds events back, so every branch is unit-testable without HTTP (Req 6.3 to 6.9).
- **The 503 re-GET rule:** a `503` (and `network`/`timeout`) never reverts the UI directly. The store first calls `getAppointment(id)`; only its result moves the phase (above). This is because the backend marks the appointment `Cancelled` before the slot release can fail (Req 6.7, 6.8).
- The 409 is mapped by a pure `cancelConflictMessage(detail)`: the known text "The appointment has already started and can no longer be cancelled." (verified in `AppointmentErrors.AlreadyStarted()`) maps to the fixed client message of Req 6.6 and phase `too-late`; any other `409` text maps to the generic "We couldn't cancel this appointment. Refresh and try again." and phase `failed` (button kept). The raw `detail` is never rendered; a table-driven test pins the known string.
- Double submission: the machine ignores `confirm` unless the phase is `confirming`, and the retry button exists only in `retryable`; one POST per user decision (Req 6.3). No `Idempotency-Key`, no automatic retry (Req 6.10).
- Announcements: a polite live region bound to `phase`: "Cancelling appointment..." on entering `cancelling`, "Appointment cancelled." on entering `cancelled` (once each, Req 6.3, 10.4); the 409/503/failed messages are in a `role="alert"` region rendered only while the phase holds them.
- After `cancelled`, the store calls `AppointmentsStore.applyCancelled(updated)` and `quietRefresh()` (Req 6.5). When the detail is a sheet and the item leaves the list, the sheet stays on the cancelled data; on close, focus goes to the nearest card or the page `<h1>` (computed from the list order captured at open time).
- `canCancel` is recomputed from `CLOCK` once when the detail loads and when the phase leaves `cancelling`; no ticking timer (a started appointment is handled by the 409).

### Profile page (Req 9)

`ProfilePage` reads `SessionStore.profile()` (`{ firstName, lastName, email, phoneNumber } | null`), `profileStatus()` (`'loading' | 'ready' | 'error'`) and `displayEmail()` (token claim), all F1 signals (the F1 design exposes the `me` result on the store; Open questions 2 if the names differ).

- Template: `<h1>`, a `<dl>` with `Name`, `Email`, `Phone number` (empty shows "Not provided"); skeleton for name and phone while `loading`; the email shows from the token claim at once; on `error` an `InlineError` with "Try again" calling `session.reloadProfile()`; an `effect` on `OutageState.recovered` calls the same method only while `status==='error'` (Req 9.3).
- `ThemePicker`: a `role="radiogroup"` of helm `radio-group` items System/Light/Dark bound to `ThemeService.preference()` and `ThemeService.setPreference(p)` (F0), so it stays in sync with the header toggle through the same signal (Req 9.4). No new persistence.
- "Sign out": `<button hlmBtn variant="outline" (click)="session.logout()">`; F1 owns the request, the broadcast and the navigation (Req 9.5).
- It contains no edit link or password text (Req 9.6).

### Validation

None: F4 has no form fields. The only client-side checks are the `GUID` matcher (Req 5.3) and `parseTab` (Req 1.2).

## State and data model

- **Stores:** `AppointmentsStore` (page-scoped), `AppointmentDetailStore` (detail-scoped), F3's `ReferenceDataStore` (root, memory only, Req 4.5), F1 `SessionStore`, `OutageState`, `ThemeService`.
- **URL state:** `/appointments?tab=upcoming|past&cancelled=1` and `/appointments/:id`. The only router state is `{ fromList: true }`, which decides sheet vs page and is lost on a reload on purpose (a reloaded deep link is a page, Req 5.1).
- **Storage:** none added (no `localStorage`/`sessionStorage`/IndexedDB; the theme key is F0's, Req 10.8).
- **Page size:** the constant `PAGE_SIZE = 20` in `appointments.store.ts`; `MAX_REFRESH = 100`.
- **Time:** "now" is `CLOCK.now()`; no `Date.now()` or `new Date(string)` in the feature (ESLint rule from F1 Req 13.6 applies and is not disabled).
- **Typed errors:** every store failure is an `AppError`; `status`/`kind` drive the table below.

## Error handling

Failures arrive as `AppError` from the F1 pipeline. The outage banner is shown by F1 for `unavailable`, `network` and `timeout`; F4 adds no second toast for those (Req 2.5).

| Condition                       | `AppError.status` / kind | UI result                                                                                                                                               |
| ------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First list page fails           | any                      | `InlineError` with F1 message and "Try again" in place of the list; no empty state (Req 2.4)                                                            |
| Load more fails                 | any                      | list kept; inline error under it with "Try again" for the same page (Req 2.4)                                                                           |
| List `403`                      | 403                      | inline message plus link to the landing route (Req 1.7)                                                                                                 |
| List `400`                      | 400                      | inline F1 message, parameters not echoed (Req 8.4)                                                                                                      |
| Lookup fails                    | any                      | cards render with fallbacks; one notice with "Try again" (Req 4.2)                                                                                      |
| Detail `404` or non-GUID        | 404                      | "Appointment not found" state, link to `/appointments` (Req 5.3)                                                                                        |
| Detail other failure            | any                      | inline error with "Try again"; reload on `OutageState.recovered` (Req 5.6)                                                                              |
| Cancel `409`                    | 409                      | revert; inline `role="alert"` with a fixed client message (known text: Cancel removed; unknown text: generic, Cancel kept); no toast; refresh (Req 6.6) |
| Cancel `503`, network, timeout  | 503 / network / timeout  | re-GET first; `Cancelled` gives the notice, `Booked` gives the retry message and button (Req 6.7, 6.8)                                                  |
| Cancel `404`                    | 404                      | not-found state, list refresh (Req 6.8)                                                                                                                 |
| Cancel `403`                    | 403                      | revert; inline F1 message (Req 6.8)                                                                                                                     |
| Cancel `429`                    | 429 / rate-limited       | revert; `RateLimitNotice` countdown on the button (Req 6.9)                                                                                             |
| Any `401`                       | 401                      | F1 session-end flow; nothing local (Req 8.5)                                                                                                            |
| Profile `/me` fails             | non-401                  | inline error with "Try again"; session stays (Req 9.3)                                                                                                  |
| Calendar file cannot be created | n/a                      | F3's `ToastService.showError("We could not create the calendar file.")` once                                                                            |

## Testing strategy

Vitest + Angular Testing Library (queries by role and label), MSW with `onUnhandledRequest: 'error'`, `vi.useFakeTimers()` and a manual `CLOCK`; no `fakeAsync`. Process time zone fixed to one that is none of the zones tested (F1 Req 13.5 setup).

| Layer                           | Covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pure unit tests (table-driven)  | `parseTab`/`toListQuery` (Req 1.2, 1.4, 1.5); `dedupeById` and `groupByDate` order preservation (Req 2.3, 3.1); `toViewModel` for `Pacific/Auckland`, `America/New_York`, `Asia/Kolkata`, a DST-change day, a missing branch, missing service, absent and invalid `timeZoneId` (Req 3.1, 3.2, 4.3, 4.4); badge text for Booked, Cancelled, past Booked, unknown status (Req 3.4); `cancelReducer` over every transition, including 503 then re-GET `Cancelled`, 503 then re-GET `Booked`, re-GET failing, a repeated `confirm` ignored (Req 6.3 to 6.10); `guidIdMatcher`                                                                                                                                                                                 |
| Store tests (MSW, fake timers)  | first page, `loadMore` append and double-call guard, a failure that keeps items and retries the same page, a late response of an old filter discarded (abort), the quiet refresh size (items < 100, > 100) and no skeleton status, reload on `OutageState.recovered`, `applyCancelled` removal rules (Req 1.3, 2.1 to 2.6, 6.5)                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Component tests                 | tabs keyboard and URL (1.2), "Show cancelled" request change (1.4), skeleton then cards (2.1), empty states not flashing (8.1 to 8.3), card accessible name and single link (3.3), zone label only when it differs (3.2), detail as sheet at 1100 px and page at 600 px, deep link, 404, non-GUID with no request (5.1 to 5.3), resize keeps an open dialog (5.7), dialog default focus and Escape (6.2), optimistic badge and announcement text (6.3), toast on success (6.4), 409 inline and no toast (6.6), 503 branches (6.7), Add to calendar visibility and the `buildIcs` input for missing names (7.1, 7.2), profile skeleton/error/"Not provided" (9.2, 9.3), theme radio group in sync with `ThemeService` (9.4), sign out calls `logout` (9.5) |
| MSW model                       | `appointments-backend.ts` keeps an in-memory list, applies `status`/`when`/`page`/`pageSize`, the order and tie-break, defaults, empty beyond the last page, `400` naming every invalid parameter; `cancel` is idempotent and can be told to return `409` or `503`-after-cancel; branches/services return only active items (Req 11.1)                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Playwright (route interception) | the flows of Req 11.3, with axe on `/appointments`, the open sheet, the cancel dialog and `/profile` in light and dark (Req 10, 11.3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Manual (Compose)                | Req 11.5                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

**Chunk budget (Req 11.4):** two lazy chunks, `features/customer/appointments` and `features/customer/profile`, together <= 40 kB gzipped, enforced by `size-limit` entries added to the F0 config. Expected contributors: helm `alert-dialog`, `switch`, `badge`, `radio-group`, `skeleton` (small) and the feature code; the sheet and `buildIcs` come from F1/F3 chunks and must not be duplicated (the build output is inspected once, and the measured value recorded here at implementation). The initial chunk gains nothing (Req 11.4; F1 Req 11.9).

## Traceability

| Requirement       | Design element                                                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1 Page and tabs   | `parseTab`, `toListQuery`, `AppointmentTabs`, `AppointmentsStore.setFilter`, abort + `requestId`                                    |
| 2 Paging          | `AppointmentsStore.loadFirst/loadMore/quietRefresh`, `dedupeById`, `LoadMore`, `AppointmentsSkeleton`, `InlineError`, outage effect |
| 3 Cards           | `toViewModel`, `groupByDate`, `AppointmentTimeline`, `AppointmentCard`, `StatusBadge`                                               |
| 4 Reference data  | F3 `ReferenceDataStore` (reused), fallbacks in `toViewModel`, lookup notice                                                         |
| 5 Detail          | child route, `presentation` computed, `AppointmentDetail` + `AppointmentDetailStore`, `guidIdMatcher`, `AppointmentNotFound`        |
| 6 Cancel          | `CancelDialog`, `cancelReducer`, `AppointmentDetailStore`, `applyCancelled`, `RateLimitNotice`                                      |
| 7 Add to calendar | F3 `buildIcs`/`downloadIcs`, `canAddToCalendar`                                                                                     |
| 8 Empty/error     | `EmptyState`, `InlineError`, error table                                                                                            |
| 9 Profile         | `ProfilePage`, `ThemePicker`, `SessionStore`                                                                                        |
| 10 Accessibility  | tab pattern, single-link cards, live regions, `restoreFocus`, `motion-safe`, F0 tokens                                              |
| 11 Tests/delivery | `src/testing/` additions, test table, `size-limit`                                                                                  |

## Open questions: resolved

1. **F3 reuse paths.** Confirmed: F3 places `ReferenceDataStore` and `buildIcs`/`downloadIcs` under `features/customer/shared/` (F3 Req 11.5); `buildIcs` name and address fields are optional (F3 covers it).
2. **`SessionStore` surface.** F1 now exposes `profile()`, `profileStatus()` and `reloadProfile()`.
3. **Cancel `409` text.** A fixed client message mapped from the known `detail`, as in F2's login `401`; an unknown `409` text shows a generic "couldn't cancel" message (Req 6.6, `cancelConflictMessage`).
4. **`/my` types.** A temporary `MyAppointmentsPage` type in `models.ts` until `pnpm gen:api` is rerun; the backend endpoint is in a PR and will reach master.
5. **Focus after a cancel** that removes the card goes to the nearest remaining card, else the `<h1>`. The 40 kB shared chunk budget is accepted.

## Implementation deviations

Where an assumption of this design proved wrong at implementation time, the option closest to the requirements was taken. Recorded as the tasks were built.

1. **Temporary types cover the appointment bodies too (task 1).** The regenerated `booking.d.ts` now has the `/api/appointments/my` path, but like every Booking endpoint it declares no response body, so there is no generated `AppointmentResponse` either. `core/api/models.ts` gains the temporary `AppointmentStatus`, `AppointmentResponse` and `MyAppointmentsPage` (all removed when the backend documents the responses). The design only named `MyAppointmentsPage`. `status` is `'Booked' | 'Cancelled' | (string & {})` so an unknown status stays representable (Req 3.4).
2. **Abort semantics (task 1).** The `BookingApiService` methods wrap the `ApiClient` observable in a small promise helper instead of `firstValueFrom`: on abort it unsubscribes (cancelling the HTTP request) and rejects with the signal's own reason, so a store can tell an abort (`AbortError`) from a failure. Each of the three methods takes the optional `{ signal }`.
3. **Stateful model split from MSW (task 2).** `src/testing/appointments-backend.ts` is a pure class (`AppointmentsBackend`, no MSW import, injectable `now`) and `handlers/appointments.handlers.ts` is `appointmentsHandlers(baseUrl, backend)`, a function rather than a constant list, because the model is per test. Beside the 503-after-cancel flag it has `forceCancelConflict` (a `409` with any text) and `forceListProblem` (a `403`/`500` list). The branches and services handlers live in the same file because F3's did not exist on this branch; they answer both `/api/Branches` and `/api/branches` (F1 deviation 1) and are to be reconciled with F3's at merge.
4. **View model inputs and labels (task 4).** `toViewModel` takes structural `BranchInfo { name, timeZoneId? }` and `ServiceInfo { name }` (declared in `appointment.model.ts`) instead of F3's `Branch`/`ServiceType`, so F4 code does not import F3 until the lookup lands; F3's types satisfy them. The date heading comes from `formatInZone(..., { style: 'date' })`, so it reads "Mon, 5 Oct 2026" rather than the long "Sunday 4 October 2026" of the design example (no new core format style was added; the example was illustrative). `ViewContext` has an optional `locale` (test seam) and `AppointmentView` an added `statusLabel` (raw status; the badge in task 7 maps it). The zone's short name uses `Intl.DateTimeFormat(...).formatToParts` directly (a zone name, not a time), and `isValidZone` is imported from `core/time/zone` because the `core/time` barrel does not export it.
5. **Cancel reducer details (task 8).** `cancelReducer` has two events the design left implicit: `open` (idle, failed or rate-limited to confirming) and `retry` (retryable to cancelling), and `reGetResult` carries why the store re-read (`after: 'ok'` for a `204`, `'unconfirmed'` for a `503`, other 5xx, network error or timeout), because the outcome differs (a failed re-GET after a `204` is still cancelled, after an unknown outcome it is retryable). `CancelPhase.cancelled` gains `slotMayBeDelayed` (true only after an unconfirmed outcome that the re-GET resolved to `Cancelled`) so the UI can show the Req 6.7 notice. A `404` (from the POST or from the re-GET) returns to `idle`: the detail's `load = 'not-found'` state, set by the store, is what the user sees. An unknown `409` text becomes a `failed` phase whose `AppError` carries the generic client message, so the raw `detail` never reaches a template. Files: `cancel-conflict.ts`, `cancel-reducer.ts`.
6. **Presentational list components (task 7, partial).** `AppointmentTabs` only reports choices through outputs (`tabChange`, `showCancelledChange`); the page (still to build) writes the URL with `replaceUrl`, so the tabs need no router. `InlineError` is a plain `role="alert"` block because the shared `alert` helm is not generated on this branch. The "Show cancelled" switch is labelled with a `<label for>` plus `inputId` (the angular-eslint label rule rejects a wrapping label around `hlm-switch`). The skeleton wrapper's `aria-busy` is the page's job (the component is the hidden cards only).
7. **AppointmentsStore details (task 6).** The recovered effect does not call the lookup's reload: F3's `ReferenceDataStore` already reloads its failed lists on `OutageState.recovered` itself. The store's own effect reloads a failed first page with `loadFirst()` and otherwise runs `quietRefresh()`. Besides the design's methods the store has `setPending`, `markNotRefreshed` (the flags the detail sets), `abort()` (also run on destroy) and an `announcement` signal. An empty `Load more` page clamps `totalCount` to the loaded count so the button goes away. `applyCancelled` replaces the item and then runs the quiet refresh, which is what removes it from an Upcoming list.
8. **List page (task 7).** `AppointmentsPage` has an inline template (no separate html file) and focuses its `<h1>` once after the first render. "Load more" focus: after the load it re-focuses the button when focus was lost (a disabled button drops it) and moves to the first new card link when the button is gone. `createFakeSession` gained `accessTokenForRequest` so specs can run the real HTTP pipeline with a fake session, and `routes.spec.ts` now provides the HTTP pipeline and an empty `AppointmentsBackend` because the screens load data.
9. **Detail store (task 8).** `AppointmentDetailStore` is seeded by `init(id)` (list copy at once, re-GET behind it; a re-GET applied during a cancel is ignored). `confirm()` and `retryCancel()` send nothing unless the phase is `confirming` / `retryable`, so a repeated click is one POST. A 204 whose re-GET shows `Booked` is still shown as cancelled (optimistic copy with a client `cancelledAtUtc`, list item marked `notRefreshed`). The success toast is shown in every cancelled outcome. The not-found spec's first test got a 20 s timeout: it pays the cold lazy imports and timed out under `pnpm test --coverage`.
10. **Detail as a child route (task 9).** `/appointments/:id` is a child of the `appointments` route (so the list stays mounted behind the sheet); a non-GUID id falls through `guidIdMatcher` to `AppointmentNotFound` with no request. `DetailHost` (provided by the list page) owns the sheet/page decision and focus return. `IcsInput` made the name, address, phone, local start and zone fields optional so a missing branch or service is passed as absent (F3 spec extended).
11. **Profile page and a11y pass (tasks 10 and 11).** `createFakeSession` gained a `user` signal (the profile page shows the token email at once). The generated helm `sheet` and `alert-dialog` (content and overlay) were edited so `animate-in`/`animate-out` and the sheet `transition` sit behind `motion-safe:` (Req 10.6); regenerating them restores the bare classes, so re-apply. No sticky headings exist, so no focus-obscured fix was needed; cards keep `min-h-11`.
12. **E2E, axe and the size budget (task 12).** No `size-limit` package exists in this repo, so the budget is a second check in `scripts/size.mjs` (`pnpm size`): the gzipped size of the chunks that hold the F4 components plus the chunks only they import must stay under 40 kB (`MAX_F4_GZIP_KB`); measured 36.63 kB (7 chunks; shared framework chunks used by other features are not counted). `@axe-core/playwright` was added as a dev dependency. axe found two real defects, fixed: the destructive button (a 10% tint with red text) failed contrast in light and dark, so the detail and dialog buttons are now solid `bg-destructive text-destructive-foreground`; and clicking the theme option text did nothing, so `ThemePicker` uses a `<label for>` per radio. The open-sheet axe test disables `aria-hidden-focus`: the CDK sets `aria-hidden` on the app root while its focus-trap anchors stay tabbable (a Spartan/CDK modal behaviour, not app code); the cancel dialog and the page presentation pass without the exemption. The Playwright mock for the appointment endpoints lives in `e2e/appointments-mock.ts`.
