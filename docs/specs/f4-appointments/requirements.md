# F4 My appointments and Profile — Requirements

## Introduction

This spec builds the signed-in customer's history screens: the **My appointments** list at `/appointments` (Upcoming and Past tabs), the **appointment detail** at `/appointments/:id` (a side sheet on desktop, a full page on mobile, always deep-linkable), the **cancel** flow, and the **Profile** page at `/profile`. It lives under `src/app/features/appointments/` and `src/app/features/profile/`, inside the F1 customer shell, and refines build phase F4 of the approved frontend plan. It serves the backend's `FR-BKG-003` (view own appointments), `FR-BKG-005` (cancel before the start time) and, for the profile, `FR-AUTH-003` (`GET /api/auth/me`).

F4 **consumes** F0, F1 and F3 and does not redefine them: `ApiClient` and the typed `BookingApiService` / `AvailabilityApiService` shells, `AppError` and its `kind`, `ToastService` (`showError`, `showSuccess`), `OutageState` and its `recovered` counter, `SessionStore` (including the `/me` profile and `logout`), `RateLimitNotice`, the time utilities (`parseUtc`, `formatInZone`, `zoneDiffersFromBrowser`), the customer shell, the `/appointments`, `/appointments/:id` and `/profile` routes (F1 Requirement 11.1 left placeholders), the MSW server (`onUnhandledRequest: 'error'`), and the F0 `ThemeService` (`system | light | dark`) and theme tokens. The `.ics` builder and the "Add to calendar" action are **F3's**; F4 reuses them and does not write a second one. Where a criterion says "the F1 error handling" it relies on that behaviour and tests it with a fake, not by re-testing F1.

Backend contract this spec relies on (verified against `AppointmentsController`, `BranchResponse`/`ServiceTypeResponse`, `docs/specs/booking-appointments/` and `docs/specs/booking-my-appointments/`; the latter is approved but lives on a backend worktree branch and is not yet deployed):

- **List.** `GET /api/appointments/my?status=Booked|Cancelled&when=upcoming|past&page=<int >= 1>&pageSize=<1..100>`, `CustomerPolicy` (a Staff or Admin caller gets `403`). All four parameters are optional and case-insensitive; defaults `page=1`, `pageSize=20`. The response is `{ items, page, pageSize, totalCount }` with `items` being `AppointmentResponse`. `upcoming` means `startUtc >= now`, ordered ascending; `past` (and no `when`) is ordered descending; ties break by `id`. Beyond the last page the answer is `200` with empty `items`. An invalid parameter is `400` listing every invalid one. The gateway adds no rate limit to it (BRD 11.5).
- **AppointmentResponse** `{ id, customerId, slotId, branchId, serviceTypeId, startUtc, endUtc, status, createdAtUtc, updatedAtUtc, cancelledAtUtc? }` with `status` `"Booked"` or `"Cancelled"`. It holds **ids only**: no branch name, service name or time zone.
- **Get one.** `GET /api/appointments/{id}` is allowed for the owner, Staff and Admin; for anyone else, and for an unknown id, the answer is the same `404`.
- **Cancel.** `POST /api/appointments/{id}/cancel` (no body): the owner or an Admin may cancel; success is `204`, and a repeat on an already cancelled appointment is also `204` (idempotent). `409` "The appointment has already started and can no longer be cancelled." once the start has passed. `503` is returned when the slot release in Availability fails; the appointment is **already `Cancelled`** by then, and repeating the call is safe. `404` covers an unknown id and a non-owner.
- **Names and zones.** `GET /api/branches` and `GET /api/services` (any signed-in role) return the **active** items only for a customer: a branch has `{ id, code, name, description, address, phoneNumber, isActive, timeZoneId?, workingHours }`, a service type `{ id, code, name, description, durationMinutes, isActive }`. A branch or service deactivated after the booking disappears from these lists, and `GET /api/branches/{id}` is `404` for a customer, so a name can be **missing** for an old appointment. `timeZoneId` is nullable.
- **Profile.** `GET /api/auth/me` returns `{ firstName, lastName, email, phoneNumber, isActive }` for the caller; F1 already loads it into the `SessionStore`.
- There is no `Completed` or `NoShow` status yet (`FR-BKG-006` is separate): a `Booked` appointment whose start has passed stays `Booked`.
- Every error body is `{status, detail}` (`application/problem+json`), normalised to `AppError` by F1.

## Decisions

Approved with these decisions:

- **Tabs are query-parameter state**: `/appointments?tab=upcoming|past` (default `upcoming`; an unknown value falls back to it), so a reload, Back and a shared link keep the tab (Req 1.2).
- **Upcoming asks for `status=Booked&when=upcoming`; Past asks for `when=past` with no status filter** (Req 1.4). Upcoming is the "what I must attend" list, so cancelled future appointments do not clutter it; a "Show cancelled" switch adds them. Past is the history, so it includes cancelled appointments.
- **Paging is "Load more"**, 20 per request, appended (Req 2). Numbered pages suit an admin table; a customer's list is short and read top-down on a phone.
- **A past `Booked` appointment keeps the badge "Booked"** and is styled as past (muted, with the hidden text "(past)"); no "Completed" wording is invented (Req 3.4). When `FR-BKG-006` ships, `Completed` and `NoShow` extend the badge map; an unknown status renders as neutral text of its own value.
- **The detail is one route in two presentations**: a side sheet over the list at 1024 px and wider, a full page below or on a direct open, both on `/appointments/:id` (Req 5).
- **Names and zones come from a cached lookup** of `GET /api/branches` and `GET /api/services`, loaded once per session and reloaded on `OutageState.recovered`; an unresolvable id renders "Unavailable branch" / "Unavailable service" and the browser's zone (Req 4).
- **After a cancel the client re-GETs the appointment and refreshes the list** instead of trusting its optimistic state (Req 6.4, 6.5).
- **Ownership (confirmed).** F3 owns the reference-data lookup (branches and services, loaded once per session) and the pure `buildIcs`; F3 ships before F4, and F4 reuses both and builds neither (Req 4.1, 7.3). F4 maps the stable `detail` text of the backend (no error codes exist) to fixed client messages, for the cancel `409` as in F2's login `401` (verified in `AppointmentErrors.AlreadyStarted()`); an unknown `409` text gets a generic message (Req 6.6).
- **Sign out on the profile page** reuses `SessionStore.logout` (F1 Requirement 6.10); the user menu keeps its own.

## Requirements

### Requirement 1: My appointments page and tabs (FR-BKG-003)

**User Story:** As a customer, I want my appointments split into upcoming and past, so that I can see what is coming and look back at my history.

#### Acceptance Criteria

1. WHEN a signed-in Customer opens `/appointments`, THEN the system SHALL render the page inside the F1 customer shell, with the document title `My appointments | Smart Appointments`, one `<h1>` "My appointments", and a "Book an appointment" link to `/book`.
2. The page SHALL show two tabs, "Upcoming" and "Past", as an ARIA tab list (`role="tablist"`, `role="tab"` with `aria-selected`, `role="tabpanel"` labelled by its tab; Left/Right arrows move between tabs, Home/End jump). The selected tab SHALL be held in the query parameter `tab` (`upcoming` or `past`). WHEN the parameter is missing or not one of those values, THEN the system SHALL show Upcoming without changing the URL; WHEN the user selects a tab, THEN the system SHALL update the URL with `replaceUrl` so Back leaves the page rather than flipping tabs.
3. WHEN a tab becomes active, THEN the system SHALL discard the other tab's loaded pages and request page 1 of the active tab. Switching tabs while a request is in flight SHALL cancel that request and SHALL NOT let its late response render in the other tab.
4. The Upcoming tab SHALL call `GET /api/appointments/my?status=Booked&when=upcoming&page=1&pageSize=20`; the Past tab SHALL call `GET /api/appointments/my?when=past&page=1&pageSize=20`. The Upcoming tab SHALL have a "Show cancelled" switch (off by default; WHEN on, THEN `status` is omitted so cancelled future appointments also appear, ordered with the rest by start time). The switch SHALL be reflected in the URL (`cancelled=1`) and SHALL NOT exist on the Past tab.
5. The client SHALL send only values the contract allows (`status` `Booked`, `when` `upcoming` or `past`, an integer `page` of at least 1, `pageSize` 20) and SHALL NOT send `customerId`, so a `400` from filter validation cannot arise from normal use.
6. The tab labels SHALL show no count (`totalCount` is for the active filter only, so a count on the inactive tab would need an extra request). The active tab's `totalCount` SHALL be shown as "N appointments" (singular "1 appointment") below the tabs as a polite status (`role="status"`) updated once per load.
7. IF a Staff or Admin reaches the page by a hand-typed URL, THEN the F1 `roleGuard` SHALL redirect them; IF the API still answers `403` to the list, THEN the page SHALL show the F1 normalised message inline with a link to the user's landing route.

