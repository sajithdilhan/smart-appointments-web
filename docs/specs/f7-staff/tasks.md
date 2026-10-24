# F7 Staff workspace — Tasks

<!--
Rules (from the template):
- Coding steps only; each task cites the requirement numbers it implements.
- Each task is small enough to finish and test in one sitting and leaves
  `pnpm lint && pnpm test && pnpm build` green.
- A box is checked only when the code exists and those three commands pass, in the same commit as the code.
-->

**Prerequisite.** F1 to F6 are merged on `main` (PRs #1 to #8). The backend features `staff-booking` and `staff-management` are on `master` (PRs #19, #20). Work happens on `f7-staff`; chunk worktrees are `saw-wt/f7-<chunk>` branched from it. Port lane for Playwright: 4307.

**Chunks for parallel agents.** Tasks 1 to 7 (foundation) run first, on `f7-staff`, in order. Then chunks **A** (8 to 12, the day-list engine), **C** (16 to 21, staff accounts) and **D** (22 and 23, customer screens) run in parallel, each in its own worktree. Chunks **B** (13 to 15, staff workspace) and **E** (24, admin appointments page) need chunk A merged first and then run in parallel. Tasks 25 onwards run on the merged branch. See "Execution chunks" at the end for file ownership.

## Foundation (on `f7-staff`, in order)

- [x] 1. Staff branch claim in the session
  - _Done: 24/10/2026 10:05am_
  - `core/util/guid.ts`: `isGuid(value)`; `features/admin/data/resolvers.ts` re-exports it instead of its own copy.
  - `jwt.ts`: `AccessClaims.branchId: string | null` (the `branch_id` claim when it is a string GUID, else `null`); `session.model.ts`: `SessionUser.branchId?: string`; `SessionStore.establish` sets it only for `role === 'Staff'` and a non-null claim (a refresh with a new claim replaces it; cross-tab adoption goes through `establish`).
  - `testing/make-access-token.ts`: optional `branchId` option written as `branch_id`.
  - Specs: `jwt.spec` (valid GUID, absent, not a GUID, empty string, Customer and Admin tokens with the claim ignored), `session.store.spec` (Staff user carries `branchId`; refresh with another `branch_id` updates it; Customer has none), `guid.spec`.
  - _Requirements: 1.1, 1.5_

- [x] 2. Generated types, models and API methods
  - _Done: 24/10/2026 10:11am_
  - With the Compose stack running in Development on `:5290` from `master`, run `pnpm gen:api` and commit the three `.d.ts` files. If the gateway is unreachable, stop and report (Open question 2).
  - `core/api/models.ts`: `AppointmentStatus` gains `Completed` and `NoShow`; `AppointmentResponse` gains `completedAtUtc?` and `noShowAtUtc?`; add `BranchAppointment`, `BranchAppointmentsPage`, `StaffAccount`, `StaffPage`, `CreateStaffBody` as "Temporary extensions (Req 11.1)", each deleted at once if the regenerated file now declares the body.
  - `BookingApiService`: `listBranchAppointments`, `completeAppointment`, `markNoShow` (promise plus `AbortSignal`, the existing pattern); `MyAppointmentsQuery.status` becomes `'Booked' | 'Cancelled' | 'Completed' | 'NoShow'`.
  - `AuthApiService`: `listStaff`, `getStaff`, `createStaff`, `moveStaff`, `setStaffActive`, `deleteStaff` (paths in the generated casing).
  - Specs: `booking-api.service.spec` (URL, `date`, `status` omitted for All, `page`, `pageSize`, abort, no `Idempotency-Key`), `auth-api.service.spec` (each method's verb, URL, body and query).
  - _Requirements: 11.1, 10.3, 10.4_

- [x] 3. Shared moves, badge variant and tokens
  - _Done: 24/10/2026 10:14am_
  - Move `public/validation/password-rules.ts`, `password-validator.ts`, `public/auth/password-field.component.ts` and `public/register/password-checklist.component.ts` (with their specs) to `shared/forms/`; update the imports in `public`; the password wording constants they need move with them.
  - Move `customer/appointments/status-badge.ts` (and its spec, if any) to `shared/appointments/appointment-status-badge.ts`; update imports.
  - Badge: `Completed` (icon `lucideCircleCheck`, variant `success`, text "Completed") and `NoShow` (icon `lucideUserX`, variant `warning`, text "No-show"); unknown values keep neutral text of their own value. Add the helm badge `warning` variant and `--warning-soft` / `--warning-soft-foreground` tokens to `styles.css` (light and dark, AA contrast), plus the Tailwind colour aliases.
  - Specs: moved specs unchanged and green; badge spec for the two new statuses (text, icon hidden from assistive technology, variant), unknown status, past Booked; badge variant class test; `no-teal` spec still green.
  - _Requirements: 10.1, 10.4, 7.1_

- [x] 4. Time helpers and the "now" signal
  - _Done: 24/10/2026 10:17am_
  - `core/time/time-hm.ts`: `timeHm(isoOrDate, zone)` (24-hour `HH:mm` via `zonedParts`, UTC for an invalid zone) and `longDateLabel(date)` ("Friday 24 October 2026", UTC on a noon instant, so the browser zone cannot change the day); export from `core/time/index.ts`.
  - `core/util/now-signal.ts`: `createNowSignal(clock = inject(CLOCK))` returning `{ now, watch(deadlines) }`; one timer for the smallest future deadline, re-armed when it fires or the deadlines change; cancelled on destroy.
  - Specs: `time-hm.spec` (Europe/London summer and winter, a DST-change day, a zone ahead of and behind UTC, invalid zone, `longDateLabel` identical under two browser zones), `now-signal.spec` with `ManualClock` (flips exactly at the deadline, re-arms for the next, no timer when no future deadline, cancelled on destroy).
  - _Requirements: 2.2, 2.4, 3.2_

- [x] 5. MSW backends
  - _Done: 24/10/2026 10:28am_
  - `testing/branch-day-backend.ts`: stateful model of `GET /api/appointments/branch/{id}` (date in the branch zone, status filter, paging with default 20 and max 100, soonest first, `customer` objects, `customersUnavailable` switch, `403` for a Staff token of another branch, `400`, `503` switch) and of `POST .../complete` and `.../no-show` (`409` before start or from another status, repeat is `200`, `404`, `403` for a Customer), driven by a controllable clock; plus `GET /api/branches/{id}` and `GET /api/services` for the staff.
  - `testing/staff-accounts-backend.ts`: `GET/POST /api/auth/staff`, `GET /api/auth/staff/{id}`, `PUT .../branch`, `POST .../activate|deactivate`, `DELETE`, with the real rules (oldest first, deleted excluded, `isActive` and `branchId` filters, `400` "Email is already registered." and "Invalid request data. Errors: …", `422` unknown or inactive branch, `503` switch, `404`, Admin only).
  - Specs: `branch-day-backend.spec`, `staff-accounts-backend.spec`, each asserting the rules above so the chunks can rely on them.
  - _Requirements: 2.3, 3.5, 6.2, 7.3, 8.4, 9.2_

- [x] 6. Admin wiring with stub pages
  - _Done: 24/10/2026 10:32am_
  - `admin.routes.ts`: `appointments` (title "Appointments", breadcrumb) and `staff` with children `new` and `:id` (both `unsavedChangesGuard`; titles "Staff", "New staff member", "Edit staff member"; `:id` resolves a breadcrumb "Staff member"), each loading a stub component that renders only its `<h1>`; `titles.ts` entries.
  - `AdminShell` sidebar order: Dashboard, Branches, Services, Staff, Slot generation, Appointments (icons `lucideUsers`, `lucideCalendarCheck`).
  - `command-registry.ts`: static commands "Go to appointments", "Go to staff", "New staff member".
  - Specs: `admin.routes.spec` (new routes resolve, `staff/new` is not taken by `:id`), `command-registry.spec`, `admin-shell.spec` (order and active state of the new links).
  - _Requirements: 5.1, 6.1_

- [x] 7. E2E mock backends
  - _Done: 24/10/2026 10:36am_
  - `e2e/support/mock-staff-api.ts`: Playwright route handlers for the day list, marks, `GET /api/Branches/{id}`, `GET /api/Services`, with a Staff login whose token carries `branch_id`; extends `mockBackend`'s `makeJwt` with an optional `branchId`.
  - `e2e/support/mock-staff-accounts-api.ts`: staff accounts list, create, read, move, activate, deactivate, delete on top of `mock-admin-api.ts`, with the same validation rules as the MSW model.
  - Specs: none of their own (used by tasks 25 and 26); a short self-check in `e2e/smoke.spec.ts` is not added, to keep runs short.
  - _Requirements: 11.4_

## Chunk A: the day-list engine (`shared/branch-day`; worktree `saw-wt/f7-a`)

- [x] 8. Day parameters, row model and store
  - _Done: 24/10/2026 10:56am_
  - `day-params.ts` (`parseDayParams`, `STATUS_FILTERS`, `toQuery`), `day-row.ts` (`toRow`), `day-errors.ts`, `mark-error.ts`, `branch-day.store.ts` (`open`, `loadMore`, `refresh`, `mark`, computed `rows`, `countLabel`, announcements; stale-response and double-send guards), `day-url-state.ts`.
  - Specs: `day-params.spec` (absent, malformed, impossible date, unknown status), `day-row.spec` (names, null customer, service fallback, `canMark`), `mark-error.spec`, `branch-day.store.spec` against `branch-day-backend` (query, Load more, dedupe, stale drop, refresh keeps rows, mark success and `409`/`404` reload, repeat ignored while in flight, `customersUnavailable`), `day-url-state.spec` (normalising `replaceUrl`, history entries, `resetDate`).
  - _Requirements: 2.1, 2.3, 2.5, 2.7, 2.8, 2.9, 3.3, 3.5, 3.6_

- [x] 9. Date controls and status filter
  - _Done: 24/10/2026 11:00am_
  - `day-nav.component.ts` (heading text, long date, Previous, Next, Today disabled on today, date input, zone label) and `status-filter.component.ts`.
  - Specs: `day-nav.spec` (each control emits the right date, Today disabled, accessible names, the UTC label), `status-filter.spec`.
  - _Requirements: 1.6, 2.2, 2.5_

- [x] 10. Day list
  - _Done: 24/10/2026 11:06am_
  - `day-list.component.ts`: table at 640 px and wider, cards below (stubbed `ViewportService`); skeleton with `aria-busy`; count line; empty text with the filter; customers notice and per-row "Name unavailable"; `tel:` link; Load more; inline error with Retry (`dayErrorText`); open event from the time or name button.
  - Specs: `day-list.spec` covering each state and both layouts, the notice with and without one null customer, `tel:` href, Load more visibility and busy state, error texts by status, 320 px content (no fixed widths asserted by class).
  - _Requirements: 2.4, 2.6, 2.7, 2.9, 2.10, 4.1_

- [x] 11. Row actions, marks and the no-show dialog
  - _Done: 24/10/2026 11:12am_
  - `row-actions.component.ts` (hint, `aria-describedby`, busy, disabled until start via `createNowSignal`, future-day hint text), `no-show-confirm.ts` (`ConfirmService`), the polite announcement region component, wiring of `store.mark` to toast and announcement.
  - Specs: `row-actions.spec` (hidden for non-Booked, disabled with hint before start, enabled when `ManualClock` passes the start, busy and double activation sends one request), `no-show-confirm.spec` (wording with name and time, initial focus on Keep as booked, Escape and Keep send nothing, Mark sends and closes), `marks.spec` (Complete without confirmation, toasts, announcement text, `409` and `404` toasts with reload).
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [ ] 12. Appointment sheet
  - `appointment-sheet.component.ts`: helm sheet, fields, duration from start and end, times in the zone, copyable id, embedded `RowActions`, shows the status after a mark, focus return to the opener.
  - Specs: `appointment-sheet.spec` (all fields for Booked, Cancelled, Completed and NoShow rows, missing customer, copy message, Escape and Close, focus returns to the opener, actions work and the badge updates, full-width class below `isLg`).
  - _Requirements: 4.1, 4.2, 4.3_

## Chunk B: the staff workspace (worktree `saw-wt/f7-b`, after A)

- [ ] 13. Staff branch store and shell header
  - `core/branch/staff-branch.store.ts` (`StaffBranchStore`: ensure once per branch, `not-linked`, `error`, `zone`, `zoneLabel`, reset on sign-out, effect on `branchId` change); `StaffShell` shows "{name} ({code})" when ready.
  - Specs: `staff-branch.store.spec` (single request for repeated `ensure`, new branch loads again, no claim means no request, `404`, network error then recovery, sign-out resets), `staff-shell.spec` (header text, absent while loading).
  - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6_

- [ ] 14. Staff gate and routes
  - `features/staff/staff-gate.component.ts` (not-linked message with Sign out, error state with Retry and reload on `OutageState.recovered`, content when ready), `staff.routes.ts` rewritten, `titles.ts`; delete `staff-placeholder.ts` and its spec.
  - Specs: `staff-gate.spec` (each of the three states, no appointment request when not linked, Retry, recovery).
  - _Requirements: 1.3, 1.4, 11.2_

- [ ] 15. Staff day page
  - `staff-day.page.ts`: composes `DayNav`, `StatusFilterSelect`, Refresh, `DayList`, `AppointmentSheet`, the announcement region; supplies the branch context from `StaffBranchStore`, the service map from `AvailabilityApiService.services()`; reloads on `OutageState.recovered`; resets the date when the branch changes.
  - Specs: `staff-day.page.spec` against the MSW backends (date defaults to today in the branch zone and the URL is replaced, Previous and Next add history entries, a filter request carries `status`, Refresh reloads, no timed polling, a mark updates the row and the sheet, branch change resets the date, `403` and `503` texts, UTC label for a branch without a zone).
  - _Requirements: 2.1, 2.2, 2.3, 2.8, 1.5, 1.6, 3.3, 4.2_

## Chunk C: staff accounts (worktree `saw-wt/f7-c`)

- [ ] 16. Staff store and error mapping
  - `data/staff-accounts.store.ts` (`load`, `loadMore`, `reload` of loaded pages, `reset`, recovery hook), added to the `staff` route `providers` and to `AdminFrame`'s reset; `staff/staff-error.ts` (`mapStaffSaveError`, `mapStaffActionError`), `staff/staff-messages.ts`.
  - Specs: `staff-accounts.store.spec` against the MSW backend (filters in the query, `pageSize=100`, append, reload keeps loaded pages, failure keeps items), `staff-error.spec` table-driven on every status and known text.
  - _Requirements: 6.2, 6.4, 6.6, 7.3, 8.4, 9.2, 9.4_

- [ ] 17. Staff list page
  - `staff/staff.page.ts` (replaces the stub): table or cards, branch and status filters in the URL, Load more, empty and no-match states, skeleton, error with Retry, row actions menu, drawer outlet.
  - Specs: `staff.page.spec` (columns, "Unknown branch", badges, filter to URL and request, unknown values to All, empty states and "Clear filters", Load more, error and recovery, card layout via stubbed viewport).
  - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- [ ] 18. Create drawer
  - `staff/staff-create-drawer.component.ts` and `staff.form.ts`: fields, F2 validators, password field and checklist, active-branch select, double-submit guard, password cleared after the request, success toast and list reload, errors per mapping, unsaved-changes guard.
  - Specs: `staff-create-drawer.spec` (validation messages, phone normalisation, checklist, submit body, success path, duplicate email on the Email field, `422` on Branch with branch reload, `503` alert with values kept, other `400` to the alert, double submit sends once, password control empty afterwards, dirty form prompts).
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [ ] 19. Edit drawer
  - `staff/staff-edit-drawer.component.ts`: `getStaff`, read-only fields, active-branch select (current inactive branch shown), notice text, Save disabled when unchanged or pending, success toast "{Name} moved to {branch}." and reload, `422`, `503`, `404`.
  - Specs: `staff-edit-drawer.spec` (fields, notice, disabled Save for the same branch, move request body, success, each error, `404` message and list reload, non-GUID id shows not-found without a request, guard).
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [ ] 20. Deactivate, reactivate and delete
  - `staff/staff-actions.ts` using `ConfirmService`; pending set; reactivate `422` banner with the Edit link; `404` toast and reload.
  - Specs: `staff-actions.spec` (exact dialog wording and labels, initial focus on Cancel for delete, busy confirm button, success toasts and reload, no dialog for reactivate, `422` banner and its link, `503` outage text, `404` for each action, row actions disabled while pending).
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 21. Palette staff records
  - `command-registry.ts` `buildCommands` takes `staff`; `command-palette.component.ts` passes `StaffAccountsStore.items()`; record entries "Edit {name}" with keywords (name, email, branch).
  - Specs: `command-registry.spec` (staff entries, filter by name and email, 50-record cap still applies), `command-palette.spec` (entry navigates to `/admin/staff/{id}`).
  - _Requirements: 6.1_

## Chunk D: customer screens (worktree `saw-wt/f7-d`)

- [ ] 22. Completed and no-show in the customer views
  - `appointment-view.ts`: status labels "Completed" and "No-show", `canCancel` false for them, `a11yName` with the label; `appointment-detail.ts`: "Completed on {date, time}" and "Marked as no-show on {date, time}" next to "Cancelled on"; no cancel action.
  - Specs: `appointment-view.spec` and `appointment-detail.spec` for Completed, NoShow and an unknown status (neutral text of its own value), the detail rows and the absence of a Cancel button; `list-components.spec` for the card badge.
  - _Requirements: 10.1, 10.2, 10.4_

- [ ] 23. Past-tab status filter
  - `tab-params.ts`: `?pstatus=` (All, Completed, NoShow, Cancelled, Booked; unknown to All; honoured on Past only), `toListQuery` sends `status` on Past; `appointments.store.ts` filter and `sameFilter`; `appointments-page.ts` select on the Past tab, URL sync, announcement; Upcoming unchanged.
  - Specs: `tab-params.spec`, `appointments.store.spec` (request carries `status`, switching tabs drops it), `appointments-page.spec` against `appointments-backend` (select appears on Past only, URL and request, Upcoming request unchanged).
  - _Requirements: 10.3_

## Chunk E: admin appointments page (worktree `saw-wt/f7-e`, after A)

- [ ] 24. Admin appointments page
  - Replace the stub `appointments/appointments.page.ts`: branch select (all branches, inactive marked) in `?branch=`, "Choose a branch to see its appointments.", the shared composition with the chosen branch's zone and `ServicesStore` names, branch change resets the date.
  - Specs: `appointments.page.spec` (picker options and "(inactive)", no request without a branch, invalid `?branch=` treated as none, date and status in the URL, branch change resets the date to today in the new zone, a mark from the page, Load more).
  - _Requirements: 5.2, 5.3, 5.4, 3.1_

## Integration (on the merged `f7-staff`, in order)

- [ ] 25. Playwright: staff day list and admin appointments
  - `e2e/staff.spec.ts`: Staff login, day list with the branch name in the header, a Complete (no dialog) and a No-show (dialog, Keep then Mark), Previous day and browser Back, the not-linked state, a `409` showing the server text; `e2e/admin-appointments.spec.ts`: choose a branch, mark, change branch.
  - `e2e/staff.a11y.spec.ts`: axe in light and dark on `/staff`, with the sheet open and with the no-show dialog open; extend `admin.a11y.spec.ts` for `/admin/appointments`; check 320 px reflow.
  - Run with port lane 4307.
  - _Requirements: 11.3, 11.4, 2.4_

- [ ] 26. Playwright: staff accounts and customer statuses
  - `e2e/admin-staff.spec.ts`: create (including the duplicate email error), move, deactivate, reactivate, delete, keyboard-only create; extend `a11y-appointments.spec` (Past tab with Completed and No-show badges, both themes) and `admin.a11y.spec` (`/admin/staff`, both drawers); extend `e2e/appointments.spec.ts` for the Past filter.
  - _Requirements: 11.3, 11.4, 10.1, 10.3_

- [ ] 27. Size group and budgets
  - `scripts/size.mjs`: `--group staff` (generic `groupFiles`, entry under `features/staff/`), default `MAX_GZIP_KB_STAFF` 40 in `GROUP_DEFAULTS`, `size:staff` in `package.json`, a CI line; extend `size.spec.mjs`.
  - Measure all groups on the merged build and record them in this task's note; if admin exceeds 120 kB, stop and ask the user to approve the proposed 140 kB (Open question 1).
  - _Requirements: 11.5_

- [ ] 28. Full gate
  - `pnpm lint`, `format:check`, `typecheck`, `test`, `build`, every `size:*` group, `test:scripts` and `pnpm e2e` (all flows and axe suites, both themes) on the merged branch; fix what fails; record the results.
  - _Requirements: 11.3, 11.4, 11.5_

- [ ] 29. Documentation
  - `README.md`: F7 row (Implemented), the Polish row renumbered to F8, "What F7 provides" and "Known gaps (F7)" (token branch lag up to 60 minutes; staff see "Unavailable service" for a deactivated service), the stale PR/status text for F2, F3, F5, F6 corrected (all merged, #4, #6, #5, #8).
  - `CLAUDE.md`: the F7 feature description, the new size script, the shared folders, and the "Working with Claude Code subagents" section updated to say that exploration-only helpers (searches, file reading, no edits) run on Haiku (`model: "haiku"`) while implementation and review stay on Sonnet.
  - `docs/specs/README.md`: F7 row, Polish as F8 "Not specced". `docs/WORKPLAN.md`: F7 section with these tasks, the 4307 lane, Polish renumbered F8, the phase table corrected (F2 #4, F3 #6, F4 #7, F5 #5, F6 #8 all merged; "Next up" rewritten), Last updated line.
  - Record any design deviation at the end of `design.md`.
  - _Requirements: 11.6_

- [ ] 30. Manual verification against the gateway
  - With the Compose stack on `master`, the seeded Admin, a Staff account created in the UI and a customer with appointments (some started, some in the future): staff day list at 1280 and 390 px in light and dark, Complete, No-show with the dialog, the "Available from" hint, Load more, Refresh, the detail sheet, a staff member of another branch asking for a different branch (`403`), admin appointments, staff create, move (and the old session refused after the token lapses), deactivate, reactivate, delete; the customer Past filter and badges; keyboard and screen reader pass of the day list and dialogs.
  - Record the result in the PR description; tick only when every step passed.
  - _Requirements: 1 to 10_

## Execution chunks

| Chunk       | Tasks    | Owns (files it may create or edit)                                                                                                                                                                                                                                                                                                                                                                                                                                            | Starts after                 |
| ----------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Foundation  | 1 to 7   | `core/auth/*`, `core/util/guid.ts`, `core/util/now-signal.ts`, `core/time/*`, `core/api/*`, `shared/forms/*` (moves), `shared/appointments/*`, `shared/ui/badge/*`, `styles.css`, `features/public/*` (import updates), `features/customer/appointments/status-badge.ts` removal and its imports, `features/admin/admin.routes.ts`, `titles.ts`, `shared/layout/admin-shell/*`, `palette/command-registry.ts` (static commands), stub pages, `src/testing/*`, `e2e/support/*` | start; sequential, one agent |
| A           | 8 to 12  | `src/app/shared/branch-day/**` only                                                                                                                                                                                                                                                                                                                                                                                                                                           | Foundation                   |
| C           | 16 to 21 | `features/admin/staff/**`, `features/admin/data/staff-accounts.store.ts`, `admin.routes.ts` (the `providers` line only), `admin-frame.component.ts` (reset line), `palette/command-registry.ts` (`buildCommands` and records), `palette/command-palette.component.ts`                                                                                                                                                                                                         | Foundation                   |
| D           | 22, 23   | `features/customer/appointments/**`                                                                                                                                                                                                                                                                                                                                                                                                                                           | Foundation                   |
| B           | 13 to 15 | `core/branch/**`, `shared/layout/staff-shell/**`, `features/staff/**`                                                                                                                                                                                                                                                                                                                                                                                                         | Chunk A merged               |
| E           | 24       | `features/admin/appointments/**`                                                                                                                                                                                                                                                                                                                                                                                                                                              | Chunk A merged               |
| Integration | 25 to 30 | `e2e/*.spec.ts`, `scripts/*`, `package.json`, `README.md`, `CLAUDE.md`, `docs/**`                                                                                                                                                                                                                                                                                                                                                                                             | all chunks merged            |

Dependency order: Foundation → (A, C, D in parallel) → (B, E in parallel, once A is merged; B and E do not depend on C or D) → Integration. Chunk C touches `admin.routes.ts` and the palette files that Foundation also edits, which is why Foundation lands first and C restricts itself to the lines named above. Merge chunks into `f7-staff` one at a time, run the gate after each, and renumber nothing: task numbers are the IDs (`F7-T<n>`).
