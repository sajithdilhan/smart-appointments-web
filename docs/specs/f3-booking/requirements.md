# F3 Booking Wizard — Requirements

## Introduction

This spec builds the customer booking flow at `/book`: a wizard of Branch, Service, Date and time, Review and Success that searches branches, service types and available slots and creates one appointment. It lives under `src/app/features/customer/book/` and renders inside the F1 customer shell. It refines build phase F3 of the approved frontend plan and serves the backend's `FR-AVL-004` (search available slots) and `FR-BKG-001` / `FR-BKG-002` (create an appointment with an `Idempotency-Key`; a repeat returns the original outcome).

F3 **consumes** F1 and F2 and does not redefine them: `AvailabilityApiService` and `BookingApiService` (F1 Requirement 1.3 left them as empty shells; F3 adds methods without touching the plumbing), `AppError` and its `kind` (F1 Requirement 3), `ToastService` (`showError`, `showSuccess`, `showInfo`), the shared `RateLimitNotice` and `createRetryCountdown()` (F1 Requirement 4), `OutageState` with its `recovered` signal (F1 Requirement 5), `SessionStore`, the guards (`authGuard`, `roleGuard('Customer')`), the time utilities `parseUtc`, `formatInZone` and `zoneDiffersFromBrowser` (F1 Requirement 13) and the MSW server with `onUnhandledRequest: 'error'` (F1 Requirement 14). F1 Requirement 1.5 guarantees the request helper never sets `Idempotency-Key`; F3 supplies it. The form and accessibility style follows F2 Requirement 6.

Backend contract this spec relies on (verified against `AppointmentsController`, `SlotsController` and the handlers):

- `GET /api/branches` returns `BranchResponse { id, code, name, description?, address, phoneNumber, isActive, timeZoneId?, workingHours[{ dayOfWeek ("Monday"), opensAt ("HH:mm:ss"), closesAt }] }`. A customer sees active branches only. `timeZoneId` and `workingHours` are absent or empty for a branch with no schedule.
- `GET /api/services` returns `ServiceTypeResponse { id, code, name, description?, durationMinutes, isActive }`, active only for a customer.
- `GET /api/slots/available?branchId&serviceId&date=yyyy-MM-dd` (all three required) returns future slots `{ id, branchId, serviceTypeId, date, startAtUtc, endAtUtc, localStartTime ("HH:mm:ss"), localEndTime, capacity, availableCapacity }`. It answers `404` when the branch or service is missing or inactive, `[]` when the branch has no schedule or no slot matches, and `429` with `Retry-After` beyond 30 requests per minute per user (BRD 11.5).
- `POST /api/appointments` (Customer only) needs the header `Idempotency-Key` (at most 128 characters) and the body `{ slotId }`. `201` returns `AppointmentResponse { id, customerId, slotId, branchId, serviceTypeId, startUtc, endUtc, status, createdAtUtc, updatedAtUtc, cancelledAtUtc? }` with a `Location` header. A replay with the same key and body returns the original status and body. `404` slot not found; `409` for an overlapping appointment ("You already have an appointment at that time."), a key still in progress, a full slot, an already started slot or an inactive slot; `422` when the key was reused with a different body; `503` when Availability is down; `429` beyond 10 per minute per user.
- Every error body is `{status, detail}` as `application/problem+json`, normalised by F1 into `AppError`. The gateway exposes `Retry-After`, `Location` and `X-Correlation-ID` to the SPA (F1 Introduction).

## Decisions

Approved with these decisions and resolutions:

- **Branches with no schedule are shown, disabled, with the badge "Online booking not available"** rather than hidden, so a customer is not left wondering where a branch went (Req 2.6).
- **Wizard state lives in the URL** as the query parameters `branch`, `service`, `date`, `slot` on `/book`; the step is derived from which are present and valid, never stored separately (Req 1).
- **One idempotency key per slot, created on entering Review** and persisted in `sessionStorage` as `sa.idem.<slotId>` (try/catch, memory fallback), so a reload of Review reuses it. It is cleared on success, when the slot changes and on a `422` (Req 7.2, 7.3, 8.6).
- **No backend error codes: `409`s are told apart by the exact `detail` text**, listed verbatim in Req 8.2. The matching lives in one mapping module with a test per string; an unknown `409` text falls back to "refresh the slots and return to step 3" (Req 8.2, Known gaps).
- **F3 owns the reference-data lookup and `buildIcs`**: branches and services are fetched once per session and cached in a shared `ReferenceDataStore`, and the pure `buildIcs` is a shared utility; both live under `src/app/features/customer/shared/` so F4 reuses them (Req 2.1, 3.1, 10.4, 11.5).
- **The 60 s slot cache, the 25 per minute client budget and one automatic retry after about 2 s for "in progress"** are accepted (Req 5.3, 5.5, 8.4).
- **The success screen is not deep-linkable and Back goes to step 3 without `slot`** (Req 9.6, 9.7). The line "You can cancel this appointment from My appointments" stays: F4 ships cancel (Req 7.1).
- **Slot queries are cached for 60 seconds per (branch, service, date), debounced, and the other days are never prefetched**, so normal use stays well under 30 requests per minute (Req 5).
- **The success screen is not deep-linkable**; a reload returns to step 1 (Req 9.7).
- **The date strip and "today" use the branch's time zone**, not the browser's (Req 4.1).

