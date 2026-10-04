# F1 Core — Tasks

<!--
Rules (from docs/specs/_templates/tasks.md):
- Coding steps only.
- Each task cites the requirement numbers it implements.
- Each task is small enough to finish and test in one sitting and leaves the solution building.
- Check a box only when the code exists and `pnpm lint && pnpm test && pnpm build` pass, in the same commit as the code.
Requirement numbers refer to requirements.md of this folder; design sections to design.md.
-->

- [x] 1. Shared primitives: `Role`, `Clock`, safe storage
  - Add `core/auth/session.model.ts` with `Role = 'Customer' | 'Staff' | 'Admin'` (one constant tuple), `SessionStatus`, `SessionUser`.
  - Add `core/util/clock.ts` (`Clock` interface, `CLOCK` injection token with the default `Date.now` / `setTimeout` implementation) and `src/testing/manual-clock.ts`.
  - Add `core/util/safe-storage.ts`: `createSafeStorage('local' | 'session')` (`get`, `set`, `remove`, `keys`, try/catch with an in-memory fallback, lazy storage lookup, `getStorage` test seam), `localSafe`, `sessionSafe` and the `safeGet`/`safeSet`/`safeRemove` shorthands; unit tests for a throwing `localStorage` and a throwing `sessionStorage` (write then read, `keys`, no throw).
  - Add `core/util/viewport.service.ts` (`matchMedia` signals `isMd`, `isLg`) with a stubbable `matchMedia` test.
  - _Requirements: 6.1, 6.3, 6.12, 7.1, 11.4, 11.5_

- [x] 2. API generation script, generated types, `ApiClient` and `AuthApiService`
  - Add `openapi-typescript` and `scripts/gen-api.mjs` (fetch the three documents with a 10 s timeout, `GATEWAY_URL` override, write temp files and rename only after all three succeed, header comment); add the `gen:api` script, `.prettierignore` and ESLint `ignores` for `core/api/generated/`.
  - Add a node unit test for the script with a stubbed `fetch`: failure leaves existing files byte-identical, exits 1, names the URL.
  - Run `pnpm gen:api` against a local Development gateway and commit `auth.d.ts`, `availability.d.ts`, `booking.d.ts`; record the real route casing (`/api/Auth/...` or `/api/auth/...`) in the design (resolved Open question 2) and any missing field (`accessTokenExpiresAtUtc`) in `core/api/models.ts` with a comment.
  - Add `api-types.ts`, `ApiClient` (`get`, `post`, `put`, `delete`, `postFull`, `url`), `AuthApiService` (`register`, `login`, `refresh`, `logout`, `me`) and empty `AvailabilityApiService` and `BookingApiService`.
  - Unit tests with MSW: each `AuthApiService` method's verb, absolute URL from a configured base, body; `ApiClient` adds no `Idempotency-Key`.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

- [x] 3. Time utilities and the date lint rules
  - Add `core/time/` (`parse-utc.ts`, `format-in-zone.ts`, `zone-offset.ts` with `zoneOffsetMinutes(zone, at: Date | number)` exported, `fromEpochMs`, `toIsoUtc`, `index.ts`) with the formatter cache and the invalid-zone fallback (one warning per id).
  - Set `process.env.TZ = 'Pacific/Kiritimati'` at the top of `src/testing/setup.ts`; verify the Vitest builder honours it (otherwise pass explicit zones and assert via `Intl`).
  - Add the `no-restricted-syntax` (`new Date(<arg>)`, `Date.parse`, `toLocale*String`) and `no-restricted-imports` (`DatePipe`) rules to `eslint.config.js` with the `core/time/**`, `*.spec.ts` and `src/testing/**` exceptions.
  - Unit tests: every case of Req 13.5 (incl. DST boundaries, half-hour zones, invalid zone); a node test that lints sample strings inside and outside `core/time`.
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7_

