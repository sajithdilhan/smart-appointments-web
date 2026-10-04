# F4 My appointments and Profile — Tasks

<!--
Rules (from the template):
- Coding steps only; each task cites the requirement numbers it implements.
- Each task is small enough to finish and test in one sitting and leaves
  `pnpm lint && pnpm test && pnpm build` green.
- A box is checked only when the code exists and those three commands pass, in the same commit as the code.
-->

**Prerequisite.** F4 starts after F3 and F1 are done and tested. It consumes, and builds none of: `ApiClient`, `BookingApiService` shell, `AppError`, `ToastService` (`showSuccess`), `OutageState.recovered`, `RateLimitNotice`, `SessionStore` (`profile()`, `profileStatus()`, `reloadProfile()`, `logout()`), `CLOCK`, `ViewportService`, the time utilities, the customer shell and its route announcer, the F1 MSW setup, the F0 `ThemeService`, the helm `sheet`, and F3's `ReferenceDataStore` and `buildIcs`/`downloadIcs` under `features/customer/shared/` (F3 Req 11.5). If one is missing, finish it in its own phase first.

- [x] 1. API methods and temporary types
  - Add `listMyAppointments(query, { signal })`, `getAppointment(id)` and `cancelAppointment(id)` to `BookingApiService` (typed; query built only from `status`, `when`, `page`, `pageSize`; no body and no `Idempotency-Key` on cancel).
  - Add the temporary `MyAppointmentsPage` type to `core/api/models.ts` with a comment naming the missing generated endpoint (removed when `pnpm gen:api` is rerun).
  - MSW-based spec per method: HTTP method, absolute URL, query string, no `customerId`, abort cancels the request.
  - _Requirements: 1.4, 1.5, 6.3, 6.10_