## Requirements

### Requirement 1: Wizard structure and URL state (no FR-ID)

**User Story:** As a customer, I want a guided, step-by-step booking whose steps I can bookmark and navigate with the Back button, so that I never lose my place.

#### Acceptance Criteria

1. WHEN a signed-in Customer opens `/book`, THEN the system SHALL render the wizard with the document title `Book an appointment | Smart Appointments`, one `<h1>` "Book an appointment" and the step indicator of criterion 2. The route SHALL be lazy and guarded by F1's `authGuard` and `roleGuard('Customer')`.
2. The step indicator SHALL be an ordered list (`<ol>`) labelled "Booking progress" with the steps Branch, Service, Date and time, Review, in that order, the current one carrying `aria-current="step"`. Completed steps SHALL be buttons that return to that step; steps not yet reachable SHALL be non-interactive text. The Success step SHALL replace the indicator with a "Booked" state.
3. The step SHALL be derived from the query parameters: no valid `branch` gives step 1; `branch` only gives step 2; `branch` and `service` give step 3; `branch`, `service`, `date` and `slot` give step 4; `done=1` with a booking in the store gives the Success view (Requirement 9.6). Each forward move and each move to an earlier step SHALL be a router navigation that pushes a history entry, so the browser Back button returns to the previous step with its choices intact. Moving to an earlier step SHALL drop the parameters of the later steps (choosing a different branch clears `service`, `date` and `slot`).
4. WHEN a parameter is present but invalid, THEN the system SHALL recover without an error page: a `branch` or `service` id not in the loaded active list (or a branch with no schedule), a `date` that is not `yyyy-MM-dd`, is earlier than today in the branch's time zone or is more than 13 days after it, or a `slot` not in the loaded slots for that date SHALL be removed together with every later parameter (`replaceUrl`, so Back does not loop). The wizard SHALL show the earliest step that is still valid and an inline `role="status"` note "That link is out of date. Choose again." above the step heading. The invalid value SHALL NOT be echoed into the page.
5. WHEN the step changes, THEN focus SHALL move to the new step's `<h2>` (`tabindex="-1"`), the document title SHALL become `<Step name> | Book an appointment | Smart Appointments`, and the content SHALL change with a slide transition of 250 ms or less (opacity and transform only), disabled under `prefers-reduced-motion: reduce`.
6. The wizard SHALL keep its in-memory state (loaded branches and services, the slot cache, the idempotency key) in one `@ngrx/signals` `BookingWizardStore` scoped to the route, with the selections derived from the URL, so a reload with valid parameters re-resolves them from fresh API data. No wizard state SHALL be written to `localStorage` or `sessionStorage`.
7. WHERE the viewport is narrower than 640 px, the step indicator SHALL collapse to "Step N of 4: <name>" with the same `aria-current` semantics, the layout SHALL be one column with no horizontal page scroll down to 320 px, and the primary action of each step SHALL sit in a sticky action bar above the F1 bottom tab bar without overlapping it.
8. Every step after the first SHALL have a "Back" button (not a history call) that goes to the previous step.

### Requirement 2: Step 1, choose a branch (FR-AVL-004)

**User Story:** As a customer, I want to find the branch I want, with its address and opening hours, so that I pick one I can reach.

#### Acceptance Criteria

1. WHEN step 1 opens, THEN the system SHALL read the branches from the shared `ReferenceDataStore` (F3 owns it, Requirement 11.5), which calls `GET /api/branches` once per session and caches the result and show skeleton cards, with `aria-busy="true"` on the list, until it returns.
2. Each branch SHALL be a card with the name, address, the phone number as plain text (a link inside a radio card is not accessible; the `tel:` link appears on the Review and Success steps) and the description clamped to two lines (when present). The cards SHALL form a `role="radiogroup"` labelled "Branch" (Requirement 12.1); selecting one SHALL navigate to step 2 with `branch=<id>`.
3. The step SHALL provide a search field labelled "Search branches" that filters the loaded list as the user types, case-insensitively and diacritic-insensitively, by name, code and address, after a 150 ms debounce, with no API call. WHEN nothing matches, THEN the step SHALL show `No branches match "<text>"` (interpolated, never as HTML) and a "Clear search" button. The result count SHALL be announced once per pause in a polite `role="status"` region ("3 branches found").
4. Each branch that has a `timeZoneId` and at least one `workingHours` entry SHALL show today's opening hours as "Today 09:00 to 17:00", using the weekday of today **in the branch's time zone** (`Intl.DateTimeFormat` with the branch `timeZoneId`, never the browser zone), with seconds removed and the 12 or 24 hour clock following the browser locale. IF the branch has no interval for that weekday, THEN the card SHALL say "Closed today".
5. Each such card SHALL show an "Open now" badge WHEN the current time of day in the branch's time zone is at or after `opensAt` and before `closesAt` of today's interval, and "Closed" otherwise. The badge SHALL use text plus an icon, use an injectable clock so tests can fix "now", and be re-evaluated once a minute while the step is open. It is informational only and SHALL NOT enable or disable selection.
6. WHERE a branch has no `timeZoneId` or an empty `workingHours`, THEN its card SHALL show the badge "Online booking not available", be dimmed, carry `aria-disabled="true"`, SHALL NOT be selectable by click, Enter or Space, stay focusable with `aria-describedby` explaining why, and sort after the bookable branches.
7. IF `GET /api/branches` returns an empty list, THEN the step SHALL show "There are no branches available for online booking yet." IF it fails with `unavailable`, `network` or `timeout`, THEN the F1 outage banner SHALL show, the step SHALL show an inline error with "Try again", and it SHALL reload WHEN `OutageState.recovered` increments. IF it fails otherwise, THEN the step SHALL show the message inline and call `ToastService.showError` once.
8. A unit test SHALL fix "now" and assert, for branches in `Pacific/Auckland`, `Europe/London` and `America/New_York` under a different process time zone, the weekday chosen, the hours text and the badge, including the instants `opensAt` (open) and `closesAt` (closed) and a branch closed today.