- [x] 3.1 Calendar, zone and branch-time helpers
  - Add `core/time/calendar-date.ts` (`DayName`, `todayInZone`, `addDays`, `diffDays`, `weekdayOf`, `eachDate`), `core/time/zone-math.ts` (`localToUtc` with gap flag and standard-time fold) and `core/time/branch-time.ts` (`BranchSchedule`, `ZonedParts`, `DayStripItem`, `zonedParts`, `dayStrip`, `todaysHours`, `isOpenNow`, `hhmm`, numeric or named `dayOfWeek`); export all from `core/time/index.ts`. Signatures exactly as in the design; no `new Date(<value>)` outside the `fromEpochMs` helper (the lint rule from task 3 stays unexempted).
  - Unit tests per Req 13.11: rollover and leap day, `diffDays` across a DST week, `todayInZone` near midnight ahead of and behind the process zone, `weekdayOf`, `eachDate` bounds, `localToUtc` on London (2026-03-29, 2026-10-25), New York (2026-03-08, 2026-11-01), Auckland (2026-09-27) and Kolkata, `isOpenNow` at `opensAt` and `closesAt`, closed day, `no-schedule`, invalid zone with one warning.
  - _Requirements: 13.6, 13.8, 13.9, 13.10, 13.11_

- [x] 4. `AppError`, normalization and HTTP helpers
  - Add `core/http/app-error.ts` (`AppErrorKind`, `AppError extends Error`), `normalize-error.ts` (pure, table-driven per the design, 500-character cap), `http-context.ts` (`RETRIED`, `OUTAGE_PROBE`, `SKIP_AUTH`) and `origin.ts` (`isApiRequest`, case-insensitive `isAuthEndpoint`).
  - Unit tests: one row per body shape (`{status, detail}`, `ValidationProblemDetails`, empty body, string body, no-JSON), status 0 network, timeout, `429` with, without and HTTP-date `Retry-After`, 401/5xx kinds, oversized detail, no stack or body ever in `message`.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

- [x] 5. Correlation-id and error interceptors, `provideCoreHttp()`
  - Add `correlation-id.interceptor.ts` and `error.interceptor.ts` (30 s `timeout`, `AppError` mapping, correlation id fallback to the sent id), `outage-state.ts` (`down`, `probing`, `recovered`, `onError`, `onResponse`; no banner UI yet) and `http.providers.ts` registering `correlationId, auth (placeholder pass-through for now), error` in that order.
  - Wire `provideCoreHttp()` into `app.config.ts`.
  - Integration tests (MSW + `HttpClient`): id header only for the API origin; an existing id kept; token and id absent for another origin; response id on `AppError`; `HttpResponse.error()` gives `network`; a never-resolving handler with fake timers gives `timeout` at 30 s; `credentials` is not `include`; outage state set by 502/503/504/network/timeout and not by 4xx; cleared by a later success; a probe failure never sets it.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.5, 3.6, 5.1, 5.3, 5.5, 5.7_

- [x] 6. Test doubles: mock auth backend and helpers
  - Add `src/testing/make-access-token.ts`, `src/testing/auth-backend.ts` (`createAuthBackend`: families, rotation, reuse revokes the whole family, counters, flags, correlation id echo, `application/problem+json` errors) and `src/testing/handlers/auth.handlers.ts` for register, login, refresh, logout, me.
  - Add `src/testing/fake-channel.ts` (in-memory `CrossTabSync` pair with a shared lock queue) and `src/testing/render-with-session.ts`.
  - Unit tests of the backend model itself: rotation, revoked token revokes the family (the latest token then also fails), unknown and expired give 401, counters, echoed id, content type; `grep -ri msw` build guard noted for task 25.
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_

