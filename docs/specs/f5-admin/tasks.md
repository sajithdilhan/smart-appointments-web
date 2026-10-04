# F5 Admin console — Tasks

<!--
Rules (from the template):
- Coding steps only; each task cites the requirement numbers it implements.
- Each task is small enough to finish and test in one sitting and leaves
  `pnpm lint && pnpm test && pnpm build` green.
- A box is checked only when the code exists and those three commands pass, in the same commit as the code.
-->

**Prerequisite.** F5 starts after F4. It needs these pieces from F1 and F2 to exist and be tested; F5 consumes them and builds none of them (if one is missing, finish it there first): `ApiClient`, `AvailabilityApiService` shell, `AppError`, `ToastService`, `OutageState` (with `recovered`), `SessionStore`, `roleGuard`, `ViewportService`, `CLOCK`, `safeGet`/`safeSet`, `RateLimitNotice`, `createRetryCountdown`, the admin shell with `BreadcrumbTrail`, `RouteAnnouncer`, `PaletteLauncher` and its shell button, `core/time` including `zoneOffsetMinutes`, `todayInZone`, `addDays`, `diffDays`, `weekdayOf`, `eachDate` and `localToUtc`, the F1 MSW setup and `makeAccessToken`, and F2's `shared/forms/` pieces (`form-field`, `field-a11y`, `field-view`, `form-alert`, `focus-first-invalid`, `field-rules`, `phone`) and `shared/a11y/focus-heading`.

- [x] 1. Contract fixtures and API methods
  - `src/testing/fixtures/availability-contract.json`: every validation message, code pattern and sample vector copied from the Availability validators, each with its C# source file and rule; `src/testing/fixtures/README.md` describes the fixture.
  - Add the admin methods to `core/api/availability-api.service.ts`: `listBranches`, `getBranch`, `createBranch`, `updateBranch`, `setSchedule`, `setBranchActive`, the same set for services, and `generateSlots`; alias the generated types in `core/api/models.ts`. `updateBranch`/`updateService` return a body or `void`.
  - Spec with MSW per method: HTTP method, absolute URL, query string (`includeInactive`), body, no `Idempotency-Key`.
  - _Requirements: 1.1, 2.1, 3.6, 5.7, 6.1, 8.8, 13.1_

- [x] 2. Stateful MSW admin backend
  - `src/testing/availability-admin-backend.ts` (`handlers`, `state`, `reset`, failure and `429` flags): branch and service CRUD with an independent implementation of the validators (regexes copied verbatim), upper-case code normalisation, `409` duplicates, `403` for a non-admin token, `includeInactive` for Admin only, idempotent activate and deactivate `204`, the schedule rules, slot generation with a fake planner and the four `409` conditions, `404`, `400` "Invalid request data. Errors: a,b", `application/problem+json`, echoed `X-Correlation-ID`.
  - Spec: each rule and status.
  - _Requirements: 13.1_

- [ ] 3. Validation rules and messages
  - `features/admin/validation/`: `messages.ts`, `branch-rules.ts` (incl. `normaliseCode`), `service-rules.ts`, `schedule-rules.ts`, `generation-rules.ts`, `validators.ts`.
  - Table-driven specs from the design's vector list (`" pg "`, `"-AB"`, `"A"`, 11 characters, `+14155550123`, `0123`; duration 4/5/7/480/485; `_` at code ends; `9:00`, `24:00`, equal times; 30 vs 31 days; capacity 0/1/100/101). Contract test: client messages that mirror the backend equal the fixture.
  - _Requirements: 3.4, 5.3, 7.2, 8.5, 8.6, 13.2_

- [ ] 4. Server validation parser and error mappers
  - `parse-validation-detail.ts` (`splitValidationDetail`, comma-aware matching of known messages) and `server-messages.ts` (message to field tables per form, `mapServerValidation`).
  - `branch-error.ts`, `service-error.ts`, `schedule-error.ts`, `generate-error.ts` (pure `AppError` to outcome mappers, including the generation 409/404 pattern table).
  - Specs: known messages containing commas mid-string, unknown tail, no prefix, each outcome row; contract test that every table entry exists in the fixture.
  - _Requirements: 3.8, 3.9, 5.9, 7.5, 8.10, 8.11, 13.2_

