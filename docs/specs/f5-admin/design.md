# F5 Admin console — Design

## Overview

F5 is a single lazy feature, `features/admin/`, mounted as the children of F1's `AdminShell`. Four ideas carry it.

1. **Two catalog stores, one source of truth.** `BranchesStore` and `ServicesStore` (built from one generic `createCatalogStore` factory over `@ngrx/signals`) hold the whole list (`includeInactive=true`, no paging exists). The dashboard, both lists, the slot pickers and the command palette all read them; every mutation writes the server's response back into the store. Filtering, searching and sorting are pure client functions over the store's items.
2. **Routes own the UI state.** Drawers are child routes of their list (`/admin/branches/new`, `/admin/branches/:id`), rendered by a `<router-outlet />` inside the list page, so the list stays mounted behind them. The schedule editor is a sibling page route. Every way out of a dirty form (Close, Escape, backdrop, Back, sidebar, palette) is a router navigation, so **one** `canDeactivate` guard implements the unsaved-changes rule (Req 11) and no component re-implements it.
3. **Pure, backend-mirroring cores.** Validation rules, the `400` message mapper, the schedule model, the slot estimate (a port of the backend's `SlotPlanner`), the "today in the branch zone" arithmetic and the command registry are plain TypeScript with table-driven tests and shared contract fixtures. Components only bind them.
4. **Our own listbox engine.** The time-zone combobox and the command palette share one headless `createListbox()` (query, items, active index, keyboard) with explicit ARIA bindings (Req 5.5, 10.2). Spartan's `command` is not used because its accessibility pattern is not verified against our criteria (focus stays on the input, `aria-activedescendant`), and a hand-written 120-line engine is cheaper to test than to adapt; helm `dialog`, `sheet` and `alert-dialog` supply the modal chrome.

F5 **consumes** F1 (`ApiClient`, `AppError`, `ToastService`, `OutageState`, `SessionStore`, `roleGuard`, `ViewportService`, `CLOCK`, `safeGet/safeSet`, `core/time`, `RateLimitNotice`, the admin shell, `BreadcrumbTrail`, `RouteAnnouncer`) and F2's form pieces. F2 designed `form-field`, `field-a11y`, `field-view`, `form-alert`, `focus-first-invalid`, the generic field rules and the phone helpers under `features/public/`. F5 needs them, and `features` must not import `features`, so they move to `shared/forms/` (and `shared/a11y/` for `focus-heading`). Done before F2 is built, that is a path change in F2's design; after, a mechanical move (Open question 1).

## Architecture

Dependency direction as F0: `features → shared, core`; `shared → core`; `core` imports neither.

| Area                                                    | Contents                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/core/api/`                                     | `availability-api.service.ts` gains the admin methods (below); `models.ts` aliases the generated schema types (`Branch`, `ServiceType`, `WorkingHours`, `GenerateSlotsResult`)                                                                                                  |
| `src/app/core/time/`                                    | new `calendar-date.ts` (calendar-date arithmetic and `todayInZone`) and `zone-math.ts` (`localToUtc`), built on F1's `zoneOffsetMinutes`; exported from `index.ts` (Req 8.4, 8.7)                                                                                               |
| `src/app/shared/forms/` (moved from F2)                 | `form-field.component.ts`, `field-a11y.directive.ts`, `field-view.ts`, `form-alert.component.ts`, `focus-first-invalid.ts`, `field-rules.ts` (`requiredTrimmed`, `maxTrimmed`), `phone.ts` (`normalizePhone`, `isE164`)                                                         |
| `src/app/shared/a11y/`                                  | `focus-heading.directive.ts` (F2, reused for page `<h1>` focus)                                                                                                                                                                                                                 |
| `src/app/shared/ui/`                                    | new helm: `sheet` (F1), `dialog`, `alert-dialog`, `badge`, `skeleton`, `textarea`, `table` (styling directives only); app primitive `confirm-dialog/` (`ConfirmService`, Req 4, 5.8, 11). Existing: `button`, `input`, `label`, `switch`, `card`, `sonner`, `rate-limit-notice` |
| `src/app/shared/layout/admin-shell/` (F1, one addition) | renders a "Search or jump to" button when `PaletteLauncher.available()` (below)                                                                                                                                                                                                 |
| `src/app/core/ui/palette-launcher.ts`                   | tiny root service, the only thing F1's shell knows about the palette (Req 10.1, 10.9)                                                                                                                                                                                           |
| `src/app/features/admin/`                               | everything below                                                                                                                                                                                                                                                                |
| `src/testing/`                                          | `availability-admin-backend.ts` (stateful MSW model), `fixtures/availability-contract.json`, `fixtures/slot-planner-vectors.json`                                                                                                                                               |
| `e2e/`                                                  | `admin.spec.ts`, `admin.a11y.spec.ts`, `support/mock-admin-api.ts` (extends F1's `mock-api.ts` with an Admin login)                                                                                                                                                             |
| `scripts/size.mjs`                                      | gains `--group admin` (Chunk budget)                                                                                                                                                                                                                                            |

```
src/app/features/admin/
  admin.routes.ts                  # route table (below), providers for the three stores
  admin-frame.component.ts         # <router-outlet/> + <app-command-palette/>; registers the launcher, key listener; resets stores on destroy
  titles.ts                        # page titles, one place
  validation/
    messages.ts                    # every user-visible validation string, one place (client wording)
    branch-rules.ts                # pure: code, name, description, address, phone  (+ normaliseCode)
    service-rules.ts               # pure: code, name, description, duration
    schedule-rules.ts              # pure: time format, opens < closes, zone required
    generation-rules.ts            # pure: dates, span, capacity
    validators.ts                  # ValidatorFn wrappers
    server-messages.ts             # known backend texts -> field (Error mapping)
    parse-validation-detail.ts     # splitValidationDetail(detail, known)
  data/
    catalog-store.ts               # createCatalogStore<T>() factory
    branches.store.ts / services.store.ts / slot-activity.store.ts
    reload-on-recovery.ts          # effect helper on OutageState.recovered
    resolvers.ts                   # branchCrumb, serviceCrumb (breadcrumb data), guid check
  shared/
    list-view.ts                   # createListView(): search, status filter, sort signals + URL sync
    sort-header.component.ts       # <th> button, aria-sort
    status-badge.component.ts      # icon + text
    list-states.component.ts       # skeleton / error+retry / empty / no-match
    drawer-frame.component.ts      # sheet chrome; closeRequested output; focus return
    drawer-focus.ts                # captures the opener, restores focus on destroy
    status-confirm.component.ts    # activate/deactivate confirmation body
    dirty/
      dirty-form.ts                # interface DirtyForm { isDirty(): boolean }
      unsaved-changes.guard.ts     # CanDeactivateFn<DirtyForm>
      before-unload.ts             # registerBeforeUnload(isDirty: Signal<boolean>)
    listbox/
      create-listbox.ts            # headless engine (pure state + keyboard)
      listbox-aria.ts              # id helpers for option ids
  dashboard/        dashboard.page.ts / .html, stat-card.component.ts, needs-attention.component.ts
  branches/
    branches.page.ts / .html       # table (md+) or cards, outlet for the drawer
    branch-drawer.component.ts / .html
    branch.form.ts                 # typed form factory + dirty snapshot
    branch-error.ts                # mapBranchError(AppError): BranchOutcome
  services/                        # same shape: services.page, service-drawer, service.form.ts, duration-stepper.component.ts, service-error.ts
  schedule/
    schedule.page.ts / .html
    schedule.form.ts               # 7-row FormArray + zone control, dirty snapshot, toRequest(), fromBranch()
    schedule-day-row.component.ts
    time-zone-combobox.component.ts  # ControlValueAccessor over createListbox()
    zone-options.ts                # buildZoneOptions(now), filterZones(query)
    schedule-error.ts
  slots/
    slots.page.ts / .html
    generation.form.ts
    slot-estimate.ts               # estimateSlots(): mirror of SlotPlanner
    generate-error.ts              # mapGenerateError(AppError): GenerateOutcome
    result-card.component.ts
  palette/
    command-palette.component.ts / .html   # dialog + combobox
    command-registry.ts            # pure: buildCommands(), filterCommands(), group
    shortcut.ts                    # isPaletteShortcut(e), platformKeyLabel()
```

## Components and interfaces

### Routes (Req 9)

`app.routes.ts` keeps `/admin` as F1's `AdminShell` with `loadChildren: () => import('./features/admin/admin.routes')`. Inside:

```ts
// admin.routes.ts
export default [
  {
    path: '',
    component: AdminFrame,
    providers: [BranchesStore, ServicesStore, SlotActivityStore],
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: dashboard,
        title: 'Dashboard',
        data: { breadcrumb: 'Dashboard' },
      },
      // The schedule route precedes `branches` so `branches/:id/schedule` is never swallowed by the drawer child `:id`.
      {
        path: 'branches/:id/schedule',
        loadComponent: schedule,
        title: 'Schedule',
        resolve: { breadcrumb: branchCrumb },
        canDeactivate: [unsavedChangesGuard],
      },
      {
        path: 'branches',
        loadComponent: branchesPage,
        title: 'Branches',
        data: { breadcrumb: 'Branches' },
        children: [
          {
            path: 'new',
            loadComponent: branchDrawer,
            title: 'New branch',
            data: { breadcrumb: 'New branch' },
            canDeactivate: [unsavedChangesGuard],
          },
          {
            path: ':id',
            loadComponent: branchDrawer,
            title: 'Edit branch',
            resolve: { breadcrumb: branchCrumb },
            canDeactivate: [unsavedChangesGuard],
          },
        ],
      },
      { path: 'services' /* same shape */ },
      {
        path: 'slots',
        loadComponent: slots,
        title: 'Generate slots',
        data: { breadcrumb: 'Slot generation' },
        canDeactivate: [unsavedChangesGuard],
      },
    ],
  },
] satisfies Routes;
```

- Role guarding is F1's (`authGuard`, `roleGuard('Admin')` with `canActivateChild` on the `/admin` parent); F5 adds none (Req 9.5).
- **Drawer outlet.** `BranchesPage`'s template ends with `<router-outlet />`; the `new` and `:id` children render there, over the list that stays mounted (Req 9.2). The list's query parameters (`q`, `status`) survive because closing navigates with `router.navigate(['..'], { relativeTo, queryParamsHandling: 'preserve' })`; opening uses `[routerLink]="['new']" queryParamsHandling="preserve"`. The list page's own resources are keyed on nothing in the URL (the whole list is loaded once), so child navigation never reloads it (Req 9.2).
- **Titles and breadcrumbs.** The F1 `AppTitleStrategy` formats `title`. `branchCrumb` is a `ResolveFn<string>` that calls `BranchesStore.ensure(id)` (deduplicated in-flight) and returns the branch name, or `'Branch'` when unknown. It writes `data['breadcrumb']`, which F1's `BreadcrumbTrail` already reads, so F1 needs no change (Req 5.1). A resolver that fails never blocks navigation (it catches and returns the fallback).
- **GUID check (Req 9.3).** `isGuid(id)` (`/^[0-9a-f]{8}-…$/i`) in the drawer and schedule components; a non-GUID sets `notFound` before any request.
- **Same-route param change** (palette "Edit branch: B" while the drawer for A is open): `runGuardsAndResolvers` defaults to `paramsChange`, which makes Angular run `canDeactivate` on the reused component too, so a dirty drawer still prompts. A test asserts it (Req 11.2).
- **Sidebar active state (Req 9.4):** F1's links use `routerLinkActive` without `exact`, so `/admin/branches/new` keeps "Branches" active; the dashboard link is `exact`.

### Admin frame and palette launcher (Req 10.1, 10.9)

`PaletteLauncher` (`core/ui/`, root): `available = signal(false)`, `requests = signal(0)`, `request(): void` (increments). The F1 `AdminShell` renders `@if (launcher.available()) { <button … (click)="launcher.request()">Search or jump to <kbd>{{ keyLabel }}</kbd></button> }` (a few lines in F1; the key label is `platformKeyLabel()`).

`AdminFrame` (the feature's only eager-in-chunk component): sets `available.set(true)` on init and `false` on destroy; an `effect` opens the palette on each `requests` change; registers the global listener with `fromEvent<KeyboardEvent>(document, 'keydown')` filtered by `isPaletteShortcut`, torn down by `takeUntilDestroyed` (Req 10.9); resets the three stores in `DestroyRef.onDestroy`, so a logout or a different admin signing in never sees stale data (route environment injectors outlive navigation, so the store state would otherwise persist).

### Data stores (Req 1, 2, 6, 9.2)

```ts
// catalog-store.ts
export interface CatalogState<T> { items: T[]; status: 'idle' | 'loading' | 'loaded' | 'error'; error: AppError | null; loadedAt: number | null }
export function createCatalogStore<T extends { id: string; isActive: boolean }>(opts: {
  list: () => Observable<T[]>;            // GET …?includeInactive=true
  get: (id: string) => Observable<T>;
  sortKey: (t: T) => string;
}) → signalStore with:
  computed: active, inactive, byId(id)
  methods:
    load(opts?: { force?: boolean }): Promise<void>   // dedups an in-flight load; stale-while-revalidate: keeps items while status 'loading'
    ensure(id: string): Promise<T | null>             // store hit, else GET /{id}; 404 -> null; upserts
    upsert(item: T): void                              // after create/update/schedule/activate responses
    setActive(id: string, isActive: boolean): void     // after 204 (the response has no body)
    reset(): void