### Requirement 2: Paging with "Load more" (FR-BKG-003)

**User Story:** As a customer with many appointments, I want the list to load quickly and bring more when I ask, so that I am not made to wait for everything.

#### Acceptance Criteria

1. WHILE the first page is loading, THEN the system SHALL show three skeleton cards matching the card layout (so nothing jumps), `aria-hidden="true"`, inside a region with `aria-busy="true"`, and SHALL NOT show the empty state.
2. WHEN fewer items are loaded than `totalCount`, THEN the system SHALL show a "Load more" button below the list; WHEN activated, THEN it SHALL request the next `page` with the same filters and `pageSize`, append the result, and keep focus on the button (or, if it disappears, move it to the first newly added item). WHILE that request is pending the button SHALL be disabled with `aria-busy="true"` and a second activation SHALL NOT send a second request.
3. WHEN the loaded count reaches `totalCount`, or a page returns empty `items`, THEN the "Load more" button SHALL be removed. An item that appears on two pages (the list changed between requests) SHALL be shown once, de-duplicated by `id`.
4. IF a "Load more" request fails, THEN the system SHALL keep the items already shown, show the F1 normalised message inline beneath the list with a "Try again" button that repeats the same page request, and SHALL NOT discard the list. IF the first-page request fails, THEN the page SHALL show the same inline message with "Try again" in place of the list (no empty state).
5. IF the failure is `unavailable`, `network` or `timeout`, THEN the F1 outage banner applies and the inline message SHALL be the F1 "service temporarily unavailable" text; the page SHALL NOT also toast it (F1 Requirement 3.11).
6. WHEN `OutageState.recovered` changes while the page is shown, THEN the system SHALL reload the active tab as a quiet refresh: one request for page 1 with `pageSize` equal to the number already loaded (capped at 100; beyond 100 the list restarts at page 1), without skeletons over a list that is already displayed, keeping the scroll position.
7. The page SHALL treat a response without `items` as an error shown by criterion 4.

### Requirement 3: Appointment cards, grouping and status (FR-BKG-003)

**User Story:** As a customer, I want each appointment to show what it is, where, and when in the branch's own clock, so that I turn up at the right place and time.

#### Acceptance Criteria