### Requirement 3: Step 2, choose a service (FR-AVL-004)

**User Story:** As a customer, I want to see what each service involves and how long it takes, so that I book the right one.

#### Acceptance Criteria

1. WHEN step 2 opens, THEN the system SHALL read the services from the same `ReferenceDataStore`, which calls `GET /api/services` once per session, and show skeleton cards until it returns, with the loading, empty ("No services are available right now."), outage, retry and error behaviour of Requirement 2.7.
2. Each service SHALL be a card (in a `role="radiogroup"` labelled "Service") showing the name, the description clamped to two lines and a duration pill. A pure formatter SHALL render `durationMinutes` as "30 min", "1 h" or "1 h 30 min" (table-driven test: 15, 30, 45, 60, 90, 120, 135), as text.
3. The selected branch SHALL stay visible above the cards as a compact summary with a "Change" button, and selecting a service SHALL navigate to step 3 with `service=<id>`. A card already chosen SHALL show `aria-checked="true"` on return.
4. Services SHALL be sorted by `name` in the browser locale. The system SHALL NOT assume every service is offered at every branch: the backend has no branch-service mapping, so an empty slot list on step 3 is how "not offered there" appears (Known gaps).

### Requirement 4: Step 3, date strip (FR-AVL-004)

**User Story:** As a customer, I want to pick a day from the next two weeks, so that I can see what is free.

#### Acceptance Criteria

1. WHEN step 3 opens, THEN the system SHALL show a strip of 14 consecutive days, the first being today **in the selected branch's time zone**, so a customer in Sydney booking a New York branch sees New York's today. Each day SHALL be a button showing the short weekday and day of month ("Sun 4") with an accessible name carrying the full date ("Sunday 4 October 2026"). The strip SHALL scroll horizontally on narrow viewports with the selected day scrolled into view and a visible scroll affordance.
2. The strip SHALL be a `role="radiogroup"` labelled "Choose a date" with radios on a roving `tabindex` (Left and Right Arrow move one day, Home and End jump to the ends, Space or Enter select) and `aria-checked` on the selection. Today SHALL carry the text "Today"; the first day of a month SHALL show its month abbreviation.
3. WHEN step 3 opens without a valid `date`, THEN the system SHALL select today and set `date` with `replaceUrl`. WHEN the user selects another day, THEN the system SHALL navigate (push) with the new `date` and clear `slot`.
4. The strip SHALL NOT mark days as available or full, and the system SHALL NOT call the slot search for other days to find out (Requirement 5.2).
5. WHERE `zoneDiffersFromBrowser(branchZone, <noon of the selected date>)` is true, a line under the strip SHALL say "Times are shown in <zone name> time"; otherwise it SHALL be omitted.
6. The `date` sent to the backend SHALL be the strip's own branch-zone calendar date, never derived from `new Date().toISOString()` or the browser's date. A unit test under a process time zone ahead of and one behind the branch zone SHALL assert that, at a fixed "now" near midnight, the first strip date and the request `date` equal the branch-zone date.
7. WHEN the branch's today rolls over while the step is open (observed by the Requirement 2.5 minute tick), THEN the strip SHALL be recomputed, a selected date now in the past SHALL be replaced by the new today and cache entries for past dates SHALL be dropped.

### Requirement 5: Step 3, slot search and caching (FR-AVL-004)

**User Story:** As a customer, I want free times to appear quickly and stay correct, without being rate-limited for clicking around.

#### Acceptance Criteria

