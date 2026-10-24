# F7 Staff workspace — Requirements

## Introduction

This spec builds four things.
- **The staff workspace** at `/staff`: a branch day list, marking appointments `Completed` or `NoShow`, and an appointment detail panel. It lives under `src/app/features/staff/` in the F1 staff shell.
- **An admin appointments page**, `/admin/appointments`, for any branch's day.
- **Admin staff account management** at `/admin/staff`: list, create, move to another branch, deactivate and reactivate, delete. It lives under `src/app/features/admin/` in the F5 admin console.
- **Customer support for the two new statuses** in the F4 screens.

It serves these backend requirements:
- `FR-BKG-004` (staff view branch appointments).
- `FR-BKG-006` (complete and no-show).
- `FR-AUTH-006` (manage staff: create, list, read, move, deactivate, reactivate and delete).
- `FR-AUTH-003` (role-based access, with staff confined to their branch).
- `FR-BKG-003` (a customer's own appointments, for the new statuses).

F7 takes the phase number the work plan had reserved for Polish, which becomes F8.

F7 **consumes** F1 to F6 and does not redefine them:
- From F1: `ApiClient` and the generated types, `AppError` and its `kind`, `ToastService`, `OutageState`, `SessionStore`, `authGuard`/`roleGuard`, the staff and admin shells, the zone-aware utilities in `core/time/` (`todayInZone`, `addDays`, `formatInZone`, `parseUtc`), and the MSW server and test helpers.
- From F2: the form conventions and the password rules and checklist.
- From F4: the status badge and the appointment view model.
- From F5: the admin drawer frame, the `unsavedChangesGuard`, the stores, the sidebar and the command palette.
- From F6: the Indigo + Lavender tokens.

Backend contract this spec relies on (verified against `AppointmentsController`, `StaffController`, `BranchAppointmentResponse`, `AppointmentResponse`, and the backend specs `staff-booking` and `staff-management`, both merged to `master`, PRs #19 and #20):

- **Staff token.** A Staff access token carries `branch_id` (a GUID string) besides `sub`, `email` and `role`. Customer and Admin tokens have none. After a move, the old access token keeps the old branch until it expires (at most 60 minutes), and every refresh token of that staff member is revoked.
- **Branch.** `GET /api/branches/{id}` works for any signed-in role and returns `{ id, code, name, …, isActive, timeZoneId?, workingHours }`. For a non-admin, an inactive branch is `404`.
- **Day list.** `GET /api/appointments/branch/{branchId}?date=yyyy-MM-dd&status=&page=&pageSize=` (`AdminOrStaffPolicy`).
  - `date` is required and is a calendar day in the **branch's** time zone (UTC when the branch has none).
  - `status` is optional: `Booked`, `Cancelled`, `Completed` or `NoShow`.
  - `page` defaults to 1. `pageSize` defaults to 20, with a maximum of 100.
  - Items come soonest first.
  - The response is `{ items, page, pageSize, totalCount, customersUnavailable }`. Each item is an `AppointmentResponse` plus `customer: { firstName, lastName, phoneNumber } | null`.
  - `customersUnavailable: true` means Auth was down: names are null but the list is valid.
  - A Staff member asking for another branch gets `403`. Bad values give one `400`. `503` means the branch's time zone could not be resolved.
- **AppointmentResponse** `{ id, customerId, slotId, branchId, serviceTypeId, startUtc, endUtc, status, createdAtUtc, updatedAtUtc, cancelledAtUtc?, completedAtUtc?, noShowAtUtc? }`. `status` is `Booked`, `Cancelled`, `Completed` or `NoShow`.
- **Marks.** `POST /api/appointments/{id}/complete` and `/no-show` (Staff of the appointment's branch, or Admin) return `200` with the appointment.
  - Repeating the same mark is `200` with no change.
  - The call is `409` before the start or from another status (Cancelled, or the other mark), `404` for an unknown id or another branch's appointment (Staff), and `403` for a customer.
- **Staff accounts** (`AdminPolicy`; Staff and Customer callers get `403`).
  - **List:** `GET /api/auth/staff?branchId=&isActive=&page=&pageSize=` returns `{ items, page, pageSize, totalCount }`, oldest registration first, with deleted accounts excluded. `pageSize` is at most 100, and bad values give one `400`.
  - **Read one:** `GET /api/auth/staff/{id}`.
  - **Create:** `POST /api/auth/staff { firstName, lastName, email, phoneNumber, password, branchId }` returns `201`. A `400` means validation failed or `Email is already registered.`; `422` means the branch is unknown or inactive; `503` means Availability is down.
  - **Move:** `PUT /api/auth/staff/{id}/branch { branchId }` returns `200`, with the same `422` and `503` as create.
  - **Deactivate:** `POST /api/auth/staff/{id}/deactivate` returns `204` and revokes every session.
  - **Activate:** `POST /api/auth/staff/{id}/activate` returns `204`, or `422` if the staff member's branch is inactive or unknown, or `503`.
  - **Delete:** `DELETE /api/auth/staff/{id}` returns `204`. It is a soft delete: the account can never sign in again and its email stays taken.
  - Unknown, non-staff and deleted ids are `404` on read one, move, activate, deactivate and delete.
  - The staff item is `{ id, firstName, lastName, email, phoneNumber, role, branchId, isActive, registeredAtUtc }`.
- **Error bodies.** Every error body is `{status, detail}`, and F1 normalises it to `AppError`. A validation `400` has `detail` "Invalid request data. Errors: a,b".

## Decisions

Agreed on 2026-10-24:

- **One F7 phase** covers the staff workspace, the admin appointments page, admin staff management and the customer statuses. Polish moves to F8.
- **The staff member's branch comes from the token's `branch_id` claim**, decoded alongside `sub`, `email` and `role`. Its name and time zone come from `GET /api/branches/{id}` (Requirement 1).
- **The day is picked with today plus Previous and Next day buttons and a date input.** The date is a URL query parameter, so reload and Back keep it. "Today" is today in the branch's zone (Requirement 2).
- **The day list refreshes manually.** There is a Refresh button and a reload after each mark, with no polling (Requirement 2.8).
- **Complete is one click; No-show asks for confirmation** (Requirement 3).
- **Customers get styled badges and a status filter** for Completed and No-show (Requirement 10).
- **The appointment detail is a panel opened from a row**, built from the row's data. It has no route of its own, because `GET /api/appointments/{id}` carries no customer name (Requirement 4).

## Requirements

### Requirement 1: Staff session and branch context (FR-AUTH-003)

**User Story:** As a staff member, I want the workspace to know my branch and show it, so that I always know whose appointments I am looking at.

#### Acceptance Criteria

1. WHEN a Staff access token is decoded, THEN the session user SHALL carry `branchId` from the `branch_id` claim. Customer and Admin users SHALL have none, and a claim that is not a GUID SHALL be treated as missing.
2. WHEN a Staff user opens `/staff`, THEN the system SHALL request `GET /api/branches/{branchId}` once per session and branch, and the staff shell header SHALL show the branch name and code. The branch's time zone SHALL be used for every date and time shown in the workspace.
3. IF the token has no `branch_id`, or the branch request returns `404`, THEN the workspace SHALL show a full-page message: "Your account is not linked to an active branch. Ask an administrator to check your branch." It SHALL also show a Sign out button and request no appointments.
4. IF the branch request fails with a network or `5xx` error, THEN the workspace SHALL show the F1 error state with a Retry button, and SHALL retry when `OutageState.recovered` increments.
5. WHEN the session is refreshed with a token whose `branch_id` differs, after a move, THEN the workspace SHALL load the new branch and reset the date to today in that branch's zone.
6. IF the branch has no `timeZoneId`, THEN dates and times SHALL be computed and shown in UTC, labelled "UTC", as the backend does.

### Requirement 2: Branch day list (FR-BKG-004)

**User Story:** As a staff member, I want to see my branch's appointments for a day with who is coming, so that I can prepare and check people in.

#### Acceptance Criteria

1. WHEN `/staff` opens without a valid `date` query parameter, THEN the system SHALL use today in the branch's zone and replace the URL with `?date=yyyy-MM-dd`. A malformed date SHALL be treated as absent.
2. The page SHALL have the `<h1>` "Appointments". Beside it SHALL be the date written out in full (for example "Friday 24 October 2026"), a **Previous day** button, a **Next day** button, a **Today** button (disabled when the date is already today) and a date input. Each control SHALL update `?date=` with a history entry, so Back returns to the previous day.
3. WHEN the date or status filter changes, THEN the system SHALL request `GET /api/appointments/branch/{branchId}?date=…&pageSize=100`, adding `status` when the filter is not "All".
4. The list SHALL show one row per appointment, in the server's order, with:
   - The start and end time in the branch's zone.
   - The customer's full name and phone number. The phone number SHALL be a `tel:` link.
   - The service name, resolved from `GET /api/services`. An unresolvable id SHALL show "Unavailable service".
   - The status badge.

   Below 640 px the rows SHALL become stacked cards, with no horizontal scroll down to 320 px.
5. A status filter SHALL offer All, Booked, Completed, No-show and Cancelled. It SHALL be kept in `?status=`, and an unknown value SHALL fall back to All.
6. The page SHALL show the count for the filter, for example "8 appointments". IF the day has none, THEN it SHALL show "No appointments on this day." (or "No {status} appointments on this day." when a filter is set) and no table. While loading, it SHALL show skeleton rows with `aria-busy="true"`.
7. IF `customersUnavailable` is true, THEN the page SHALL show a non-blocking notice: "Customer names are unavailable right now. Refresh to try again." Rows SHALL show "Name unavailable" and no phone number. IF `customer` is null for one row only, THEN only that row SHALL show "Name unavailable".
8. A **Refresh** button SHALL reload the current day and filter. The list SHALL reload after each successful mark (Requirement 3) and when `OutageState.recovered` increments. There SHALL be no timed polling.
9. IF `totalCount` is greater than the number of items loaded, THEN a **Load more** button SHALL request the next page and append it.
10. IF the request fails, THEN the list area SHALL show an inline error with a Retry button: `403` as "You can only see your own branch.", `503` as "The branch's time zone could not be loaded. Try again shortly.", and others through the F1 error text. The date controls SHALL stay usable.

### Requirement 3: Complete and no-show (FR-BKG-006)

**User Story:** As a staff member, I want to mark an appointment as attended or missed once it has started, so that the record shows what happened.

#### Acceptance Criteria

1. Every `Booked` row SHALL offer **Complete** and **No-show** actions. Rows in any other status SHALL offer none.
2. WHILE an appointment's `startUtc` is later than the current time, both actions SHALL be disabled, with the visible hint "Available from {HH:mm}" (branch zone). The hint SHALL be tied to the buttons with `aria-describedby`. The enabled state SHALL update when the start time passes, without a reload. The server stays the authority (Criterion 5).
3. WHEN Complete is activated, THEN the system SHALL send `POST /api/appointments/{id}/complete` with no confirmation. On `200` it SHALL show a success toast "{Customer name} marked as completed." (or "Appointment marked as completed." without a name), update the row's badge, and reload the list.
4. WHEN No-show is activated, THEN a confirmation dialog SHALL open. It SHALL name the customer and the time and state: "This records that the customer did not attend. It cannot be undone." It SHALL have the buttons **Mark as no-show** (destructive style) and **Keep as booked**, and focus SHALL start on **Keep as booked**. Confirming SHALL send `POST /api/appointments/{id}/no-show`, then show a success toast and update the row as in Criterion 3. Escape and **Keep as booked** SHALL close the dialog and send nothing.
5. IF a mark returns `409`, THEN the system SHALL show the server's `detail` in an error toast and reload the list, so the row shows the real status. IF it returns `404`, THEN it SHALL show "This appointment is no longer available." and reload.
6. WHILE a mark request is in flight, both actions on that row SHALL be disabled and the activated one SHALL show a busy state. A second activation SHALL send nothing.
7. Each status change SHALL be announced to screen readers through a polite live region, for example "Ana Perera, 10:30, marked as completed".

### Requirement 4: Appointment detail panel (FR-BKG-004)

**User Story:** As a staff member, I want to open one appointment and see everything about it, so that I can answer a customer's question.

#### Acceptance Criteria

1. Activating a row's time or name SHALL open a detail panel for that appointment. It SHALL be a side sheet at 1024 px and wider and a full-width sheet below that. It SHALL show:
   - The customer's name and phone.
   - The service name and duration.
   - The start and end time and the date (branch zone).
   - The status badge.
   - The created time, and whichever of the cancelled, completed and no-show times is set, each in the branch zone.
   - The appointment id, in a copyable field.
2. The panel SHALL offer the same Complete and No-show actions, with the same rules as Requirement 3, and SHALL show the updated status after a mark.
3. The panel SHALL trap focus, close on Escape and its Close button, and return focus to the element that opened it.

### Requirement 5: Admin appointments page (FR-BKG-004, FR-BKG-006)

**User Story:** As an admin, I want to see any branch's appointments for a day and mark them, so that I can cover for a branch or check its records.

#### Acceptance Criteria

1. The admin sidebar SHALL gain an **Appointments** item at `/admin/appointments`, after Slot generation. The command palette SHALL gain "Go to appointments".
2. The page SHALL have a branch picker listing every branch, active and inactive, by name and code, with inactive ones marked "(inactive)". The chosen branch SHALL be kept in `?branch=`. Without a valid branch the page SHALL show "Choose a branch to see its appointments." and request nothing.
3. With a branch chosen, the page SHALL offer the date controls, status filter, list, Load more, Refresh, detail panel and actions of Requirements 2 to 4. "Today" and the times SHALL be in that branch's zone, and the date and status SHALL be kept in the URL.
4. WHEN the branch changes, THEN the date SHALL reset to today in the new branch's zone.

### Requirement 6: Staff accounts list (FR-AUTH-006)

**User Story:** As an admin, I want to see every staff account, where each works and whether it is active, so that I can manage my team.

#### Acceptance Criteria

1. The admin sidebar SHALL gain a **Staff** item at `/admin/staff`, after Services. The palette SHALL gain "Go to staff" and "New staff member", and one record entry per loaded staff member ("Edit {name}").
2. The page SHALL request `GET /api/auth/staff` with `pageSize=100`, plus `branchId` and `isActive` from the filters, and SHALL show a table with these columns:
   - Name.
   - Email.
   - Phone.
   - Branch: the name from the branches store, or "Unknown branch".
   - Status: an "Active" or "Inactive" badge.
   - Registered: the date.
   - An actions menu.

   Below 640 px the table SHALL become cards.
3. A branch filter (All, or each branch) and a status filter (All, Active, Inactive) SHALL be kept in `?branch=` and `?status=`. Unknown values SHALL fall back to All.
4. IF `totalCount` is greater than the items loaded, THEN **Load more** SHALL fetch the next page.
5. IF there are no staff accounts, THEN the page SHALL show "No staff accounts yet." with a "New staff member" link. IF the filters match none, THEN it SHALL show "No staff match these filters." and a "Clear filters" button.
6. While loading it SHALL show skeleton rows. On failure it SHALL show an inline error with Retry, and it SHALL reload when `OutageState.recovered` increments.
7. Each row's actions menu SHALL offer:
   - **Edit**, which opens the drawer of Requirement 8.
   - **Deactivate** or **Reactivate**, according to its status (Requirement 9).
   - **Delete** (Requirement 9).

### Requirement 7: Create a staff account (FR-AUTH-006)

**User Story:** As an admin, I want to create a staff account for a branch, so that a new team member can sign in.

#### Acceptance Criteria

1. **New staff member** SHALL open a drawer at `/admin/staff/new` over the list, using the F5 drawer conventions (deep-linkable, Back closes it, unsaved-changes guard). It SHALL have these fields:
   - First name and last name, each required with at most 50 characters.
   - Email, required and valid.
   - Phone, required and matching `^\+?[1-9]\d{1,14}$`, with the F2 phone normaliser.
   - Password, with the F2 password rules and checklist.
   - Branch, a required select of **active** branches only.
2. WHEN the form is submitted valid, THEN the system SHALL send `POST /api/auth/staff`. On `201` it SHALL close the drawer, show "{First} {Last} can now sign in." and reload the list.
3. IF the response is `400` "Email is already registered.", THEN the error SHALL show on the Email field. IF it is `422`, THEN "This branch is not active any more. Choose another." SHALL show on the Branch field and the branch list SHALL reload. IF it is `503`, THEN the drawer SHALL show the alert "The branch could not be checked right now. Try again shortly." and keep the form's values. Any other `400` message SHALL go to the form alert.
4. Submitting SHALL be protected against double submission. The password SHALL never be kept anywhere after the request.

### Requirement 8: Edit a staff account: move to another branch (FR-AUTH-006)

**User Story:** As an admin, I want to move a staff member to another branch, so that their access follows where they work.

#### Acceptance Criteria

1. **Edit** SHALL open a drawer at `/admin/staff/:id`, which requests `GET /api/auth/staff/{id}`. It SHALL show the name, email, phone, status and registered date as read-only, and a Branch select of active branches set to the current branch. IF the request returns `404`, THEN the drawer SHALL show "This staff account no longer exists." and the list SHALL reload.
2. The drawer SHALL state, above the Save button: "Moving a staff member signs them out of every device. They sign in again to work at the new branch."
3. WHEN Save is activated with a different branch, THEN the system SHALL send `PUT /api/auth/staff/{id}/branch`. On `200` it SHALL close the drawer, show "{Name} moved to {branch}." and reload the list. With the same branch, Save SHALL be disabled.
4. IF the response is `422`, `503` or `404`, THEN the drawer SHALL handle it as Requirement 7.3 does for `422` and `503`, and as Criterion 1 does for `404`.

### Requirement 9: Deactivate, reactivate and delete (FR-AUTH-006)

**User Story:** As an admin, I want to suspend, restore or remove a staff account, so that only current staff can sign in.

#### Acceptance Criteria

1. **Deactivate** SHALL open a confirmation dialog: "{Name} will be signed out of every device and won't be able to sign in. Pages they already have open may keep working for up to an hour." The confirm button SHALL read **Deactivate**. Confirming SHALL send `POST /api/auth/staff/{id}/deactivate`, and on `204` the system SHALL show "{Name} deactivated." and reload the list.
2. **Reactivate** SHALL send `POST /api/auth/staff/{id}/activate` with no dialog. On `204` the system SHALL show "{Name} can sign in again." and reload. IF the response is `422`, THEN it SHALL show "{Name}'s branch is not active. Move them to an active branch first." with an action that opens the Edit drawer. IF it is `503`, THEN it SHALL show the F1 outage text.
3. **Delete** SHALL open a destructive confirmation dialog: "Delete {Name}'s staff account? They will never be able to sign in again, and {email} can't be used for a new account. This cannot be undone." The confirm button SHALL be labelled **Delete account** and focus SHALL start on **Cancel**. Confirming SHALL send `DELETE /api/auth/staff/{id}`, and on `204` the system SHALL show "{Name}'s account was deleted." and reload.
4. IF any of these returns `404`, THEN the system SHALL show "This staff account no longer exists." and reload the list.
5. While a request is in flight, the row's actions SHALL be disabled and the confirm button SHALL show a busy state.

### Requirement 10: Completed and No-show for customers (FR-BKG-003)

**User Story:** As a customer, I want my history to say whether I attended, so that it matches what the branch recorded.

#### Acceptance Criteria

1. The status badge SHALL style `Completed` as "Completed", with its own icon and success tone, and `NoShow` as "No-show", with its own icon and a warning tone. The text SHALL meet WCAG AA contrast in light and dark themes, and colour SHALL not be the only cue.
2. The appointment detail SHALL show "Completed on {date, time}" or "Marked as no-show on {date, time}" from `completedAtUtc` or `noShowAtUtc`, as it does for "Cancelled on". It SHALL offer no cancel action for either status.
3. The Past tab SHALL gain a status filter: All, Completed, No-show, Cancelled and Booked. It SHALL be kept in the URL and sent as `status=` to `GET /api/appointments/my`. The Upcoming tab SHALL be unchanged.
4. `AppointmentStatus` SHALL include `Completed` and `NoShow`. A status the client does not know SHALL still render as neutral text of its own value.

### Requirement 11: Types, quality and delivery (no FR-ID)

**User Story:** As the maintainer, I want the new screens built to the same standard as the rest of the app, so that nothing regresses.

#### Acceptance Criteria

1. The generated API types SHALL be regenerated with `pnpm gen:api` against the backend on `master`, so that they include the staff, day-list and mark endpoints. Hand-written models SHALL be added only where the backend declares no response body, and marked as temporary as F3's are.
2. `/staff/**` SHALL stay behind `authGuard` and `roleGuard('Staff')`, and the new admin routes behind the admin guards. Role checks SHALL remain UX only; the server's `403` is handled as in Requirements 2.10 and 6.6.
3. Every new screen SHALL pass axe checks in the Playwright suite (light and dark) and keyboard-only use. The date controls, filters, tables, dialogs and drawers SHALL follow the F5 and F2 accessibility conventions.
4. Unit tests (Vitest, Angular Testing Library, MSW) SHALL cover every criterion above that a component, store or service can show. Playwright flows with the mocked backend SHALL cover the staff day list with a mark, the admin appointments page, and the staff create, move, deactivate, reactivate and delete flows.
5. The staff feature SHALL be a lazy chunk with a size budget set in design, and the admin chunk SHALL stay within its budget, or the design records a new one for approval.
6. `README.md`, `CLAUDE.md`, `docs/specs/README.md` and `docs/WORKPLAN.md` SHALL be updated. That includes the F7 row and Polish renumbered to F8, and the stale F2, F3, F5 and F6 PR states corrected.

## Out of scope

- **Staff cancelling or rebooking for a customer, walk-ins and the queue:** they belong to the backend's queue feature, which does not exist yet.
- **Undoing a mark:** the backend has no endpoint for it.
- **Staff self-service:** changing their own branch, profile or password.
- **Editing a staff member's name, email or phone, resetting a password, and restoring a deleted account:** there is no backend endpoint for any of them.
- **Live updates (polling or push):** refresh is manual, as decided.
- **Reports:** daily summary and waiting times are a later phase with their own backend.
- **A staff appointment detail with its own route:** the detail is a panel opened from the list (Decisions).

## Known gaps

- After an admin moves or deactivates a staff member, the staff member's open workspace keeps working with the old branch until their access token expires (at most 60 minutes). Every refresh is refused, so it ends at the next refresh with the F1 "session expired" flow. This is the backend's accepted residual risk (ADR-0007 and ADR-0009), and the client cannot close it.