- [x] 2. MSW appointments model and handlers
  - `src/testing/appointments-backend.ts` (stateful: filters, order with `id` tie-break, defaults, empty beyond last page, `400` naming every invalid parameter, idempotent cancel, `409`, a `503`-after-cancel flag, `404` for another customer's id) and `handlers/appointments.handlers.ts`; `make-appointment.ts` factory.
  - Branches and services handlers returning only active items so a test can deactivate a branch (reuse F3's if they exist).
  - Spec of the model itself (order, paging, filters, errors).
  - Note: F3's branches/services handlers did not exist on this branch, so `appointments.handlers.ts` serves its own active-only `/api/Branches` and `/api/Services` (both casings); reconcile with F3's at merge.
  - _Requirements: 11.1_

- [x] 3. Pure helpers: tab params, dedupe, GUID matcher
  - `tab-params.ts` (`parseTab`, `toListQuery`), `dedupeById`, `guidIdMatcher`.
  - Table-driven specs: unknown tab, `cancelled=1` honoured only on `upcoming`, exact query for each tab and the switch, de-duplication keeps first and order, GUID accepted/rejected.
  - _Requirements: 1.2, 1.4, 1.5, 2.3, 5.3_

- [x] 4. View model and grouping
  - `appointment.model.ts` and `appointment-view.ts`: `toViewModel`, `groupByDate`, `cancelConflictMessage` not here (task 8).
  - Branch-zone dates, zone label only when `zoneDiffersFromBrowser`, "your time" fallback for an absent or invalid `timeZoneId` or a missing branch, "Unavailable branch/service", past by tab, `canCancel`/`canAddToCalendar` by `CLOCK`, accessible name, no re-sorting.
  - Specs under a fixed process zone: `Pacific/Auckland`, `America/New_York`, `Asia/Kolkata`, a DST-change day, a date-boundary case, missing branch, missing service, unknown status.
  - _Requirements: 3.1, 3.2, 3.4, 3.5, 3.7, 4.3, 4.4, 6.1, 7.1, 7.2_

- [x] 5. Add helm components
  - Generate `alert-dialog`, `skeleton`, `switch`, `badge`, `radio-group` into `shared/ui/` (the sheet exists from F1).
  - Smoke render spec for each used variant.
  - Note: `switch` already existed from F0 (smoke-tested here) and the helm `sheet` is F1's, not on this branch; only `alert-dialog`, `skeleton`, `badge` and `radio-group` were generated.
  - _Requirements: 2.1, 3.4, 6.2, 9.4_

- [x] 6. `AppointmentsStore`
  - `signalStore` provided on the page: `setFilter` (abort in flight, `requestId` guard), `loadFirst`, `loadMore` with the double-call guard, `retryMore`, `quietRefresh` (one request sized `min(100, loaded)`, restart past 100, no skeleton status), `applyCancelled`, `byId`, the single "Loaded N more" announcement, and an effect reloading on `OutageState.recovered` (also reloading F3's lookup).
  - Runtime guard turning a response without `items` into an `AppError`.
  - Store specs (MSW, fake timers): first page, append and de-duplication, double-click, failure keeping the list and retrying the same page, a late response of an old filter discarded, refresh sizes, recovered reload, removal rules.
  - _Requirements: 1.3, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 4.2, 6.5, 10.4_

- [ ] 7. List UI: tabs, timeline, cards, skeleton, empty and error
  - partial: presentational components done (`AppointmentTabs`, `AppointmentTimeline`, `AppointmentCard`, `StatusBadge`, `AppointmentsSkeleton`, `LoadMore`, `EmptyState`, `InlineError`, with specs); remaining: `AppointmentsPage` (needs `AppointmentsStore`, task 6, and F3 `ReferenceDataStore`), the \"N appointments\" status, the lookup notice, the `/appointments` route replacing F1's placeholder (needs F1 routes and shell), and the page-level component specs.
  - `AppointmentTabs` (ARIA tab list with arrows/Home/End, URL via `replaceUrl`, "Show cancelled" only on Upcoming), `AppointmentTimeline`, `AppointmentCard` (one link, `[state]="{ fromList: true }"`), `StatusBadge` (incl. past `(past)` text and "Cancelling..."), `AppointmentsSkeleton`, `LoadMore`, `EmptyState`, `InlineError`, the "N appointments" status, and `AppointmentsPage` binding `queryParamMap` to the store and showing the lookup notice.
  - Wire the `/appointments` route (title `My appointments`) replacing the F1 placeholder; call F3's `ensureLoaded()`; skeletons wait for the lookup.
  - Component specs: tab keyboard and URL, request change for the switch, skeleton then cards, empty states not flashing, card name and single link, zone label only when it differs, lookup failure not blocking, `403` message.
  - _Requirements: 1.1, 1.2, 1.4, 1.6, 1.7, 2.1, 2.2, 2.4, 3.1, 3.2, 3.3, 3.4, 3.6, 4.1, 4.2, 8.1, 8.2, 8.3, 8.4, 10.2_

- [ ] 8. Cancel reducer, conflict mapping and detail store
  - partial: `cancelReducer` and `cancelConflictMessage` with their specs are done; `AppointmentDetailStore` and its MSW specs remain, waiting on F1 `ToastService` and `OutageState.recovered` wiring, and on `AppointmentsStore` (task 6, needs F3's `ReferenceDataStore`).
  - Pure `cancelReducer(phase, event)` and `cancelConflictMessage(detail)` (known "already started" text gives the fixed client message and `too-late`; any other `409` text gives the generic "We couldn't cancel this appointment. Refresh and try again." and keeps the button; the raw `detail` is never exposed).
  - `AppointmentDetailStore` running the effects: load (seeded from the list item, background re-GET), cancel, the `204` re-GET, the `503`/network/timeout re-GET-first rule, `404`, `403`, `429`, announcements, `applyCancelled` and quiet refresh of the list.
  - Table-driven reducer specs for every transition, a repeated `confirm` ignored, 503 then re-GET `Cancelled`, 503 then `Booked`, re-GET failing; store specs with MSW; a spec pinning the known 409 string.
  - _Requirements: 5.2, 5.3, 5.6, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10_

- [ ] 9. Detail UI: sheet or page, cancel dialog, calendar
  - Child route `/appointments/:id` (`guidIdMatcher`, `AppointmentNotFound`), the `presentation` computed (sheet at >= 1024 px when entered from the list, otherwise page), one `AppointmentDetail` projected into either container so a resize keeps data and an open dialog, the "Back to my appointments" link, focus into the sheet and back to the originating card (nearest remaining card, else the `<h1>`, when the card left the list).
  - Detail fields of Req 5.4 (booking reference with copy via the F1 helper, "Booked on"/"Cancelled on"), no internal ids, skeleton, error with retry and reload on `OutageState.recovered`.
  - `CancelDialog` (alertdialog, initial focus on "Keep appointment", Escape/backdrop keep), optimistic badge, inline `role="alert"` messages, `RateLimitNotice` on 429, and "Add to calendar" using F3's `buildIcs`/`downloadIcs` with missing names passed as absent.
  - Component specs: sheet at 1100 px and page at 600 px, deep link, `404`, non-GUID with no request, resize with an open dialog, Cancel visibility, dialog focus and Escape, optimistic text and announcement, success toast, 409 known and unknown text, 503 branches, Add to calendar visibility and missing-name input.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 7.1, 7.2, 7.3, 10.1, 10.3, 10.4_

- [ ] 10. Profile page
  - `ProfilePage` (title `Profile`, `<dl>` with "Not provided", skeleton, email from the token claim, inline error with "Try again" calling `reloadProfile()`, reload on `OutageState.recovered` only while in error), `ThemePicker` radio group on the F0 `ThemeService`, "Sign out" calling `session.logout()`; no edit or password text. Replace the F1 placeholder route.
  - Component specs: list, skeleton, retry, "Not provided", theme in sync with the toggle, sign out calls `logout`.
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 10.1_

- [ ] 11. Accessibility and motion pass
  - Verify live-region wording and single announcements, focus indicators not hidden by sticky headings, 44 px card targets, `motion-safe` on sheet, dialog and skeleton, reduced-motion behaviour, and the 320 px / 200% zoom layouts; fix gaps found.
  - Component specs for reduced motion (no pulse, no slide class) and the announcements.
  - _Requirements: 3.6, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8_

- [ ] 12. Playwright suites and size budget
  - `e2e/appointments.spec.ts` and `e2e/profile.spec.ts` (route interception) covering the flows of Req 11.3, and `e2e/a11y-appointments.spec.ts` with axe on `/appointments`, the open sheet, the cancel dialog and `/profile` in light and dark.
  - Add `size-limit` entries for the two lazy chunks (40 kB gzipped together), confirm `pnpm size` passes and record the measured value in the design.
  - _Requirements: 10.1, 10.5, 11.3, 11.4_

- [ ] 13. Documentation
  - Document in the web repo's `README`/`CLAUDE.md`: the F4 routes, URL state (`tab`, `cancelled`), the cancel state machine and the re-GET rule, the reference-lookup dependency on F3, the temporary `MyAppointmentsPage` type to remove after `pnpm gen:api`, and the manual check procedure.
  - Record the measured chunk size and mark F4 done in the plan.
  - _Requirements: 11.4, 11.5_

- [ ] 14. Manual verification against the live gateway
  - With the Compose stack (the `booking-my-appointments` backend merged): book two appointments through F3, see both in Upcoming, cancel one and see it leave Upcoming and appear with "Show cancelled" and in its detail as Cancelled; open the detail by deep link after a reload (sheet vs page at both widths); deactivate its branch as an Admin and see "Unavailable branch"; stop Availability and cancel to see the `503` guidance and the re-GET rule; check the profile, the theme survives a reload, sign out; run `pnpm gen:api` and remove the temporary type if the `/my` schema is present. Record results and any deviations as new Known gaps.
  - _Requirements: 11.5_