```

- `BranchesStore` binds `list = api.listBranches({ includeInactive: true })`, `ServicesStore` likewise. A list or dashboard page calls `load()` on entry: first visit shows skeletons; later visits show the cached rows immediately and refresh in the background (a `loading` status with items does not show skeletons). A failed refresh with items keeps them and shows the inline error only when there are none; otherwise a toast via `handleError` is not shown (the F1 outage banner covers outages).
- `reloadOnRecovery(store)` is `effect(() => { outage.recovered(); untracked(() => store.load({ force: true })); })` skipping the first run (Req 1.7, 2.9).
- `SlotActivityStore`: `{ createdThisSession: number }`, `add(n)`, `reset()`; in memory only (Req 1.6).
- `isActive` after a `204` is set from the intent (`setActive`), not read back, because the endpoints return no body (Req 4.3, 4.7). The next `load()` reconciles.

### API calls (core/api)

`AvailabilityApiService` additions, all through `ApiClient` with generated types (path casing follows the generated `paths` keys, F1 Open question 2):

```ts
listBranches(o: { includeInactive: boolean }): Observable<Branch[]>             // GET  /api/branches?includeInactive=
getBranch(id: string): Observable<Branch>                                       // GET  /api/branches/{id}
createBranch(b: CreateBranchBody): Observable<Branch>                           // POST /api/branches            201
updateBranch(id: string, b: UpdateBranchBody): Observable<Branch | void>        // PUT  /api/branches/{id}
setSchedule(id: string, b: { timeZoneId: string; workingHours: WorkingHoursBody[] }): Observable<Branch> // PUT …/schedule 200
setBranchActive(id: string, active: boolean): Observable<void>                  // POST …/activate|deactivate 204
listServices / getService / createService / updateService / setServiceActive    // same shapes against /api/services
generateSlots(b: GenerateSlotsBody): Observable<{ createdCount: number; skippedCount: number }> // POST /api/slots/generate 200
```

`updateBranch` and `updateService` return whatever the generated schema says (the controller was not read for the success body); the store `upsert`s the response when it is a record and otherwise refetches that one item with `ensure(id, { force: true })`. No method sets `Idempotency-Key` (F1 Req 1.5). `listBranches` passes `includeInactive` as the query string through `ApiClient`'s `params`.

### List view and presentational atoms (Req 2, 6.2)

**Decision: per-entity table templates over a shared headless view, not a generic `DataTable<T>`.** Two entities with different cells (Schedule column, Duration column) and different row actions do not repay a column-definition API, and per-entity templates keep native `<table>` semantics and the card layout trivially accessible.

```ts
// list-view.ts
export interface ListView<T> {
  readonly q: WritableSignal<string>;
  readonly status: WritableSignal<'all' | 'active' | 'inactive'>;
  readonly sort: WritableSignal<{ key: string; dir: 'asc' | 'desc' } | null>; // null = default (name asc)
  readonly rows: Signal<T[]>; // filtered then sorted
  readonly total: Signal<number>;
  readonly announcement: Signal<string>; // "{n} branches shown", debounced 400 ms, settled changes only
  readonly state: Signal<'loading' | 'error' | 'empty' | 'no-match' | 'ready'>;
}
export function createListView<T>(opts: {
  items: Signal<T[]>;
  status: Signal<CatalogStatus>;
  searchText: (t: T) => string; // lower-cased haystack: code, name, address, phone
  sorters: Record<string, (a: T, b: T) => number>; // built on Intl.Collator('…', { sensitivity: 'base', numeric: true })
  noun: string; // 'branches' | 'services' for the announcement
}): ListView<T>;
```

- `q` and `status` are synced with the URL by `syncQueryParams(view)` (reads `ActivatedRoute.queryParamMap` once, writes with `router.navigate([], { queryParams, queryParamsHandling: 'merge', replaceUrl: true })`, debounced 150 ms). An unknown `status` value parses to `'all'` (Req 2.3).
- Sorting: header click cycles `asc → desc → null`; the stable sort relies on `Array.prototype.sort` being stable (ES2019) with the original store order as the tiebreaker (Req 2.4).
- `announcement` is a `toSignal` of `debounceTime(400)` over `rows().length` plus `noun`, writing only when the count changes (Req 2.7).
- Atoms: `SortHeader` (`<th [attr.aria-sort]>` containing a `<button>` whose accessible name is "Sort by Name"), `StatusBadge` (lucide `circle-check` or `circle-off` plus text), `ListStates` (skeleton rows with `aria-busy`, error with Retry, empty with a projected CTA, no-match with "Clear filters").
- **Responsive (Req 2.8, 12.5):** pages read `ViewportService.isMd()` (F1) and `@if (isMd()) { <table> } @else { <ul> cards }`, with a labelled `<select>` for sorting in the card layout. Rendering one or the other (not both) avoids duplicate content for assistive technology and works under jsdom, where media queries are not evaluated. Row actions: Edit and Schedule are links, Activate/Deactivate a button; below `md` the actions sit in a flex row of 44 px targets (no menu needed).

### Drawers (Req 3, 7, 4.6)

`DrawerFrame` wraps the helm `sheet` (brain dialog based: focus trap, `aria-modal`, Escape and backdrop events). The sheet is **always open while the component exists**; Escape, backdrop and the Close button only emit `closeRequested`, and the page's handler is `router.navigate(['..'], …)`. The `canDeactivate` guard decides; the sheet never self-dismisses, so a dirty form cannot be lost by a stray Escape (Req 3.1, 11.4).

```ts
@Component({ selector: 'app-drawer-frame', … })
export class DrawerFrame { title = input.required<string>(); closeRequested = output<void>(); }
```

`DrawerFocus` (`drawer-focus.ts`): in the drawer component's constructor, `const opener = document.activeElement as HTMLElement | null` (still the clicked link or button, because routing renders after the click and focus has not moved); in `onDestroy`, if `opener?.isConnected` it focuses it, else it focuses the page's `<h1>` (`[appFocusHeading]` target). Focus into the first field is `afterNextRender` plus `focusFirstInvalid` on submit (Req 3.1, 3.5). A deep link has no meaningful opener (`document.body`), so the heading fallback applies.

`BranchDrawer`: creates the form with `createBranchForm(mode)`; in edit mode reads `:id`, validates the GUID, then `store.ensure(id)`; while loading it shows a skeleton form, on `null` the not-found state (Req 3.10). Mode is derived from the route (`new` has no `:id`). Save flow:

```text
submit -> submitAttempted.set(true); if invalid -> focusFirstInvalid; return
pending.set(true)   // fields readOnly, button disabled + aria-busy; a guard `if (pending()) return` blocks a second call
create/update -> on success: store.upsert(branch); form.markPristine(); toast; router.navigate(['..'], preserve)   // pristine, so the guard passes (Req 11.5)
              -> on AppError: mapBranchError(e) -> outcome (below); finally pending.set(false) unless navigating
