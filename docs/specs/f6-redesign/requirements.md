# F6 Redesign (Indigo + Lavender) — Requirements

## Introduction

This spec replaces the F0 visual language (teal accent, zinc neutrals) with an **Indigo + Lavender** theme in light and dark, and reworks the landing page, the login and register pages and the booking wizard to match the approved mockup (18/10/2026). The my-appointments, profile, staff and admin screens keep their layouts and change through the theme tokens only. It lives in `src/styles.css`, `src/app/shared/` (shells, theme toggle, UI components), `src/app/features/public/` and `src/app/features/customer/book/`.

F6 is a visual change. It **does not change behaviour** specified by F1 to F5: routes, URL state, API calls, idempotency, error handling, guards, the 14-day booking window and every accessible name and role that existing tests and assistive technology rely on stay as they are, unless a criterion below says otherwise. Where a criterion below names an F2 or F3 requirement it supersedes only the visual part of it. It makes no API change and needs no backend change. Every requirement is a pure frontend concern (no FR-ID); the screens keep serving the FR-IDs their original specs cite.

## Decisions to confirm at approval

- **Wizard steps stay Branch, Service, Date & time, Review.** The mockup's labels (Service, Date & Time, Review, Confirm) fold branch choice into step 1; we keep our four steps and show all four as completed on the success screen (Req 6.1).
- **The 14-day booking window stays.** The month calendar shows full months but only the 14 bookable days are selectable (Req 7).
- **The booking reference stays the appointment id**, shown in full in a monospace mint card. The mockup's `SA-2026-10432` short form would need a backend field (Out of scope).
- **The branch "Open" badge** reads "Open today" or "Closed today" from the branch's weekly schedule in the branch's own time zone; a branch with no schedule shows no badge (Req 6.3).
- **No "About" or "Help" pages.** The mockup's header links point at pages that do not exist; the public header keeps only the links to real routes (Out of scope).
- **The theme is still `system`, `light` or `dark`**, stored under `sa.theme`; only its look changes.

## Requirements

### Requirement 1: Palette and design tokens (no FR-ID)

**User Story:** As a user, I want a calm indigo and lavender look in both light and dark mode, so that the app feels modern and pleasant to use.

#### Acceptance Criteria

1. The system SHALL define an indigo brand ramp (`--color-brand-50` to `--color-brand-950`, replacing teal) and a lavender ramp (`--color-lavender-50` to `--color-lavender-950`) in `src/styles.css`, and SHALL remove every teal value from the app's source.
2. WHERE the light theme is active, the semantic tokens SHALL be: a lavender-tinted near-white page background, white cards and popovers with a lavender-tinted border, an indigo primary (about `#4f46e5`) with white text, a lavender accent surface with dark indigo text, and a mint success surface for confirmation chips.
3. WHERE the dark theme is active, the semantic tokens SHALL use deep indigo-navy backgrounds and cards (not zinc), a lighter indigo primary with dark text, and a muted lavender accent.
4. Every text and background pair produced by the tokens SHALL meet WCAG 2.2 AA (4.5:1 for body text, 3:1 for large text, focus rings and UI component boundaries) in both themes, and the axe suites for `/`, `/login`, `/register`, every booking step, `/appointments`, `/profile` and the admin screens SHALL report no serious or critical violation in either theme.
5. Cards SHALL use a radius of 1 rem and a soft, slightly lavender-tinted shadow; buttons and inputs SHALL use a 0.75 rem radius.
6. The components under `src/app/shared/ui/` SHALL keep taking every colour from the semantic tokens, so that the re-skin needs no per-component colour edit.
7. Colours outside the stylesheet SHALL follow the new palette: the configuration-error screen (`core/config/config-error.ts`), the confetti fallback colours, and the `theme-color` meta tag if one exists. The confetti SHALL read the brand colours through the variable names Tailwind actually emits (`--color-brand-*`).
8. The initial theme script (`public/theme-init.js`) SHALL keep applying the stored or system theme before first paint, so no light flash appears in dark mode.

### Requirement 2: Headers and theme toggle (no FR-ID)

**User Story:** As a user, I want a clean header with a recognisable logo and a compact theme switch, so that I can find my way and choose my theme easily.

#### Acceptance Criteria

1. Every shell's brand link SHALL show a calendar-check icon in an indigo tile before the "Smart Appointments" wordmark, and SHALL keep its accessible name and link target.
2. The public header SHALL show "Sign in" as an outline button and "Create account" as a filled indigo button (or "Go to my dashboard" for a signed-in user, per F2 Req 1.8), inside the existing "Account" navigation.
3. The theme toggle SHALL be a compact segmented control of three icon radios with the existing names "Use system theme", "Use light theme" and "Use dark theme", and the checked radio SHALL be visible by more than colour alone.
4. In the customer shell, the active navigation item SHALL be marked by an indigo underline (desktop) or an indigo icon and label (bottom tab bar), and `aria-current="page"` SHALL stay.
5. The shells' layout contracts SHALL not change: the customer shell's bottom tab bar below 768 px, the admin sidebar widths and the skip link.