- [ ] 5. Catalog stores, resolvers and session activity store
  - `data/catalog-store.ts`, `branches.store.ts`, `services.store.ts` (`load` with dedup and stale-while-revalidate, `ensure`, `upsert`, `setActive`, `reset`), `slot-activity.store.ts`, `reload-on-recovery.ts`, `resolvers.ts` (`branchCrumb`, `serviceCrumb`, `isGuid`).
  - Specs with MSW: first load, cached revisit refreshes in the background, a failed refresh keeps items, `ensure` hit and 404, `upsert`/`setActive`, reload on `OutageState.recovered`, `reset`.
  - _Requirements: 1.1, 1.6, 1.7, 2.1, 2.9, 9.3_

- [ ] 6. Unsaved-changes guard and confirm dialog
  - Generate helm `alert-dialog`; `shared/ui/confirm-dialog/` (`ConfirmService`: single in-flight dialog, optional `run` with pending and inline error, initial focus option).
  - `features/admin/shared/dirty/` (`DirtyForm`, `unsavedChangesGuard`, `registerBeforeUnload`, `formSnapshot`).
  - Specs: pristine passes, dirty blocked until confirm, Keep editing is the default focus, two exits show one dialog, `beforeunload` registered and removed, snapshot ignores cosmetic differences.
  - _Requirements: 4.1, 4.3, 5.8, 11.1, 11.2, 11.3, 11.5, 11.6, 11.7_

- [ ] 7. Listbox engine and command registry
  - `shared/listbox/create-listbox.ts` (query, items, active index and id, keyboard: arrows with wrap, Home, End, Enter, Escape, PageUp/PageDown).
  - `palette/command-registry.ts` (`buildCommands`, `filterCommands` with ranking, grouping and the 50-record cap) and `palette/shortcut.ts` (`isPaletteShortcut`, `platformKeyLabel`).
  - Table-driven specs: keyboard behaviour, wrap and empty list, ranking and grouping, `ctrlKey` and `metaKey` accepted, shift and alt rejected, platform labels.
  - _Requirements: 10.3, 10.4, 10.5, 10.10, 13.2_

- [ ] 8. Slot estimate and its vectors
  - `slots/slot-estimate.ts` (`estimateSlots`: closed form on normal days, exact path on today and transition days) consuming F1's `core/time` helpers.
  - `src/testing/fixtures/slot-planner-vectors.json` generated by a one-off dotnet script against the backend `SlotPlanner`; document the script and regeneration steps in `src/testing/fixtures/README.md` (manual regeneration, CI does not check drift). Include Europe/London 2026-03-29 and 2026-10-25, America/New_York 2026-03-08 and 2026-11-01, Pacific/Auckland 2026-09-27, Asia/Kolkata, a non-dividing duration, a 31-day range, "now" mid-day today.
  - Spec: `estimateSlots` equals each vector; closed days, `droppedPast` and day counts.
  - _Requirements: 8.7, 13.2_

- [ ] 9. Time-zone options
  - `schedule/zone-options.ts` (`buildZoneOptions` from `Intl.supportedValuesOf` with the fallback list, offsets from `zoneOffsetMinutes`, memoised; `filterZones` with ranking and the 100-item cap; `formatOffset`; browser-zone option).
  - Specs: filter treats `_` and space alike, offset label across a DST change, fallback when `Intl.supportedValuesOf` is missing, truncation flag.
  - _Requirements: 5.5, 5.6, 13.2_

- [ ] 10. Shared list pieces
  - Generate helm `badge`, `skeleton`, `table`, `textarea`. `shared/list-view.ts` (`createListView`, query-string sync, `Intl.Collator` sorters, debounced announcement), `sort-header`, `status-badge`, `list-states`.
  - Specs: search and status filter, unknown `status` becomes "All", sort cycle with `aria-sort`, stable ordering, state resolution (loading, error, empty, no-match, ready), announcement settles once per change.
  - _Requirements: 2.2, 2.3, 2.4, 2.6, 2.7, 6.2, 12.4_

