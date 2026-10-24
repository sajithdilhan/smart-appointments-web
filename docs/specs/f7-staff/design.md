# F7 Staff workspace — Design

## Overview

F7 adds three screens and one set of badge changes, all on top of F1 to F6 without changing any of their contracts. Five ideas carry it.

1. **One day-list engine, two hosts.** The staff page (`/staff`) and the admin page (`/admin/appointments`) show the same thing: one branch's appointments for one branch-local day, with marks and a detail panel (Req 2 to 5). The engine lives in `src/app/shared/branch-day/` (store, URL-state helpers, date controls, status filter, list, row actions, detail sheet, no-show confirmation). It takes the branch (`id`, `timeZoneId`) and a service-name lookup as inputs, so neither host re-implements anything. The hosts only supply the branch (the token's, or a picker) and the page chrome. It sits in `shared/` because two features need it and `features` must not import `features` (the F5 precedent for the forms).
2. **The URL owns the view state.** `?date=` and `?status=` (and `?branch=` on the admin page) are the only state besides the loaded rows. Controls navigate; a pure `parseDayParams()` turns the query into `{date, status}`; the store reloads when that pair or the branch changes (Req 2.1, 2.2, 2.5, 5.2).
3. **Reload, never patch.** After a mark the store reloads the list from the server, so the row shows what the server holds (Req 3.3, 3.5). The one in-flight marker per row (`marking`) is the only local state, and it prevents double sends (Req 3.6).
4. **A staff member's branch is a token claim, resolved once.** `SessionUser.branchId` comes from `branch_id` (Req 1.1). A root `StaffBranchStore` in `core/` turns it into `{name, code, timeZoneId}` through `GET /api/branches/{id}` once per session and branch, and both the staff shell header and the staff page read it (Req 1.2 to 1.6).
5. **Staff accounts are a server-paged list with drawers.** `StaffAccountsStore` (admin feature) is a `@ngrx/signals` store over `GET /api/auth/staff` with filters and Load more. The create and edit drawers are children of the list route and reuse F5's `DrawerFrame`, `unsavedChangesGuard` and the F2 form primitives (Req 6 to 9). All backend error texts are mapped in one module (`staff-error.ts`).

F7 consumes F1 (`ApiClient`, `AppError`, `ToastService`, `OutageState`, `SessionStore`, guards, shells, `core/time`, `CLOCK`, `ViewportService`), F2 (field components and password rules), F4 (status badge, appointment view), F5 (admin stores, drawers, palette) and F6 (tokens).

## Architecture

Dependency direction as before: `features → shared, core`; `shared → core`; `core` imports neither.