```

The drawer implements `DirtyForm` (`isDirty = () => !form.pristine && snapshotChanged()`), where `snapshotChanged` compares the normalised current values to the initial values, so typing and deleting back to the original returns to pristine (Req 11.1). `ServiceDrawer` is the same with the duration stepper.

**`DurationStepper`** (`ControlValueAccessor<number>`): a text input `inputmode="numeric"` with `-`/`+` buttons (`aria-label` "Decrease duration" / "Increase duration"), ArrowUp/ArrowDown handlers adding ±5 clamped to 5..480, buttons `disabled` at the bounds, a visible "minutes" unit and an `aria-live="off"` echo `formatDuration(v)`. A non-multiple of 5 is never rounded; the control's validator reports it on blur (Req 7.3). **Preset chips** are `<button type="button" aria-pressed>` in a `role="group"` labelled "Common durations"; they set the control value and keep focus (Req 7.4).

### Activate and deactivate (Req 4, 6.3)

`ConfirmService` (`shared/ui/confirm-dialog/`) wraps the helm `alert-dialog`:

```ts
confirm(opts: { title: string; body: TemplateRef<unknown> | string; confirmLabel: string; destructive?: boolean;
                initialFocus?: 'cancel' | 'confirm'; run?: () => Promise<void> }): Promise<boolean>
