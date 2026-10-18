# F6 Redesign (Indigo + Lavender) — Tasks

<!--
Rules (from the template):
- Coding steps only; each task cites the requirement numbers it implements.
- Each task is small enough to finish and test in one sitting and leaves
  `pnpm lint && pnpm test && pnpm build` green.
- A box is checked only when the code exists and those three commands pass, in the same commit as the code.
-->

**Prerequisite.** F1 to F5 are merged on `main` (F4 in PR #7). F6 changes no store, route, URL rule or API call; a task that finds it needs one stops and reports.

**Chunks for parallel agents** (non-overlapping files, all after task 1): A = tasks 2 and 3 (shared and shells), B = tasks 4 and 5 (landing), C = task 6 (auth), D = tasks 7 to 11 (booking wizard), E = task 12 (other screens). Task 13 onwards runs after all chunks are merged into the branch.

- [x] 1. Palette and tokens
  - _Done: 18/10/2026 4:13pm_
  - Replace the ramps and semantic tokens in `src/styles.css` with the design's values (indigo `brand`, `lavender`, light and dark tables, `success-soft`, the four `tile-*` pairs, radius and lavender-tinted shadows); add `shadow-soft` to the helm card's default classes.
  - Swap the hard-coded colours: `core/config/config-error.ts`, the `theme-color` meta in `src/index.html` if present, and the confetti fallback array plus its variable names (`--color-brand-500`, `--color-lavender-400`, `--color-success`).
  - Interim fix for the four `brand-*` users so they still render (the hero gradient, auth aside and illustration keep working with the new ramp; their redesign is in tasks 4 to 6).
  - Specs: a Vitest spec that fails on any teal hex value from the old ramp or a `teal-` class in `src/` and `public/`; the confetti spec reads the new variable names.
  - Run the axe e2e suites (public, book, appointments, admin) in both themes; fix any token value that fails, and record a changed value in the design's palette table.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_

- [x] 2. Brand mark, theme toggle and badge variants
  - _Done: 18/10/2026 4:52pm_
  - `shared/ui/brand-mark` (`BrandMark`: icon tile + wordmark, icon `aria-hidden`).
  - Theme toggle as the segmented control (names, roles and `aria-checked` unchanged).
  - Badge variants `success` and `muted`.
    - Already done in commit 10946fd (with a test in `shared/ui/f4-helm.spec.ts`); not repeated here.
  - Specs: brand mark renders the wordmark and a hidden icon; theme toggle spec still passes; badge variants' classes.
  - _Requirements: 2.1, 2.3, 6.3, 9.2_

- [ ] 3. Shell headers
  - Public, customer, staff and admin shells use `BrandMark` inside their existing brand link.
  - Public header: "Sign in" outline, "Create account" filled (or "Go to my dashboard").
  - Customer shell: active desktop link with the indigo underline, active tab-bar item in `text-primary`; layout classes unchanged.
  - Specs: shell specs updated only for the new markup; the accessible name of the brand link is "Smart Appointments"; `aria-current` kept.
  - _Requirements: 2.1, 2.2, 2.4, 2.5_

- [ ] 4. Landing hero and scene
  - Hero pill, two-line `<h1>` with "in just a few clicks." in `text-primary`, supporting sentence, CTA arrow icon.
  - `hero-scene.component.ts` (inline SVG blobs and reception scene, `aria-hidden`, `focusable="false"`, shown from `lg`).
  - `hero-preview` reworked into the floating "Appointment Confirmed!" card (mint check, branch and service, date, mint time chip, "Confirmed"); still `aria-hidden` and `inert`.
  - `hero.component.css` gradients in lavender; grain and `.reveal` kept; file under 4 kB.
  - Specs: `landing.page.spec` (one `<h1>` with both lines, pill text, no `<img>`, no external URL, reveal rules), scene and card hidden from assistive technology; 320 px no horizontal scroll still covered by e2e.
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 5. Landing sections
  - "Why choose us?" with the four cards and tile icons (`zap`, `calendar-check`, `map-pin`, `shield-check`) in `tile-*` colours.
  - How-it-works and CTA band on the new tokens.
  - Specs: `landing-sections.spec` (heading, four titles and sentences, icons hidden, landmarks kept).
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ] 6. Login and register
  - `auth-layout`: form first, gradient aside second (`hidden lg:flex` kept), `tagline` and `subtitle` inputs with the texts from the design.
  - Redrawn `auth-illustration` (3D-style calendar, mint check, plant).
  - Eyebrows "Create account" and "Sign in" above the unchanged `<h1>`s.
  - `app-form-field` optional `icon` input (decorative, `ps-10` on the projected input); icons on names, email, phone and passwords; show/hide kept.
  - Checklist icons (mint check, muted circle); full-width submit with arrow; primary underlined switch link.
  - Specs: `auth-layout.component.spec` (form slot before aside, aside classes, tagline), form-field icon hidden and label association unchanged, register spec (5 `.sr-only`, eyebrow is not a heading), login spec.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [ ] 7. Stepper
  - `step-indicator` from 640 px: numbered circles, labels under, connectors, completed with check and sr-only "completed", current filled with `aria-current="step"`, earlier steps as buttons; success shows all four completed; below 640 px text unchanged.
  - Specs: `step-indicator.component.spec` rewritten for each step, the success state, `disabled`, and the small-screen line.
  - _Requirements: 6.1_

