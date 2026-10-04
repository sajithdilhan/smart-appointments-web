# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

This is the Angular web client of the SmartAppointments backend (`https://github.com/sajithdilhan/SmartAppointments`, a .NET microservices portfolio project). **Only the F0 scaffold is built: there is no feature screen.** `docs/specs/README.md` lists the phases F0 to F6 (core, public pages, booking, my appointments, admin, polish); everything after F0 is aspirational until its spec is written, approved and implemented. The specs in `docs/specs/<feature>/` drive all work; the F1 to F6 specs are added one phase at a time.

What exists today:

- **Workspace**: Angular 22 (standalone only, zoneless, `provideZonelessChangeDetection()` registered in `app.config.ts`, no `zone.js`), TypeScript 6 with extra strict flags, pnpm, plain CSS.
- **Styling**: Tailwind v4 (CSS-first, `src/styles.css`, no `tailwind.config.js`), the teal/zinc token sheet with a light and a `.dark` theme, self-hosted Inter, Spartan/ui helm components `button`, `card`, `input`, `label`, `switch`, `sonner` under `src/app/shared/ui/` (aliases `@app/shared/ui/<name>`).
- **Core**: `core/config` (runtime `/config.json` loader, `APP_CONFIG` token, standalone configuration error page, app initializer) and `core/theme/ThemeService` (`system | light | dark`, `localStorage` key `sa.theme`, pre-paint script `public/theme-init.js`). `shared/ui/theme-toggle` is the only app primitive.
- **App**: a placeholder page (heading, theme toggle, a sample card) and one lazy placeholder route (`/about`) in `app.routes.ts`.
- **Quality and delivery**: ESLint (angular-eslint, flat config), Prettier, Husky, lint-staged, commitlint, Vitest + Angular Testing Library + MSW, Playwright smoke test, bundle budgets plus `pnpm size`, a Dockerfile (nginx-unprivileged), `docker-compose.yml` and a GitHub Actions workflow.

Not present yet (do not assume): HTTP calls of any kind, auth, interceptors, guards, API types (`openapi-typescript` / `gen:api`), the error normaliser, `@ngrx/signals`, `core/time`, `shared/layout`, i18n.

## Commands

```powershell
pnpm install --frozen-lockfile     # Husky installs through the prepare script
pnpm start                         # ng serve on http://localhost:4200
pnpm build                         # production build with budgets -> dist/smart-appointments-web/browser
pnpm test                          # Vitest once; `pnpm test --coverage` writes coverage/
pnpm test:watch
pnpm lint                          # eslint . --max-warnings 0
pnpm format                        # prettier --write . ; pnpm format:check to verify
pnpm typecheck                     # tsc on tsconfig.app.json and tsconfig.spec.json
pnpm size                          # gzip size of the initial files in dist; fails above 250 kB
pnpm e2e                           # Playwright; starts pnpm start unless E2E_BASE_URL is set

# One spec file, or tests by name (use pnpm exec: `pnpm test --filter` is eaten by pnpm itself)
pnpm test --include "src/app/core/config/*.spec.ts"
pnpm exec ng test --watch=false --filter "ThemeService"

# One Playwright test by title
pnpm e2e -g "dark theme persists"

# One-time browser install for Playwright
pnpm exec playwright install chromium

# Production build served locally, then e2e against it (what CI does)
pnpm build
pnpm exec sirv dist/smart-appointments-web/browser --single --port 4300
E2E_BASE_URL=http://localhost:4300 pnpm e2e

# Container
docker compose up --build          # http://localhost:8081 ; WEB_PORT and API_BASE_URL are overridable
docker compose down
```

The gate for every task is `pnpm lint && pnpm test && pnpm build`. Husky runs lint-staged (ESLint `--fix`, Prettier) on commit and commitlint on the message; CI sets `HUSKY=0`.