- [ ] 11. Admin frame, routes and palette launcher wiring
  - `admin.routes.ts` per the design (store providers, schedule route before `branches`, drawer children, titles, breadcrumb data and resolvers, guards), replacing the F1 placeholders for `/admin`, `/admin/branches`, `/admin/services`, `/admin/slots`; page stubs with an `appFocusHeading` `<h1>`.
  - `admin-frame.component.ts` (`<router-outlet/>`, sets `PaletteLauncher.available`, store reset on destroy; the palette is added in task 20).
  - Specs: route table resolves, `branches/:id/schedule` is not swallowed by `:id`, non-GUID `:id` shows not-found without a request, resolver supplies the breadcrumb, stores reset on destroy, Customer on `/admin/branches` lands on `/book` (F1 guard).
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 12. Dashboard
  - `dashboard.page`, `stat-card`, `needs-attention`: four stat cards, per-card skeleton and error with Retry, needs-attention list and empty text, quick actions with the missing-prerequisite note, "slots generated this session", `reloadOnRecovery`, responsive grid.
  - Specs: figures and accessible names ("Active branches: 3 of 4"), per-card error independence, needs-attention rows and empty state, session counter text, recovery reload.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_

- [ ] 13. Branches list page
  - `branches.page` (table at `md` and up, cards below, labelled sort select, `<router-outlet/>` for the drawer), per-row actions with record-named accessible names, schedule column, filter and search with URL sync, list states, announcements.
  - Specs: columns and badges, "Not set" schedule, filter and sort, empty and no-match, Retry, card layout via a stubbed `ViewportService`, state preserved after a store update, recovery reload.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 12.4, 12.5_

- [ ] 14. Drawer frame and focus return
  - Generate helm `sheet` and `dialog` if not present. `shared/drawer-frame.component.ts` (always-open sheet; Escape, backdrop and Close emit `closeRequested`), `shared/drawer-focus.ts` (opener capture and restore, heading fallback).
  - Specs: dialog semantics and focus trap, Escape and backdrop only emit, focus returns to the opener or the heading on a deep link, reduced-motion class.
  - _Requirements: 3.1, 12.3, 12.6_

- [ ] 15. Branch drawer (create and edit)
  - `branch.form.ts`, `branch-drawer.component` (code immutable on edit, normalised-code preview, counters, submit flow with pending and double-submit guard, `mapBranchError`, `DirtyForm`, `registerBeforeUnload`, not-found and 404 handling, 429 notice), toasts with the "Set schedule" action.
  - Specs: validations and messages, immutable code, preview, create and update bodies (trimmed, description `null`, cleaned phone), `409` field error with focus, `400` mapping and alert, network/outage/429 handling, double-submit, Escape through the guard, store updated, focus return.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12_

- [ ] 16. Activate and deactivate (branches and services)
  - `shared/status-confirm.component` (guaranteed-effects wording for branch and service, lighter activate wording, no-schedule warning), wiring in the branches list and the edit drawer header, neutral toast, `404` and failure paths, focus return to the row button.
  - Specs: wording asserts the "existing appointments and slots are not cancelled" statement, Cancel is the initial focus, request sent once, pending state, store badge updates, `404` closes and reloads, failure keeps the dialog with the message.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 6.3_

- [ ] 17. Time-zone combobox and schedule grid
  - `schedule/time-zone-combobox.component` (ControlValueAccessor over `createListbox`, full ARIA, offsets, browser-zone suggestion, list-only values), `schedule.form.ts` (seven-row model, `fromBranch`, `toRequest`, copy Monday to weekdays, close all, `slice(0, 5)` normalisation, snapshot), `schedule-day-row.component` (switch, time inputs, per-row error, per-day card below 768 px).
  - Specs: row validation and messages, request shape and Monday-first order, copy and close-all, combobox attributes and keyboard, selection sets the value, free text not accepted, offsets shown, form model round trip.
  - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.11_

- [ ] 18. Schedule page
  - `schedule.page`: load via `ensure`, breadcrumbs, not-found state, inactive note, save flow (pending, response upserted, form re-seeded and pristine), all-closed confirmation, `mapScheduleError`, the "affects only slots generated from now on" note, `DirtyForm` and `registerBeforeUnload`.
  - Specs: load and seeding, save body, success resets dirtiness, all-closed confirm, `400` alert, `404`, outage and `429`, guard blocks a dirty exit.
  - _Requirements: 5.1, 5.7, 5.8, 5.9, 5.10, 5.11, 11.2_