```

- It keeps one in-flight dialog: a second call while one is open returns the same promise (Req 11.6).
- With `run`, the confirm button stays in the dialog, shows `aria-busy` and `disabled` while `run()` is pending, and the dialog closes only when `run` resolves; if it rejects, the dialog stays open and shows the `AppError` message inline in a `role="alert"` region (Req 4.3, 4.5). Without `run` (the unsaved-changes and all-closed cases) it resolves on click.
- Initial focus is **Cancel** for destructive confirmations and "Keep editing" for the guard (Req 4.1, 11.2).

`StatusConfirm` builds the wording from the entity and direction (branch deactivate, branch activate with the no-schedule warning, service deactivate, service activate), using the guaranteed-effects wording of Req 4.1 and 6.3. The page's handler: `await confirm({ …, run: () => firstValueFrom(api.setBranchActive(id, false)) })`, then `store.setActive`, toast "{name} is now inactive", and `restoreFocus(rowButton)`; a `404` closes the dialog, toasts "That branch no longer exists" and `store.load({ force: true })` (Req 4.5).

### Validation (Req 3.4, 5.3, 7.2, 8.5, 8.6)

All rules are pure functions returning an error key or `null`; messages live only in `messages.ts` (the F2 pattern). The client wording equals the backend's wherever the backend has a message (Req 3.4); the exception is the phone, which keeps F2's friendlier client text (the backend says "Invalid phone number format.").

| Rule module           | Rules (key)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `branch-rules.ts`     | `normaliseCode(v) = v.trim().toUpperCase()` (mirrors `Branch.NormaliseCode`; `toUpperCase` is locale-insensitive, matching `ToUpperInvariant` for ASCII, and codes are ASCII-only by the pattern); `code`: `required`, `pattern` on the trimmed value `^[A-Za-z0-9](?:[A-Za-z0-9-]{0,8}[A-Za-z0-9])$`; `name`: `required` (trimmed non-empty), `maxlength` 100; `description`: `maxlength` 500 (untrimmed length, as the backend validates before trimming); `address`: `required`, `maxlength` 200; `phone`: `required`, `pattern` on `normalizePhone(v)` via `isE164` |
| `service-rules.ts`    | code `^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,28}[A-Za-z0-9])$`; name, description as branch; `duration`: integer (`range` if not an integer or outside 5..480, `step` if `% 5 !== 0`)                                                                                                                                                                                                                                                                                                                                                                                           |
| `schedule-rules.ts`   | `timeFormat(v)` `^([01]\d                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | 2[0-3]):[0-5]\d$`; `opensBeforeCloses(a, b)`compares minutes;`zoneRequired` |
| `generation-rules.ts` | `dateRange(from, to)`: `order` if `to < from`, `span` if `diffDays(from, to) > 30`; `capacity`: integer 1..100                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

- `validators.ts` wraps them as `ValidatorFn`s with the backend's ordering (`required` first, so one message per field; the first failing rule wins).
- The code field uses `maxlength="10"` for branches and `"30"` for services on the `<input>` as a convenience only; the validator still trims before matching, so `" pg "` is accepted and previewed as `PG` (Req 3.4). The preview line (`aria-live="off"`, in the hint) is `Will be saved as {normaliseCode(v)}` when the value is valid.
- The description counter is `{remaining}` text updated on input and carries no live region (Req 3.4).
- Forms are typed `FormGroup`s with `nonNullable` controls, `novalidate`, and `FieldView`s from `shared/forms` (Req 3.5).

**Schedule form** (`schedule.form.ts`): `FormGroup({ timeZoneId: FormControl<string>, days: FormArray<FormGroup<{ day: FormControl<DayName>; open: FormControl<boolean>; opensAt: FormControl<string>; closesAt: FormControl<string> }>> })`, always seven rows in `DAYS = ['Monday', …, 'Sunday']`. A row group validator reports `timeRequired`, `timeFormat` or `order` only while `open` is true. `fromBranch(b)` builds the rows (days absent from `b.workingHours` are closed; times are normalised to `HH:mm` by `slice(0, 5)`, since the backend may serialise `TimeOnly` with seconds, see Open question 5). `toRequest()` emits only open days, in Monday-first order, `{ dayOfWeek, opensAt, closesAt }`, so a day never repeats (Req 5.3, 5.7). `copyMondayToWeekdays()` copies Monday's three values to rows 1 to 4 and `markAsDirty()`; it is disabled while Monday is closed or invalid (Req 5.4). `closeAll()` sets every `open` false.

Time inputs are `<input type="time" step="300">`; its `value` is always `HH:mm` (or `HH:mm:ss` if a user agent adds seconds, normalised by the same `slice`), independent of how the browser displays it. Where the browser shows 12-hour text the stored value is still 24-hour, which satisfies Req 5.2 (the contract) even if the visible clock follows locale; Known gap.

### Server error mapping (Req 3.8 to 3.9, 5.9, 8.10, 8.11)

One module, `server-messages.ts` + `parse-validation-detail.ts`, shared by the three form areas.

**The comma problem.** The backend joins messages with a bare `,`, and some of its own messages contain commas ("Code must be 2-10 letters, digits or hyphens, and cannot start or end with a hyphen."), so a plain `split(',')` would shred a known message. The parser therefore matches known messages first:

```ts
export const VALIDATION_PREFIX = 'Invalid request data. Errors: ';
export function splitValidationDetail(detail: string, known: readonly string[]): string[] {
  if (!detail.startsWith(VALIDATION_PREFIX)) return [detail];
  const body = detail.slice(VALIDATION_PREFIX.length);
  const byLength = [...known].sort((a, b) => b.length - a.length); // longest first
  const out: string[] = [];
  for (let i = 0; i < body.length;) {
    const hit = byLength.find(
      (m) => body.startsWith(m, i) && (i + m.length === body.length || body[i + m.length] === ','),
    );
    const end = hit
      ? i + hit.length
      : body.indexOf(',', i) === -1
        ? body.length
        : body.indexOf(',', i);
    out.push(body.slice(i, end));
    i = end + 1; // skip the joining comma
  }
  return out.filter(Boolean);
}
```

A known message is consumed whole when it ends at a comma or the end of the string; any other text is taken up to the next comma and reported as unknown. This gives exact behaviour for every message the client knows and a graceful degradation for the rest (Req 3.9, Known gap kept: **no backend error codes are introduced**).

**Known messages and their fields** (copied verbatim from the validators; `known` for each form is the union of its rows):

| Backend message                                                                                                                                                                                                                                                                      | Form       | Field                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | --------------------------------------- |
| "Code is required." / "Code must be 2-10 letters, digits or hyphens, and cannot start or end with a hyphen."                                                                                                                                                                         | branch     | `code`                                  |
| "Code is required." / "Code must be 2-30 letters, digits, hyphens or underscores, and cannot start or end with a hyphen or underscore."                                                                                                                                              | service    | `code`                                  |
| "Name is required." / "Name cannot exceed 100 characters."                                                                                                                                                                                                                           | both       | `name`                                  |
| "Description cannot exceed 500 characters."                                                                                                                                                                                                                                          | both       | `description`                           |
| "Address is required." / "Address cannot exceed 200 characters."                                                                                                                                                                                                                     | branch     | `address`                               |
| "Phone number is required." / "Invalid phone number format."                                                                                                                                                                                                                         | branch     | `phoneNumber`                           |
| "Duration must be between 5 and 480 minutes." / "Duration must be a multiple of 5 minutes."                                                                                                                                                                                          | service    | `durationMinutes`                       |
| "Time zone must be an IANA time zone identifier, such as 'Asia/Colombo'."                                                                                                                                                                                                            | schedule   | `timeZoneId`                            |
| "A day of the week can be listed only once." / "Day of week is not valid." / "Opening time must be a 24-hour time in the form HH:mm." / "Closing time must be …" / "Opening time must be before closing time." / "Working hours are required; use an empty list to close every day." | schedule   | alert (a message cannot name which day) |
| "Branch id is required." / "Service type id is required."                                                                                                                                                                                                                            | generation | `branchId` / `serviceTypeId`            |
| "From date cannot be after to date." / "The date range cannot span more than 31 days."                                                                                                                                                                                               | generation | `toDate`                                |
| "Capacity must be between 1 and 100."                                                                                                                                                                                                                                                | generation | `capacity`                              |

`mapServerValidation(detail, table): { fields: Record<string, string>; unmapped: string[] }` uses the table; the form applies `fields` as server errors on the `FieldView` (cleared when the value changes, F2) and puts `unmapped` in the `FormAlert` (Req 3.9). A **contract test** loads `fixtures/availability-contract.json`, which lists every message above with the C# source file and rule it came from, and asserts that (a) every table entry is present in the fixture and (b) every client message that claims to mirror the backend equals it. Both the table and the MSW backend read the same fixture, so a backend wording change is one fixture edit and a failing test, not a silent mismatch.

**Per-form outcome mappers** (the F2 pattern; pure, `AppError → Outcome`):

| Condition                         | `AppError.status` / kind          | Outcome / UI                                                                                                                                                      |
| --------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch create `409`               | 409                               | field error on `code`: "A branch with code {NORMALISED} already exists." (normalised from the **sent** code, not parsed from `detail`), focus the field (Req 3.8) |
| Service create `409`              | 409                               | same, "A service with code {CODE} already exists." (Req 7.5)                                                                                                      |
| `400` validation                  | 400                               | `mapServerValidation`; fields plus alert; focus first mapped field or the alert (Req 3.9)                                                                         |
| `404` on edit / status / schedule | 404                               | close, toast "That branch no longer exists", `store.load({ force: true }) ` (Req 3.10, 4.5)                                                                       |
| `403`                             | 403 `http`                        | `ToastService.handleError` (Req 9.5); form stays open                                                                                                             |
| network, timeout, 502/503/504     | `network`/`timeout`/`unavailable` | form stays, values kept, re-enabled; the F1 banner shows (Req 3.11)                                                                                               |
| `429`                             | `rate-limited`                    | `createRetryCountdown().startFrom(e)`, Save disabled, `RateLimitNotice` (Req 3.11)                                                                                |
| other                             | any                               | inline alert with the F1 message plus reference                                                                                                                   |

`mapGenerateError` (Req 8.10), by status then `detail` pattern:

| Status, detail                                    | Outcome (inline `role="alert"`)                                                                                | Link / action                                              |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 409 matches `/has no working hours\.$/`           | "This branch has no schedule"                                                                                  | **Set a schedule** → `/admin/branches/{branchId}/schedule` |
| 409 matches `/^Branch '.*' is inactive\.$/`       | "This branch is inactive"                                                                                      | **Activate it** → `/admin/branches?status=inactive`        |
| 409 matches `/^Service type '.*' is inactive\.$/` | "This service is inactive"                                                                                     | **Activate it** → `/admin/services?status=inactive`        |
| 409 matches `/concurrent request/`                | "Another generation for this branch and service was running at the same time. Check the result and try again." | **Try again** (manual)                                     |
| 404 matches `/^Branch /` / `/^Service type /`     | "That branch/service no longer exists"                                                                         | pickers reload                                             |
| 409 other                                         | the server `detail` unchanged                                                                                  | none                                                       |
| 400                                               | `mapServerValidation`                                                                                          | fields / alert                                             |

The ids come from the form values at submit time (never from `detail`). Patterns are anchored to the backend's `SlotErrors`/`BranchErrors` texts and are listed in the contract fixture, so wording drift fails the contract test.

### Dashboard (Req 1)

`DashboardPage` calls `branches.load()` and `services.load()` (parallel, independent statuses) and reads computed `active`, `inactive` and `total` from each store. `StatCard` (`<a routerLink [queryParams]>` with `aria-label` "{label}: {n} of {total}") shows a skeleton on its own store's `loading` without items and an inline error with Retry on its own `error` (Req 1.3). `NeedsAttention` is `computed(() => branches.active().filter(b => !b.timeZoneId || b.workingHours.length === 0))`. "Generate slots" gets a note from `branches.active().length === 0 || services.active().length === 0`. The session figure reads `SlotActivityStore` and shows "No slots generated yet" while `createdThisSession() === 0 && !everGenerated` (a separate `generations` counter, so a run that created 0 slots is distinguishable from none, Req 1.6). `reloadOnRecovery` is applied to both stores (Req 1.7). Grid: `grid-cols-1 sm:grid-cols-2 xl:grid-cols-4` (Req 1.8).

### Schedule page (Req 5)

`SchedulePage` reads `:id`, validates the GUID, `branches.ensure(id)`, builds `scheduleForm.fromBranch(branch)` once the branch is available, and re-seeds only on a successful save (never while the user is editing, so a background `load()` cannot overwrite changes). Each row is `ScheduleDayRow` (`@if (isMd()) grid row else card`): a `hlm-switch` with `aria-label="Open on {day}"`, two `type="time"` inputs labelled "{day} opens" and "{day} closes", and a per-row error `<p id>` linked by `aria-describedby`. The all-closed save goes through `ConfirmService` (Req 5.8). A successful `setSchedule` response is `upsert`ed, the form re-seeded and marked pristine (Req 5.7). `DirtyForm.isDirty` compares `JSON.stringify(toRequest())` plus the zone to the loaded snapshot.

**Time-zone combobox** (`TimeZoneCombobox`, `ControlValueAccessor<string>`): the input is `role="combobox" aria-expanded aria-controls="{id}-list" aria-autocomplete="list" aria-activedescendant="{id}-opt-{n}"`, the popup is an absolutely positioned `role="listbox"` below it (no overlay: the schedule page has no clipping ancestor). Behaviour comes from `createListbox` (below). `zone-options.ts`:

```ts
export interface ZoneOption {
  id: string;
  offsetMinutes: number;
  offsetLabel: string;
  label: string;
  haystack: string;
  browser?: boolean;
}
export function buildZoneOptions(now: Date): ZoneOption[];
//  ids = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : FALLBACK_ZONES (≈40 common ids)
//  offsetMinutes = zoneOffsetMinutes(id, now)  (F1)           -> "UTC+05:30" via formatOffset()
//  label = `${id}, ${offsetLabel}`; haystack = lower-case id with '_' -> ' ' and '/' kept, plus the offset text
export function filterZones(
  options: ZoneOption[],
  query: string,
  limit = 100,
): { items: ZoneOption[]; truncated: boolean };
```

- Options are built **lazily on first open and memoised for the page** (about 420 zones; one cached `Intl.DateTimeFormat` per zone, a few tens of ms), not at startup. The offsets are for `CLOCK.now()`, so they reflect daylight saving now (Req 5.5).
- The browser's zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) is added as the first option with `browser: true` and the label suffix "Your browser's zone" when the field is empty (Req 5.6), and never preselected.
- Filtering: split the normalised query into words; every word must be a substring of the haystack; rank exact-prefix of the city part first, then by id. At most 100 options render; a `role="status"` line "Keep typing to narrow the list" shows when `truncated`.
- Only list members are accepted: the control value is set on option selection; typing alone leaves the previous value and shows "Choose a time zone." on blur if none selected (Req 5.5).
- The selected value displays as `label` (id plus offset) in the input when closed; the accessible name is "Time zone" and the offset is part of the visible value.

**`createListbox`** (`shared/listbox/create-listbox.ts`): headless; used by both comboboxes.

```ts
export interface Listbox<T> {
  readonly query: WritableSignal<string>;
  readonly open: WritableSignal<boolean>;
  readonly items: Signal<readonly T[]>; // supplied by the caller's filter
  readonly activeIndex: Signal<number>; // -1 when none
  readonly activeId: Signal<string | null>; // `${prefix}-opt-${index}` for aria-activedescendant
  onKeydown(e: KeyboardEvent): void; // ArrowDown/Up (wrap), Home/End, Enter (select active), Escape (close), PageDown/Up (±10)
  select(index: number): void; // emits `selected`
  readonly selected: OutputEmitterRef<T>;
}
export function createListbox<T>(opts: {
  items: Signal<readonly T[]>;
  idPrefix: string;
  wrap?: boolean;
}): Listbox<T>;
```

Focus never leaves the input; the active option is scrolled into view with `scrollIntoView({ block: 'nearest' })` in an `effect` (skipped under `prefers-reduced-motion` for smooth behaviour, which is not used anyway). `activeIndex` resets to 0 when `items` changes and to -1 when empty (Req 10.5). The active option has `aria-selected="true"`, a `bg-accent` background plus a left `border-l-2 border-primary` marker (more than colour, Req 10.5).

### Slot generation (Req 8)

`SlotsPage` with `generation.form.ts`: `branchId`, `serviceTypeId`, `fromDate`, `toDate`, `capacity` (default 1). Pickers are native `<select>`s (helm-styled), populated from `branches.active()` and `services.active()` (Req 8.2); `?branchId` and `?serviceId` preselect only when the id is in the active list. The empty states, the inactive note and links are template conditions.

**Dates in the branch zone.** F5 adds `core/time/calendar-date.ts` (pure; calendar dates are `yyyy-MM-dd` strings, arithmetic through `Date.UTC` numbers and `fromEpochMs`, so the F1 lint rule is respected):

```ts
export function todayInZone(timeZoneId: string, nowMs: number): string; // Intl.DateTimeFormat('en-CA', { timeZone, year, month, day }).formatToParts; invalid zone -> UTC
export function addDays(date: string, n: number): string;
export function diffDays(from: string, to: string): number; // to - from, calendar days
export function weekdayOf(date: string): DayName; // via getUTCDay on the UTC midnight of that calendar date
export function eachDate(from: string, to: string): string[]; // inclusive
```

- `fromDate` input: `min = todayInZone(tz, clock.now())`; `toDate` input: `min = fromDate`, `max = addDays(fromDate, 30)`; native `<input type="date">` disables out-of-range dates in the picker and exposes `validity` too (Req 8.5). The inputs are `disabled` with a hint until a branch is chosen (Req 8.4). The label states the zone and `formatOffset(zoneOffsetMinutes(tz, now))`.
- Changing `fromDate` does not silently rewrite `toDate`: an out-of-range `toDate` simply shows the span error (Req 8.5). Quick ranges ("Next 7/14/30 days") set `from = today`, `to = addDays(today, n - 1)` (so "Next 30 days" is exactly 30 dates, within the cap).
- The strings are sent unchanged (Req 8.4).

**Estimate (`slot-estimate.ts`)**: a port of `SlotPlanner.Plan`. It returns what the backend would **create before overlap checks**:

```ts
export interface Estimate {
  days: number;
  slots: number;
  closedDays: number;
  droppedPast: number;
}
export function estimateSlots(i: {
  timeZoneId: string;
  hours: readonly { dayOfWeek: DayName; opensAt: string; closesAt: string }[];
  durationMinutes: number;
  fromDate: string;
  toDate: string;
  nowMs: number;
}): Estimate;
```

```text
byDay = map dayOfWeek -> { opens, closes } in minutes since midnight          // as WorkingHours.OpensAt/ClosesAt
for date in eachDate(from, to):                                               // days = count
  h = byDay[weekdayOf(date)]; if none: closedDays++, continue                  // planner: `continue`
  for start = h.opens; start + duration <= h.closes; start += duration:        // identical loop bounds (no wrap past midnight)
     (fast path)  if date is neither today-in-zone nor a transition day -> slots += floor((closes - opens) / duration); break
     (exact path) r = localToUtc(tz, date, start)                              // see below
                  if r.gap -> continue                                         // "a time skipped by a clock change does not exist"
                  if r.utcMs <= nowMs -> droppedPast++; continue                // planner: startUtc <= nowUtc
                  slots++