- [x] 7. `ToastService` and error announcements
  - Add `core/notify/toast.service.ts` (`showError`, `handleError` policy, `showInfo`, `showSuccess`, `showSessionExpired`, copyable reference with a try/catch clipboard) and mount `<hlm-toaster>` (add the helm `sonner` wrapper if F0 did not) in `app.ts`.
  - Check whether ngx-sonner announces errors assertively; IF not, add `alert-announcer.ts` (visually hidden `role="alert"`, cleared on the previous animation frame) and mount it; record the outcome in the design.
  - Component and unit tests: message, reference line, Copy action writes the id, denied or missing clipboard does not throw, the policy table (toast or not per kind and status), errors stay at least 8 s, announcer text, success toast auto-dismiss.
  - _Requirements: 3.10, 3.11, 3.12, 3.13_

- [x] 8. Retry countdown and `RateLimitNotice`
  - Add `core/http/retry-countdown.ts` (`createRetryCountdown`, deadline based, 250 ms tick only while active, `startFrom(error)`, `DestroyRef` cleanup).
  - Add `shared/ui/rate-limit-notice/` (visible text `aria-hidden`, `sr-only` `role="status"` text written exactly twice per countdown, wording "Too many attempts. Try again in N seconds.").
  - Tests with fake timers: start, decrement, replacement, cancel, a single large jump catches up, destroy clears; component test that the status text changes exactly twice across a full countdown.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [x] 9. Outage banner and Retry
  - Add `OutageState.retry()` (probe `GET /healthz` with `OUTAGE_PROBE`, `Degraded` counts as reachable, re-navigate with `onSameUrlNavigation: 'reload'`, `probing` flag).
  - Add `shared/layout/outage-banner/` (helm `alert`, `role="alert"`, Retry button disabled with `aria-busy` while probing, `warning` tokens) and mount it in `app.ts` above the outlet (add helm `alert` through the Spartan CLI).
  - Tests: banner appears for 502/503/504/network/timeout and not for 4xx or 429; Retry calls `/healthz` once, clears on `200` or `Degraded` and navigates, stays on failure; `recovered` increments once per recovery.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

- [x] 10. JWT decode, `safeReturnUrl`, landing and post-login target
  - Add `core/auth/jwt.ts` (`decodeAccessToken`, UTF-8 safe, role whitelist), `safe-return-url.ts`, `landing.ts` (`landingRouteFor`), `post-login-target.ts` (`roleCanOpen`, `resolvePostLoginTarget`).
  - Unit tests: valid, missing padding, non-ASCII email, malformed, missing `sub`/`exp`, role `Owner`; the full accept and reject list of Req 8.4 plus a percent-encoded `//` and a malformed `%`; `roleCanOpen` per role and area; `resolvePostLoginTarget` for safe, unsafe, wrong-role and absent values.
  - _Requirements: 6.5, 8.4, 10.4, 10.7_

- [x] 11. Token storage and cross-tab primitives
  - Add `core/auth/token-storage.ts` (`sa.refreshToken`, in-memory shadow, never throws) and `core/auth/cross-tab.ts` (`CrossTabSync`: `tabId`, `BroadcastChannel('sa.session')` with message validation, `withLock` via `navigator.locks` with a 15 s abort mapped to a `timeout` `AppError`, `waitForUpdate`, the in-process fallback and one console warning).
  - Tests: a throwing `localStorage` keeps working in memory; message validation (shape, own tab, invalid access token); lock timeout; fallback serialization with `navigator.locks` and `BroadcastChannel` deleted.
  - _Requirements: 6.2, 6.3, 9.1, 9.2, 9.3, 9.7, 9.8, 9.9_

- [x] 12. `SessionStore`: state, login, profile, logout
  - Add `core/auth/session.store.ts` (`@ngrx/signals`: state incl. `profile` and `profileStatus`, `isAuthenticated`, `role`, `displayName`, `login`, `applyTokens`, `loadProfile`, `reloadProfile`, `clearLocal`, `logout`, `settled()`), adding `@ngrx/signals` if absent. Expiry comes from `exp`, derived when `accessTokenExpiresAtUtc` is absent; an invalid decode ends the session.
  - Tests with the mock backend: login sets state and loads names; expiry derivation and `exp` wins on mismatch; the access token never appears in `localStorage` or `sessionStorage` (spies); `me` failure keeps the session, sets `profileStatus: 'error'` and falls back to the email, and `reloadProfile()` retries to `ready` (`profileStatus` idle, loading, ready; never rejects); logout sends one call with the stored token, clears everything, is silent on failure and skips the call without a token.
  - _Requirements: 6.1, 6.2, 6.4, 6.5, 6.6, 6.7, 6.10, 6.13_