pnpm 12 blocks dependency build scripts until approved: the approved ones are listed under `allowBuilds` in `pnpm-workspace.yaml` (run `pnpm approve-builds --all` after adding a package that needs one).

### Local settings and secrets

There are no secrets in this repository and none may be added: a SPA's bundle and `config.json` are public. The only environment-specific value is the API origin, delivered at runtime:

- `public/config.json` is `{ "apiBaseUrl": "http://localhost:5290" }`, the gateway of the backend's local setup. It is copied to the build output and read by `provideAppConfig()` before the app renders (`cache: 'no-store'`, 5 s timeout). `loadConfig(fetch)` normalises the URL to its origin and returns `{ ok: false, reason }` on any problem; the initializer then renders the plain-DOM configuration error page and aborts bootstrap.
- In the container, `docker/40-config.sh` renders `/config.json` from `API_BASE_URL` and writes the CSP `connect-src` origin from it, all under `/tmp/runtime` (a `tmpfs`, so the root filesystem is read-only).
- Never bake an API URL into the bundle: `grep -r "localhost:5290" dist` may match only `config.json` (CI checks it). Read the origin through `inject(APP_CONFIG)`, never from `environment` files (none exist).
- The backend gateway must list this app's origin in its CORS settings (`http://localhost:4200` for `pnpm start`, `http://localhost:8081` for Docker) for browser calls to work. The gateway has this (`Cors:AllowedOrigins`, backend spec `docs/specs/gateway-cors/`): exact origins, no credentials, exposed headers `X-Correlation-ID`, `Retry-After` and `Location`. A new origin is a backend config change, never a workaround in the SPA.

## Architecture conventions

Layout under `src/app`:

- `core/`: non-visual code only (config, theme now; later auth, API clients, error handling, time). Imports neither `shared` nor `features`.
- `shared/ui/`: Spartan helm components (generated, do not hand-edit beyond what a feature needs; regenerate with `pnpm exec ng g @spartan-ng/cli:ui <name> --interactive=false`, one name per call) and small app primitives such as `theme-toggle`. May import `core`. `shared/layout/` (shells) arrives in F1.
- `features/`: one folder per area (`public/`, `customer/`, `admin/`, `staff/` later), each lazy-loaded from `app.routes.ts`. May import `shared` and `core`.
- ESLint enforces the direction with `no-restricted-imports` zones; the generated helm folders have their own override (their selectors use `hlm`/`brn` prefixes).

Angular rules:

- Standalone components only, `ChangeDetectionStrategy.OnPush` on every component (lint error otherwise), zoneless, state in signals (`signal`, `computed`, `effect`), `inject()` instead of constructor parameters, new control flow (`@if`, `@for` with `track`, `@switch`), `input()`/`output()` functions, typed reactive forms, functional guards and interceptors, `provideX()` functions for setup.
- Routes are lazy (`loadComponent` / `loadChildren`) after F0.
- Component selectors use the `app` prefix; templates must pass the angular-eslint accessibility rules.
- Once F1 lands, dates and times go through `core/time` (UTC `*Utc` fields from the API are parsed and formatted there): no `new Date(string)`, `toLocale*` or `DatePipe` elsewhere. This is upcoming and not enforced by lint yet.

### Styling

- Tailwind v4 with `@theme` tokens in `src/styles.css`. Use the semantic names (`bg-background`, `text-foreground`, `text-muted-foreground`, `bg-primary`, `text-primary-foreground`, `border-border`, `border-input`, `ring-ring`, `bg-accent`, `bg-destructive`, ...) and the `brand-*` ramp; never raw hex or arbitrary colour values in templates. Helm components already use these names.
- Dark mode is class-based (`.dark` on `<html>`, `@custom-variant dark`), driven by `ThemeService`; do not use `prefers-color-scheme` media queries in components.
- Contrast rules (WCAG 2.2 AA, enforced by `src/app/styles.contrast.spec.ts`): teal-600 is never text on white; filled buttons and links use `--primary` (teal-700 in light, teal-400 in dark); control borders use `--input`, not `--border`. If you change a token, update the spec's pair list.
- Honour `prefers-reduced-motion` (a global rule in `styles.css` disables non-essential motion); no `inlineCritical` (it needs an inline event handler the CSP forbids).
- The CSP allows scripts from `'self'` only: no inline scripts or event-handler attributes, no third-party origins (fonts are self-hosted).