```

- **Fast path vs exact path.** The exact path needs a time-zone offset per candidate (a `formatToParts` call), and a 31-day range can hold ~9 000 candidates, so it is used only on days where the answer can differ from the closed form: today in the branch zone (the "already started" cut-off) and **transition days** (the zone's offset at 00:00 differs from the offset at 23:59 local). All other days use `floor((closes - opens) / duration)`, which is exactly the planner's loop count. Offsets are probed twice per day (cheap, memoised per date).
- **`localToUtc(tz, date, minuteOfDay)`** (`core/time/zone-math.ts`): `local = Date.UTC(y, m-1, d, 0, minute)` (the wall time read as UTC); `o1 = zoneOffsetMinutes(tz, local - o0*60000)` iterated twice (`o0 = offsetAt(local)`) to a fixed point; `gap` when the round trip `local - o*60000 + offsetAt(...)*60000 !== local`; for an **ambiguous** time (two valid offsets) it picks the **smaller offset (standard time)**, as .NET's `ConvertTimeToUtc` does. Result `{ gap: boolean; utcMs: number }`. The end is not needed for the estimate; the backend adds the duration in UTC.
- It is deliberately an **estimate**: it does not know existing overlapping slots (`skippedCount`) or the server's clock, and `Intl` and .NET tzdata can differ (Known gaps). The result card shows the server's counts (Req 8.7, 8.9).
- **Preview text** is built from `Estimate`: "{days} day(s), about {slots} slots estimated", "{closedDays} closed day(s) in this range" when > 0, and "slots that have already started today are not created" when `droppedPast > 0` (Req 8.7). `slots === 0` shows "No slots would be created: …" and **Generate stays enabled** (Approved resolution 6). The preview recomputes in a `computed` over the form values (cheap: the fast path is O(days)) and its status region is updated through a debounced signal (300 ms) so typing in a date input does not announce per keystroke.
- **Contract vectors.** `fixtures/slot-planner-vectors.json` holds cases (zone, hours, duration, range, `nowUtc`, expected `created` before overlaps) generated by a one-off run of the backend's `SlotPlanner` (a short dotnet script, documented next to the fixture), including `Europe/London` on 2026-03-29 and 2026-10-25, `America/New_York` 2026-03-08 and 2026-11-01, `Pacific/Auckland` 2026-09-27, a half-hour zone (`Asia/Kolkata`), a duration that does not divide the interval, a 31-day range, and "now" mid-day today. The unit test asserts `estimateSlots` equals each `expected` (Req 8.7, 13.2).

Submit: `if (pending()) return`; no confirmation threshold (removed). On `200` the page sets `result` (the `ResultCard` in a `role="status"` region, focus on its heading via `afterNextRender`), `slotActivity.add(createdCount)`, and `form.markAsPristine()` with a snapshot reset (Req 8.9, 8.12). "Generate more" clears the dates only. A zero/zero result shows the explanation (Req 8.9). Errors go through `mapGenerateError`. `DirtyForm.isDirty` compares current values to the initial snapshot (the pickers' preselected values count as initial) (Req 8.12).

### Command palette (Req 10)

`shortcut.ts`: `isPaletteShortcut(e) = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k'`; `platformKeyLabel()` returns "⌘K" when `navigator.userAgentData?.platform ?? navigator.platform` matches `/mac|iphone|ipad/i`, otherwise "Ctrl K". The frame's listener calls `e.preventDefault()` and opens the palette unless a **foreign modal** is present: `document.querySelector('[aria-modal="true"]:not([data-palette])')` (the drawer and confirm dialogs are `aria-modal`; the palette root carries `data-palette`), which is how "not while another modal is open" is implemented (Req 10.1). Ctrl+K inside a text field still opens it (the field is not the browser's own shortcut target; the palette is the more useful behaviour). Cmd+K / Ctrl+K are also the browser's address-bar or search shortcuts in some browsers; `preventDefault` overrides the Chromium and Firefox page-level defaults, not the browser-chrome ones, which is the usual behaviour (Known gap).

`command-registry.ts` (pure, no Angular):

```ts
export type CommandGroup = 'Navigate' | 'Create' | 'Records' | 'Settings';
export interface Command {
  id: string;
  label: string;
  keywords: string[];
  group: CommandGroup;
  run: CommandAction;
  hint?: string;
  icon?: string;
}
export type CommandAction =
  | { kind: 'navigate'; url: string; queryParams?: Record<string, string> }
  | { kind: 'theme' }
  | { kind: 'signOut' };
export function buildCommands(ctx: {
  branches: readonly Branch[];
  services: readonly Service[];
}): Command[]; // static ones + "Edit branch: {name}", "Edit schedule: {name}", "Edit service: {name}"
export function filterCommands(
  all: readonly Command[],
  query: string,
  limit = 50,
): { groups: { group: CommandGroup; items: Command[] }[]; count: number };
```

- Scoring: every query word must appear in `label + keywords` (case-insensitive); score 3 for a label prefix, 2 for a word-start match, 1 for any substring; sort by score desc, then group order, then label; **records are capped at 50** after sorting (Req 10.3, 10.4). Group headings are rendered as `role="presentation"` / `role="group" aria-label` wrappers around their options so they are never options (Req 10.4).
- Records come from the already-loaded stores (`branches.items()`, `services.items()`); the palette never calls the API (Req 10.8). While a store is `idle` it simply has no record entries.

`CommandPalette` (`@if (open())` inside the frame): helm `dialog` with `role="dialog" aria-modal="true" aria-label="Command palette" data-palette`, containing the input (`role="combobox"`, `aria-expanded="true"`, `aria-controls`, `aria-autocomplete="list"`, `aria-activedescendant` from `createListbox`) and a `role="listbox"` with the grouped `role="option"` elements. A visually hidden `role="status"` announces "{n} results" via a debounced (300 ms) signal that writes only when the count changes; "No matching commands" is the same region (Req 10.7). Running a command: `close()` first; for `navigate` commands whose `url` differs from `router.url`, close with `restoreFocus: false` so focus is not returned over the destination's own focus management, then `router.navigate`; for the current route just close (focus returns) (Req 10.6). `theme` calls F0's `ThemeService.cycle()`-style setter, `signOut` calls `SessionStore.logout()`. Transitions use the helm `animate-in` classes under `motion-safe:` so reduced motion disables them (Req 10.8, 12.6). Width: `w-full max-w-lg`, `inset-x-0` on `< sm` (Req 10.8).

### Unsaved-changes guard (Req 11)

```ts
export interface DirtyForm {
  isDirty(): boolean;
}
export const unsavedChangesGuard: CanDeactivateFn<DirtyForm> = (component) =>
  !component.isDirty() ||
  inject(ConfirmService).confirm({
    title: 'Discard changes?',
    body: 'You have unsaved changes. They will be lost.',
    confirmLabel: 'Discard changes',
    initialFocus: 'cancel',
    cancelLabel: 'Keep editing',
  });
```

- All four forms implement `DirtyForm`; a successful save calls `markPristine()` / resets the snapshot **before** navigating, so its own navigation passes (Req 11.5). `ConfirmService` returns one shared promise while open (Req 11.6).
- Drawer exits (Close, Escape, backdrop) are `router.navigate`s, so they hit the same guard and no separate confirm exists (Req 11.4). Back/forward use the same guard; Angular restores the URL on a vetoed history navigation.
- `registerBeforeUnload(isDirty: Signal<boolean>)`: an `effect` adds `window.addEventListener('beforeunload', h)` while `isDirty()` is true and removes it otherwise and on destroy; `h = e => { e.preventDefault(); e.returnValue = '' }` (Req 11.3). `isDirty` is a `computed` over the same snapshot comparison as `DirtyForm.isDirty`.
- **Snapshot comparison** (`formSnapshot(form): string` = stable `JSON.stringify` of trimmed, normalised values, e.g. the phone through `normalizePhone`, the code through `normaliseCode`, times through `slice(0, 5)`), so cosmetic differences never mark a form dirty (Req 11.1).

## State and data model

| Item                                      | Where                                                                                         | Notes                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Branches, services (whole lists)          | `BranchesStore`, `ServicesStore` (route-provided in `admin.routes.ts`)                        | reset in `AdminFrame.onDestroy`; `status`, `error`, `items` |
| Slots generated this session              | `SlotActivityStore`                                                                           | memory; `createdThisSession`, `generations`                 |
| List filter, search, sort                 | `ListView` signals; `q` and `status` mirrored in the URL                                      | sort not in the URL                                         |
| Drawer / schedule / generation form state | component-level typed forms; `pending`, `submitAttempted`, `serverErrors`, `notFound` signals | no persistence                                              |
| Time-zone options                         | memoised in `zone-options.ts` per page instance                                               | built on first open                                         |
| Palette open                              | `AdminFrame` signal + `PaletteLauncher.requests`                                              |                                                             |
| Persisted storage                         | none new; F1's `sa.admin.sidebar` is untouched                                                |                                                             |

Types: `DayName = 'Monday' | … | 'Sunday'` (one constant tuple `DAYS`, Monday first, in `features/admin/validation/schedule-rules.ts` and re-exported to `core/time/calendar-date.ts` only as a type via `core/api/models.ts` to keep `core` free of `features`: the tuple lives in `core/time/calendar-date.ts` and the admin feature imports it).

## Error handling

Mappings per form are above. The shared rules:

| Condition                                   | `AppError.status`                 | UI result                                                                                    |
| ------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------- |
| Any admin call `403`                        | 403 `http`                        | `ToastService.handleError`: "You do not have permission to do that."; session kept (Req 9.5) |
| List load fails (no cached items)           | any                               | inline error with the F1 message and **Retry** in place of the table or cards (Req 2.6)      |
| List refresh fails (cached items present)   | any                               | keep rows; the F1 banner covers outages                                                      |
| Validation `400`                            | 400                               | field errors plus alert (Req 3.9)                                                            |
| `404` on a record                           | 404                               | not-found state in the drawer or page, or close plus toast (Req 3.10, 4.5)                   |
| `409`                                       | 409                               | per form (Req 3.8, 7.5, 8.10)                                                                |
| Network, timeout, 502/503/504               | `network`/`timeout`/`unavailable` | values kept, banner, re-enabled (Req 3.11)                                                   |
| `429`                                       | `rate-limited`                    | `RateLimitNotice`, button disabled (Req 3.11)                                                |
| Browser lacks `Intl.supportedValuesOf`      | not an HTTP error                 | fallback zone list; no error                                                                 |
| Invalid zone id in a branch from the server | not an HTTP error                 | `formatInZone`/`zoneOffsetMinutes` fall back to UTC (F1); the combobox shows the raw id      |

## Testing strategy

All tests: Vitest + Angular Testing Library (queries by role and label), MSW for network, `vi.useFakeTimers()` as F1 configures, no `fakeAsync`. The stateful MSW backend `availability-admin-backend.ts` follows F1's `auth-backend.ts` pattern (`handlers`, `state`, `reset`, flags for forced failures and `429`). It validates with an **independent** implementation written from the C# validators (regexes copied verbatim from the source) and the shared contract fixture, so a mistake in the client rules is not hidden by the same mistake in the mock.

| Kind                                            | Covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pure unit (table-driven)                        | `branch-rules`, `service-rules` (`" pg "`, `"-AB"`, `"A"`, 11-char code, `+14155550123`, `0123`; duration 4/5/7/480/485; `_` at code ends), `schedule-rules` (equal times, `9:00`, `24:00`), `generation-rules` (30 vs 31 days), `splitValidationDetail` (known comma-containing messages mid-string, unknown tail, no prefix), `mapServerValidation`, the **contract test** (client messages and table equal the fixture), `estimateSlots` against `slot-planner-vectors.json`, `todayInZone` (Auckland vs Los Angeles at the same instant), `localToUtc` (gap and fold), `filterZones` and `formatOffset` across a DST change, `filterCommands` ranking and grouping, `createListbox` keyboard (wrap, Home/End, empty), `isPaletteShortcut` (ctrl and meta, not shift/alt) (Req 13.2) |
| Component: dashboard                            | cards, skeleton and per-card error, needs-attention rows and empty text, quick-action note, session counter states, recovery reload (Req 1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Component: lists                                | `aria-sort` cycle, search and status filter with URL sync and unknown `status`, announcements, empty and no-match states, Retry, card layout under `isMd() = false` via a stubbed `ViewportService` (Req 2, 6)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Component: drawers                              | focus trap and first-field focus, Escape routes through the guard, immutable code on edit, preview of normalised code, client messages, double-submit, `409` field error, `400` mapping, focus return to opener, not-found deep link, 404 on edit (Req 3, 7)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Component: status confirm                       | wording (guaranteed effects only), Cancel initial focus, pending state, neutral toast, 404 path, focus return to the row button (Req 4, 6.3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Component: schedule                             | row toggle, validation messages, copy-Monday-to-weekdays, all-closed confirmation, request body order and shape, combobox ARIA attributes, keyboard, offsets shown, browser-zone suggestion, only list values accepted (Req 5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Component: stepper and presets                  | ±5 clamp, disabled bounds, non-multiple message after blur, `aria-pressed` sync (Req 7.3, 7.4)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Component: generation                           | inactive exclusion and note, no-schedule warning with link and disabled button, branch-zone date labels and `min`/`max`, quick ranges, preview text and zero case (button enabled with reason), every error mapping with its link, result card focus, zero/zero explanation, session counter (Req 8)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Component: palette                              | combobox attributes, filtering, grouping, keyboard, Escape and focus return, "No matching commands", shortcut with `ctrlKey` and `metaKey`, ignored while a foreign modal is open, no network request (Req 10)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Guard                                           | each form: pristine passes, dirty blocked until confirm, outcome decides; same-route param change prompts; successful save does not prompt; one dialog for two exits; `beforeunload` registered and removed (Req 11)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Routing                                         | route table resolves; `branches/:id/schedule` is not swallowed by `:id`; non-GUID shows not-found without a request; resolver supplies the breadcrumb (Req 9)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Playwright (mocked API via `mock-admin-api.ts`) | Req 13.4 scenarios, including keyboard-only drawer completion and the Customer redirect to `/book`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| axe (`@axe-core/playwright`)                    | Req 12.7 pages and the open palette, light and dark                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Manual                                          | Req 13.6 against the Compose stack                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## Chunk budget (Req 13.5)

Everything is lazy under one `loadChildren`; the initial bundle gains only `PaletteLauncher` (a few bytes) and the shell button. Estimate of the **admin lazy group, gzip**: shared forms components and `@angular/forms` (likely already counted in the F2 group, so a shared lazy chunk), helm `sheet`/`dialog`/`alert-dialog` + CDK dialog about 10 to 14 kB, stores and `@ngrx/signals` (already initial via F1), list/drawer/schedule/slot pages about 20 kB, palette, listbox engine and zone options about 6 kB, validation modules about 3 kB, lucide icons (about 15, tree-shaken) about 6 kB: roughly 45 to 55 kB beyond the shared forms chunk. **Proposed admin group budget: 80 kB gzip**, measured and recorded at implementation (Open question 4). `scripts/size.mjs --group admin` sums outputs whose entry point is under `src/app/features/admin/` plus the non-initial files they statically import (shared chunks counted once, and reported separately from the public group), exits non-zero above `MAX_GZIP_KB_ADMIN`. Native `<input type="date">`, `<input type="time">` and `<select>` are used instead of a calendar component or Spartan select precisely to keep this budget; the time-zone list is generated at runtime from `Intl`, not bundled.

## Traceability

| Requirement              | Design section                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| 1 Dashboard              | Dashboard; Data stores; Routes                                                                              |
| 2 Branches list          | List view and atoms; Data stores; Drawers (outlet)                                                          |
| 3 Branch drawer          | Drawers; Validation; Server error mapping; Unsaved-changes guard                                            |
| 4 Activate / deactivate  | Activate and deactivate (`ConfirmService`, `StatusConfirm`)                                                 |
| 5 Schedule               | Schedule page; Time-zone combobox; Validation (schedule form); Server error mapping                         |
| 6 Services list          | List view and atoms (same view, different noun); Activate and deactivate                                    |
| 7 Service drawer         | Drawers (`DurationStepper`, presets); Validation; Server error mapping                                      |
| 8 Slot generation        | Slot generation; Estimate; `core/time/calendar-date.ts`; `mapGenerateError`                                 |
| 9 Routes and deep links  | Routes; Admin frame; Drawers (`DrawerFocus`)                                                                |
| 10 Command palette       | Admin frame and launcher; Command palette; `createListbox`                                                  |
| 11 Unsaved-changes guard | Unsaved-changes guard; Drawers (routed exits); `ConfirmService`                                             |
| 12 A11y and responsive   | `FormField`/`FieldA11y` reuse; `ViewportService` card layout; Drawers/palette focus handling; testing (axe) |
| 13 Testing               | Testing strategy; Chunk budget; MSW backend and contract fixtures                                           |

## Open questions — resolved

Resolved by the user after design approval; the design above stands, with these amendments.

1. **Form pieces.** F2 builds `form-field`, `field-a11y`, `field-view`, `form-alert`, `focus-first-invalid`, the generic field rules and `phone` in `shared/forms/` (and `focus-heading` in `shared/a11y/`). F5 only imports them; there is no move task.
2. **Calendar and zone helpers.** `todayInZone`, `addDays`, `diffDays`, `weekdayOf`, `eachDate` and `localToUtc` (with its tests) are added to F1's `core/time` by F1 (F1 amended). F5 consumes them and builds none.
3. **`PaletteLauncher`** and the "Search or jump to" button in `AdminShell` are F1's. F5 registers the palette through `PaletteLauncher` from `AdminFrame`.
4. **Admin chunk budget** is 80 kB gzip (`size.mjs --group admin`); the measured figure is recorded at implementation.
5. **`TimeOnly` serialisation.** Times are normalised with `slice(0, 5)` and sent as `HH:mm`; verified against the generated types and a real response at the first `gen:api`.
6. **Ctrl/Cmd+K opens the palette even in text fields.**
7. **`slot-planner-vectors.json`** is regenerated manually by a documented one-off dotnet script; a README note beside the fixture describes the steps. CI does not check drift.
8. **Ambiguous local times in negative-DST zones** (for example Europe/Dublin) are a Known gap: the estimate may differ from .NET on Linux.
9. **`PUT` response bodies** (branch and service update) are handled as either a body or `204` (refetch); verified against the generated types at `gen:api`.

Known gap added to the requirements' list: item 8 above. (Requirements Known gaps already list the estimate caveats; the negative-DST case is recorded there.)

## Implementation deviations

Recorded as the code is written; each is a difference from the design above, with the reason.

1. **No `@ngrx/signals` yet (task 5).** The package is not installed on this branch (F1 adds it with `SessionStore`). `createCatalogStore` is a plain-signals class instead of a `signalStore`; its surface is the same (`items`, `status`, `error`, `loadedAt`, `active`, `inactive`, `byId`, `load`, `ensure`, `upsert`, `setActive`, `reset`), so swapping the implementation later changes no caller.
2. **Response types are hand-written (task 1).** The generated Availability document declares no response bodies (every success is "no content"), so `Branch`, `ServiceType` and `GenerateSlotsResult` are written in `core/api/models.ts` from the controllers and response records, like Auth's temporary extensions. `dayOfWeek` is typed as the day name (the service serialises enums as strings) although the generated `DayOfWeek` is a number; `durationMinutes` and `capacity` are narrowed to `number`.
3. **Phone and generic field rules (task 3).** F2's `shared/forms/phone.ts` and `field-rules.ts` do not exist on this branch and are not created here. `phoneError` takes an already-normalised value (the form passes F2's `normalizePhone` result in task 15), `branchValidators.phoneNumber(normalise)` takes the normaliser as an argument, and the name, description and address rules are local to `branch-rules.ts`. Switch to F2's `requiredTrimmed` and `maxTrimmed` if they turn out to match (the backend measures length untrimmed, which F2's helper may not).
4. **Validation keys.** Rule keys are `required`, `pattern`, `max`, `range`, `step`, `order`, `span` and, for schedule rows, `opensRequired`, `opensFormat`, `closesRequired`, `closesFormat`, `order`; `messages.ts` is organised per form and field, with `MIRRORED` mapping each backend-equal text to its contract-fixture id.
5. **MSW admin backend (task 2).** `makeAccessToken` (F1) does not exist, so the backend exports its own `tokenFor(role)` (an unsigned JWT with `sub` and `role`) and reads the role from the bearer token. It is also available as `createAdminBackend(baseUrl)` for a different base URL; the module-level `handlers`, `state`, `flags`, `reset` are the default instance. Replace `tokenFor` with F1's helper when it lands.