- [x] 13. Refresh scheduler
  - Add `core/auth/refresh-schedule.ts` (pure `refreshDelayMs`) and a `RefreshScheduler` service (one timer from `CLOCK`, `schedule`, `cancel`, `visibilitychange` recompute, last-refresh bookkeeping), wired into `applyTokens` and `clearLocal`.
  - Tests: pure delay table (past, near, far, 5 s floor); with fake timers the refresh fires at exp minus 60 s; `visibilitychange` recomputes; cleared on logout.
  - _Requirements: 7.1, 7.2, 7.9_

- [x] 14. Refresh coordinator and the auth interceptor
  - Add `core/auth/refresh-coordinator.ts` (single-flight promise, lock-guarded run, skip when a fresh token is held, 1 s broadcast wait, always refresh with the freshly read token, no retry of the refresh call, `429` `blockedUntil`) and store methods `refresh`, `accessTokenForRequest`, `refreshAfterUnauthorized`.
  - Add `core/auth/auth.interceptor.ts` (bearer for the API origin only, none on the four auth endpoints, pre-flight wait when expiring within 10 s, one retry with `RETRIED`, second 401 ends the session) and register it in `provideCoreHttp()` in place of the placeholder.
  - Integration tests: 401, refresh, retry succeeds; five concurrent 401s send exactly one refresh (`counters.refresh === 1`); a retried 401 ends the session with no second refresh; near-expiry request waits for refresh; refresh has no `Authorization` and is not retried on 503 or network; refresh `401` ends the session, network/timeout/5xx and `429` keep it and block early retries; `403` leaves the session; the reuse scenario (a consumed token presented again) ends `anonymous` with the family revoked.
  - _Requirements: 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 8.1, 8.5, 9.1, 14.7_

- [x] 15. Session end and cross-tab wiring
  - Add `core/auth/session-ender.ts` (idempotent `end(reason)`, `reason=session-expired` and `returnUrl` navigation, none on `/login` or `/register`, one toast, broadcast with `reason`) and connect `CrossTabSync` messages and the `storage` event to the store (adopt `session-updated` only when its `exp` is later; `session-ended` clears memory and navigates per reason; login broadcasts).
  - Tests with two store instances on `fake-channel`: one refresh adopted by the other without a request; simultaneous restore of two tabs sends one refresh; login in A authenticates anonymous B; logout in A clears B; `expired` goes to `/login?reason=session-expired&returnUrl=...`, `logout` to plain `/login`, `invalid` shows no toast; own and invalid messages ignored; five simultaneous failures give one navigation and one toast.
  - _Requirements: 6.10, 8.2, 8.3, 9.2, 9.3, 9.4, 9.5, 9.6, 9.9_

- [x] 16. Restore initializer
  - Add `SessionStore.restore()` and `provideAuth()` registering `provideAppInitializer(() => inject(SessionStore).restore())` after the config initializer in `app.config.ts`; add the static "Loading..." content inside `<app-root>` in `index.html`.
  - Tests: no stored token means no request and `anonymous`; a stored token means exactly one refresh before the initializer resolves; refresh `401` clears the token; network, timeout, 5xx and `429` keep it and leave `anonymous` with the banner; `settled()` resolves once.
  - _Requirements: 6.8, 6.9, 10.1_

- [x] 17. Guards and landing CTAs
  - Add `core/auth/guards.ts` (`authGuard`, `guestGuard` using `resolvePostLoginTarget` and the `returnUrl` query value, `roleGuard(...roles)` as both `CanActivate` and `CanActivateChild`) and `core/auth/landing-cta.ts` (`landingCtas()`).
  - Tests: the full matrix of status (including `unknown` resolving later) by role by required role with `UrlTree` targets; Customer on `/admin` lands on `/book` with the toast; `guestGuard` sends a signed-in user to a safe `returnUrl` the role may open, otherwise to the landing route; `landing-cta` anonymous versus each role.
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.8_