- [ ] 8. Branch and service cards, action bar
  - Branch search gets a leading search icon and a "Clear search" button when non-empty (existing debounce and no-match state kept).
  - Branch card: "Open now"/"Closed" on the `success`/`muted` badge variants; selected card styling and the leading radio dot, also on service cards.
  - Action bar buttons with arrow icons (position classes unchanged).
  - Specs: `branch-step.component.spec` (clear button empties the search and returns focus to the field; existing search tests green), `service-step` and `action-bar` specs green.
  - _Requirements: 6.2, 6.3, 6.4, 6.5_

- [ ] 9. Month grid model
  - `core/time/month-grid.ts`: `monthGrid(year, month, firstBookable, lastBookable)` and `windowMonths(first, last)` as in the design (Monday-first weeks, `inMonth`, `bookable`, `isToday`, full labels via `Intl` in UTC on noon instants).
  - Table-driven spec: window inside one month, across two months, across a year end; leading and trailing days; a month starting on Monday and on Sunday; labels identical under a browser zone ahead of and behind UTC.
  - _Requirements: 7.1, 7.2_

- [ ] 10. Month calendar and time grid
  - `month-calendar.component.ts` (grid pattern, roving tab stop, keys, previous/next month limits, today ring, selected fill, disabled days) wired to `store.date()`, `store.chooseDate()`, `store.strip()`, `store.todayInBranch()`.
  - `date-time-step` uses it in the two-column layout from 768 px; delete `date-strip.component.ts` and its spec.
  - `slot-groups` grid and `slot-chip` restyle (two to three columns, outlined, selected fill, capacity hint under the time); roles and names unchanged.
  - e2e: add `pickDate(page, date)` to `e2e/book-helpers.ts` and use it wherever a spec picked a day from the strip.
  - Specs: `month-calendar.component.spec` (only the 14 days enabled; each key; Page Up/Down clamped; arrows skip disabled days and stop at the edge; focus does not select; Enter, Space and click call `chooseDate`; month switches when focus crosses a boundary; every day's accessible name), `slot-groups` and `slots-status` specs green ("Check <next day>" still works).
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

- [ ] 11. Review and success
  - `review-card` as "Booking summary" with icon rows, `editable` input and `edit` output, and a `contact` input; `review-step` maps Edit to `store.goTo(step)` and supplies the contact from `SessionStore.profile()` (calling `fetchProfile()` when idle; email only until ready or on failure).
  - `success-step`: mint check circle, "Booking confirmed!", sentence, mint "Booking reference" card with the copy button, summary card without Edit, "Add to calendar" filled, "View details" to `/appointments/<id>`, "Book another" and "Back to home" text links.
  - Replace "You're booked" with "Booking confirmed!" in specs and e2e.
  - Specs: `review-step.component.spec` (Edit per step, Contact with and without profile, no error UI on profile failure), `success-step.component.spec` (heading, reference card, links).
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 12. Other screens
  - Appointment status badge: Booked default, Cancelled `muted`; admin status badge: Active `success`, Inactive `muted`.
  - Visual pass of `/appointments`, the detail sheet and page, `/profile`, `/staff`, the 404 page and every admin screen in both themes at 1280 and 390 px (screenshots from the mocked e2e build); fix token-level issues, and list any layout issue under Known gaps instead of fixing it.
  - Specs: badge specs for the variants; the appointments and admin axe suites in both themes.
  - _Requirements: 9.1, 9.2, 9.3_

- [ ] 13. Full gate, budgets and e2e
  - `pnpm lint`, `format:check`, `typecheck`, `test`, `build`, every `size:*` group within its budget, `test:scripts`, and `pnpm e2e` (all flows and axe suites, both themes) on the merged branch; fix what fails.
  - Record the measured sizes in this task's note.
  - _Requirements: 1.4, 10.1, 10.2, 10.3_

- [ ] 14. Documentation
  - README: the theme description (indigo and lavender, light and dark) and the roadmap row; `docs/specs/README.md` row for F6; `docs/WORKPLAN.md`; record any design deviation at the end of `design.md`.
  - _Requirements: 10.5_

- [ ] 15. Manual verification against the live gateway
  - With the Compose stack and the F6 web image: landing, register, book to success, my appointments and the admin console at 1280 and 390 px, light and dark, with screenshots compared to the mockup; keyboard pass of the calendar.
  - Record the result in the PR description; tick only when every step passed.
  - _Requirements: 10.4_