### Backend contract (applies from F1 on)

- The SPA talks to the YARP gateway only (`APP_CONFIG.apiBaseUrl`); it never calls Auth, Availability or Booking directly, and `/internal/**` does not exist for it.
- Errors are `application/problem+json` with one body shape, `{ status, detail }`; show `detail`, branch on `status`. The gateway adds `502`/`504` for a dead or slow service and `429` with `Retry-After` (always 60) for rate limits (login 5 per minute per address, create appointment 10 and slot search 30 per minute per user).
- `X-Correlation-ID` is echoed on every response, `Location` carries the gateway's host, and `Idempotency-Key` is required when creating an appointment: generate one per user intent and reuse it on retry. The gateway's CORS policy exposes exactly these three headers.
- JWT claims are `sub`, `email` and `role` (`Customer`, `Staff`, `Admin`); the gateway validates the token but makes no role decisions, so a wrong role gets the service's `403`. Role checks in the SPA are for UX only.
- Refresh-token rotation is strict: a refresh token is single-use, so never retry or replay a refresh request, and serialise concurrent refreshes into one.
- Consult the backend's `docs/requirements.md` (FR-IDs) and `docs/specs/` for behaviour; verify against its code for what actually exists.

## Testing conventions

- Unit tests are Vitest through `@angular/build:unit-test` (jsdom), with Angular Testing Library. Query by role and accessible name (`screen.getByRole(...)`), not by CSS class or test id; use `@testing-library/user-event` for interaction. Zoneless: no `fakeAsync`/`tick`; await `fixture.whenStable()` or ATL's async helpers, and call `TestBed.tick()` to flush effects.
- HTTP is mocked with MSW. `src/testing/setup.ts` starts the shared server with `onUnhandledFrame: 'error'` (MSW 3 name), so an unmocked request fails the test; register handlers per test with `server.use(...)`. Default handlers go in `src/testing/handlers.ts` (empty).
- Stub browser globals with `vi.stubGlobal` (`matchMedia`, `localStorage`) and restore them in `afterEach`.
- Specs sit beside the code (`*.spec.ts`). The pure `loadConfig` function takes a fetch stub; keep logic pure where possible.
- Playwright (`e2e/`, Chromium only): CI runs against the built output with routes mocked (`page.route`), so no backend is needed; add axe accessibility checks as screens appear. A feature is not done until its unit tests pass.

## Git and workflow

- Spec-driven loop: `requirements.md` -> `design.md` -> `tasks.md`, each approved before the next; tasks are coding steps and are ticked in the same commit as the code. See `docs/specs/README.md` for the index and templates in `docs/specs/_templates/`.
- Commits follow Conventional Commits (`feat(core): ...`, `fix:`, `chore:`, `test:`, `build:`, `ci:`, `docs:`); commitlint rejects anything else. Use branch `main` for F0; later phases use one branch and one pull request per phase. A feature is done only when its unit tests pass and the pull request is raised.
- Update `README.md` and this file in the same commit as any change that makes them untrue.

## Working with Claude Code subagents

When delegating work to a subagent (the `Agent` tool), run it on **Sonnet** — pass `model: "sonnet"`
explicitly on every spawn rather than letting it inherit the parent session's model. Sonnet is the
project's chosen subagent model because delegated tasks (codebase searches, spec drafting, focused
refactors) don't need the larger model and run faster and cheaper on it. The intended model is
**Sonnet 5.5**; the `sonnet` alias resolves to the latest Sonnet release, so it picks up Sonnet 5.5
without pinning a version-specific model ID.