- [x] 18. Router configuration, title strategy, placeholder pages
  - Add `core/routing/app-title.strategy.ts` ("<Page> | Smart Appointments", string or function route titles, fallback to the app name for an empty, non-string or throwing title), `PlaceholderPage` (heading and phase from route `data`), the four `features/*/*.routes.ts` files and `app.routes.ts` with all routes lazy, guards and `data.breadcrumb`; configure `provideRouter` with `withViewTransitions` (skipped under reduced motion), `withComponentInputBinding` and in-memory scrolling.
  - At this task the shells are stubbed as plain `<router-outlet>` wrappers so the table builds; the real shells replace them in tasks 19 to 22.
  - Tests with `RouterTestingHarness` for every path as anonymous, Customer, Staff and Admin (final URL and heading); title strategy unit tests for string, function, empty and throwing titles; a drift test that `roleCanOpen`'s area map agrees with the route table.
  - _Requirements: 10.2, 10.7, 11.1, 11.2, 11.7, 11.9, 11.13_

- [x] 19. Shell building blocks and the public shell
  - Add under `shared/layout/`: `skip-link`, `route-progress` (shown after 150 ms, `aria-hidden`), `route-announcer` (live region after each `NavigationEnd`), `user-menu` (helm `dropdown-menu`, "Sign out" calls `logout`), `public-shell` (header with `ThemeToggle` and `landingCtas()`, `<main id="main-content">` with `<ng-content><router-outlet /></ng-content>`, footer); generate the helm `dropdown-menu` and `separator` with the Spartan CLI; mount progress and announcer in `app.ts`; replace the public shell stub.
  - Component tests: skip link first in tab order, one `main`, header shows "Sign in" / "Create account" anonymous and "Go to my dashboard" signed in, menu closes on Escape and returns focus, progress bar only after 150 ms, title announced.
  - _Requirements: 11.3, 11.6, 11.7, 11.8, 10.8_

- [x] 20. Customer shell
  - Add `shared/layout/customer-shell/`: `@if (viewport.isMd())` top nav (Book, My appointments, Profile, `aria-current`, theme toggle, user menu) else compact top bar plus fixed bottom tab bar (44 px targets, safe-area padding, content padding); replace the stub.
  - Component tests with a stubbed `matchMedia`: bottom tabs below 768 px and top links above, one labelled `nav`, active link `aria-current="page"`, sign out calls `logout`.
  - _Requirements: 11.4, 11.6, 11.10_

- [x] 21. Admin shell
  - Add `core/ui/palette-launcher.ts` (`available`, `requests`, `request()`) and, in the admin shell top bar, the "Search or jump to…" button (platform key label in a `<kbd>`, icon-only below 640 px) rendered only while `available()` is true; F1 does not set `available` or handle Ctrl/Cmd K.
  - Add `shared/layout/admin-shell/` and `breadcrumb-trail/`: collapsible sidebar persisted under `sa.admin.sidebar` with `safeGet`/`safeSet`, off-canvas helm `sheet` below 1024 px (focus trapped and returned, closed on navigation), toggle with `aria-expanded` and `aria-controls`, breadcrumbs from `data.breadcrumb`, user menu; generate the helm `sheet` and `breadcrumb`; replace the stub.
  - Component tests: collapse and expand persist across a re-render and survive a throwing `localStorage`, drawer opens below 1024 px and returns focus, breadcrumbs for each admin route; the search button is absent while `available()` is false, present when true, and a click increments `requests`.
  - _Requirements: 11.5, 11.6, 11.10, 11.12_