1. The list SHALL be a timeline grouped by calendar date: each group has a date heading (a real heading level, for example "Sunday 4 October 2026") and below it a list of the cards of that date in the order the server returned (soonest first for Upcoming, most recent first for Past). The date used for grouping SHALL be the **branch-zone date** of `startUtc` (Requirement 4.3), so a late-evening appointment is not filed under the wrong day. Grouping SHALL NOT reorder the server order.
2. Each card SHALL show: the service name; the branch name; the start and end time in the branch's time zone (for example "15:00 to 15:30"); and the status badge. WHERE `zoneDiffersFromBrowser(timeZoneId, startUtc)` is true, the card SHALL also show a zone label (for example "BST") next to the time and a secondary line with the browser-zone equivalent ("14:00 your time"). WHERE the zone does not differ, no zone label SHALL be shown.
3. The whole card SHALL be one link (a single focus stop, an `<a>` to `/appointments/:id`) with an accessible name of the form "<service>, <branch>, <date and time>, <status>"; it SHALL NOT nest another interactive element. The Cancel action lives on the detail (Requirement 6), not on the card.
4. The status badge SHALL read "Booked" (accent) or "Cancelled" (neutral) and carry its meaning in text, never in colour alone. A `Booked` appointment shown in the Past tab SHALL read "Booked", be styled muted, and carry the visually hidden text "(past)"; the system SHALL NOT invent a "Completed" or "Attended" label (`FR-BKG-006`). An unknown `status` value SHALL render as neutral text of that value.
5. Whether an appointment is past SHALL be decided, for styling, by the tab the item came from (the server's `when` filter), not by the browser clock, so a wrong clock cannot restyle a list. The browser clock SHALL be used only where the client decides whether to offer an action (Requirement 6.1), and the server remains authoritative.
6. WHILE the viewport is narrower than 640 px, each card SHALL stack its fields in one column with no horizontal page scroll down to 320 px and a tap target of at least 44 px height; sticky date headings, if used, SHALL NOT hide the focused card (WCAG 2.4.11).
7. All times SHALL be rendered through `parseUtc` and `formatInZone` (F1 Requirement 13), never `new Date(string)`, `DatePipe` or `toLocaleString()` without a zone.

### Requirement 4: Names and zones from reference data (FR-BKG-003)

**User Story:** As a customer, I want to see branch and service names, not ids, so that I recognise my appointments.

#### Acceptance Criteria

1. The system SHALL provide one lookup (F3's, reused; F4 SHALL NOT create a second one) that loads `GET /api/branches` and `GET /api/services` once per session, keeps them in memory only, and exposes `branchById(id)` and `serviceById(id)`. The two calls SHALL run in parallel, and the list SHALL NOT render cards until both have settled or failed (skeletons stay until then).
2. WHEN `OutageState.recovered` changes, or the user activates "Try again" after a lookup failure, THEN the system SHALL reload the lookup. A failed lookup SHALL NOT block the list: the cards render with the fallbacks of criteria 3 and 4 and one inline notice "Some names could not be loaded." with a "Try again" button.
3. WHERE a branch is found and has a valid `timeZoneId`, the card and detail SHALL render times in that zone. WHERE the branch is found but `timeZoneId` is absent or invalid (F1 Requirement 13.3), the system SHALL render in the browser's zone with the label "your time" (never a silent UTC) and group by the browser-zone date.
4. WHERE the branch id is not in the lookup (deactivated after the booking, or a failed lookup), the card SHALL show "Unavailable branch" and render times in the browser's zone with "your time"; WHERE the service id is missing it SHALL show "Unavailable service". The system SHALL NOT call `GET /api/branches/{id}` for a missing branch (it is `404` for a customer) and SHALL NOT show a raw id as a name.
5. The lookup SHALL NOT be written to the URL, storage or logs, and SHALL NOT be re-requested on tab changes.

### Requirement 5: Appointment detail, deep link and presentation (FR-BKG-003)

**User Story:** As a customer, I want to open an appointment to see all of it, and open the same view from a link, so that I can check or revisit the details.

#### Acceptance Criteria

1. WHEN the user activates a card, THEN the system SHALL navigate to `/appointments/:id`. WHILE the viewport is 1024 px or wider and the navigation came from the list, the detail SHALL render as a right-hand sheet (Spartan/CDK sheet, `role="dialog"`, `aria-modal="true"`, labelled by its heading) over the list, with focus moved into the sheet, trapped there, and **returned to the originating card** when closed (Escape, the close button, the backdrop, or Back). WHILE the viewport is narrower, or WHEN the URL is opened directly, the detail SHALL render as a full page in the customer shell with a "Back to my appointments" link to `/appointments` (restoring the previous `tab`).
2. WHEN `/appointments/:id` is opened directly (reload, bookmark, a link from the F3 success page), THEN the system SHALL load `GET /api/appointments/{id}` itself and not depend on the list; the title SHALL be `Appointment | Smart Appointments` and focus SHALL move to the `<h1>`. WHEN it was opened from the list, THEN the system SHALL show the list item at once and still re-GET the appointment to refresh it.
3. IF `GET /api/appointments/{id}` returns `404` (unknown, someone else's, or the F1 guard let a non-owner through), THEN the system SHALL render an "Appointment not found" state with a link to `/appointments` and the title `Appointment not found | Smart Appointments`, and SHALL NOT distinguish "not yours" from "unknown". A `:id` that is not a GUID SHALL show the same state without calling the API.
4. The detail SHALL show: the service name and duration; the branch name, address and phone number (WHERE the branch is in the lookup); the date and the start and end time in the branch's zone with the zone label per Requirement 3.2 (for example "Sunday 4 October 2026, 15:00 to 15:30 BST") and the browser-zone equivalent when it differs; the status badge; the booking reference (the appointment `id`, selectable, with a "Copy" button whose result is announced); "Booked on" (`createdAtUtc`); and "Cancelled on" (`cancelledAtUtc`) WHERE the status is `Cancelled`.
5. The detail SHALL NOT show `customerId`, `slotId`, `branchId` or `serviceTypeId`.
6. WHILE the detail is loading, the system SHALL show a skeleton of the same layout. WHEN the load fails with a non-404 error, THEN it SHALL show the F1 normalised message inline with "Try again"; for `unavailable`, `network` and `timeout` the F1 outage banner applies, and WHEN `OutageState.recovered` changes the detail SHALL reload.
7. WHEN the viewport is resized across 1024 px while a detail is open, THEN the presentation SHALL switch (sheet to page or back) without losing loaded data or an open cancel dialog.
8. The detail SHALL NOT offer a staff or admin view of other customers' appointments (Out of scope); the customer routes are Customer-only (F1 Requirement 10.7).

### Requirement 6: Cancel an appointment (FR-BKG-005)

**User Story:** As a customer, I want to cancel an appointment I can no longer attend, with clear feedback, so that the slot is released and I am not left unsure whether it worked.

#### Acceptance Criteria

1. The detail SHALL show a "Cancel appointment" button **only** WHEN `status` is `Booked` and `startUtc` is later than the browser's current time. For a `Cancelled` appointment it SHALL NOT be shown; for a `Booked` one that has started it SHALL be replaced by the note "This appointment has already started and can no longer be cancelled." The browser clock only decides whether to offer the button; the server's `409` is authoritative (criterion 6).
2. WHEN "Cancel appointment" is activated, THEN the system SHALL open a confirm dialog (`role="alertdialog"`, labelled "Cancel this appointment?", described by a sentence naming the service, branch and local time of Requirement 5.4) with the buttons "Keep appointment" (initial focus, the safe default) and "Cancel appointment" (destructive style). Escape and the backdrop SHALL act as "Keep appointment"; focus SHALL return to the originating button when the dialog closes without cancelling.
3. WHEN the user confirms, THEN the system SHALL call `POST /api/appointments/{id}/cancel` once with no body and no `Idempotency-Key`, close the dialog and show an optimistic state at once: the badge reads "Cancelling…" (spinner plus text, neutral style), and the Cancel and "Add to calendar" actions are disabled. WHILE the call is pending a second activation SHALL NOT send a second request, and "Cancelling appointment…" SHALL be announced once through a polite live region.
4. WHEN the call returns `204`, THEN the system SHALL re-GET `GET /api/appointments/{id}`, replace the appointment with the response, show the toast "Appointment cancelled." (`ToastService.showSuccess`), and announce it once. IF the re-GET fails, THEN the system SHALL keep the optimistic result as "Cancelled" (the `204` is proof enough) without an error toast; the next list load corrects any difference.
5. WHEN the cancel succeeded, THEN the list SHALL refresh as a quiet refresh (Requirement 2.6): on the Upcoming tab without "Show cancelled" the appointment SHALL leave the list; with "Show cancelled" or on the Past tab it SHALL stay with its new status. A cancelled appointment SHALL NOT be shown as `Booked` in any view. WHERE the detail is a sheet over the list and the appointment leaves the list, the sheet SHALL stay open on the now-cancelled appointment until closed, and focus on close SHALL go to the nearest remaining card or the page heading.
6. IF the call returns `409`, THEN the system SHALL revert the optimistic state, explain it inline in a `role="alert"` region on the detail with a **fixed client message** chosen by the known server `detail`: WHEN `detail` equals "The appointment has already started and can no longer be cancelled." the message SHALL be "This appointment has already started, so it can no longer be cancelled." and the Cancel button SHALL be removed; for any other `409` text the message SHALL be the generic "We couldn't cancel this appointment. Refresh and try again." and the button SHALL stay. The raw server `detail` SHALL NOT be displayed. In both cases the system SHALL refresh the appointment and the list and SHALL NOT also toast.
7. IF the call returns `503`, THEN the system SHALL NOT silently revert: it SHALL re-GET the appointment first. IF it is `Cancelled`, THEN the system SHALL treat it as cancelled (criterion 4) and show the inline notice "Your appointment is cancelled. The time slot may take a moment to become available again." IF it is still `Booked`, THEN the system SHALL revert and show "We could not cancel right now. Nothing was changed. Try again in a moment." with a "Try again" button that repeats the cancel call (a repeat is safe on the backend). The F1 outage banner is shown for the `503` as usual.
8. IF the call fails with a network or timeout error, THEN the system SHALL re-GET (as in criterion 7) before deciding what to show, because the server may have processed the request. IF it returns `404`, THEN the system SHALL show the "Appointment not found" state of Requirement 5.3 and refresh the list. IF it returns `403`, THEN the system SHALL revert and show the F1 message inline. A `401` is handled by the F1 session-end flow.
9. IF the call returns `429`, THEN the system SHALL revert the optimistic state and show `RateLimitNotice` with the F1 countdown on the Cancel button (the gateway does not limit this endpoint today; the branch is defensive).
10. The cancel flow SHALL NOT retry automatically and SHALL NOT call Availability.

### Requirement 7: Add to calendar for upcoming appointments (reuses F3)

**User Story:** As a customer, I want to put an upcoming appointment in my calendar, so that I do not forget it.

#### Acceptance Criteria

1. WHERE an appointment is `Booked` and in the future (the browser-clock decision of Requirement 6.1), the detail SHALL offer "Add to calendar", which downloads an `.ics` file produced by the **F3** builder from the appointment's `id`, `startUtc`, `endUtc`, the service name, and the branch name and address. It SHALL NOT be offered for `Cancelled` or started appointments.
2. WHERE the branch or service name is missing (Requirement 4.4), the event SHALL use "Appointment" as the summary and omit the location rather than write "Unavailable branch" into the user's calendar.
3. F4 SHALL NOT define its own `.ics` rules; the UTC `DTSTART`/`DTEND`, escaping and a stable `UID` (the appointment id, so a re-download updates the event) are F3's requirements and tests.

### Requirement 8: Empty and error states (FR-BKG-003)

**User Story:** As a customer with nothing to show, I want a friendly next step, so that an empty page is not a dead end.

#### Acceptance Criteria

1. WHEN the Upcoming tab returns no items, THEN the system SHALL show an empty state (an inline decorative SVG with `aria-hidden="true"`, the heading "No upcoming appointments", one supporting sentence and a primary "Book an appointment" link to `/book`). The copy talks only about _upcoming_ appointments, never "you have never booked".
2. WHEN the Past tab returns no items, THEN the system SHALL show "No past appointments" with the same link.
3. The empty state SHALL appear only after a successful response; it SHALL NOT show during loading (Requirement 2.1) or after an error (Requirement 2.4), and SHALL be part of the tab panel, not a separate `role="alert"`.
4. IF the list returns `400` (not expected, since Requirement 1.5 sends only valid values), THEN the system SHALL show the F1 normalised message inline without echoing request parameters.
5. A `401` on any F4 request is handled by the F1 session-end flow and SHALL NOT be rendered as a local error.

### Requirement 9: Profile page (FR-AUTH-003)

**User Story:** As a customer, I want to see which account I am signed in with, choose a theme and sign out, so that I can check my details and leave safely on a shared device.

#### Acceptance Criteria

1. WHEN a signed-in Customer opens `/profile`, THEN the system SHALL render the page in the customer shell with the title `Profile | Smart Appointments` and one `<h1>` "Profile".
2. The page SHALL show, read-only, as a labelled description list (`<dl>`, not disabled inputs): "Name" (`firstName` and `lastName`), "Email" and "Phone number", from the F1 `SessionStore` profile (the result of `GET /api/auth/me`). It SHALL NOT render an edit control and SHALL NOT display the role, the user id, `isActive` or any token.
3. WHILE the profile has not loaded, the page SHALL show a skeleton for name and phone; the email MAY show at once from the token claim. IF the `/me` call failed, THEN the page SHALL show the F1 normalised message inline with "Try again", which asks the session store to reload the profile once, and SHALL NOT sign the user out for a non-401 failure (F1 Requirement 6.7). WHEN `OutageState.recovered` changes while an error shows, the page SHALL reload it. An empty value SHALL render as "Not provided".
4. The page SHALL have an "Appearance" section with a three-option radio group (System, Light, Dark; `role="radiogroup"`, labelled) bound to the F0 `ThemeService` preference; WHEN the user selects an option, THEN the theme and the `dark` class SHALL change at once and persist per F0. The control SHALL stay in sync with the theme toggle in the shell header.
5. The page SHALL have a "Sign out" button that calls `SessionStore.logout()` (F1 Requirement 6.10), which sends `POST /api/auth/logout`, clears the session, broadcasts to other tabs and navigates to `/login`; a failure of the logout request SHALL NOT be shown.
6. WHILE the viewport is narrower than 640 px, the sections SHALL stack with no horizontal scroll down to 320 px. The page SHALL contain no link or text promising profile editing or password change (no such backend exists; see Out of scope).

### Requirement 10: Accessibility, responsiveness and page titles (no FR-ID)

**User Story:** As a user of assistive technology, a keyboard or a phone, I want these pages to be fully usable, so that I can manage my appointments without a mouse or a large screen.

#### Acceptance Criteria

1. The route titles SHALL be `My appointments | Smart Appointments`, `Appointment | Smart Appointments` (or `Appointment not found | Smart Appointments`) and `Profile | Smart Appointments`, through the F1 `TitleStrategy`. WHEN the route changes, THEN focus SHALL move to the page `<h1>` (full page) or into the sheet (Requirement 5.1), and the F1 route announcer SHALL announce the title.
2. The tabs follow Requirement 1.2; each date group SHALL be a `<ul>` of cards with a correct heading outline under the page `<h1>`; each card exposes a single link (Requirement 3.3).
3. Every interactive element SHALL be keyboard operable in a logical order, show a focus indicator of at least 3:1 contrast that no sticky element hides, have a target size of at least 24 x 24 CSS px (44 x 44 on touch for card links), and the dialog and the sheet SHALL trap focus and restore it on close (Requirements 5.1, 6.2).
4. Results SHALL be announced exactly once through polite live regions ("N appointments", "Cancelling appointment…", "Appointment cancelled."), and errors through a `role="alert"` region that is not re-announced on unrelated re-renders. "Load more" SHALL announce one status, "Loaded N more appointments", not one per item.
5. All text and UI components SHALL meet WCAG 2.2 AA contrast (4.5:1 text, 3:1 large text and components) in light and dark with the F0 tokens, including the muted past styling; the pages SHALL be usable at 200% zoom and at 320 px width without two-dimensional scroll.
6. WHERE the user has `prefers-reduced-motion: reduce`, the sheet, dialog, list and skeletons SHALL show no slide or looping motion (the skeleton pulse becomes a static tone); where motion is allowed, entrance transitions SHALL be 300 ms or less.
7. The pages SHALL make no request other than those listed in this spec (`GET /api/appointments/my`, `GET /api/appointments/{id}`, `POST /api/appointments/{id}/cancel`, `GET /api/branches`, `GET /api/services`, and F1's `/me` and `/api/auth/logout`) and SHALL NOT call `/internal/**` or a slot endpoint.
8. The pages SHALL NOT put appointment data (names, times) into the document title, the URL beyond the appointment id in the path, console logs or storage, and SHALL render server text only through Angular interpolation (no `innerHTML`).

### Requirement 11: Tests and delivery (no FR-ID)

**User Story:** As a maintainer, I want these screens covered by unit and end-to-end tests that need no backend, so that CI proves the flows and regressions are caught.

#### Acceptance Criteria

1. MSW handlers in `src/testing/handlers/appointments.handlers.ts` SHALL model the contract: `GET /api/appointments/my` with `status`, `when`, `page` and `pageSize` filtering, the documented order (upcoming ascending, past descending, `id` tie-break), `{items, page, pageSize, totalCount}`, defaults, `200` empty beyond the last page and `400` `{status, detail}` naming every invalid parameter; `GET /api/appointments/{id}` (`404` for an unknown or another customer's id); `POST /api/appointments/{id}/cancel` (`204`, a repeat `204`, `409` with the documented text once started, a flag for `503` after the appointment became `Cancelled`); and `GET /api/branches` / `GET /api/services` returning only active items, so a test can deactivate a branch and see the fallback.
2. Component and unit tests (Vitest, Angular Testing Library, MSW with `onUnhandledRequest: 'error'`, `vi.useFakeTimers()`, no `fakeAsync`) SHALL cover: tab query handling including an invalid value (1.2); the exact request parameters of each tab and of "Show cancelled" (1.4, 1.5); skeletons then cards (2.1); "Load more" append, de-duplication, double-click protection, and a failure that keeps the list and retries the same page (2.2 to 2.4); the quiet refresh on `OutageState.recovered` (2.6); grouping by branch-zone date across a date boundary in `Pacific/Auckland`, `America/New_York`, `Asia/Kolkata` and a DST-change day, under a fixed process zone different from all of them (3.1); the zone label shown only when `zoneDiffersFromBrowser` is true (3.2); the badge for `Booked`, `Cancelled`, a past `Booked` (text "Booked" plus hidden "(past)", never "Completed") and an unknown status (3.4); the fallbacks for a missing branch, missing service and absent `timeZoneId` (4.3, 4.4); a lookup failure not blocking the list (4.2); the detail as sheet and as page, a direct deep link, `404` and a non-GUID id without a request (5.1 to 5.3); Cancel button visibility (6.1); the dialog's default focus and Escape (6.2); the optimistic state then the re-GET (6.3, 6.4); a `409` reverting with the inline text and no toast (6.6); a `503` where the re-GET shows `Cancelled` and where it shows `Booked` (6.7); a network error followed by a re-GET (6.8); the empty states not flashing while loading (8.1 to 8.3); the profile list, skeleton, retry and "Not provided" (9.2, 9.3); the theme radio group in sync with `ThemeService` (9.4); and sign out calling `SessionStore.logout` (9.5).
3. A Playwright suite with mocked API responses (route interception, no backend) SHALL cover: reaching `/appointments` from the shell and seeing Upcoming; switching to Past with Back behaviour; "Load more" over two pages; opening a card as a sheet on a desktop viewport and as a page on a mobile viewport, and reloading the deep link; the cancel flow to `204` with a toast and the card leaving Upcoming; a `409` explained inline; a `503` with the retry; an empty state linking to `/book`; the profile page with a theme change that survives a reload; sign out landing on `/login`; keyboard-only completion of the cancel flow; and `@axe-core/playwright` on `/appointments`, an open detail, the cancel dialog and `/profile` in light and dark, failing on any `serious` or `critical` violation.
4. The lazy chunks of `features/appointments/` and `features/profile/` SHALL together add no more than 40 kB gzipped (`pnpm size`), and the F0 and F1 budgets SHALL still pass. (An estimate until the screens exist; the design records the measured value.)
5. WHERE the real backend is available (the Compose stack with the `booking-my-appointments` feature), a documented manual check SHALL book two appointments through F3, see them in Upcoming, cancel one, see it leave Upcoming and appear with "Show cancelled", then deactivate its branch as an Admin and see "Unavailable branch" for it.

## Out of scope

- **Rescheduling**: the backend has no endpoint; the customer cancels and books again.
- **Editing the profile, changing the password, deleting the account, email or phone verification**: the backend has no such endpoints; the profile is read-only.
- **Notification history, reminders and preferences**: the Notification service does not exist.
- **Staff and admin views of other customers' appointments** (`FR-BKG-004`), **complete and no-show** (`FR-BKG-006`), and an admin cancelling on a customer's behalf (the backend allows it; the SPA offers no screen).
- **Filtering by branch, service or date, search and sorting options**: the endpoint offers only `status` and `when` and a fixed order.
- **Numbered pages, infinite scroll and virtualised lists**: "Load more" is enough for a customer's volume.
- **The `.ics` builder, the booking success page and the wizard** (F3); F4 reuses the builder.
- **Real-time updates** and **offline support**.
- **Printing, sharing and exporting appointments**, other than the calendar download.
- **Translations**: English only.

## Known gaps

- **Cancelled future appointments are hidden from the default Upcoming tab and never appear in Past** (they are not past). They are reachable through "Show cancelled" and by deep link; a user wanting a complete history may find this surprising. The alternative (all statuses in Upcoming) was rejected as clutter.
- **A past `Booked` appointment is not "completed".** There is no completed status until `FR-BKG-006`; "Booked" with past styling can read oddly for a visit that happened. The badge map is built to extend.
- **Names and zones are joined on the client from the active-only reference lists.** A deactivated branch or service shows "Unavailable branch" / "Unavailable service" and times fall back to the browser's zone, which may not be the branch's. Putting names and `timeZoneId` in `AppointmentResponse` would remove the join; that is not in the approved backend spec.
- **`timeZoneId` is nullable on a branch**; the browser-zone fallback is a guess.
- **The list endpoint is on an unmerged backend branch** (`booking-my-appointments`); F4 is verified against MSW until it is deployed, and the contract can drift until `pnpm gen:api` is rerun.
- **Offset paging can repeat or skip an item** if appointments change between "Load more" requests. The stable order and de-duplication by `id` cover a repeat; a skipped item appears after the next reload.
- **The client decides whether to offer Cancel by the browser clock.** A wrong clock can hide the button for a still-cancellable appointment, or show it for one that has started, in which case the server's `409` corrects it (Requirement 6.6).
- **A `503` on cancel is ambiguous to the user.** The appointment is already cancelled but the slot release failed, so the slot may stay unavailable to others until a repeat succeeds; the SPA can only tell the user the cancel took effect.
- **The reference lookup has no freshness policy** beyond the session and `OutageState.recovered`: a branch renamed by an admin shows its old name until the page reloads.
- **F4 depends on F3's lookup and `buildIcs`**; their exact module paths are fixed in the F3 design, and F4's design records the assumed ones.