1. WHEN `branch`, `service` and `date` are valid, THEN the system SHALL call `GET /api/slots/available?branchId=<id>&serviceId=<id>&date=<yyyy-MM-dd>` and show a skeleton of chips (with group placeholders) with `aria-busy="true"` on the slot region until it returns.
2. The system SHALL send at most one search per settled user action: no prefetching of other days and no polling. A search SHALL be sent no earlier than 250 ms after the last date change (debounce), so holding an arrow key over the strip does not send a request per day; a superseded request SHALL be aborted and its result ignored.
3. Results SHALL be cached in the store, keyed by `branchId|serviceId|date`, for 60 seconds. WHEN the user returns to a key with a fresh entry, THEN the system SHALL render it with no request. WHEN the entry is older, THEN the system SHALL render it at once and refresh in the background without a skeleton, replacing the chips only if the result differs. A "Refresh" button SHALL always bypass the cache.
4. WHEN a `429` arrives, THEN the system SHALL show F1's `RateLimitNotice` in place of the chips with a countdown from `retryAfterSeconds`, SHALL NOT retry automatically, and SHALL leave only cached days selectable until the countdown ends; a "Try again" button SHALL then appear.
5. The system SHALL count its own search requests in a sliding 60-second window. WHEN 25 have been sent in the window (a margin under the gateway's 30), THEN it SHALL serve from cache where possible and otherwise show the same countdown notice instead of sending. A unit test with fake timers SHALL assert that 26 rapid distinct-date selections send at most 25 requests.
6. IF the search answers `404`, THEN the system SHALL clear the cached branches and services, reload them, drop the invalid selection (Requirement 1.4), return the user to the earliest valid step and call `ToastService.showInfo("That option is no longer available. Please choose again.")`.
7. IF the search fails with `unavailable`, `network` or `timeout`, THEN the F1 outage banner SHALL show, the slot region SHALL show an inline error with "Try again", and the search SHALL re-run WHEN `OutageState.recovered` increments.
8. The system SHALL sort slots by `startAtUtc` and discard any whose `branchId` or `serviceTypeId` differs from the request or whose `availableCapacity` is not above zero.

### Requirement 6: Step 3, slot chips (FR-AVL-004)

**User Story:** As a customer, I want free times grouped by part of the day, selectable by tap or keyboard.

#### Acceptance Criteria

1. Slots SHALL be grouped by the hour of `localStartTime` (branch-local; the SPA SHALL NOT recompute it from `startAtUtc`): Morning for hours 00 to 11, Afternoon 12 to 16, Evening 17 to 23. Each non-empty group SHALL have a heading; empty groups SHALL be omitted.
2. Each chip SHALL show `localStartTime` as "09:30" (seconds removed) with an accessible name such as "09:30 to 10:00, 2 spots left" built from `localStartTime`, `localEndTime` and the capacity hint. All chips SHALL form one `role="radiogroup"` labelled "Available times" with a roving `tabindex` (arrow keys move in visual order across groups, Space or Enter select) and `aria-checked` on the selection.
3. WHEN `availableCapacity` is 3 or less, THEN the chip SHALL show "N left" ("1 left" for one) as text with a small meter; WHEN it is greater than 3, THEN no hint. The chip SHALL NOT show the total `capacity`.
4. Selecting a chip SHALL mark it selected in the wizard store (not in the URL) and enable a primary "Continue to review" button; the system SHALL NOT advance automatically. WHEN the user activates "Continue to review", THEN the system SHALL navigate (push) with `slot=<id>`, which is what makes step 4 (Requirement 1.3). Changing the date clears the selection.
5. WHERE the viewport is narrower than 640 px, chips SHALL be at least 44 by 44 CSS pixels in a wrapping grid of at least three columns at 360 px.
6. IF the list for the date is empty, THEN the system SHALL show "No times available on <full date>." with a "Check <next day>" button selecting the next strip day (omitted on the last day) and a "Choose another branch" link. The backend returns only future slots, so a late-evening today shows the same state.
7. WHEN a polling-free background refresh (Requirement 5.3) removes the selected slot, THEN the selection SHALL be cleared, "Continue to review" SHALL be disabled and `ToastService.showInfo("The time you picked is no longer available.")` SHALL be called.
8. A polite `role="status"` region SHALL announce "N times available" once per completed search, not per chip.
9. Component tests (queries by role and name) SHALL cover the grouping boundaries (11:59 morning, 12:00 afternoon, 16:xx afternoon, 17:00 evening), the capacity hint thresholds (1, 3 shown; 4 hidden), the accessible name and the radio-group keyboard behaviour.

### Requirement 7: Step 4, review and idempotency key (FR-BKG-001, FR-BKG-002)

**User Story:** As a customer, I want to check my booking before confirming, and I want a slow connection or a double tap never to book twice.

#### Acceptance Criteria

1. WHEN step 4 opens (valid `branch`, `service`, `date`, `slot`), THEN the system SHALL show a review card with the branch name and address, the service name and duration, and the date and time range ("Sunday 4 October 2026, 09:30 to 10:00") built from the slot's `date`, `localStartTime` and `localEndTime`. WHERE `zoneDiffersFromBrowser(branchZone, slotStart)` is true, THEN it SHALL add the zone label ("Europe/London time") and the start in the customer's own zone ("15:30 your time") formatted with `formatInZone` from `startAtUtc`. The card SHALL say "You can cancel this appointment from My appointments." (FR-BKG-005 ships in v1).
2. WHEN the user enters step 4 for a slot id, THEN the system SHALL read `sessionStorage` key `sa.idem.<slotId>`; IF it holds a valid UUID, THEN that key SHALL be used, otherwise the system SHALL create one with `crypto.randomUUID()` (36 characters, within the 128-character limit) and write it there. The key SHALL be created once per slot and reused for every submit, retry and reload of Review for that slot, SHALL NOT be placed in the URL or `localStorage`, and SHALL NOT exist before step 4. Every `sessionStorage` access SHALL be wrapped in try/catch; IF storage throws or is unavailable, THEN the key SHALL be held in memory only and no error SHALL surface.
3. WHEN the selected slot id changes, THEN the `sa.idem.<previous slotId>` entry SHALL be removed and a new key created on the next entry to step 4. The key SHALL also be removed on a successful booking and on a `422` (Requirements 8.6, 9.8). WHEN the user goes Back from step 4 and returns to the same slot id, or reloads Review, THEN the existing key SHALL be kept. WHEN the wizard starts, THEN every `sa.idem.*` entry except the current slot's SHALL be pruned.
4. IF `crypto.randomUUID` is unavailable, THEN the system SHALL build a UUID v4 from `crypto.getRandomValues`; IF that is unavailable too, THEN it SHALL show "Your browser cannot book appointments safely. Try a newer browser." and disable Confirm.
5. WHEN the user activates "Confirm booking", THEN the system SHALL send `POST /api/appointments` with `Idempotency-Key: <key>` and the body `{ "slotId": "<id>" }`, exactly that one property (no customer, branch or service id; a unit test with MSW SHALL assert the body and header).
6. WHILE the request is in flight, Confirm SHALL be disabled with a spinner and `aria-busy="true"`, and Back and the step indicator SHALL be disabled. A second activation by click, Enter, Space or double tap SHALL send nothing: the guard SHALL be a store `submitting` flag set synchronously before the request starts, not only a disabled attribute, which a fast second event can beat.
7. Navigating away while a request is in flight SHALL NOT abort it (an aborted POST can leave the server booked and the client unaware); returning SHALL show Confirm still disabled until the request ends.
8. The review SHALL NOT claim the slot is still available; the server decides at Confirm.

### Requirement 8: Step 4, outcome handling (FR-BKG-001, FR-BKG-002)

**User Story:** As a customer, I want a clear explanation and a sensible next move when a booking does not go through.

#### Acceptance Criteria

1. WHEN the server answers `201`, THEN Requirement 9 applies. A replayed `201` (the same key retried) SHALL be handled identically; the SPA neither needs to nor can tell a replay from a first success.
2. The system SHALL classify every `409` through one mapping module (`features/customer/book/conflict-map.ts`) keyed on the normalised `detail` (trimmed, case-insensitive; an exact match unless a pattern is shown). These are the backend's strings, verbatim (Booking `AppointmentErrors`, Availability `SlotErrors`, Booking `AvailabilityClient`), and each has its own unit test:

   | `detail`                                                                           | Source                                                | Class                             |
   | ---------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------- |
   | `You already have an appointment at that time.`                                    | Booking                                               | `overlap`                         |
   | `A request with this Idempotency-Key is still being processed.`                    | Booking                                               | `in-progress`                     |
   | `Slot is full.`                                                                    | Availability, passed through                          | `slot-gone`                       |
   | `Slot has already started.`                                                        | Availability, passed through                          | `slot-gone`                       |
   | `Branch '<code>' is inactive.` (pattern `^Branch '.+' is inactive\.$`)             | Availability                                          | `slot-gone`                       |
   | `Service type '<code>' is inactive.` (pattern `^Service type '.+' is inactive\.$`) | Availability                                          | `slot-gone`                       |
   | `Branch '<code>' has no working hours.` (pattern)                                  | Availability                                          | `slot-gone`                       |
   | `The slot cannot be reserved.`                                                     | Booking fallback for an unreadable Availability `409` | `slot-gone`                       |
   | any other text                                                                     | n/a                                                   | `unknown`, handled as `slot-gone` |

   Other verbatim strings the wizard can meet: `404` `Slot not found.` (Booking; criterion 5); `422` `This Idempotency-Key was already used with a different request.`; `503` `The availability service is unavailable. Try again later.`; `400` `The Idempotency-Key header is required.` and `The Idempotency-Key must be at most 128 characters.` (not reachable from the UI). `The appointment has already started and can no longer be cancelled.` is a cancel-only `409` and belongs to F4. The class is decided by status first and `detail` second, and the `detail` text is never displayed for `slot-gone` and `unknown`.

3. IF the class is `overlap`, THEN the system SHALL stay on step 4, show an inline `role="alert"` message "You already have an appointment at that time." with a link "View my appointments" to `/appointments`, and replace Confirm with "Choose another time", which returns to step 3 (the same slot cannot succeed). The key SHALL be kept until the slot changes.
4. IF the class is `in-progress`, THEN the system SHALL keep the same key, show "Your booking is still being processed.", re-send the same request once automatically after 2 seconds and afterwards only on a "Check again" button, and SHALL NOT create a new key. IF the class is `slot-gone` or `unknown`, THEN the system SHALL bypass the cache and re-run the slot search for the date, return to step 3 with `slot` removed (`replaceUrl`), remove the stored key, call `ToastService.showInfo("That time is no longer available. Please choose another.")` and move focus to the step 3 heading.
5. IF the server answers `404`, THEN the system SHALL do the same as the `slot-gone` handling of criterion 4.
6. IF the server answers `422`, THEN the system SHALL remove `sa.idem.<slotId>`, create and store a new key, stay on step 4, show "Something went wrong with that request. Please confirm again." and re-enable Confirm. A `422` SHALL NOT be retried automatically.
7. IF the request fails with `kind` `unavailable` (`502`, `503`, `504`), `network` or `timeout`, THEN the system SHALL keep the same key and stay on step 4, the F1 outage banner SHALL show, and an inline `role="alert"` message "We could not confirm your booking. It may or may not have gone through. Try again; you will not be booked twice." SHALL show with a "Try again" button that re-sends the **same** key and body once the request has ended. WHEN `OutageState.recovered` increments, THEN the message MAY gain emphasis but the system SHALL NOT retry by itself (retrying a mutation is the user's decision).
8. IF the server answers `429`, THEN the system SHALL replace Confirm with F1's `RateLimitNotice` counting down from `retryAfterSeconds`, keep the same key and show Confirm again when the countdown ends, with no automatic retry.
9. IF the server answers `401` after F1's single refresh and retry, THEN F1's session-ended handling applies with `returnUrl` equal to the wizard URL (including `slot`), and a new key SHALL be created on return to step 4. IF it answers `403` or `400`, THEN the system SHALL show the normalised message inline and call `ToastService.showError` once.
10. IF the first attempt succeeded on the server but its response was lost and the user retries with the same key, THEN the retry SHALL return the original `201` and exactly one success screen SHALL show. A component test with MSW (first call booked then times out; second call replays) SHALL assert exactly one success screen and the same key sent twice.
11. A unit test per status and per `409` string of criteria 2 to 9 SHALL assert the visible message, whether the key was kept or regenerated, the destination step and whether `ToastService` was called. Messages SHALL come from the fixed strings above or `AppError.message`, never raw response text.

### Requirement 9: Step 5, success (FR-BKG-001)

**User Story:** As a customer, I want a clear confirmation and an easy way to add the appointment to my calendar.

#### Acceptance Criteria

1. WHEN booking succeeds, THEN the wizard SHALL show the Success step with the document title `Appointment booked | Smart Appointments`, focus on its `<h2>` "You're booked" and a single polite announcement "Your appointment is booked for <date and time>." The screen is the confirmation, so no success toast is shown.
2. The screen SHALL show an animated check (an inline SVG whose stroke draws in within 600 ms) and a light confetti burst of at most 60 particles lasting at most 2 seconds, implemented from the app bundle (canvas or CSS; a library, if any, bundled and lazy, never from a CDN, consistent with the F0 CSP). The burst SHALL be `aria-hidden`, SHALL NOT capture pointer events or focus and SHALL stop on navigation.
3. WHILE the user has `prefers-reduced-motion: reduce`, the check SHALL be drawn instantly and the confetti SHALL NOT run.
4. The screen SHALL show the branch name and address, the service name and duration, the appointment time built with `formatInZone(parseUtc(startUtc), branchZone)` and labelled under the rule of Requirement 7.1, and the **booking reference**, the appointment id, in full with a "Copy reference" button (the F1 Requirement 3.10 clipboard fallback: the value stays visible and selectable, no error is thrown).
5. The screen SHALL offer, in order, "Add to calendar" (Requirement 10), "View my appointments" (a link to `/appointments`) and "Book another" (resets the wizard to step 1 with no parameters).
6. WHEN booking succeeds, THEN the system SHALL replace the step 4 history entry (`replaceUrl`) with `/book?branch=<id>&service=<id>&date=<date>&done=1` (no `slot`, no reference); the Success view SHALL show only while `done=1` is present AND the booking is held in the wizard store. WHEN the user presses the browser Back button on the Success step, THEN the previous history entry (step 3 for the same branch, service and date, without `slot`) SHALL load, the Success view SHALL disappear and the idempotency key SHALL already have been removed, so a second confirm cannot silently book again.
7. The Success step SHALL NOT be deep-linkable and the reference SHALL NOT be placed in the URL: a load or reload with `done=1` but no booking in the store SHALL drop `done` and show step 3 (the earliest valid step for the remaining parameters). WHEN a booking was just made in this browser tab (a `sessionStorage` marker `sa.book.justBooked` written on success, valid for 10 minutes, consumed once), THEN step 1 or step 3 reached after a reload or "Book another" SHALL show "Your appointment is saved. Find it in My appointments."
8. WHEN booking succeeds, THEN `sa.idem.<slotId>` SHALL be removed. The slot cache entry for the booked (branch, service, date) SHALL be invalidated so a later visit shows the reduced capacity.
9. A component test SHALL assert the summary, the reference, the absence of the confetti when reduced motion is on, and Back landing on step 3 without `slot`.

### Requirement 10: Add to calendar (.ics) (FR-BKG-001)

**User Story:** As a customer, I want to put my appointment in my calendar app with one click.

#### Acceptance Criteria

1. WHEN the user activates "Add to calendar", THEN the system SHALL generate the file client-side with no network request and download it as `appointment-<yyyyMMdd>-<branch code lowercase>.ics` (the date from `startUtc` in UTC; characters outside `a-z0-9-` replaced by `-`) with the type `text/calendar;charset=utf-8`, using a `Blob` and an object URL revoked right after the click.
2. The file SHALL be RFC 5545: lines end in CRLF, lines are folded at 75 octets (continuations start with one space, never splitting a UTF-8 multi-byte sequence), and it SHALL contain `BEGIN:VCALENDAR`, `VERSION:2.0`, `PRODID:-//Smart Appointments//Web//EN`, `CALSCALE:GREGORIAN`, `METHOD:PUBLISH`, one `VEVENT` with `UID:<appointment id>@smartappointments`, `DTSTAMP` (generation time), `DTSTART` and `DTEND` in UTC basic form (`20261004T143000Z`, from `startUtc` and `endUtc` after `parseUtc`, never from the local strings), `SUMMARY`, `LOCATION`, `DESCRIPTION`, `STATUS:CONFIRMED`, `END:VEVENT` and `END:VCALENDAR`.
3. `SUMMARY` SHALL be "<service name> at <branch name>", `LOCATION` the branch address, and `DESCRIPTION` the booking reference, the branch phone number and the local start with its zone ("09:30 Europe/London"). TEXT values SHALL escape backslash, semicolon, comma and newline (RFC 5545 section 3.3.11) and strip other control characters so a branch name or address cannot inject a property.
4. The generator SHALL be a pure function `buildIcs(input, now)` taking plain data (strings and dates), owned by F3 and placed in `src/app/features/customer/shared/ics/` so F4 reuses it for the appointment detail. Table-driven unit tests SHALL cover the exact `DTSTART` and `DTEND`, escaping of commas and semicolons in an address, a name containing a newline, folding of an address over 75 characters and of one with multi-byte characters ("Zürich"), the CRLF endings and the UID, by parsing the output back.
5. IF the download cannot be created, THEN the system SHALL call `ToastService.showError` once ("We could not create the calendar file.") and SHALL NOT throw.
6. The control SHALL be a real `<button>` named "Add to calendar" with a visually hidden suffix "download .ics file".

### Requirement 11: Loading, empty and error states and session (no FR-ID)

**User Story:** As a user, I want every wait and failure in the wizard to be understandable.

#### Acceptance Criteria

1. Every step that loads data SHALL show skeletons shaped like the final content, a "Try again" button on failure, and SHALL NOT show a blank area for more than 150 ms.
2. WHILE the F1 outage banner is visible, the wizard SHALL keep the user's selections, and WHEN `OutageState.recovered` increments, THEN the current step's data SHALL reload once.
3. IF the session ends during the wizard (F1 Requirement 8), THEN the `returnUrl` SHALL be the current wizard URL, so a successful login returns the customer to the same step; on step 4 a new key is created.
4. The wizard SHALL NOT call `GET /api/slots/available` or `POST /api/appointments` until the session is `authenticated`, and SHALL NOT call `POST /api/appointments` WHEN the role is not `Customer` (F1's `roleGuard` already redirects other roles).
5. `ReferenceDataStore` (`features/customer/shared/`) SHALL be the one place that fetches and caches branches and services for the signed-in session: one request each per session, a `refresh()` that bypasses the cache (used by Requirement 5.6), cleared when the session ends, and shared by F3 and F4. Two concurrent first reads SHALL send one request.
6. Skeleton, empty-state and inline-alert components SHALL come from `src/app/shared/ui/` where F1 or F2 created them; new ones needed here SHALL be added there for F4 and F5 to reuse.

### Requirement 12: Accessibility and responsive layout (no FR-ID)

**User Story:** As a keyboard or screen-reader user on any device, I want to complete a booking without a mouse or sight.

#### Acceptance Criteria

1. Every radio group of the wizard (branch cards, service cards, date strip, slot chips) SHALL follow the WAI-ARIA radio-group pattern: one tab stop, arrow keys move focus and selection, Space selects, a visible group label, a focus indicator of at least 3:1 contrast not hidden by the sticky action bar (WCAG 2.4.11) and targets of at least 24 by 24 CSS pixels (44 by 44 for chips and cards on touch viewports, WCAG 2.5.8). A disabled branch card (Requirement 2.6) is the exception to selection, not to focus.
2. Every step change SHALL move focus to the step heading and update the document title (Requirement 1.5).
3. Status changes (counts, "N times available", the out-of-date note, the booking announcement) SHALL use polite `role="status"` regions once per change; errors SHALL use `role="alert"`; countdowns SHALL use F1's `RateLimitNotice`.
4. Information SHALL never rely on colour alone (open and closed badge, capacity hint, selected state, disabled card).
5. Text and UI components SHALL meet WCAG 2.2 AA contrast in both themes, and every step SHALL work at 200% zoom and at 320 px without two-dimensional scrolling (the date strip's own horizontal scroll area is the only exception and is keyboard reachable).
6. The layout SHALL be mobile-first: one column below 640 px, two columns of cards from 640 px and three from 1024 px, with a sticky summary panel beside the Review card from 1024 px.
7. A `@axe-core/playwright` run SHALL cover each of the five steps in light and dark and fail on any `serious` or `critical` violation. The full audit remains F6.
8. Slide, check, confetti and skeleton shimmer animations SHALL be disabled or instant under `prefers-reduced-motion: reduce`.

### Requirement 13: Tests and delivery (no FR-ID)

**User Story:** As a maintainer, I want the booking flow covered by tests that need no backend.

#### Acceptance Criteria

1. MSW handlers in `src/testing/handlers/availability.handlers.ts` and `booking.handlers.ts` SHALL model the real rules: branches (one with no schedule, and one each in `Pacific/Auckland`, `Europe/London` and `America/New_York`), services, slot search (`404` for an unknown or inactive branch or service, `[]` for no schedule, `429` with `Retry-After: 60` on request 31 in a minute when enabled), and appointment creation with a real idempotency store (same key and body replays the first status and body; same key with another body `422`; overlap `409` "You already have an appointment at that time."; full or started slot `409`; unknown slot `404`; missing `Idempotency-Key` `400`) plus switches for `503` and for a timeout after a successful booking. Handlers SHALL echo `X-Correlation-ID`, return `{status, detail}` as `application/problem+json`, and SHALL NOT ship in the production bundle.
2. Unit and component tests SHALL cover every criterion marked as tested above, using Vitest fake timers (no `fakeAsync`), Angular Testing Library queries by role and name, and a fixed process time zone different from every zone under test.
3. A dedicated test SHALL assert the invariant that matters most: for any sequence of confirm activations, retries and network failures against the real-rules MSW store, at most one appointment exists for the slot and exactly one success screen is shown.
4. A Playwright e2e test (mocked with `page.route`, no backend) SHALL cover: booking through all five steps by keyboard only, with a download whose content has `DTSTART` and `LOCATION`; a deep link to `/book?branch=...&service=...&date=...&slot=...` landing on Review; a stale `slot` recovering to step 3; a `409` overlap showing the link to My appointments; a `503` followed by a retry that books once with the same key (asserted from recorded request headers); and a `429` showing the countdown.
5. The wizard's lazy chunk SHALL add no more than 60 kB gzipped (an estimate until it exists, reported by `pnpm size`), the confetti code SHALL be a separate lazy chunk loaded only on success, and the F0 budgets SHALL still pass.
6. WHERE the Compose stack is available, a documented manual check SHALL book a slot end to end, repeat the confirm to see the original result, book an overlapping slot to see the `409`, and stop the booking container to see the banner and a same-key retry.

## Out of scope

- **Rescheduling:** the backend has no reschedule endpoint (FR-BKG-005 is cancel only); a customer cancels in F4 and books again.
- **Staff or admin booking on behalf of a customer:** `POST /api/appointments` is Customer-only.
- **Payments, deposits and prices:** the backend models none.
- **Guest booking:** a session is required; an anonymous visitor goes to `/login` through F1 and returns to `/book`.
- **My appointments, cancel and appointment detail** (F4; FR-BKG-003, FR-BKG-005): F3 only links to `/appointments`.
- **Queue, waitlist, notifications and reminders:** those services do not exist.
- **Recurring or multi-slot bookings and choosing a staff member.**
- **A branch-service mapping or a per-day availability overview:** the backend offers neither.
- **Server-rendered or offline booking, service workers, translations** (English only; times follow the browser locale).
- **Backend changes** such as machine-readable conflict codes (Known gaps).

## Known gaps

- **Conflict reasons are told apart by text.** The `409` cases carry only `{status, detail}`; the SPA matches the verbatim strings of Requirement 8.2 in one mapping module and treats any unrecognised `409` as "no longer available". A reworded backend message degrades to that generic path (still safe: the user returns to step 3, and for an overlap sees a less specific message); a backend error code is the real fix and is out of scope.
- **The idempotency key survives a reload but not a closed tab.** It lives in `sessionStorage` (`sa.idem.<slotId>`), so a reload of Review replays the original outcome; a new tab, or a browser that blocks storage (memory fallback), gets a new key, and the server's overlap rule then answers `409` "You already have an appointment at that time.", which Requirement 8.3 explains and links to My appointments.
- **No per-day availability and no branch-service mapping.** The strip cannot show full days without 13 extra requests against a limit of 30 per minute, and a service not offered at a branch looks like an empty day. Both need backend support.
- **"Open now" is not availability.** It compares weekly hours with the clock and ignores holidays and exceptions (the backend has none); a branch can show "Open now" with no slots.
- **The 25-request guard is per tab,** while the gateway limit is per user; two tabs can still reach `429`, which Requirement 5.4 handles.
- **Capacity is a snapshot.** A slot may fill between search and Confirm (`409`); Requirement 8.4 handles it.
- **A lost confirm response can leave the customer unsure.** Retrying with the same key returns the original `201`, but a customer who closes the tab must check My appointments; there is no "find my booking by key" endpoint.
- **`AppointmentResponse.status` is an enum** whose JSON form (string or number) is confirmed after the first `pnpm gen:api`; F3 does not branch on it.
- **A branch with no `timeZoneId` is treated as not bookable online** (Requirement 2.6); an unknown identifier falls back to UTC with a console warning (F1 Requirement 13.3), so its hours and badge are labelled UTC.
- **Depends on in-progress backend work:** `gateway-cors` (the `Idempotency-Key` request header, `Location` exposure) and the unified error body; until deployed, F3 is verified against MSW only.