### Requirement 3: Landing hero (no FR-ID)

**User Story:** As a visitor, I want an inviting first screen that shows what booking looks like, so that I want to try it.

#### Acceptance Criteria

1. The hero SHALL show, in order, a pill reading "Fast • Secure • Hassle-free", the single `<h1>` "Book your next appointment in just a few clicks." with "in just a few clicks." on its own line in the indigo primary colour, one supporting sentence, and the two F2 call-to-action buttons, the primary one with a trailing arrow icon.
2. WHERE the viewport is 1024 px wide or more, the hero SHALL have a right-hand illustration: an inline-SVG scene of soft lavender blob shapes and a stylised reception area, with a floating "Appointment Confirmed!" card showing a branch name and service, a date, a time chip and a mint "Confirmed" line. Below 1024 px the scene SHALL stack under the text or be hidden, and the page SHALL have no horizontal scroll at 320 px.
3. The illustration and the card SHALL be decorative (`aria-hidden="true"`, not focusable) and SHALL use only inline SVG, CSS and data URIs: no `<img>`, no raster file and no external origin.
4. The entrance motion SHALL stay within F2 Req 1.6 (opacity and transform only, 400 ms or less, none under reduced motion), and the hero component stylesheet SHALL stay under the 8 kB `anyComponentStyle` error budget.

### Requirement 4: Landing sections (no FR-ID)

**User Story:** As a visitor, I want the benefits explained at a glance, so that I trust the service.

#### Acceptance Criteria

1. The value-propositions section SHALL be headed "Why choose us?" and show four cards: "Fast & easy booking", "Instant confirmation", "Multiple branches" and "Flexible cancellation", each with a one-sentence description and an icon in a rounded tile tinted lavender, blue, mint and peach respectively.
2. The four tile tints SHALL be defined as tokens with light and dark values, and each icon SHALL meet 3:1 against its tile.
3. The "How it works" section and the closing call-to-action band SHALL use the new palette (numbered indigo circles, a lavender-tinted band) and keep their headings, landmarks and content from F2.
4. On a 320 px viewport the cards SHALL stack in one column with no horizontal scroll.

### Requirement 5: Login and register pages (no FR-ID)

**User Story:** As a visitor, I want a friendly sign-up and sign-in page, so that creating an account feels quick.

#### Acceptance Criteria

