# Smart Appointments Web

![CI](https://github.com/sajithdilhan/smart-appointments-web/actions/workflows/ci.yml/badge.svg)

The Angular web client for [SmartAppointments](https://github.com/sajithdilhan/SmartAppointments), a .NET microservices portfolio project: a smart appointment and queue management system. The backend owns the business rules; this repository is the single-page app that customers, staff and administrators will use, and it talks to the backend only through its API gateway.

> **Status: F0 scaffold and F1 core are built; no feature screen exists yet.** The repository holds the production-shaped foundation (tooling, theme, runtime configuration, container image, CI) and the core every screen stands on (typed API layer, HTTP pipeline, auth session with silent refresh, guards, application shells, 404 page, time utilities), with placeholder pages behind the routes. The roadmap below is the plan; only F0 and F1 describe what is built.

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
| F2    | Public pages: landing, login, register                                                             | Not started                              |
| F3    | Booking wizard, success page, calendar export                                                      | Not started                              |
| F4    | My appointments, detail, cancel, profile                                                           | Not started                              |
| F5    | Admin console                                                                                      | Not started                              |
| F6    | Polish: accessibility audit, motion, empty and error states, end-to-end suites, Lighthouse budgets | Not started                              |

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
  features/        one folder per area (public, customer, admin, staff), lazy routes with placeholder pages
src/testing/       MSW server, a stateful mock of the auth endpoints, fake timers, fake session
public/            config.json (dev default), theme-init.js (pre-paint theme script)
docker/            nginx config, entrypoint that renders config.json and the CSP
e2e/               Playwright specs (routes mocked, no backend needed)
scripts/           size.mjs (gzip budget check), gen-api.mjs (OpenAPI types)
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

- `ng serve` and the build serve `public/config.json` with the local default.
- In the container the entrypoint (`docker/40-config.sh`) renders `/config.json` from the `API_BASE_URL` environment variable and derives the CSP `connect-src` origin from it, so one image serves every environment.
- `apiBaseUrl` is normalised to its origin. If the file is missing, unreachable, invalid or not an absolute `http(s)` URL, the app shows a standalone "Configuration error" page with a "Try again" button instead of starting.
- An empty or malformed `API_BASE_URL` still starts the container (so the error page is visible, not a crash loop) and limits `connect-src` to `'self'`.

There are no secrets in the SPA; do not put any in `config.json`.

## Theming

Design tokens live in `src/styles.css` as CSS custom properties exposed through Tailwind's `@theme`: a zinc neutral scale, one teal brand accent, and radius and shadow tokens. Light values are on `:root`, dark values under `.dark` on `<html>`. The theme follows the system setting by default and can be forced to light or dark with the toggle; the choice is stored in `localStorage` and applied before first paint by `/theme-init.js`. A unit test checks the text and control colour pairs against WCAG 2.2 AA contrast in both themes.

## Quality gates

- **Bundle budgets:** initial 600 kB warning and 700 kB error (raw), component styles 4 kB and 8 kB. `pnpm size` additionally enforces the real target, under 250 kB gzipped for the initial bundle (about 150 kB at F1; the raw warning is 600 kB).
- **Accessibility target:** WCAG 2.2 AA; automated and manual audits come in F6.
- **Security headers:** nginx sends a CSP (scripts `'self'` only), `nosniff`, a referrer policy, a permissions policy, `X-Frame-Options: DENY` and COOP on every response. `style-src 'unsafe-inline'` is a recorded known gap.
- **Commits:** Conventional Commits, enforced by commitlint through a Husky hook.
- **CI** ([`ci.yml`](.github/workflows/ci.yml)): `lint` (lint, format check, typecheck) then `test` (with coverage), `build` (budgets, size, no baked-in API URL, no MSW in the bundle), `e2e` (Playwright against the built output), `docker` (build the image and `curl` the config, health, deep link and headers).

## Spec-driven development

Every feature is described by `requirements.md`, `design.md` and `tasks.md` in [`docs/specs/`](docs/specs/README.md) before it is built, and each task is checked off in the commit that implements it. The backend repository owns the functional requirement IDs (FR-AUTH, FR-AVL, FR-BKG) that the screens serve.