- [ ] 19. Services list, drawer and duration stepper
  - `services.page`, `service-drawer`, `service.form.ts`, `duration-stepper.component` (±5, clamp, bounds, ArrowUp/ArrowDown, hours echo, never rounds) with preset chips (`aria-pressed`), `mapServiceError`, the duration note and the "Generate slots" toast action; services list reuses the list pieces.
  - Specs: columns and duration format, stepper and presets sync, validation messages, `409`, update body, guard, list states and card layout.
  - _Requirements: 6.1, 6.2, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [ ] 20. Command palette
  - Generate nothing new beyond `dialog`. `palette/command-palette.component` (dialog, combobox over `createListbox`, grouped options, hidden result-count status, run-then-close with focus rules, theme and sign-out actions, no network), registered by `AdminFrame` (key listener torn down on destroy, ignored while a foreign modal is open, opens from `PaletteLauncher` requests, also in text fields).
  - Specs: combobox attributes, filtering and grouping, keyboard, Escape and focus return, "No matching commands", shortcut with `ctrlKey` and `metaKey` and no fire when a foreign modal is open, record entries from loaded stores only, no request issued, listener removed on destroy.
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9_

- [ ] 21. Slot generation page
  - `slots.page`, `generation.form.ts`, `result-card.component`: active-only pickers with the inactive note and links, empty states, no-schedule warning and disabled button, branch-zone date inputs (`min` and `max`), quick ranges, capacity, live debounced preview, submit with pending and double-submit guard, result card with focus, zero/zero explanation, `slotActivity.add`, `mapGenerateError` alerts with fix links, `?branchId`/`?serviceId` preselect, `DirtyForm`.
  - Specs: inactive exclusion, warning and link, date labels and bounds, span cap, preview text including the zero case (Generate still enabled), each 409 and 404 mapping with its link, `429`, result card, session counter, guard.
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 8.12, 11.2_

- [ ] 22. Size group, README note and e2e support
  - `scripts/size.mjs --group admin` (limit `MAX_GZIP_KB_ADMIN`, default 80, shared chunks counted once and reported), run in CI after `pnpm size`; record the measured figure in the design.
  - `e2e/support/mock-admin-api.ts` (stateful, Admin login) extending F1's `mock-api.ts`.
  - _Requirements: 13.5_

- [ ] 23. Playwright and accessibility suites
  - `e2e/admin.spec.ts`: create a branch, set its schedule with "Copy Monday to weekdays", create a service, generate slots to the result card; duplicate code error; generating for a branch without a schedule and following "Set a schedule"; deactivate through the confirmation; dirty-drawer discard and a deep link to `/admin/branches/:id`; palette via `Ctrl+K`, filter, Enter on "New service"; Customer on `/admin/branches` lands on `/book`; keyboard-only branch drawer.
  - `e2e/admin.a11y.spec.ts`: axe on `/admin`, `/admin/branches` with the drawer open, the schedule page, `/admin/services`, `/admin/slots` and the open palette, light and dark, failing on serious or critical.
  - _Requirements: 12.7, 13.4_

- [ ] 24. Documentation
  - Update the README (feature list, admin routes, `pnpm size --group admin`, fixture regeneration note) and `CLAUDE.md` (project status: F5 built; layout under `features/admin`; the `shared/forms` reuse; the contract-fixture convention; no admin API for appointments or reports). Update `docs/specs/README.md` if it indexes specs. Tick this file in the same commit.
  - _Requirements: 13.5, 13.6_

- [ ] 25. Manual verification against the live gateway
  - With the backend Compose stack running and the seeded Admin (`Seed:Admin`) signed in: create a branch, set its schedule and time zone, create a service, generate slots for a range, and compare the result card's `createdCount` with the estimate; reproduce a duplicate-code `409`, a no-schedule `409` and an inactive-branch `409`; deactivate and reactivate a branch; open the palette with Ctrl+K; sign in as a Customer and confirm the branch and slots are visible and a deactivated branch is not, and that `/admin/branches` redirects to `/book`. Record the outcome, including the `gen:api` verifications (`TimeOnly` format, `PUT` response bodies), in the PR description.
  - _Requirements: 13.6_