1. WHERE the viewport is 1024 px wide or more, the form SHALL be on the left and a decorative panel on the right, with a lavender-to-indigo gradient, a heading-styled tagline ("Small steps, better access." on register; "Welcome back to easier booking." on login), a one-line subtitle and an inline-SVG 3D-style calendar illustration with a check mark. The panel SHALL stay `aria-hidden="true"`; its tagline is decoration, not the page heading.
2. Below 1024 px the panel SHALL be hidden and the form SHALL fill the width, as in F2.
3. The register page SHALL show a small uppercase eyebrow "Create account" above its `<h1>`, which keeps F2's text "Create your account" (the mockup's "Book your account" is not adopted); the login page SHALL show the eyebrow "Sign in" above F2's "Welcome back". The eyebrow SHALL not be a heading.
4. Text inputs SHALL show a leading icon (person for names, envelope for email, phone for phone number, lock for passwords) that is decorative and does not change the inputs' accessible names, and the password field SHALL keep its show/hide button.
5. The password checklist SHALL show a mint check icon for a met rule and a muted circle for an unmet one, keeping the F2 screen-reader text and live announcement.
6. The submit buttons SHALL be full-width filled indigo buttons with a trailing arrow icon, and the "Already have an account? Log in" (or the login page's equivalent) link SHALL be underlined in the primary colour.

### Requirement 6: Booking wizard frame, branch and service steps (no FR-ID)

**User Story:** As a customer, I want to see where I am in the booking and pick a branch quickly, so that booking feels short.

#### Acceptance Criteria

1. The step indicator SHALL show the four steps as numbered circles joined by a line, with the label under each: completed steps as indigo-outlined circles with a check, the current step as a filled indigo circle with `aria-current="step"`, later steps muted. On the success screen all four SHALL show as completed. Below 640 px it SHALL keep the F3 "Step N of 4: <name>" line, and it SHALL keep F3's rule that only earlier steps are clickable.
2. The branch step SHALL have a search field ("Search branches") above the list that filters branches by name or address as the user types (case-insensitive, no API call), with a "No branches match" message and a way to clear the search when nothing matches.
3. Each branch SHALL be a card showing its name, description (if any) and address, and a badge "Open today" (mint) or "Closed today" (muted) computed from its weekly schedule for today's date in the branch's time zone. A branch without a schedule SHALL show no badge and stay disabled as in F3.
4. The selected branch or service card SHALL have an indigo border, a lavender-tinted background and a filled radio dot, and the cards SHALL keep their `radio` roles and names.
5. The Back and Continue buttons SHALL carry leading and trailing arrow icons, and the action bar SHALL keep its F3 position contract (sticky above the tab bar on small screens, static from 768 px).

### Requirement 7: Month calendar and time grid (no FR-ID)

**User Story:** As a customer, I want to pick a date on a familiar month calendar and see the times next to it, so that choosing a time is easy.

#### Acceptance Criteria

1. The date-and-time step SHALL replace the 14-day strip with a month calendar: a month and year title, previous and next month buttons, weekday headings (Mon to Sun) and a grid of the month's days.
2. Only the 14 days of the F3 booking window (today in the branch's time zone and the 13 days after it) SHALL be selectable; all other days SHALL be shown muted and be disabled. The previous and next buttons SHALL be disabled when the adjacent month has no bookable day, so the user can only move across the one or two months the window covers.
3. The selected date SHALL be a filled indigo circle and today SHALL be marked with a ring. Selecting a day SHALL call the existing wizard store's date choice (so the URL, the slot search, the caching and the midnight roll-over from F3 work unchanged).
4. The calendar SHALL be operable by keyboard: one tab stop into the grid, the arrow keys moving by day and week across bookable days, Home and End to the first and last bookable day of the week, Page Up and Page Down to the adjacent month, and Enter or Space to select. Each day SHALL have an accessible name with the full date (for example "Wednesday, 21 October 2026"), and the selected day SHALL be exposed as selected.
5. WHERE the viewport is 768 px wide or more, the calendar and the "Available times" list SHALL sit side by side; below that, the times SHALL follow the calendar.
6. The times SHALL be outlined buttons in a grid of two to three columns showing the start time; the selected one SHALL be filled indigo with white text. The F3 `radiogroup` "Available times", the morning, afternoon and evening grouping, the capacity hint, and the loading, empty, error and rate-limited states SHALL stay.
7. The "No times available on <date>" state and its "Check <next day>" button SHALL keep working with the calendar.

### Requirement 8: Review and success (no FR-ID)

**User Story:** As a customer, I want a clear summary before I confirm and a clear confirmation after, so that I am sure of my booking.

#### Acceptance Criteria

1. The review step SHALL show a "Booking summary" card with icon rows for Branch (name and address), Service (name and duration), Date & time (in the branch's time zone, with F3's zone note), and Contact (the signed-in customer's email and phone number from the session), each row separated by a divider.
2. The card SHALL have an "Edit" link for Branch, Service and Date & time that returns to that step with the later choices kept where F3's URL rules allow.
3. The success step SHALL show a large mint circle with the drawn check, the heading "Booking confirmed!" (replacing "You're booked"), the sentence "Your appointment has been successfully booked.", and the booking reference in a mint card labelled "Booking reference" with the copy button.
4. The success step SHALL offer "Add to calendar" as a filled indigo button, "View details" as an outline button linking to the new appointment's detail (`/appointments/<id>`), and a "Back to home" text link; F3's "Book another" stays as a text link.
5. The confetti SHALL use indigo, lavender and mint, and SHALL stay off under reduced motion.

### Requirement 9: Other screens (no FR-ID)

**User Story:** As a customer, staff member or admin, I want the rest of the app to match the new look, so that it feels like one product.

#### Acceptance Criteria

1. The my-appointments list and detail, the profile page, the staff placeholder, the not-found page and every admin screen SHALL keep their layouts and pick up the new tokens, radius and shadows.
2. Appointment and admin status badges SHALL use the new palette: Booked indigo, Cancelled muted, Active mint and Inactive muted, each meeting 4.5:1 for its text.
3. The toasts, dialogs, sheets, drawers and command palette SHALL use the new surfaces and pass the axe checks in both themes.

### Requirement 10: Tests and delivery (no FR-ID)

**User Story:** As a maintainer, I want the redesign covered by the same gates, so that it does not regress behaviour or accessibility.

#### Acceptance Criteria

1. The unit specs that assert structure changed by this spec (the date strip, the step indicator, the auth layout, the landing sections, the success step) SHALL be updated or replaced, and new specs SHALL cover the month calendar (window limits, month navigation, keyboard, selection calling the store), the branch search and the "Open today" badge.
2. The Playwright flows with the mocked API SHALL pass, updated only where a visible text changed by this spec ("Booking confirmed!") or the date picker changed.
3. `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`, every `pnpm size:*` group and `pnpm e2e` SHALL pass, within the existing budgets (initial 250 kB, public 50 kB, book 60 kB, appointments 40 kB, admin 120 kB gzip).
4. A manual check against the Compose gateway SHALL walk landing, register, booking to success, my appointments and the admin console at 1280 and 390 px in light and dark, with screenshots compared to the mockup, recorded in the PR.
5. The README (theme description and roadmap), `docs/specs/README.md` and `docs/WORKPLAN.md` SHALL be updated.

## Out of scope

- A short human-readable booking reference such as `SA-2026-10432`: the backend has no such field.
- "About" and "Help" pages and their header links.
- Photographs or raster illustrations; every illustration is inline SVG.
- Layout changes to my appointments, profile, staff and admin (token re-skin only).
- Booking beyond the 14-day window, and showing availability on the calendar days themselves (that would need one slot search per day).
- The old F6 Polish items (size-script unification, the `size:admin` label, Lighthouse budgets): moved to F7.