- [ ] 22. Staff shell and the 404 page
  - Add `shared/layout/staff-shell/` (top bar, theme toggle, "Sign out") with `StaffPlaceholder` ("The staff workspace is coming."), and `shared/layout/not-found/` (`NotFoundHost` switching by role between the four shells with `<app-not-found>` projected, `NotFoundPage` with the heading, one sentence, landing link, `noindex` meta added and removed, title "Page not found | Smart Appointments").
  - Tests: an unknown path renders the page in the public shell anonymously and in each role's own shell; the link target; the meta tag lifecycle; the URL is not echoed; a Customer on `/admin` is redirected, not shown the 404.
  - _Requirements: 11.1, 12.1, 12.2, 12.3, 12.4, 12.5_

- [ ] 23. Root wiring and cross-cutting verification
  - Confirm `app.ts` mounts progress, banner, `<router-outlet>`, toaster, announcers, and that provider order is config initializer, session initializer, router.
  - Add a smoke component test that boots the real `app.config` with MSW: anonymous `/book` redirects to `/login?returnUrl=%2Fbook`; a stored refresh token restores the session and lands on the role page.
  - _Requirements: 6.8, 10.1, 11.1, 11.2_

- [ ] 24. Playwright e2e (mocked, no backend)
  - Add `e2e/session.spec.ts` with `page.route` mocks (reusing helpers): anonymous `/book` redirects to `/login?returnUrl=%2Fbook`; with a stored refresh token a reload restores the session and lands on the role's page; a `401` from `POST /api/auth/refresh` clears the session and shows the login route.
  - _Requirements: 14.8, 6.8, 8.2_

- [ ] 25. Bundle and CI guards
  - Run `pnpm build` and `pnpm size`; confirm the core services are in the initial chunk and the shells and pages are lazy; record the measured gzip total in the design.
  - Add a CI `build` step `! grep -ri msw dist/` and run the full F0 pipeline (`lint`, `test`, `build`, `size`, `e2e`) green.
  - _Requirements: 11.9, 14.5_

- [ ] 26. Documentation
  - Note in `CLAUDE.md` that `core/time` owns all calendar, zone and branch-time maths, and that `sessionSafe` / `localSafe` are the only way to touch web storage.
  - Update `README.md` (what F1 provides, `pnpm gen:api` and its prerequisites, the backend features F1 needs: refresh tokens, CORS, unified error body, `accessTokenExpiresAtUtc`).
  - Update `CLAUDE.md`: project status (F1 built), the `core`, `shared/layout` layout, the pipeline and session conventions (never read `HttpErrorResponse`, always `AppError`; never touch the token storage keys directly; `parseUtc` / `formatInZone` only; `safeReturnUrl` for every `returnUrl`; MSW `createAuthBackend` for tests; fake timers not `fakeAsync`).
  - Update `docs/specs/README.md` index: F1 row "Built", FR-AUTH-002 to 005; tick all tasks above.
  - _Requirements: 14.7_

- [ ] 27. Manual verification against the live gateway
  - Start the backend stack (`docker compose up --build` in SmartAppointments, with `WEB_ORIGIN` set) once refresh tokens, CORS and the unified error body are merged, and run `pnpm start`.
  - Walk and record the results: register and log in (Auth `.http` or a console call, F2 builds the screens); a reload restores the session; a silent refresh after setting `AccessTokenExpirationMinutes=1`; two tabs refreshing together produce one `POST /api/auth/refresh` and no logout; logout in one tab signs out the other; a hand-edited refresh token gives a redirect to `/login?reason=session-expired`; a Customer opening `/admin` lands on `/book`; hammering `GET /api/slots/available` (or login) shows `429` and the countdown; stopping the Booking container shows the outage banner and Retry recovers; the `X-Correlation-ID` shown in a toast matches the gateway log; `pnpm gen:api` reproduces the committed types.
  - Record any deviation in the design and re-run `pnpm lint && pnpm test && pnpm build && pnpm e2e`.
  - _Requirements: 1.1, 2.3, 3.10, 4.1, 5.1, 6.8, 7.1, 7.4, 8.2, 9.4, 10.3_