| Area                                      | Contents                                                                                                                                                                                                               |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/core/auth/`                      | `jwt.ts` (`branchId` claim), `session.model.ts` (`SessionUser.branchId?`), `session.store.ts` (`establish` copies it) (Req 1.1)                                                                                        |
| `src/app/core/util/`                      | `guid.ts` (`isGuid`), `now-signal.ts` (`createNowSignal`: a `nowMs` signal that ticks only when a deadline passes, built on `CLOCK`) (Req 3.2)                                                                         |
| `src/app/core/branch/`                    | `staff-branch.store.ts` (`StaffBranchStore`, root) (Req 1.2 to 1.6)                                                                                                                                                    |
| `src/app/core/time/`                      | new `time-hm.ts`: `timeHm(iso, zone)` (24-hour `HH:mm`, via `zonedParts`) and `longDateLabel(date)` ("Friday 24 October 2026", UTC on a noon instant); exported from `index.ts` (Req 2.2, 2.4, 3.2)                    |
| `src/app/core/api/`                       | `generated/*.d.ts` regenerated; `models.ts` (new types, below); `auth-api.service.ts` (staff methods); `booking-api.service.ts` (day list and marks) (Req 11.1)                                                        |
| `src/app/shared/forms/`                   | receives `password-rules.ts`, `password-validator.ts`, `password-field.component.ts`, `password-checklist.component.ts` from `features/public/` (path change only; `public` imports them from the new place) (Req 7.1) |
| `src/app/shared/appointments/`            | `appointment-status-badge.ts` moved from `features/customer/appointments/status-badge.ts`, with Completed and NoShow (Req 10.1, 10.4)                                                                                  |
| `src/app/shared/branch-day/`              | the day-list engine (below)                                                                                                                                                                                            |
| `src/app/shared/ui/badge`                 | new `warning` variant (Req 10.1)                                                                                                                                                                                       |
| `src/app/shared/layout/staff-shell/`      | header shows branch name and code (Req 1.2)                                                                                                                                                                            |
| `src/app/features/staff/`                 | `staff.routes.ts`, `staff-gate.component.ts`, `staff-day.page.ts`, `titles.ts`; the placeholder is deleted                                                                                                             |
| `src/app/features/admin/`                 | `appointments/` (page, branch picker), `staff/` (page, drawers, error mapping, row actions), `data/staff-accounts.store.ts`, routes, titles, palette entries                                                           |
| `src/app/features/customer/appointments/` | detail "Completed on / Marked as no-show on", Past-tab status filter, `tab-params` (Req 10)                                                                                                                            |
| `src/testing/`, `e2e/`                    | `branch-day-backend.ts`, `staff-accounts-backend.ts`, `make-access-token.ts` (+ `branchId`), `e2e/support/mock-staff-api.ts`, `mock-staff-accounts-api.ts`                                                             |
| `scripts/`                                | `size.mjs` gains `--group staff` (Chunk budget)                                                                                                                                                                        |

```
src/app/shared/branch-day/
  day-params.ts              # parseDayParams(raw, today), STATUS_FILTERS, toQuery(): pure (Req 2.1, 2.5)
  day-row.ts                 # BranchDayRow view model + toRow(appointment, ctx) (Req 2.4, 2.7)
  branch-day.store.ts        # signalStore: rows, paging, marking, announcements (Req 2.3, 2.8, 2.9, 3)
  day-url-state.ts           # createDayUrlState(): router <-> {date,status}; history entries, normalisation
  day-nav.component.ts       # heading date + Previous / Next / Today / date input (Req 2.2)
  status-filter.component.ts # All, Booked, Completed, No-show, Cancelled (Req 2.5)
  day-list.component.ts      # table (>=640px) or cards; states, notices, Load more (Req 2.4, 2.6 to 2.10)
  row-actions.component.ts   # Complete / No-show + "Available from" hint (Req 3.1, 3.2, 3.6)
  no-show-confirm.ts         # ConfirmService wording (Req 3.4)
  mark-error.ts              # mapMarkError(AppError) (Req 3.5)
  appointment-sheet.component.ts  # detail panel (Req 4)
  day-errors.ts              # day-list error text by status (Req 2.10)
```

## Components and interfaces

### Routes

| Path                  | Component                    | Guard                                             | Notes                                          |
| --------------------- | ---------------------------- | ------------------------------------------------- | ---------------------------------------------- |
| `/staff`              | `StaffGate` → `StaffDayPage` | `authGuard`, `roleGuard('Staff')` (F1, unchanged) | `?date=&status=`; title "Appointments" (Req 2) |
| `/admin/appointments` | `AdminAppointmentsPage`      | admin guards (F1)                                 | `?branch=&date=&status=` (Req 5)               |
| `/admin/staff`        | `StaffAccountsPage`          | admin guards                                      | `?branch=&status=` (Req 6)                     |
| `/admin/staff/new`    | `StaffCreateDrawer` (child)  | `unsavedChangesGuard`                             | Req 7                                          |
| `/admin/staff/:id`    | `StaffEditDrawer` (child)    | `unsavedChangesGuard`                             | GUID check before any request, as F5 (Req 8)   |

`ADMIN_ROUTES` gains `appointments` and `staff` (with its two children) inside `AdminFrame`; `StaffAccountsStore` joins that route's `providers` and is reset by `AdminFrame` on destroy with the other stores. `features/staff/staff.routes.ts` becomes one route, `''` → `StaffGate` with `StaffDayPage` as its content. Sidebar order: Dashboard, Branches, Services, **Staff**, Slot generation, **Appointments** (Req 5.1, 6.1). Palette static commands: "Go to appointments" (Navigate), "Go to staff" (Navigate), "New staff member" (Create), and `staff-{id}` record entries "Edit {name}" from `StaffAccountsStore.items()` when loaded (Req 6.1).

### Session and branch context (Req 1)

- `decodeAccessToken` returns `branchId: string | null` (the `branch_id` claim, only if it is a string and a GUID; anything else is `null`) (Req 1.1). `establish()` writes `branchId` into `SessionUser` only for `role === 'Staff'`. Cross-tab adoption and refresh already go through `establish`, so a token with a new `branch_id` updates the user (Req 1.5).
- `StaffBranchStore` (`core/branch/`, root `signalStore`): state `{ branchId, status: 'idle'|'loading'|'ready'|'not-linked'|'error', branch: Branch|null, error }`. Computed `timeZoneId` (`branch.timeZoneId` or `null`), `zone` (`timeZoneId ?? 'UTC'`), `zoneLabel` (`null` or `'UTC'`). `ensure()` is called by the gate: no `branchId` → `not-linked` and no request; same id already `ready` → no request ("once per session and branch"); `404` → `not-linked`; network/`5xx` → `error`. An `effect` on `session.user().branchId` re-runs `ensure()` when it changes; `reset()` runs when the session leaves `authenticated` (as `ReferenceDataStore` does) (Req 1.2 to 1.5).
- `StaffGate` reads the store: `not-linked` renders the full-page message and a Sign out button, with no day page and so no appointment request (Req 1.3); `error` renders the F1 error state with Retry and re-runs `ensure()` when `OutageState.recovered` increments (Req 1.4); `ready` renders the router content. `StaffShell` shows "{name} ({code})" in the header from the same store when `ready` (Req 1.2).
- **Zone.** Every date and time in the workspace uses `store.zone()`; when `timeZoneId` is null, `zoneLabel` "UTC" is shown beside the date ("Times in UTC") (Req 1.6).

### Day-list engine (`shared/branch-day`)

```ts
export type StatusFilter = 'all' | 'Booked' | 'Completed' | 'NoShow' | 'Cancelled';
export function parseDayParams(
  raw: { date?: string | null; status?: string | null },
  today: string,
): { date: string; status: StatusFilter; dateWasInvalid: boolean }; // malformed date -> today (Req 2.1); unknown status -> 'all' (Req 2.5)

export interface BranchDayContext {
  branchId: Signal<string | null>;
  zone: Signal<string>; // 'UTC' when the branch has none
  services: Signal<ReadonlyMap<string, { name: string }>>; // host-supplied (Req 2.4)
}
```

- **`createDayUrlState(ctx)`** (injection context): reads `ActivatedRoute.queryParamMap` into signals `date()` and `status()` through `parseDayParams(…, todayInZone(zone, now))`. When the raw `date` is absent or malformed it navigates once with `replaceUrl: true` to the normalised value (Req 2.1). `setDate(d)`, `setStatus(s)` call `router.navigate([], { queryParams, queryParamsHandling: 'merge' })` **without** `replaceUrl`, so each control adds a history entry and Back returns (Req 2.2, 2.5). `goToday()` uses the clock. `resetDate()` clears `date` (the next parse gives today in the current zone): used when the branch changes (Req 1.5, 5.4).
- **`BranchDayStore`** (`@ngrx/signals`, provided per page, so it dies with the page). State: `branchId`, `date`, `status`, `items: BranchDayItem[]`, `page`, `totalCount`, `customersUnavailable`, `load: 'idle'|'loading'|'ready'|'refreshing'|'loading-more'|'error'|'more-error'`, `error: AppError|null`, `marking: Record<id, 'complete'|'no-show'>`, `announcement: string`. Methods:
  - `open({branchId, date, status})`: aborts the previous request (`AbortController`, the F4 pattern), sets `loading` (skeletons, `aria-busy`), calls `booking.listBranchAppointments(branchId, {date, status?, page:1, pageSize:100}, {signal})`, stores items. A stale response is dropped by a request counter (Req 2.3, 2.6).
  - `loadMore()`: page + 1, append, dedupe by `id`; failure → `more-error`, items kept (Req 2.9).
  - `refresh()`: re-requests pages 1..`page` sequentially with the current query, keeping the rows on screen (`refreshing`); the F4 `refresh` shape. Called by the Refresh button, after a mark, and on `OutageState.recovered` (an `effect` in the page) (Req 2.8). No timers.
  - `mark(id, kind)`: ignored when `marking[id]` is set (Req 3.6). Sets it, calls `completeAppointment` or `markNoShow`. Success: toast, announcement, `refresh()`. `409`/`404`: `mapMarkError`, toast, `refresh()` (Req 3.5). Other failures: `ToastService.handleError`, no reload. Always clears `marking[id]`.
  - Computed: `rows` (items through `toRow`), `countLabel` ("8 appointments", "1 appointment"; "{n} Booked appointments" is not used: the count is the filter's `totalCount`, Req 2.6), `showCustomersNotice` (`customersUnavailable`), `isEmpty`.
- **`toRow(item, ctx)`** → `BranchDayRow { id, startUtc, startLabel, endLabel, timeRange, status, customerName|null, phone|null, serviceName, canMark }`. `customerName` is `"{firstName} {lastName}"`; null `customer` (whole page unavailable or one row) gives `null` and the row shows "Name unavailable" with no phone link (Req 2.4, 2.7). The service comes from `ctx.services`, else `UNAVAILABLE_SERVICE` (F4 constant) (Req 2.4). `canMark` is `status === 'Booked'` (Req 3.1).
- **`DayNav`** inputs `date`, `today`, `zoneLabel`; outputs `dateChange`. Renders `<h1>Appointments</h1>`, the long date (`longDateLabel`), Previous/Next (`addDays`), Today (disabled when `date === today`), and `<input type="date">` with a visible label "Go to date" (Req 2.2). It is presentational: the host connects `dateChange` to `setDate`.
- **`StatusFilterSelect`**: a labelled native `<select>` (the F5 choice; Spartan select not used, to keep the budget) (Req 2.5).
- **`DayList`**: `@if (viewport.isSm()) { <table> } @else { <ul> cards }` (F5 pattern, one rendered at a time; Req 2.4). Skeleton rows with `aria-busy="true"`; the empty text with the filter wording; the inline error with Retry (`day-errors.ts`: `403` "You can only see your own branch.", `503` "The branch's time zone could not be loaded. Try again shortly.", others the F1 message); the customers notice; the count in a `role="status"` line; the Load more button (Req 2.6, 2.7, 2.9, 2.10). The row's time and name are one `<button>` (`aria-haspopup="dialog"`) that emits `open(rowId)` (Req 4.1). Phone is `<a [href]="'tel:' + phone">`.
- **`RowActions`** (inputs `row`, `marking`, `nowMs`, `zone`; outputs `complete`, `noShow`): both buttons `disabled` while `startMs > nowMs` or while `marking` is set; the hint `<span id="avail-{id}">Available from 10:30</span>` is the `aria-describedby` of both; the activated button shows a spinner and `aria-busy` (Req 3.2, 3.6). `nowMs` comes from `createNowSignal` (below). Hidden for non-Booked rows (Req 3.1).
- **No-show dialog**: `confirmNoShow(confirm, row)` calls `ConfirmService.confirm({ title: 'Mark as no-show?', body: '{name} at {time} ...', confirmLabel: 'Mark as no-show', cancelLabel: 'Keep as booked', destructive: true, initialFocus: 'cancel', run })`. The existing helm alert-dialog (via `ConfirmService`) already gives Escape-closes-without-running, focus on Cancel and `aria-busy` on the confirm button, so no new dialog is built (Req 3.4). `run` calls `store.mark(id, 'no-show')`, which handles `409`/`404` itself and resolves, so the dialog closes and the toast shows; a network error rejects so the dialog stays open with the message inline.
- **`AppointmentSheet`**: the helm `sheet` (F4's `HlmSheetImports`), `side="right"`, `max-w-md` when `ViewportService.isLg()`, full width below; open state is a page signal `openId`, not a route (Req 4). Content is a `<dl>`: customer, phone, service with duration (`end − start` in minutes, so it does not depend on the service lookup), date and time, `AppointmentStatusBadge`, created, and cancelled/completed/no-show times (`timeHm`/`formatInZone` in the branch zone), and the id with a Copy button (the F4 copy pattern and its `role="status"` message). It embeds `RowActions` and reads the row from `store.rows()` by id, so it shows the status after the reload. Focus is trapped by the brain dialog; on close focus returns to the opener button, restored explicitly through a captured element if the row re-rendered (Req 4.2, 4.3).

### "Available from" ticking (Req 3.2)

`createNowSignal(clock = inject(CLOCK))` returns `{ now: Signal<number>, watch(deadlines: Signal<number[]>) }`. An `effect` over the deadlines sets **one** timer, via `clock.setTimer`, for the smallest deadline in the future, and on firing sets `now` and re-arms for the next. So the enabled state flips exactly when a start time passes, with no polling, and it works under `ManualClock` in tests (`advance(ms)` fires it) (Req 3.2). `now` is also refreshed when a reload brings new rows.

### Staff page (`features/staff`)

`StaffDayPage` provides `BranchDayStore`; its context is `StaffBranchStore` (`branchId`, `zone`) and a service map from `AvailabilityApiService.services()` (any role can list services; loaded once per page, failure → empty map and "Unavailable service"). An `effect` calls `store.open(...)` when `(branchId, date, status)` changes; a second effect, on a `branchId` change after the first, calls `resetDate()` (Req 1.5). Composition: `DayNav`, `StatusFilterSelect`, Refresh button, `DayList`, `AppointmentSheet`, a polite `role="status"` region bound to `store.announcement()` (Req 3.7).

### Admin appointments page (`features/admin/appointments`)

`AdminAppointmentsPage` calls `BranchesStore.load()`, renders a branch `<select>` (`name (code)`, "(inactive)" suffix) bound to `?branch=` (invalid or unknown id → treated as none), and with a branch chosen renders the same composition as the staff page; the zone comes from the chosen branch (`timeZoneId ?? 'UTC'`) and the service map from `ServicesStore.items()` (includes inactive services, so names resolve for admins). Changing the branch calls `resetDate()` and keeps `status` (Req 5.2 to 5.4). Without a branch: "Choose a branch to see its appointments." and no request (Req 5.2).

### Staff accounts (`features/admin/staff`, `data/staff-accounts.store.ts`)

- **`StaffAccountsStore`** (`signalStore`, provided by the route): state `{ items, page, totalCount, filter: {branchId|null, isActive|null}, status: 'idle'|'loading'|'ready'|'error'|'loading-more', error }`. `load(filter)` requests page 1 with `pageSize=100`; `loadMore()` appends (dedupe by id); `reload()` re-requests pages 1..`page`; `reset()`. `reloadOnRecovery(store)` (the F5 helper, typed on `load`) is reused through a one-method adapter (Req 6.2, 6.4, 6.6).
- **`StaffAccountsPage`**: the F5 list conventions (`ListStates`, `ListToolbar`, `ViewportService.isSm()` table or cards, row actions as `dropdown-menu` with Edit/Deactivate-or-Reactivate/Delete) with server-side filters: branch `<select>` (All + `BranchesStore.items()`) and status `<select>` kept in `?branch=` and `?status=`, unknown values → All. Branch cell: `BranchesStore.byId(id)?.name ?? 'Unknown branch'`. Empty states per Req 6.5 ("Clear filters" resets both). Outlet for the drawers (Req 6).
- **`StaffCreateDrawer`** and **`StaffEditDrawer`** use `DrawerFrame`, `drawer-focus` and `unsavedChangesGuard` as F5's branch drawer does. Create form: `firstName`, `lastName`, `email`, `phoneNumber`, `password` (`PasswordField` + `PasswordChecklist` from `shared/forms`), `branchId` (select of `BranchesStore.active()`). Edit: `getStaff(id)` read-only `<dl>` (name, email, phone, status badge, registered) plus the Branch select and the sign-out notice; Save disabled while the branch is unchanged or a save is pending. The edit drawer's branch select also lists the staff member's current branch if it is inactive (marked "(inactive)") so the control shows the true value; saving requires choosing an active one (Req 8.1 to 8.3).
- **`StaffRowActions`** (a service, `staff-actions.ts`, not a component): `deactivate(account)`, `reactivate(account)`, `remove(account)` use `ConfirmService` (`run` performs the request; success toast + `store.reload()`), exactly the wording of Req 9. `404` anywhere: toast "This staff account no longer exists." + reload (Req 9.4). The row's menu button is disabled while its id is in `pending` (a `Set` signal on the page) (Req 9.5). Reactivate `422`: an inline alert banner above the list with an "Edit {name}" link to `/admin/staff/{id}` (Design decision 9).

### API calls

`AuthApiService` (paths in the generated casing, `/api/Auth/staff...`; the gateway is case-insensitive):

```ts
listStaff(q: { branchId?: string; isActive?: boolean; page: number; pageSize: number }, o?: RequestOptions): Promise<StaffPage>
getStaff(id: string): Observable<StaffAccount>                       // GET    /api/Auth/staff/{id}
createStaff(b: CreateStaffBody): Observable<StaffAccount>            // POST   /api/Auth/staff            201
moveStaff(id: string, branchId: string): Observable<StaffAccount>    // PUT    /api/Auth/staff/{id}/branch 200
setStaffActive(id: string, active: boolean): Observable<void>        // POST   .../activate | .../deactivate  204
deleteStaff(id: string): Observable<void>                            // DELETE /api/Auth/staff/{id}        204
```

`BookingApiService`: `listBranchAppointments(branchId, {date, status?, page, pageSize}, {signal}): Promise<BranchAppointmentsPage>` (`GET /api/appointments/branch/{id}`, `status` omitted for All), `completeAppointment(id, {signal}): Promise<AppointmentResponse>`, `markNoShow(...)`; `MyAppointmentsQuery.status` widens to `'Booked'|'Cancelled'|'Completed'|'NoShow'` (Req 10.3). No call sets `Idempotency-Key`. `GET /api/Branches/{id}` (`getBranch`) and `services()` already exist.

**Types (Req 11.1).** `pnpm gen:api` runs against the gateway on `master` (`http://localhost:5290`, the Compose stack in Development). The existing generated files declare request bodies and path/query parameters but, as F3's note records, no response bodies; the new operations are expected to be the same, so the response types stay hand-written, marked "Temporary extensions (Req 11.1)": `StaffAccount { id, firstName, lastName, email, phoneNumber, role, branchId, isActive, registeredAtUtc }`, `StaffPage`, `CreateStaffBody` (the generated `CreateStaffRequest` if present, else written), `BranchAppointment = AppointmentResponse & { customer: {firstName,lastName,phoneNumber}|null }`, `BranchAppointmentsPage { items, page, pageSize, totalCount, customersUnavailable }`; `AppointmentResponse` gains `completedAtUtc?` and `noShowAtUtc?`; `AppointmentStatus = 'Booked'|'Cancelled'|'Completed'|'NoShow'` (Req 10.4). If the regenerated file does declare a body, the hand-written type is deleted in that task.

### Validation (Req 7.1, 8)

Client rules mirror the backend (`staff-booking` validators), reusing F2/F5 pieces: names `maxLengthValidator(50)` + required-trimmed; `emailValidator`; `phoneValidator` with `normalizePhone` (`^\+?[1-9]\d{1,14}$`, applied on submit); `strongPasswordValidator` and `evaluatePasswordRules` (moved to `shared/forms`); `branchId` required (select). Wording lives in `features/admin/staff/staff-messages.ts` (F5 `validation/messages.ts` style); the generic name/email/phone texts come from the moved F2 messages through `shared/forms`. The password control value is read once into the request body and the control is reset immediately after `createStaff` settles (success or failure), and it is never put in a store, URL, log or `localStorage` (Req 7.4).

## State and data model

| State                                   | Owner                     | Lifetime                          |
| --------------------------------------- | ------------------------- | --------------------------------- |
| `SessionUser.branchId`                  | `SessionStore`            | session                           |
| Staff branch `{status, branch}`         | `StaffBranchStore` (root) | session; reset on sign-out        |
| `date`, `status`, `branch`              | URL query params          | navigation                        |
| Rows, paging, `marking`, announcement   | `BranchDayStore`          | the page                          |
| `openId` (detail sheet)                 | page signal               | the page                          |
| `nowMs`                                 | `createNowSignal`         | the page                          |
| Staff accounts, filters                 | `StaffAccountsStore`      | the admin frame; reset on destroy |
| Form values (not password after submit) | drawer `FormGroup`        | the drawer                        |
| Persisted storage                       | none new                  | —                                 |

`BranchDayRow` and `StaffAccount` are as above. No store keeps the password.

## Error handling

All failures arrive as `AppError` from the F1 pipeline (`{status, message, kind}`); mapping modules switch on `status` first and on the exact backend `detail` only where one status carries several meanings. Known texts are constants in the mapping module, never inline.

| Condition                                               | `AppError`           | UI result                                                                                                              |
| ------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Day list `403` / `503` / other                          | 403 / 503 / any      | inline error text per Req 2.10, Retry; date controls stay usable                                                       |
| Day list network, timeout                               | `network`, `timeout` | inline error with the F1 text and Retry; F1 banner covers outages; reload on recovery (Req 2.8)                        |
| Mark `409`                                              | 409                  | error toast with the server's `detail`; reload (Req 3.5)                                                               |
| Mark `404`                                              | 404                  | toast "This appointment is no longer available."; reload                                                               |
| Mark `403`/other                                        | any                  | `ToastService.handleError`; no reload                                                                                  |
| Branch `404` or no claim                                | 404                  | `not-linked` full-page message (Req 1.3)                                                                               |
| Branch network/`5xx`                                    | other                | F1 error state + Retry; retry on recovery (Req 1.4)                                                                    |
| Staff list failure                                      | any                  | inline error + Retry (Req 6.6)                                                                                         |
| Create `400` "Email is already registered."             | 400                  | error on Email field (Req 7.3)                                                                                         |
| Create/move `400` "Invalid request data. Errors: a,b"   | 400                  | split on `, ` / `,` like F5's `splitValidationDetail`; known messages to fields, the rest to the form alert            |
| Create/move `422`                                       | 422                  | Branch field: "This branch is not active any more. Choose another."; `BranchesStore.load({force:true})` (Req 7.3, 8.4) |
| Create/move `503`                                       | 503                  | form alert "The branch could not be checked right now. Try again shortly."; values kept (Req 7.3, 8.4)                 |
| Edit read / move / activate / deactivate / delete `404` | 404                  | edit drawer: "This staff account no longer exists." and list reload; actions: toast + reload (Req 8.1, 9.4)            |
| Activate `422`                                          | 422                  | banner "{Name}'s branch is not active. Move them to an active branch first." + Edit link (Req 9.2)                     |
| Activate/move `503` (not create)                        | 503                  | `ToastService.handleError` (F1 outage text) (Req 9.2)                                                                  |
| `429`                                                   | rate-limited         | `RateLimitNotice` on forms; toast on actions                                                                           |
| Any `403` on staff endpoints                            | 403                  | `handleError`: "You do not have permission to do that." (Req 11.2)                                                     |

`staff-error.ts` exports `mapStaffSaveError(err, mode: 'create'|'move'): StaffOutcome` (`{ kind: 'field', field, message } | { kind: 'alert', message } | { kind: 'not-found' } | { kind: 'rate-limited', … } | { kind: 'generic' }`) and `mapStaffActionError(err, action)`; the day list has `mapMarkError` and `dayErrorText`. Each is pure and table-tested.

## Accessibility

- The day list table has a caption (visually hidden: "Appointments for {date}"), `scope="col"` headers and a row-level name button; cards use a `<ul>` of `<li>` with the same button (Req 2.4, 4.1).
- Status is never colour alone: icon + text on every badge (Req 10.1). Tokens: `warning` is `#b45309` on white (4.9:1 on `#fff`); the badge uses a `warning-soft` pair added to `styles.css`, checked by axe in both themes (Req 10.1, 11.3).
- Live regions: the count line and the mark announcement are separate polite regions; the announcement text is "Ana Perera, 10:30, marked as completed" and is cleared after 5 s with `CLOCK` (Req 3.7).
- Disabled actions keep the hint text visible and linked by `aria-describedby`; `aria-disabled` is not used (a real `disabled` button is skipped by Tab, so the hint is also in the row's text) (Req 3.2).
- The sheet and dialogs follow the brain dialog behaviour (trap, Escape, focus return) F4 and F5 already test; drawers keep F5's `DrawerFrame` behaviour (Req 4.3, 7.1).
- Date input has a visible label; Previous/Next have names "Previous day"/"Next day"; page `<h1>` is focused on route change by the F1 `RouteAnnouncer`/`focusHeading` (Req 2.2, 11.3).
- Reflow: cards below 640 px, no horizontal scroll to 320 px (Playwright check at 320 px) (Req 2.4, 6.2).

## Testing strategy

Vitest + Angular Testing Library (queries by role and label), MSW, `ManualClock` for time, `vi.useFakeTimers()` as F1 configures, no `fakeAsync`. Two new stateful MSW backends in `src/testing/` follow `appointments-backend.ts`: `branch-day-backend.ts` (branches' appointments, customer lookup, marks with the real rules: `409` before start or wrong status, idempotent repeat, `404` other branch for a Staff token, `403` customer, `customersUnavailable` switch, paging) and `staff-accounts-backend.ts` (list with filters and paging, create with the duplicate-email `400` and inactive-branch `422`, move, activate/deactivate, soft delete, `503` switch). `make-access-token` gains `branchId`.

| Kind                      | Covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Spec files                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Pure                      | `branch_id` decode (valid, absent, not a GUID, Customer/Admin) (1.1); `parseDayParams` (2.1, 2.5); `toRow` (2.4, 2.7); `timeHm`, `longDateLabel` for DST days and no-zone (1.6, 2.2); `createNowSignal` with `ManualClock` (3.2); mapping modules (2.10, 3.5, 7.3, 8.4, 9.x); `splitValidationDetail` reuse                                                                                                                                                                     | `jwt.spec`, `day-params.spec`, `day-row.spec`, `time-hm.spec`, `now-signal.spec`, `mark-error.spec`, `staff-error.spec` |
| Store                     | `BranchDayStore`: query by date and status, `pageSize=100`, Load more append and dedupe, stale response dropped, refresh keeps rows, mark success reload, `409`/`404` reload, double send ignored, announcements (2.3, 2.8, 2.9, 3.3 to 3.7); `StaffBranchStore`: once per branch, `not-linked`, error, recovery, branch change (1.2 to 1.5); `StaffAccountsStore`: filters, paging, reload of loaded pages (6.2, 6.4)                                                          | `branch-day.store.spec`, `staff-branch.store.spec`, `staff-accounts.store.spec`                                         |
| Component: shared         | day nav (buttons, Today disabled, input; navigation adds history), filter, list (table vs cards via stubbed viewport, skeleton, empty text with filter, notice, per-row null customer, tel link, Load more, inline error and Retry), row actions (hint, `aria-describedby`, busy, becomes enabled when the clock passes start), no-show dialog (wording, initial focus Keep as booked, Escape sends nothing, confirm sends), sheet (fields, copy, actions, focus return, close) | `day-nav`, `status-filter`, `day-list`, `row-actions`, `no-show-confirm`, `appointment-sheet` specs                     |
| Component: hosts          | staff gate (not-linked, error + Retry, ready), shell header, staff page (URL normalised with `replace`, branch change resets date, unknown filter → All, recovery reload), admin appointments page (picker incl. inactive, no branch message, branch change resets date, zone of the chosen branch)                                                                                                                                                                             | `staff-gate`, `staff-day.page`, `staff-shell`, `appointments.page` specs                                                |
| Component: staff accounts | table/cards, filters in URL, empty states, Load more, row menu; create drawer (fields, normalised phone, password checklist, every error mapping, double submit, password cleared, guard prompt); edit drawer (read-only fields, same-branch disabled, notice, `404`, `422`, `503`); actions (wording, focus on Cancel, busy, `404`, reactivate `422` action)                                                                                                                   | `staff.page`, `staff-create-drawer`, `staff-edit-drawer`, `staff-actions` specs                                         |
| Component: customer       | badge Completed/NoShow/unknown (10.1, 10.4); detail "Completed on"/"Marked as no-show on", no cancel (10.2); Past filter in URL and request, Upcoming unchanged (10.3)                                                                                                                                                                                                                                                                                                          | `status-badge`, `appointment-detail`, `appointments-page`, `tab-params` specs                                           |
| Routing/palette           | admin routes resolve incl. `staff/new` vs `:id`; sidebar order; palette commands and staff records (5.1, 6.1, 11.2)                                                                                                                                                                                                                                                                                                                                                             | `admin.routes.spec`, `command-registry.spec`, `admin-shell.spec`                                                        |
| API services              | URLs, params (`status` omitted for All), bodies, `Idempotency-Key` absent                                                                                                                                                                                                                                                                                                                                                                                                       | `auth-api.service.spec`, `booking-api.service.spec`                                                                     |
| Playwright (mocked)       | staff day list with a Complete and a No-show, branch day change by Back; admin appointments page; staff create, move, deactivate, reactivate, delete (11.4)                                                                                                                                                                                                                                                                                                                     | `staff.spec`, `admin-appointments.spec`, `admin-staff.spec`                                                             |
| axe (light and dark)      | `/staff`, with the sheet and the no-show dialog open; `/admin/appointments`; `/admin/staff`; create and edit drawers; customer Past tab with the new badges (11.3)                                                                                                                                                                                                                                                                                                              | `staff.a11y.spec`, `admin.a11y.spec` (extended), `a11y-appointments.spec` (extended)                                    |
| Manual                    | Req 1 to 10 against the Compose gateway                                                                                                                                                                                                                                                                                                                                                                                                                                         | task F7-T30                                                                                                             |

## Chunk budget (Req 11.5)

Measured by `pnpm size:*` on the F6 build (before F7): initial 165.94 of 250 kB, public 32.86 of 50, book 39.31 of 60, appointments 19.98 of 40, admin 93.81 of 120 kB (gzip). F7 adds:

- **Staff group** (new `--group staff`: the chunks whose entry is under `features/staff/` plus what they import statically, shared chunks counted once). Estimate: `shared/branch-day` (list, actions, sheet, store) about 14 kB, helm sheet and alert-dialog shared with other groups (counted once, perhaps 8 kB if first in this group), gate and page 3 kB, icons 2 kB: about 27 kB. **Proposed budget: 40 kB gzip** (`MAX_GZIP_KB_STAFF`, default added to `GROUP_DEFAULTS`).
- **Admin group.** Adds the appointments page (small, the engine is shared), the staff page, two drawers, the error module, the password pieces (shared chunk, may already be counted in public) and ~8 icons: estimated +18 to +24 kB, giving about 112 to 118 kB, **near the 120 kB limit**. Proposed new admin budget: **140 kB** (about +20 percent), recorded for approval; if the measurement leaves headroom the limit stays at 120 (task F7-T27).
- **Appointments group** (customer): +1 kB (two icons and two branches), stays under 40.
- **Initial bundle**: +about 1.5 kB (`StaffBranchStore`, `createNowSignal`, `timeHm`); limit 250 stays.

## Design decisions

1. **Engine in `shared/branch-day`, not in `features/staff`** (Req 5.3). Two features need it; lint would not stop `admin → staff`, but the layering rule (and F5's precedent of moving forms to `shared/forms`) says shared code is shared.
2. **`StaffBranchStore` in `core/branch/`** (Req 1.2). `StaffShell` (in `shared/layout`) needs the name, and `shared` may import `core` but not `features`.
3. **Moves, not copies** (Req 7.1, 10.1). The password field/checklist/rules and the status badge move to `shared/` with their specs; the original folders import from the new place. A task of its own, done before the chunks start, so no chunk edits another's files.
4. **Reload instead of patching rows** (Req 3.3, 3.5). Simpler and always correct under races; the list is at most a few pages; F4's cancel patches because it has a single-item detail, here the day list is the truth.
5. **`createNowSignal` with one timer for the next start** (Req 3.2). No 1 s polling; works with the injected `CLOCK` and `ManualClock`, matching the "no timed polling" decision for data.
6. **24-hour `HH:mm` through `zonedParts`** (Req 2.4, 3.2). `formatInZone` follows the browser locale (12-hour in some); the requirement writes `HH:mm`, and staff scanning a schedule benefit from one format. The long date uses the browser locale options.
7. **"Available from" shows the date when the day is not today** (Req 3.2). On a future day "Available from 10:30" would mislead; the text becomes "Available from Sat 25 Oct, 10:30". Today's rows read exactly as the requirement says.
8. **Duration in the sheet is `end − start`** (Req 4.1), not the service's `durationMinutes`: always available and equal by construction (slots are generated with the service's duration), and avoids a second lookup failing.
9. **Reactivate `422` action** (Req 9.2). `ToastService.showError` takes an error and has no action button (only `showSuccess` does), so the message is an inline dismissable `role="alert"` banner above the staff list with an "Edit {name}" link to `/admin/staff/{id}`; the toast carries no action. Custom toast texts ("This appointment is no longer available.", "This staff account no longer exists.") are sent as `showError(new AppError(status, text, 'http'))`.
10. **Service names for staff** (Req 2.4). Staff list services through `GET /api/services` (active only for non-admins). An appointment whose service was deactivated shows "Unavailable service" for a staff member, but the real name for an admin. Accepted and listed as a known gap; the backend gives no per-id lookup that works for inactive services for staff.
11. **No route for the detail** (Decisions in requirements): the open row id is a page signal, so Back leaves the page, not the panel. Escape and Close are the exits.
12. **Customers' Past filter in `?pstatus=`** (Req 10.3). A new parameter next to `tab`, parsed in `tab-params.ts`; ignored (and dropped on navigation) on Upcoming; unknown → All. A separate name keeps `status` free of the Upcoming `cancelled=1` switch's semantics.
13. **Staff list reload re-requests all loaded pages** (Req 6.4, 7.2, 9). A reload after create must not collapse "Load more" progress; with 100 per page it is at most a couple of requests.
14. **Edit drawer shows the true current branch even if inactive** (Req 8.1). Otherwise the select would show an empty value for a staff member in a deactivated branch; Save stays disabled until an active branch is chosen.
15. **Mark failure other than 409/404 does not reload** (Req 3.5). Nothing is known to have changed; the toast and the re-enabled buttons let the user retry. A network error inside the no-show dialog keeps the dialog open with the message (ConfirmService behaviour).
16. **Port lane 4307** for F7's Playwright runs (WORKPLAN lanes).

## Open questions

1. **Admin budget.** Resolved 24/10/2026: after chunk C the admin group measured 120.39 kB gzip, so the user approved raising its limit to **140 kB** (applied in F7-T27).
2. **Regenerating types** needs the Compose stack running in Development on `:5290` with the `master` backend; the task stops and reports if the gateway is unreachable rather than hand-writing request types.
