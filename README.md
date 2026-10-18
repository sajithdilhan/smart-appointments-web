# Smart Appointments Web

![CI](https://github.com/sajithdilhan/smart-appointments-web/actions/workflows/ci.yml/badge.svg)

The Angular web client for [SmartAppointments](https://github.com/sajithdilhan/SmartAppointments), a .NET microservices portfolio project: a smart appointment and queue management system. The backend owns the business rules; this repository is the single-page app that customers, staff and administrators will use, and it talks to the backend only through its API gateway.

> **Status: F0 scaffold, F1 core, F2 public pages, the F3 booking wizard, the F4 my-appointments and profile screens and the F5 admin console and the F6 redesign are built.** The repository holds the production-shaped foundation (tooling, theme, runtime configuration, container image, CI), the core every screen stands on (typed API layer, HTTP pipeline, auth session with silent refresh, guards, application shells, 404 page, time utilities), the public pages (landing, login, register), the five-step booking wizard at `/book` and the admin console under `/admin` (see "What F3 provides" and "What F5 provides"), the customer's appointments list, detail with cancel and profile (see "What F4 provides"), with a placeholder page behind the staff route. The roadmap below is the plan.

## What it will do

| Role                                 | Planned capabilities                                                                             | Phase |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ | ----- |
| Visitor                              | Landing page, register, sign in                                                                  | F2    |
| Customer                             | Find a free slot, book an appointment (with `.ics` export), view, cancel, edit the profile       | F3-F4 |
| Admin                                | Manage branches and weekly schedules, service types, slot generation, dashboard, command palette | F5    |
| Staff, queue, notifications, reports | Wait for their backend services; not planned here                                                | -     |

## Roadmap

| Phase | Scope                                                                                              | State                                    |
| ----- | -------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| F0    | Scaffold and tooling: workspace, theme, runtime config, quality gates, Docker, CI                  | Implemented                              |
| F1    | Core: API types, error normaliser, auth store and token refresh, guards, layout shells             | Implemented (live-gateway check pending) |
| F2    | Public pages: landing, login, register                                                             | Implemented                              |
| F3    | Booking wizard, success page, calendar export                                                      | Implemented (live check partly run)      |
| F4    | My appointments, detail, cancel, profile                                                           | Implemented                              |
| F5    | Admin console                                                                                      | Implemented                              |
| F6    | Redesign: Indigo + Lavender theme and the new landing, auth and booking layouts                    | Implemented                              |
| F7    | Polish: accessibility audit, motion, empty and error states, end-to-end suites, Lighthouse budgets | Not started                              |

Specs for every phase live in [`docs/specs/`](docs/specs/README.md).

## Tech stack

Versions are the ones installed at scaffold time (see `package.json` and `pnpm-lock.yaml`).

| Area       | Choice                                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| Framework  | Angular 22, standalone components, zoneless change detection, signals, TypeScript 6                        |
| Styling    | Tailwind CSS 4 (CSS-first `@theme` tokens), Inter variable font (self-hosted)                              |
| Components | Spartan/ui (`brain` headless primitives and `helm` styled components, generated into `src/app/shared/ui/`) |
| State      | Angular signals; `@ngrx/signals` for the session store                                                     |
| Unit tests | Vitest through the Angular builder, Angular Testing Library, MSW                                           |
| End-to-end | Playwright (Chromium)                                                                                      |
| Quality    | ESLint (angular-eslint), Prettier, Husky, lint-staged, commitlint                                          |
| Workspace  | Nx 23 standalone workspace (root `project.json`, Angular builders as executors), pnpm                      |
| Packaging  | pnpm, multi-stage Docker build, nginx (unprivileged) with a strict CSP                                     |
| CI         | GitHub Actions                                                                                             |

## Architecture

```
src/app/
  core/            non-visual: config, theme, api (typed services), http (pipeline, AppError, outage),
                   auth (session store, refresh, cross-tab, guards), notify (toasts), routing (titles),
                   time (UTC parsing, zone maths), util (clock, safe storage, viewport), ui (palette launcher)
  shared/ui/       Spartan helm components and small app primitives (theme toggle, rate-limit notice)
  shared/layout/   application frames: public, customer, admin and staff shells, user menu, breadcrumbs,
                   outage banner, route progress and announcer, not-found page
  shared/forms/    form primitives: field view and form field, field a11y directive, form alert, generic
                   validators, phone normaliser, first-invalid focus
  shared/a11y/     heading focus directive
  features/        one folder per area (public, customer, admin, staff), lazy routes; admin and customer are built, the
                   staff area still shows a placeholder page
    public/          landing/ (hero, value props, how it works, call-to-action band), login/, register/
                     (with the password checklist), auth/ (auth layout, illustration, password field),
                     validation/ (password rules and messages), public.routes.ts, titles.ts
src/testing/       MSW server, a stateful mock of the auth endpoints, fake timers, fake session
public/            config.json (dev default), theme-init.js (pre-paint theme script)
docker/            nginx config, entrypoint that renders config.json and the CSP
e2e/               Playwright specs (routes mocked, no backend needed)
scripts/           size.mjs (gzip budgets, incl. `--group admin`), gen-api.mjs (OpenAPI types)
docs/specs/        spec-driven development: requirements, design, tasks per feature
```

Dependency direction is `features -> shared, core`, `shared -> core`; `core` imports neither. ESLint enforces it.

- **One API, the gateway.** The app only ever calls the YARP API gateway (default `http://localhost:5290`), never Auth, Availability or Booking directly.
- **Runtime configuration.** The API origin is read from `/config.json` before the app renders; nothing environment-specific is compiled in.
- **CORS.** Browser calls need the backend gateway to allow this app's origin. The gateway's CORS support ([backend PR #12](https://github.com/sajithdilhan/SmartAppointments/pull/12), spec `docs/specs/gateway-cors/`) allows `http://localhost:4200` (`pnpm start`) and `http://localhost:8081` (Docker) in Development, and Compose sets the Docker origin from `WEB_ORIGIN`.

## Getting started

Prerequisites: Node (the major in [`.nvmrc`](.nvmrc), currently 24), pnpm (the version in `package.json` `packageManager`; `corepack enable` provides it), and optionally Docker.

```bash
pnpm install
pnpm start          # http://localhost:4200
```

The app needs a backend to sign in or to regenerate the API types (`pnpm gen:api`); the unit and end-to-end tests do not. To run the backend, clone [SmartAppointments](https://github.com/sajithdilhan/SmartAppointments), copy `.env.example` to `.env` and run `docker compose up --build`; its gateway listens on `http://localhost:5290`. Its Development CORS settings already allow `http://localhost:4200` and `http://localhost:8081` (`Cors:AllowedOrigins`; Compose reads `WEB_ORIGIN`).

One-time browser install for the end-to-end tests:

```bash
pnpm exec playwright install chromium
```

### Scripts

| Script                             | What it does                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm start`                       | Dev server on port 4200                                                              |
| `pnpm build`                       | Production build into `dist/smart-appointments-web/browser`, with budgets            |
| `pnpm test`                        | Unit tests, single run (`pnpm test --coverage` writes `coverage/`)                   |
| `pnpm test:watch`                  | Unit tests in watch mode                                                             |
| `pnpm lint`                        | ESLint, zero warnings allowed                                                        |
| `pnpm format`, `pnpm format:check` | Prettier write and check                                                             |
| `pnpm typecheck`                   | `tsc` over the app and spec projects                                                 |
| `pnpm size`                        | Gzip size of the initial bundle; fails above 250 kB                                  |
| `pnpm size:public`                 | Gzip size of the public feature chunks (needs a build); fails above 50 kB            |
| `pnpm size:admin`                  | Gzip size of the admin lazy group (shared chunks counted once); fails above 120 kB   |
| `pnpm size:book`                   | Gzip size of the booking wizard's lazy chunks; fails above 60 kB                     |
| `pnpm size:appointments`           | Gzip size of the F4 lazy chunks (appointments, profile); fails above 40 kB           |
| `pnpm test:scripts`                | Node tests of `scripts/` (the generator, the date lint rules)                        |
| `pnpm e2e`                         | Playwright tests, routes mocked (starts `pnpm start`, or uses `E2E_BASE_URL`)        |
| `pnpm gen:api`                     | Regenerates `src/app/core/api/generated/*.d.ts` from the gateway's OpenAPI documents |

## What F1 provides

- **Typed API layer.** `pnpm gen:api` fetches the three OpenAPI documents from a running gateway (`http://localhost:5290/openapi/{auth,availability,booking}/v1.json`, served only in Development; override with `GATEWAY_URL`) and writes `openapi-typescript` declarations to `src/app/core/api/generated/`. It writes nothing unless all three downloads succeed. `ApiClient` and `AuthApiService` build absolute URLs from the runtime config.
- **One HTTP pipeline.** Correlation id, bearer token (only for the API origin), one retry after a silent refresh, error normalisation into `AppError` (`{ status, detail }`, network and timeout, `429` with `Retry-After`, `502`/`504` outage) and an outage banner with Retry.
- **Auth session.** Access token in memory, refresh token in `localStorage` (`sa.refreshToken`), restore before the first navigation, proactive refresh 60 s before expiry, single-flight refresh guarded by a Web Lock, cross-tab sync over `BroadcastChannel`, `returnUrl` handling through `safeReturnUrl`.
- **Guards, shells and routes.** `authGuard`, `guestGuard`, `roleGuard`, role-based landing, public, customer (top bar or bottom tabs), admin (collapsible sidebar or drawer, breadcrumbs) and staff shells, a 404 page, function-based page titles.
- **Utilities.** `core/time` (UTC parsing, zone formatting, calendar and branch-hours maths; lint rules forbid ad-hoc date handling elsewhere), `sessionSafe` and `localSafe` storage, toasts, a retry countdown for rate limits.
- **Backend features F1 depends on:** refresh tokens and logout (`POST /api/auth/refresh`, `POST /api/auth/logout`, `accessTokenExpiresAtUtc` in the token response), gateway CORS for this app's origin, and the unified `{ status, detail }` error body (backend specs `auth-refresh-tokens`, `gateway-cors`, `shared-web-infrastructure`).

## What F2 provides

- **Landing (`/`).** Hero with a preview, value propositions, how it works and a call-to-action band. It renders for signed-in users too, with a "Go to my dashboard" action.
- **Login (`/login`) and register (`/register`).** Both are guest-only (`guestGuard`). Typed reactive forms with inline validation, a show/hide password field, an alert region that takes focus on failure, a retry countdown on `429`, and a password checklist on register. A failed login always shows one fixed message. A duplicate email is shown inline with a "Log in instead" link.
- **After submit.** Login goes to `resolvePostLoginTarget` (role landing, or a safe `returnUrl`). Register logs the new customer in and lands on `/book`; if that automatic login fails it opens `/login` with the notice below.
- **Query parameters on `/login`.** `returnUrl` (read through `safeReturnUrl`; unsafe values are ignored), `reason=session-expired` (set by the session ender and the cross-tab sync; shows "Your session has ended. Log in again.") and `reason=registered` with `email` (set by register when the automatic login fails; shows "Your account was created. Log in to continue.", prefills the email and focuses the password).
- **Shared primitives.** `shared/forms` and `shared/a11y` (listed under Architecture) are reusable by later forms.
- **Bundle.** The public chunks are held under 50 kB gzipped by `pnpm size:public`, which CI runs after the build.

### Known gaps (F2)

- **Registration reveals whether an email is registered.** The backend answers `400` "Email is already registered." and the page shows it inline, which allows account enumeration; login stays uniform. A neutral flow needs email verification, which does not exist.
- **Registration is not rate limited at the gateway.** Only login, appointment creation and slot search are, so the `429` branch on the register page is defensive and cannot be exercised end to end yet.

## What F3 provides

- **Booking wizard at `/book`** (customers only): branch, service, date and time, review, success. The selections live in the URL as the `branch`, `service`, `date` and `slot` query parameters (and `done=1` on the success view, which needs the booking held in memory and is never deep-linkable), so Back, reload and shared links work; an invalid link is repaired with `replaceUrl` and a short note.
- **Slot search** is debounced (250 ms), cached for 60 s, limited to 25 requests per minute per tab (the gateway allows 30) and shows the `429` countdown with a manual retry. Branch dates and hours use the branch's own time zone, never the browser's.
- **No double booking.** The `Idempotency-Key` is created when Review opens for a slot and kept in `sessionStorage` as `sa.idem.<slotId>`; a retry, a reload or a lost response re-sends the same key and gets the original result. The confirm flow is an explicit state machine with the verbatim backend `409` strings mapped in one module. `sa.book.justBooked` remembers for 10 minutes that a booking was just made, for the "saved" hint.
- **Success** shows the reference, an animated check, a light confetti burst (own lazy chunk, off under reduced motion) and an `.ics` calendar download generated in the browser.
- **Known gaps:** conflict reasons are told apart by their text; the idempotency key is per tab; there is no per-day availability or branch-service mapping; "Open now" is not availability (it ignores holidays). The response types in `core/api/models.ts` are temporary until `pnpm gen:api` can run against a gateway that documents them.

## What F4 provides

- **Routes.** `/appointments` (list) with the detail as its child `/appointments/:id` (a sheet at 1024 px and wider when opened from a card, otherwise a page; a reloaded deep link is always a page; a non-GUID id shows "Appointment not found" without a request) and `/profile`.
- **URL state.** `?tab=upcoming|past` and `cancelled=1` (only honoured on Upcoming); an unknown tab falls back to Upcoming. The tabs write the URL with `replaceUrl`.
- **Cancel state machine.** `cancelReducer` (pure) with `AppointmentDetailStore` running the effects. After every outcome the store re-reads the appointment (`GET /api/appointments/{id}`): a `204` shows the server copy; a `503`, network error or timeout is never trusted, the re-GET decides between "cancelled, the slot may take a moment" and "nothing was changed, try again"; a known `409` text means "already started"; any other `409` is a generic refresh message (the raw server text is never shown).
- **Reference lookup.** Branch and service names come from F3's `ReferenceDataStore`; a missing name shows "Unavailable branch/service" and the time falls back to "your time". F4 does not add a second lookup.
- **Temporary type.** `MyAppointmentsPage` (and the appointment body types) in `core/api/models.ts` are removed once `pnpm gen:api` is rerun against a backend that documents the `/api/appointments/my` response.
- **Profile.** Read-only name, email and phone from the session store, a theme radio group in sync with the header toggle, and Sign out.
- **Manual check** (needs the Compose stack with the `booking-my-appointments` backend; task 14 of the F4 tasks): book two appointments, see both under Upcoming, cancel one and see it leave Upcoming and appear with "Show cancelled", deactivate its branch as an Admin and see "Unavailable branch", stop Availability and cancel to see the `503` guidance, check the profile theme survives a reload, sign out.
- **Size.** The F4 lazy chunks measure 36.6 kB gzipped (budget 40 kB, `pnpm size:appointments`, which CI runs after the build).

## What F5 provides

The admin console, under `src/app/features/admin/`, behind `authGuard` and `roleGuard('Admin')`:

| Route                             | What it is                                                                                   |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| `/admin`                          | Dashboard: branch and service counts, "needs attention" (no schedule), quick actions         |
| `/admin/branches`                 | Branch list (search, status filter, sort; cards below 768 px); activate and deactivate       |
| `/admin/branches/new`, `/:id`     | Create and edit in a side drawer over the list (deep-linkable, guarded against lost edits)   |
| `/admin/branches/:id/schedule`    | Time zone (searchable combobox) and weekly opening hours, "Copy Monday to weekdays"          |
| `/admin/services`, `/new`, `/:id` | Service list and drawer with a duration stepper and preset chips                             |
| `/admin/slots`                    | Slot generation for a branch and service, dates read in the branch zone, live local estimate |

Ctrl or Cmd plus K opens a command palette (navigation, create, edit-record and settings commands).
The admin API has no appointments, staff or reports endpoints, so none of those screens exist.

- **Contract fixture.** The Availability validation rules live once in `src/testing/fixtures/availability-contract.json` (copied from the backend's C# validators); the client messages, the server-message tables and the MSW admin backend are all tested against it. `src/testing/fixtures/README.md` explains how to update it and how to regenerate `slot-planner-vectors.json` (manual, CI does not check drift).
- **Bundle.** The admin area is one lazy group; `pnpm size:admin` reports it (limit `MAX_GZIP_KB_ADMIN`, default 120) and CI runs it after `pnpm size`.
- **Tests.** Vitest with a stateful MSW model of the admin endpoints; Playwright (`e2e/admin.spec.ts`, `e2e/admin.a11y.spec.ts`) against `e2e/support/mock-admin-api.ts`, with axe checks in both themes.

## What F6 provides

The visual redesign, with no change to routes, URL state, API calls or accessible names.

- **Theme.** An Indigo + Lavender palette in light and dark replaces the teal/zinc one (`src/styles.css`): a `brand-*` indigo ramp, a `lavender-*` ramp and the same semantic tokens, with 1 rem card and 0.75 rem control radii. The contrast spec checks every pair in both themes. The theme toggle is a compact system/light/dark control and the logo (`BrandMark`) is an indigo tile with a calendar icon; below the `sm` breakpoint the public and staff headers show the tile alone (the name stays as screen-reader text).
- **Landing (`/`).** A hero with a pill, the headline, two calls to action and a flat inline SVG clinic illustration with a decorative booking preview, then four feature tiles, the how-it-works steps and a closing call to action. One load-time reveal (off under reduced motion), no images or external requests.
- **Login and register.** A shared auth layout: the form first, with a tagline aside from 1024 px up; the fields, validation and error handling are unchanged.
- **Booking wizard.** Circle step indicator (completed state; all four steps complete on the success view), branch cards with a search field and an Open now/Closed badge, a month calendar for the 14 bookable days (keyboard grid: arrows, Home, End, Enter, Space; the date strip is gone), a review card with per-row Edit buttons and a Contact row, and a success view with a mint reference card (monospace, selectable, Copy), the check animation, confetti and the summary.
- **Deviations.** The list of places where the build differs from the design is at the end of `docs/specs/f6-redesign/design.md`.
- **Size.** Measured gzipped: public 32.9 kB (budget 50), admin 93.8 kB (120), booking wizard 39.3 kB (60), appointments 20.0 kB (40).
- **Manual check** (needs the Compose stack; task 15 of the F6 tasks): landing, register, book to success, my appointments and the admin console at 1280 and 390 px, light and dark, plus a keyboard pass of the calendar.

## Docker

```bash
docker compose up --build       # http://localhost:8081
```

The image is built from the repository root and served by unprivileged nginx on container port 8080. Compose publishes it on `WEB_PORT` (default `8081`), runs it with a read-only root filesystem and `tmpfs` for `/tmp`, and needs no `.env`. Copy `.env.example` to `.env` to change `API_BASE_URL` or `WEB_PORT`. The compose file does not start the backend.

## Configuration

The app fetches `/config.json` (uncached) before it renders:

```json
{ "apiBaseUrl": "http://localhost:5290" }
```

- `nx serve` (`pnpm start`) and the build serve `public/config.json` with the local default.
- In the container the entrypoint (`docker/40-config.sh`) renders `/config.json` from the `API_BASE_URL` environment variable and derives the CSP `connect-src` origin from it, so one image serves every environment.
- `apiBaseUrl` is normalised to its origin. If the file is missing, unreachable, invalid or not an absolute `http(s)` URL, the app shows a standalone "Configuration error" page with a "Try again" button instead of starting.
- An empty or malformed `API_BASE_URL` still starts the container (so the error page is visible, not a crash loop) and limits `connect-src` to `'self'`.

There are no secrets in the SPA; do not put any in `config.json`.

## Theming

Design tokens live in `src/styles.css` as CSS custom properties exposed through Tailwind's `@theme`: an indigo brand ramp and a lavender ramp (light: lavender-tinted near-white page and white cards; dark: deep indigo-navy surfaces), the semantic tokens built on them, and radius and shadow tokens. Light values are on `:root`, dark values under `.dark` on `<html>`. The theme follows the system setting by default and can be forced to light or dark with the toggle; the choice is stored in `localStorage` and applied before first paint by `/theme-init.js`. A unit test checks the text and control colour pairs against WCAG 2.2 AA contrast in both themes.

## Quality gates

- **Bundle budgets:** initial 600 kB warning and 700 kB error (raw), component styles 4 kB and 8 kB. `pnpm size` additionally enforces the real target, under 250 kB gzipped for the initial bundle (about 150 kB at F1; the raw warning is 600 kB).
- **Accessibility target:** WCAG 2.2 AA; automated and manual audits come in F6.
- **Security headers:** nginx sends a CSP (scripts `'self'` only), `nosniff`, a referrer policy, a permissions policy, `X-Frame-Options: DENY` and COOP on every response. `style-src 'unsafe-inline'` is a recorded known gap.
- **Commits:** Conventional Commits, enforced by commitlint through a Husky hook.
- **CI** ([`ci.yml`](.github/workflows/ci.yml)): `lint` (lint, format check, typecheck) then `test` (with coverage), `build` (budgets, size, no baked-in API URL, no MSW in the bundle), `e2e` (Playwright against the built output), `docker` (build the image and `curl` the config, health, deep link and headers).

## Spec-driven development

Every feature is described by `requirements.md`, `design.md` and `tasks.md` in [`docs/specs/`](docs/specs/README.md) before it is built, and each task is checked off in the commit that implements it. The backend repository owns the functional requirement IDs (FR-AUTH, FR-AVL, FR-BKG) that the screens serve.
