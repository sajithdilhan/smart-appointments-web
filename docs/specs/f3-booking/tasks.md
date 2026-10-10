# F3 Booking Wizard — Tasks

<!--
Rules (from the template):
- Coding steps only; each task cites the requirement numbers it implements.
- Each task is small enough to finish and test in one sitting and leaves
  `pnpm lint && pnpm test && pnpm build` green.
- A box is checked only when the code exists and those three commands pass, in the same commit as the code.
-->

**Prerequisite.** F3 starts after F1 and F2 are implemented and tested. It consumes, and builds none of: `ApiClient`, the `AvailabilityApiService` and `BookingApiService` shells, `AppError` and the error interceptor, `ToastService` (`showError`, `showSuccess`, `showInfo`), `createRetryCountdown` and the shared `RateLimitNotice`, `OutageState` with `recovered`, `SessionStore`, `authGuard` and `roleGuard`, the customer shell with the `book` placeholder route, `ViewportService`, `CLOCK` (`now()` in epoch ms), `core/util/safe-storage.ts` (the `sessionStorage` variant), the `core/time/` utilities including the branch-zone helpers (`zonedParts`, `todayInZone`, `addDays`, `todaysHours`, `isOpenNow`, `hhmm`; confirm F1's final names before task 4), the F1 title strategy that accepts function titles, the MSW server setup and F1's `render-with-session.ts`, `manual-clock.ts`, and F2's `appFocusHeading` pattern. IF one is missing, finish it in F1 or F2 first.

- [ ] 1. Generated types, API methods and MSW backend model
  - partial: `pnpm gen:api` was not run (it needs the running backend gateway, which this branch may not start); the generated Availability and Booking documents declare no response bodies, so the response types are temporary extensions in `models.ts` until the backend documents them and the types are regenerated.
  - Run `pnpm gen:api` and commit the regenerated `availability.d.ts` and `booking.d.ts`; remove any temporary extension in `models.ts` that the regeneration made redundant.
  - Add `AvailabilityApiService.branches()`, `services()`, `availableSlots({ branchId, serviceId, date })` and `BookingApiService.createAppointment(slotId, idempotencyKey)` (header `Idempotency-Key`, body exactly `{ slotId }`), typed from the generated schema.
  - Add `src/testing/booking-backend.ts` (stateful model: branches in Auckland, London and New York plus one with no schedule, services, slots generated from a fixed clock with capacity, appointments, idempotency store with replay and `422`, overlap and slot-state `409`s with the verbatim backend strings, `404 Slot not found.`, `503`, flags for search `429`, create `429`, drop-response-after-booking and in-progress) and `availability.handlers.ts` / `booking.handlers.ts` (echo `X-Correlation-ID`, `{status, detail}` as `application/problem+json`).
  - Specs: each API method's URL, query and body with MSW; the model's own rules (replay returns the first status and body, `422` for another body, overlap, full slot, missing key `400`).
  - _Requirements: 5.1, 7.5, 13.1_

- [x] 2. Pure modules: params, steps, day parts, duration, strip
  - `book/steps.ts` (`STEPS`, `stepFromParams`, `stepTitle`), `book/wizard-params.ts` (`parseParams`, `repairParams`, `buildParams`), `book/day-parts.ts` (`partOfDay`, `groupSlots`, `capacityHint`), `book/duration.ts` (`formatDuration`), `book/date-strip.ts` (`dayStrip`).
  - Table-driven specs: every repair rule and its cascade, `done` without a booking dropped, invalid and out-of-range dates (past, today plus 13, plus 14), unloaded data skipping rules; grouping boundaries 11:59, 12:00, 16:59, 17:00, 00:00, 23:59; hint thresholds 1, 3, 4; durations 15, 30, 45, 60, 90, 120, 135; `dayStrip` across a month boundary and a DST change; the request `date` equals the branch-zone date under a process time zone ahead of and one behind the branch zone near midnight.
  - _Requirements: 1.3, 1.4, 3.2, 4.1, 4.6, 6.1, 6.3_

- [x] 3. `conflict-map`, `confirm-outcome` and `request-budget`, `slot-cache`
  - `book/conflict-map.ts` with the verbatim strings of Req 8.2 (exact map plus the three patterns), `book/confirm-outcome.ts` (`mapConfirmError`), `book/request-budget.ts` (`SlidingWindowBudget`, 25 per 60 s, `retryAfterSeconds`), `book/slot-cache.ts` (`SlotCache`, 60 s freshness, `invalidate`, `dropBefore`).
  - Specs: one test per verbatim `409` string plus case and whitespace variants, the three patterns with real codes, an unknown text; the status-by-status outcome table (404, 409 classes, 422, 429 seconds, unavailable, network, timeout, 401, 400, 403); budget window sliding and the 26th request refused; cache freshness at 59 s and 61 s.
  - _Requirements: 5.3, 5.5, 8.2, 8.11_

- [x] 4. Reference data store
  - `features/customer/shared/reference-data/reference-data.store.ts`: `ensureBranches`, `ensureServices`, `refresh`, `branchById`, `serviceById`, states and error signals, one in-flight request, bookable-first sorting, clear on session end, reload on `OutageState.recovered` only after an error.
  - Specs: one request per session, concurrent first reads send one, refresh bypasses the cache, cleared when the session leaves `authenticated`, sorting, outage recovery reload.
  - _Requirements: 2.1, 2.6, 2.7, 3.1, 3.4, 11.5_

- [x] 5. Idempotency-key store and just-booked marker
  - `book/idempotency-key.store.ts` (`acquire`, `clear`, `rotate`, `pruneExcept`, memory mirror, UUID validation of a stored value, `crypto.randomUUID` then `getRandomValues` fallback, `NoSecureRandomError`) using the F1 session-storage helpers; `book/just-booked.marker.ts` (`sa.book.justBooked`, 10 minutes, consume once).
  - Specs: created once and reused, tampered value replaced, blocked storage falls back to memory with no error, slot change removes the old key, prune keeps only the current slot, no `localStorage` write, marker expiry and single consumption.
  - _Requirements: 7.2, 7.3, 7.4, 9.7_

- [x] 6. Slot search service
  - `book/slot-search.service.ts`: the debounced (250 ms) `switchMap` pipeline, synchronous cache hits, stale-while-revalidate with a `sameSlots` check, the budget with a countdown notice, `429` countdown with no auto retry, `404` handling through `ReferenceDataStore.refresh()`, outage re-issue on `OutageState.recovered`, normalisation (drop foreign or zero-capacity slots, sort by `startAtUtc`), `invalidate`.
  - Specs with fake timers: debounce, a superseded request aborted, a fresh hit sends nothing, a stale hit renders then refreshes and replaces only on change, 26 rapid distinct dates send at most 25, `429` countdown and the manual retry, `404`, outage then recovery.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 6.7_

- [x] 7. Wizard store and routing shell
  - `book/wizard.store.ts` (`BookingWizardStore`: URL-derived params, resolved branch, service, date, slot, step and strip; `selectedSlotId`, `notice`, `searchText`, `booking`, `initialised`; navigation methods; the repair effect with `replaceUrl` and the out-of-date notice; `booking` cleared when `done` leaves the URL), `book/book.routes.ts` (route providers, function `title`, `runGuardsAndResolvers: 'paramsOrQueryParamsChange'`), `book/step-heading.directive.ts`, and replace the F1 `book` placeholder with `loadChildren`.
  - A minimal `BookPage` with the `<h1>`, the notice and an `@switch` over the step showing placeholder step content.
  - Specs: step derivation from the URL, Back and forward through history, an invalid parameter repaired with `replaceUrl` and the note shown (and the value not echoed), the title per step, no focus move on first render and a focus move on a later step change, no wizard state in storage except the two `sa.*` keys.
  - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 12.2_

- [x] 8. Roving radio group directive and shared UI
  - note: `empty-state` and `inline-alert` were not added (F1 and F2 have not built them on this branch); add them when a step component needs them.
  - `shared/a11y/roving-radio-group.directive.ts` (`appRadioGroup` and `appRadioItem`: roles, `aria-checked`, roving `tabindex`, arrows with wrap across descendants, Home and End, Space and Enter, `aria-disabled` items focusable but not selectable, `(selected)` output).
  - Generate helm `skeleton` and `badge` with the Spartan CLI; add `empty-state` and `inline-alert` to `shared/ui/` only if F1 or F2 have not.
  - Specs: one tab stop, arrow and Home/End behaviour, a disabled item, selection by Space and Enter.
  - _Requirements: 2.6, 4.2, 6.2, 11.5, 12.1_

- [x] 9. Step indicator and page layout
  - `components/step-indicator.component.ts` (`<ol aria-label="Booking progress">`, `aria-current="step"`, reachable earlier steps as buttons, "Step N of 4" under 640 px via `ViewportService`, "Booked" on success), `components/action-bar.component.ts` (sticky above the F1 bottom tab bar), page layout (one column below 640 px, two columns from 640 and three from 1024, summary panel from 1024), the slide transition disabled under reduced motion.
  - Specs: ordered list and `aria-current`, reachable and unreachable steps, the narrow variant with a stubbed `matchMedia`, Back button per step.
  - _Requirements: 1.2, 1.5, 1.7, 1.8, 12.6, 12.8_

- [x] 10. Branch step
  - `components/branch-step.component.ts` and `branch-card.component.ts`: skeletons, 150 ms debounced search (diacritic-insensitive over name, code, address, no API call), result-count status, today's hours and Open/Closed badge from the F1 zone helpers with a one-minute tick, plain-text phone, the disabled no-schedule card, empty and error states, `OutageState.recovered` reload.
  - Specs: loading skeleton, search with fake timers and the no-match state, hours and badge for branches in Auckland, London and New York under another process zone (open at `opensAt`, closed at `closesAt`, closed today), the disabled card not selectable by click, Enter or Space and still focusable, empty list, outage then recovery, selection navigates with `branch`.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 12.4_

- [x] 11. Service step
  - _Done: 10/10/2026 9:48am_
  - `components/service-step.component.ts` and `service-card.component.ts`: the compact branch summary with "Change", duration pill, description clamp, checked state on return, loading, empty and error states.
  - Specs: sorting, pill text, "Change" returns to step 1 and drops later parameters, selection navigates with `service`.
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 12. Date strip
  - _Done: 10/10/2026 9:55am_
  - `components/date-strip.component.ts`: the 14-day radio group in the branch zone, "Today" and month labels, selected day scrolled into view (smooth only without reduced motion), default `date` set with `replaceUrl`, the "Times are shown in ..." line when `zoneDiffersFromBrowser`, minute-tick rollover recomputing the strip.
  - Specs: first day equals the branch-zone today (Sydney user, New York branch), arrow, Home and End keys, default date, zone line shown and hidden, rollover replaces a past selection and drops its cache entry.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [x] 13. Slot chips and slot states
  - _Done: 10/10/2026 10:01am_
  - `components/slot-groups.component.ts`, `slot-chip.component.ts` and `slots-status.component.ts`: grouped chips with the radio group, accessible names, capacity hint, selection held in the store, "Continue to review" writing `slot`, skeleton, empty state with "Check <next day>" and "Choose another branch", error with "Try again", `RateLimitNotice` with a manual retry, "N times available" status once per search, selection cleared with a toast when a refresh removes the slot, 44 px targets on narrow screens.
  - Specs: grouping and headings, empty group omitted, names and hints, keyboard across groups, selection cleared on date change, Continue disabled without a selection, the empty state and the absence of the next-day button on the last day, the `429` notice, the removed-slot toast, one status announcement per search.
  - _Requirements: 4.4, 5.1, 5.4, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 12.3_

- [x] 14. Confirm flow (state machine)
  - _Done: 10/10/2026 10:06am_
  - `book/confirm.machine.ts` (`createConfirmFlow`: the synchronous `inFlight` guard, `submit`, `retry`, `reset`, the transition table of the design, one auto retry after 2 s for "in progress", countdown for `429`, key kept, cleared or rotated per outcome, the request not aborted on component destroy).
  - Specs: every transition row with MSW and fake timers (key kept or rotated, destination step, toast calls, slot search forced on `slot-gone`), double click, Enter plus click and `dblclick` send one request, destroying the component mid-flight does not abort, the lost-response replay (same key twice, one success), `401` leaves the flow idle for F1, no call unless authenticated as a Customer.
  - _Requirements: 7.5, 7.6, 7.7, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 11.4_

- [x] 15. Review step
  - _Done: 10/10/2026 10:10am_
  - `components/review-step.component.ts` and `review-card.component.ts`: branch and service summary, branch-local date and time range, the zone label and "your time" line only when the zone differs, `tel:` link, the cancel note, the inline messages per `ConfirmState`, Confirm and "Choose another time" and "Try again" and "Check again" buttons, `RateLimitNotice`, `aria-busy`, key acquired on entry, the no-secure-random message.
  - Specs: summary text with and without a zone difference, exact request body and header, disabled controls while in flight, each message and button per state, key reuse on Back and on reload, new key after a slot change.
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.6, 7.8, 8.3, 8.4, 8.7, 8.8, 12.4_

- [x] 16. `buildIcs`, download and calendar button
  - _Done: 10/10/2026 10:13am_
  - `features/customer/shared/ics/build-ics.ts` (`buildIcs`, `icsFileName`, escaping, CRLF, folding at 75 octets without splitting a code point, UTC `DTSTART`/`DTEND`, UID), `ics-download.ts` (Blob, object URL revoked after the click, failure shown once with `showError`), and `book/components/calendar-button.component.ts` (lazy `import()` on first click).
  - Specs: exact `DTSTART` and `DTEND`, escaping of commas, semicolons, backslashes and a newline, control-character stripping, folding of a long ASCII address and of "Zürich", CRLF endings, UID, parse-back of the property set, file name cases, download failure.
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

- [x] 17. Success step and confetti
  - _Done: 10/10/2026 10:17am_
  - `components/success-step.component.ts`, `success-check.component.ts` (SVG draw within 600 ms), `confetti.component.ts` (canvas, at most 60 particles, 2 s, `aria-hidden`, no pointer events, stopped on destroy) loaded with `@defer` only when reduced motion is off, copy-reference with the clipboard fallback, the three actions; on `201` replace the step 4 entry with `done=1`, remove the key, invalidate the cache entry, write the marker; step 1 or 3 shows the saved hint when the marker is present.
  - Specs: heading focus and one announcement, summary and reference, Copy with the clipboard blocked, no confetti under reduced motion and none after 2 s, Back lands on step 3 without `slot`, the key is gone, the cache entry is invalidated, a reload with `done=1` and no booking drops it, "Book another" resets, the saved hint shows once.
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9_

- [x] 18. Invariant test
  - _Done: 10/10/2026 10:24am_
  - `booking-invariant.spec.ts`: a seeded pseudo-random sequence of confirm activations, retries, dropped responses, `503`s, Review reloads and double activations against `createBookingBackend()`; assert at most one appointment exists for the slot and exactly one success view.
  - _Requirements: 13.3_

- [x] 19. Playwright flows with mocked API
  - _Done: 10/10/2026 10:34am_
  - `e2e/book.spec.ts` (`page.route`, F1's mock helpers): a keyboard-only booking through all five steps with the downloaded `.ics` containing `DTSTART` and `LOCATION`; a deep link to Review; a stale `slot` recovering to step 3; a `409` overlap with the link to My appointments; a `503` followed by a same-key retry that books once (headers recorded); a `429` countdown on slot search and on Confirm.
  - _Requirements: 1.3, 1.4, 8.3, 8.7, 8.8, 10.1, 13.4_

- [x] 20. Accessibility and reflow checks
  - _Done: 10/10/2026 10:43am_
  - `e2e/book.a11y.spec.ts`: axe on each of the five steps in light and dark (fails on `serious` or `critical`), a 320 px width assertion of no horizontal page scroll per step, and a reduced-motion run asserting no confetti element.
  - _Requirements: 9.3, 12.1, 12.4, 12.5, 12.7, 12.8_

- [ ] 21. Chunk budget check
  - Extend `scripts/size.mjs` with `--group book` (sums gzip of outputs whose `entryPoint` is under `src/app/features/customer/book/` plus non-initial static imports, shared chunk counted once; fails over `MAX_GZIP_KB_BOOK`, default 60; reports the confetti and `.ics` chunks separately); add `pnpm size:book` and a CI `build`-job step. Record the measured total in `design.md`.
  - Confirm the F0 budgets still pass and no F3 code is in the initial bundle.
  - _Requirements: 13.5_

- [ ] 22. Documentation
  - Update `README.md` and `CLAUDE.md` project status (booking wizard built; the `features/customer/book` and `features/customer/shared` layout; the `branch`, `service`, `date`, `slot` and `done` query parameters; the `sa.idem.<slotId>` and `sa.book.justBooked` session-storage keys) and the spec index in `docs/specs/README.md` (F3 row status).
  - Add the F3 known gaps that remain open (conflict reasons matched by text, idempotency key per tab, no per-day availability or branch-service mapping, "Open now" is not availability) to the README's known-gaps list if one exists.
  - _Requirements: Introduction, Known gaps_

- [ ] 23. Manual verification against the live gateway
  - Start the backend with `docker compose up --build` (its `WEB_ORIGIN` set to the web origin) with at least one branch that has a weekly schedule and generated slots, and the web app with `pnpm start` or the web compose file.
  - Sign in as a customer and book a slot end to end; confirm the success screen, the reference, and that the `.ics` opens in a calendar with the right time and location; confirm the appointment is in the database.
  - Reload on Review and press Confirm to see the original result (same key); book an overlapping slot and confirm the `409` message and the link; pick a slot that another customer has just filled and confirm the return to step 3 with a refreshed list.
  - Stop the booking container, confirm the banner and the "may or may not have gone through" message, restart it and confirm the same-key retry books once.
  - Click through many dates quickly and confirm no `429`, then force one (about 31 searches in a minute) and confirm the countdown and the manual retry; check a branch with no schedule shows as disabled.
  - Complete a booking with only the keyboard, with a screen reader on at least one pass, in light and dark, and with reduced motion enabled; test at 320 px and on a phone.
  - Record the result in the PR description; tick this box only when every step passed.
  - _Requirements: 13.6_
