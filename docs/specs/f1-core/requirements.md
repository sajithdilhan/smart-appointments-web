# F1 Core — Requirements

## Introduction

This spec builds the plumbing every later screen stands on: a typed API layer generated from the gateway's OpenAPI documents, one HTTP pipeline (base URL, correlation id, error normalization, rate-limit and outage handling), the auth session (in-memory access token, persisted refresh token, silent refresh, cross-tab coordination), the route guards and role-based landing, the three application shells with placeholder routes, a 404 page, time utilities, and MSW handlers for the auth endpoints. It contains no feature screens beyond placeholders.

It refines build phase F1 of the approved frontend plan and builds on [F0](../f0-scaffold/requirements.md): the runtime `AppConfig` (`{ apiBaseUrl }`, F0 Requirement 6), the `core/`, `shared/ui/`, `features/` layout, the theme tokens, `src/testing/` (MSW server, `onUnhandledRequest: 'error'`), and the strict CSP whose `connect-src` is the API origin.

The backend contract it consumes:

- The **API gateway** (`http://localhost:5290`) is the only API; the SPA never calls a service directly.
- **Errors.** Every failure body is `{"status":<int>,"detail":"..."}` as `application/problem+json` (`shared-web-infrastructure` Requirement 4, including model-binding 400s, 4.5). Two other bodies still occur and must be tolerated: an **empty body** (the gateway's JWT challenge answers `401` with no body; `gateway-cors` Requirement 4.1) and a legacy **`ValidationProblemDetails`** (`{title,status,errors}`).
- **Sessions** (`auth-refresh-tokens`, FR-AUTH-004 and FR-AUTH-005): login returns `{accessToken, refreshToken, accessTokenExpiresAtUtc}`; `POST /api/auth/refresh {refreshToken}` rotates the pair (anonymous, 10 per minute per client address); reuse of a rotated token revokes the **whole family**, so the SPA must never present a rotated token and must serialize refreshes across tabs; an expired, unknown or revoked token is `401` "Invalid or expired refresh token."; `POST /api/auth/logout {refreshToken}` is anonymous and always `204`.
- **Identity** (`auth-identity`, FR-AUTH-002 and FR-AUTH-003): the access token carries exactly `sub`, `email` and `role` (`Customer | Staff | Admin`) and **no name**; `GET /api/auth/me` returns `{ firstName, lastName, email, phoneNumber, isActive }` for the caller.
- **CORS** (`gateway-cors`): the gateway allows the SPA's exact origin, no credentials, and exposes `X-Correlation-ID`, `Retry-After` and `Location`, so the SPA can read them on every response including `401`, `429`, `502` and `504`. It allows the request headers `Authorization`, `Content-Type`, `Idempotency-Key` and `X-Correlation-ID`, and the methods `GET`, `POST`, `PUT` and `DELETE` only.
- **Rate limits** at the gateway (BRD 11.5, `api-gateway` Requirement 3): login 5 per minute per client address, refresh 10 per minute per client address, `POST /api/appointments` 10 per minute per user, `GET /api/slots/available` 30 per minute per user; a limited request gets `429` with `Retry-After: 60`.

The backend features `auth-refresh-tokens`, `gateway-cors` and the unified error body are approved and in progress; F1 is built against the specs above and its tests use MSW, so it does not need them deployed. Running F1 against a real gateway needs all three.

## Decisions

Approved with these decisions:

- **Blocking session restore on reload.** The app initializer refreshes before the first navigation, so guards never see a transient `anonymous` (Req 6.8).
- **Cross-tab design.** Tabs broadcast the access token and its expiry only, never the refresh token; after taking the lock a tab skips its own refresh if another tab already rotated the token (Req 9.1, 9.2).
- **Refresh failure handling.** `401` clears the session; a network, timeout or `5xx` failure keeps the stored token; a refresh is never retried automatically; `429` does not log the user out (Req 7.6 to 7.8, 6.9).
- **`AppError.kind` and the `ToastService` policy** are accepted as specified (Req 3.1, 3.11).
- **30 s client timeout; `GET /healthz` as the Retry probe, with `Degraded` counting as reachable** (Req 3.6, 5.2).
- **Staff** gets a placeholder page in a minimal shell (Req 11.1).
- **`new Date(string)` is banned outside `core/time/` by an ESLint `no-restricted-syntax` rule** (Req 13.6; enforced, not left to convention).
- **A missing `accessTokenExpiresAtUtc` is tolerated** until the backend ships it: expiry is derived from the token's `exp` (Req 1.6, 6.6).
- **Open questions resolved after design approval** (see "Open questions: resolved" at the end): visual frames in `shared/layout/`; `session-ended` carries a `reason`; 7.1 and 9.1 reworded; `OutageState.recovered`; the public shell header owns the signed-in swap; F2's `post-login-target.ts` and `landing-cta.ts` are F1 deliverables; one countdown component that announces at start and end; `ToastService.showSuccess`.
- **Downstream amendments** (F3, F4, F5 designs, approved by the user): calendar and zone helpers in `core/time` (Req 13.8 to 13.10); a storage helper for both `localStorage` and `sessionStorage` (Req 6.12); `SessionStore.profile()`, `profileStatus()` and `reloadProfile()` (Req 6.13); a "Search or jump to" button in the admin shell through a `PaletteLauncher` service (Req 11.12); function titles in the title strategy (Req 11.13). F3's `branch-time.ts` and F5's `calendar-date.ts` / `zone-math.ts` therefore live in `core/time/`, not in the features.
- **`/` is not guest-guarded.** It renders for signed-in users with a "Go to my dashboard" action; `guestGuard` covers only `/login` and `/register` (Req 10.2, 11.1). F1 owns `safeReturnUrl` (Req 8.4).

## Requirements

### Requirement 1: Typed API layer (no FR-ID)

**User Story:** As a developer, I want request and response types generated from the backend's OpenAPI documents and thin typed services on top of them, so that a backend contract change is a compile error instead of a runtime surprise.

#### Acceptance Criteria

1. `openapi-typescript` SHALL be a dev dependency, and `pnpm gen:api` SHALL fetch `/openapi/auth/v1.json`, `/openapi/availability/v1.json` and `/openapi/booking/v1.json` from a gateway running in Development (default `http://localhost:5290`, overridable by `GATEWAY_URL`) and write `auth.d.ts`, `availability.d.ts` and `booking.d.ts` under `src/app/core/api/generated/`.
2. The generated files SHALL be committed, carry a "generated, do not edit" header, and be excluded from ESLint and Prettier. WHEN `pnpm gen:api` fails because the gateway is not running, THEN it SHALL exit non-zero with a message naming the unreachable URL and SHALL NOT overwrite or truncate an existing generated file.
3. `src/app/core/api/` SHALL contain `auth-api.service.ts` with typed methods for `register`, `login`, `refresh`, `logout` and `me`. `availability-api.service.ts` and `booking-api.service.ts` SHALL exist as empty injectable shells with the shared request helper wired, so that F3 to F5 add methods without touching the plumbing.
4. Each service method SHALL take and return types derived from the generated schema (for example `components['schemas']['TokenResponse']`), SHALL NOT use `any`, and SHALL build its URL as `AppConfig.apiBaseUrl` plus the path of the generated `paths` key (for example `/api/auth/login`).
5. The request helper SHALL send the JSON body as `application/json` and SHALL NOT set `Idempotency-Key` itself: the caller supplies it, so a retry can reuse the same key (F3).
6. WHERE the generated schema lacks a field a service needs (for example `accessTokenExpiresAtUtc` before the backend feature ships and `pnpm gen:api` is rerun), the service SHALL extend the generated type in `src/app/core/api/models.ts` with a comment naming the missing field, and that extension SHALL be removed in the same commit that regenerates the types.
7. A unit test SHALL assert for each `AuthApiService` method the HTTP method, the absolute URL built from a configured base URL, and the body, using MSW.

### Requirement 2: HTTP pipeline and correlation id (no FR-ID)

**User Story:** As a developer, I want every HTTP call to go through one pipeline that sets the base address and records the correlation id, so that no screen builds URLs or reads response headers by hand.

#### Acceptance Criteria

1. The application SHALL register `provideHttpClient(withFetch(), withInterceptors([...]))` with interceptors, in this order: correlation id, auth, error normalization.
2. WHEN a request goes to the configured `apiBaseUrl` origin, THEN the correlation-id interceptor SHALL set an `X-Correlation-ID` request header to a new `crypto.randomUUID()` value unless the request already carries one, so that a request can be traced from the browser to the services. A request to any other origin SHALL be left untouched and SHALL NOT receive the header or the bearer token.
3. WHEN a response (success or failure) carries an `X-Correlation-ID` header, THEN the pipeline SHALL expose that value to the caller (on `AppError.correlationId` for failures, Requirement 3). IF the header is absent (for example a network failure), THEN the value SHALL fall back to the id the SPA sent.
4. The pipeline SHALL send no cookies and no credentials (`credentials` stays at the default `same-origin`, never `include`), matching the gateway's no-credentials CORS policy.
5. WHEN `/healthz` is requested through the shared helper, THEN it SHALL NOT be treated as an error by the outage banner of Requirement 5.
6. Only the SPA's own `apiBaseUrl` origin SHALL ever receive an `Authorization` header (Requirement 8.1); a unit test SHALL assert that a request to another origin gets neither header.

### Requirement 3: Error normalization (no FR-ID)

**User Story:** As a user, I want a readable message and a reference I can quote when something goes wrong, so that I know what happened and support can find the request.

#### Acceptance Criteria

1. The system SHALL define `AppError` as `{ status: number; message: string; correlationId?: string; retryAfterSeconds?: number; kind: 'http' | 'network' | 'timeout' | 'unauthorized' | 'rate-limited' | 'unavailable' }`, and the error interceptor SHALL convert every failed response into an `AppError` thrown to the caller. No component SHALL read an `HttpErrorResponse` directly.
2. WHEN the body is `{"status":N,"detail":"..."}`, THEN `AppError.message` SHALL be `detail` and `status` the HTTP status (the HTTP status wins if they differ).
3. WHEN the body is a `ValidationProblemDetails` (`errors` present), THEN `message` SHALL be `detail` or `title` if present, otherwise the `errors` messages joined with `"; "`.
4. WHEN the body is empty, not JSON, or has neither `detail` nor `title` (for example the gateway's `401` challenge), THEN `message` SHALL be a fixed per-status fallback (400 "The request was not valid.", 401 "You need to sign in.", 403 "You do not have permission to do that.", 404 "We could not find that.", 409 "That conflicts with the current state.", 422 "The request could not be processed.", 5xx "Something went wrong on our side."), and the response body text SHALL NOT be displayed.
5. WHEN the request fails without an HTTP response (offline, DNS failure, a CORS rejection, or a connection reset), THEN `AppError` SHALL have `status: 0`, `kind: 'network'` and the message "Cannot reach the server. Check your connection and try again."
6. WHEN a request exceeds the client timeout of 30 seconds (the gateway's own activity timeout is 30 s and answers `504`), THEN the pipeline SHALL abort it and produce `status: 0`, `kind: 'timeout'` with the message "The request took too long. Please try again."
7. WHEN the response is `429`, THEN `kind` SHALL be `'rate-limited'` and `retryAfterSeconds` SHALL be parsed from `Retry-After` (integer seconds); IF the header is missing or not a non-negative integer, THEN it SHALL default to 60 (the gateway's constant value). The HTTP-date form of `Retry-After` is not produced by the gateway and SHALL be treated as missing.
8. WHEN the response is `502`, `503` or `504`, THEN `kind` SHALL be `'unavailable'`; `401` SHALL be `'unauthorized'`; all other statuses `'http'`.
9. `AppError.message` SHALL NEVER contain a stack trace, the raw response body, or request headers. A unit test per body shape of criteria 2 to 4 and each of criteria 5 to 8 SHALL assert the result.
10. A `ToastService` SHALL show an error toast (ngx-sonner, with the `<hlm-toaster>` mounted in the root component) with the message and, WHERE `correlationId` is present, a "Reference: <id>" line and a **Copy reference** action that writes the id to the clipboard and confirms with "Copied". IF the Clipboard API is unavailable or denied, THEN the reference SHALL stay visible and selectable and no error SHALL be thrown.
11. The error interceptor SHALL NOT toast by itself. Toasting is a caller decision (`ToastService.showError(appError)`), so that a form can render a `400` inline instead. A helper `handleError(appError)` SHALL toast by default for `network`, `timeout` and `http` kinds with status 403 or 5xx other than the outage kinds, and SHALL NOT toast for `unauthorized` (Requirement 8), `rate-limited` (Requirement 4) or `unavailable` (Requirement 5), which have their own affordances.
12. Toasts SHALL be announced to assistive technology (`role="status"` or `aria-live="polite"` for information, `role="alert"` for errors), SHALL stay on screen at least 8 seconds for errors, and SHALL be dismissible by keyboard.
13. `ToastService` SHALL also provide `showSuccess(message: string)` (a polite, non-error toast that auto-dismisses after 5 seconds) and `showInfo(message: string)`, so no page calls the toast library directly.

### Requirement 4: Rate-limit countdown (no FR-ID; serves BRD 11.5)

**User Story:** As a user who hit a rate limit, I want to see how long to wait and have the action come back by itself, so that I do not hammer the button or give up.

#### Acceptance Criteria

1. The system SHALL provide `createRetryCountdown()` in `core/http/` returning signals `{ remaining: Signal<number>; active: Signal<boolean>; start(seconds: number): void; cancel(): void }`, so that a screen binds a disabled button and a label to it.
2. WHEN `start(n)` is called with a positive integer, THEN `active` SHALL become `true`, `remaining` SHALL equal `n`, and `remaining` SHALL decrease by one each second until it reaches `0`, at which point `active` SHALL become `false`. The countdown SHALL be computed from a deadline timestamp, not by counting ticks, so a throttled background tab still shows the right value when it returns.
3. WHEN `start` is called while a countdown is active, THEN it SHALL replace the deadline (not stack timers). `cancel()` and destruction of the owning injector SHALL clear the timer.
4. A helper `retryCountdownFrom(error: AppError)` SHALL start the countdown from `retryAfterSeconds` WHEN `error.kind === 'rate-limited'` and do nothing otherwise.
5. The shared `RateLimitNotice` component (the only rate-limit countdown component in the app; F2 and later features reuse it) SHALL, WHILE a countdown is active, render the visible text "Too many attempts. Try again in {remaining} seconds." with `aria-hidden="true"` (so it is not read every second), and a separate visually hidden `role="status"` element whose text changes exactly twice per countdown: at the start ("Too many attempts. Try again in {N} seconds.", N being the first `remaining`) and at the end ("You can try again now."). The visible text SHALL switch to "You can try again now." when `remaining` reaches zero.
6. The countdown SHALL NOT retry the request automatically.
7. Unit tests with fake timers SHALL assert the start, the decrement, the replacement, cancel, and the deadline-based catch-up. A component test SHALL assert that the `role="status"` text changes exactly twice across a full countdown.

### Requirement 5: Service-unavailable banner (no FR-ID)

**User Story:** As a user, I want a clear notice when a backend service is down, with a way to retry, so that a failure of the server is not mistaken for a mistake of mine.

#### Acceptance Criteria

1. WHEN any response is `502`, `503` or `504`, or a request fails with `kind: 'network'` or `'timeout'`, THEN an `OutageState` signal SHALL become `down` and a banner "Service temporarily unavailable. Some features may not work." with a **Retry** button SHALL appear above the page content in every shell (as a fixed-position or in-flow `role="alert"` region that does not shift focus).
2. WHEN **Retry** is activated, THEN the system SHALL call `GET /healthz` through the pipeline. IF it returns `200` (a `Healthy` or `Degraded` payload both count as reachable), THEN the banner SHALL disappear and the active route's data SHALL be reloaded (the router's current URL is re-navigated with `onSameUrlNavigation: 'reload'`). IF it fails, THEN the banner SHALL remain and the button SHALL re-enable after the request ends.
3. WHEN any later request succeeds (a status below 500 with an HTTP response), THEN the banner SHALL clear on its own.
4. WHILE the Retry request is in flight, the button SHALL be disabled and carry `aria-busy="true"`.
5. The banner SHALL NOT appear for `401`, `403`, `404`, `409`, `429` or any other 4xx, and SHALL NOT appear for a failure of the `/healthz` probe itself being the only evidence (the probe drives the banner clear, not set).
6. The banner SHALL be keyboard operable, SHALL meet WCAG 2.2 AA contrast in both themes using the `warning` tokens, and SHALL NOT overlap the bottom tab bar of the customer shell on mobile.
7. `OutageState` SHALL expose a `recovered` signal (a counter, incremented each time `down` goes from `true` to `false`), so that data not keyed on the router (resources, stores) can reload when the service returns.

### Requirement 6: Session state and token storage (FR-AUTH-002, FR-AUTH-004)

**User Story:** As a signed-in user, I want my session to survive a page reload without keeping my password or a long-lived token in reach of the page, so that I stay signed in safely.

#### Acceptance Criteria

1. A `SessionStore` (`@ngrx/signals`) in `core/auth/` SHALL hold `status` (`'unknown' | 'anonymous' | 'authenticated'`, initially `unknown`), `accessToken` (memory only), `accessTokenExpiresAtUtc`, `user` (`{ id, email, role, firstName?, lastName? }`) and expose computed `isAuthenticated`, `role` and `displayName`.
2. The access token SHALL be held only in memory and SHALL NOT be written to `localStorage`, `sessionStorage`, IndexedDB, cookies, the URL, or any log or error message.
3. The refresh token SHALL be persisted in `localStorage` under one key (`sa.refreshToken`). IF `localStorage` throws or is unavailable (private window, blocked storage), THEN the session SHALL still work for the page's lifetime with the refresh token held in memory, and no uncaught error SHALL occur; the loss of persistence on reload SHALL be the only effect.
4. WHEN `login(email, password)` succeeds (`200` with `accessToken`, `refreshToken`, `accessTokenExpiresAtUtc`), THEN the store SHALL set the tokens, decode the access token, schedule the proactive refresh (Requirement 7.1), call `GET /api/auth/me` to load `firstName` and `lastName`, and set `status` to `authenticated`.
5. WHEN a token is decoded, THEN the system SHALL read `sub`, `email`, `role` and `exp` from its payload with a tolerant base64url decoder (including a missing padding and non-ASCII characters), SHALL NOT verify the signature (the server does), and SHALL treat the result as untrusted display and routing data only. IF the token is malformed, lacks `sub` or `exp`, or has a `role` other than `Customer`, `Staff` or `Admin`, THEN the system SHALL treat the session as invalid: clear it and set `status: 'anonymous'`.
6. WHEN `accessTokenExpiresAtUtc` and the token's `exp` differ, THEN the system SHALL trust `exp`. WHEN `accessTokenExpiresAtUtc` is absent (a backend that has not yet shipped the field), THEN it SHALL be derived from `exp`.
7. IF `GET /api/auth/me` fails after a successful login or refresh with a non-401 error, THEN the session SHALL remain `authenticated` with `displayName` falling back to the email, and a later navigation SHALL retry the call once; a `401` SHALL follow Requirement 8.
8. WHEN the application starts (an app initializer registered after `AppConfig` loads), THEN the store SHALL restore the session: IF a refresh token exists in `localStorage`, THEN it SHALL call `refresh` (Requirement 7) before the first navigation completes, so that a guard never sees a transient `anonymous` for a signed-in user, and show a neutral loading state, not the login page; ELSE it SHALL set `status: 'anonymous'` without a network call.
9. IF the restore refresh fails with `401` (revoked, expired or reused), THEN the store SHALL clear the stored refresh token and set `anonymous`. IF it fails with a network, timeout or 5xx error, THEN the store SHALL keep the stored refresh token (it has not been proven bad) and set `anonymous` for this page load with the outage banner of Requirement 5 shown, so a reload when the server is back restores the session.
10. WHEN `logout()` is called, THEN the system SHALL send `POST /api/auth/logout` with the stored refresh token (fire-and-forget; failures SHALL NOT block or be shown), clear the in-memory access token, the stored refresh token and the user, set `anonymous`, navigate to `/login`, and broadcast the logout to other tabs (Requirement 9.4). IF there is no stored refresh token, THEN it SHALL skip the call.
11. The login-state screens of F2 SHALL be able to read `status`; F1 itself contains no login or registration form (Out of scope).
12. `core/util/safe-storage.ts` SHALL provide one API over both `localStorage` and `sessionStorage` (`createSafeStorage('local' | 'session')` returning `get`, `set`, `remove` and `keys`, plus the ready-made `localSafe` and `sessionSafe`): every call SHALL be wrapped in try/catch and SHALL fall back to an in-memory map when the storage throws or is unavailable (private window, blocked storage), so a value written during the page's life can be read back and no uncaught error occurs. The `safeGet`, `safeSet` and `safeRemove` functions of the first design SHALL remain as `localSafe` shorthands.
13. `SessionStore` SHALL expose `profile()` (`{ firstName, lastName, email, phoneNumber } | null`, from `GET /api/auth/me`), `profileStatus()` (`'idle' | 'loading' | 'ready' | 'error'`, `idle` only while no session exists) and `reloadProfile()` (a manual retry: sets `loading`, calls `me` again, resolves in `ready` or `error`, and never rejects), so a profile page can show a "Try again" action. The automatic single retry on the next navigation of criterion 7 SHALL stay. `displayName` SHALL use `profile()` when ready and fall back to the email.

### Requirement 7: Token refresh: proactive, on 401, single-flight (FR-AUTH-004)

**User Story:** As a signed-in user, I want my session renewed in the background, so that I am not thrown out in the middle of a task when the 60-minute access token expires.

#### Acceptance Criteria

1. WHEN a session is established or refreshed, THEN the system SHALL schedule a refresh after a delay of `max(0, exp - 60 s - now)` (so immediately if that moment is already past), floored at "time of the last refresh + 5 seconds" (criterion 9), replacing any earlier timer, and SHALL clear the timer on logout. The timer SHALL be recomputed from the deadline when the tab becomes visible again (`visibilitychange`), because background tabs throttle timers.
2. WHEN `POST /api/auth/refresh` succeeds, THEN the store SHALL replace both tokens at once (the new refresh token SHALL be written to `localStorage` before any other request can read the old one) and reschedule.
3. WHEN a request to the API origin (other than `login`, `register`, `refresh` and `logout`) receives `401`, THEN the auth interceptor SHALL refresh once and retry the original request once with the new access token. IF the retry also returns `401`, THEN it SHALL follow Requirement 8 and SHALL NOT refresh a second time.
4. WHEN several requests receive `401` while a refresh is already in progress (or several expire together), THEN they SHALL all wait for that single refresh and retry with its result (single-flight). Exactly one `POST /api/auth/refresh` SHALL be sent, and the test SHALL assert it with five concurrent calls.
5. WHEN a request is about to be sent and the access token expires within 10 seconds (or is absent while a refresh is in progress), THEN the interceptor SHALL wait for the in-flight or a new refresh first, so that a request does not predictably fail with `401`.
6. The refresh call SHALL NOT carry an `Authorization` header and SHALL NOT pass through the 401-retry logic (no refresh loop). It SHALL send the refresh token exactly as stored and SHALL NOT retry on a network error or `5xx` on its own (a retry of a rotated token that the server already consumed would trigger reuse detection); a failed attempt SHALL be reported to the waiting callers.
7. IF a refresh fails with `401`, THEN the session SHALL be cleared (Requirement 8). IF it fails with a network, timeout or `5xx` error, THEN the session SHALL NOT be cleared (the refresh token may still be valid): the waiting requests SHALL fail with that `AppError`, the outage banner SHALL show, and the next proactive or on-demand attempt SHALL try again with the same stored token.
8. IF refresh returns `429`, THEN the session SHALL NOT be cleared; the waiting requests SHALL fail with a `rate-limited` `AppError`, and the refresh SHALL NOT be retried before `retryAfterSeconds` has passed.
9. The access token SHALL NOT be refreshed more than once per 5 seconds on the proactive path (a guard against a clock-skew loop, where the server's `exp` is nearer than the 60-second margin): IF a freshly issued token is already inside the margin, THEN the next refresh SHALL be scheduled at least 5 seconds after the last one.

### Requirement 8: Session end and redirect (FR-AUTH-003)

**User Story:** As a user whose session cannot be renewed, I want to be taken to sign in and then returned to what I was doing, so that an expired session is an interruption rather than a loss.

#### Acceptance Criteria

1. The auth interceptor SHALL attach `Authorization: Bearer <accessToken>` only WHEN a token is present and the request goes to the `apiBaseUrl` origin, and SHALL NOT attach it to `login`, `register`, `refresh` or `logout`.
2. WHEN the session ends because refresh failed with `401` (or a retried request was still `401`), THEN the system SHALL clear all session state and stored tokens, SHALL set `anonymous`, and SHALL navigate to `/login?reason=session-expired&returnUrl=<current url, URL-encoded>` (F2 shows the session-ended notice for `reason=session-expired`). IF the current URL is already `/login` or `/register`, THEN it SHALL NOT add a `returnUrl`.
3. WHEN several requests fail at once because of an ended session, THEN there SHALL be exactly one navigation to `/login` and one "Your session has expired. Please sign in again." toast.
4. F1 SHALL own one pure function `safeReturnUrl(raw: unknown): string | null` in `core/auth/`, the only code that turns a `returnUrl` query value into a navigation target (F2's login page and the `guestGuard` use it). It SHALL return the input only IF it is a string that starts with exactly one `/` followed by a character that is neither `/` nor `\`, contains no control character (including tab, CR and LF) and no backslash, does not begin with `/login` or `/register` (to avoid a loop), and, once resolved against the app origin with `new URL`, has an origin equal to the app's origin; otherwise `null`, and the caller uses the role landing instead. Unit tests SHALL reject at least `https://evil.example`, `//evil.example`, `/\evil.example`, `\\evil.example`, `/%09/evil.example` after decoding to a control character, `javascript:alert(1)`, `data:text/html,x`, a value with a tab or newline, an empty string, `null`, a non-string, `/login` and `/register?x=1`, and SHALL accept `/book`, `/appointments?tab=past` and `/admin/branches/123`.
5. A `403` from the API SHALL NOT end the session (it is a role mismatch, `FR-AUTH-003`): the caller receives an `AppError` with status 403 and the shell remains.

### Requirement 9: Cross-tab coordination (FR-AUTH-004)

**User Story:** As a user with several tabs open, I want them to share one session and never trigger a security logout, so that opening a second tab does not sign me out.

The server revokes the **whole family** when a rotated token is presented again (`auth-refresh-tokens` Requirement 3.2 and Known gap 1). Two tabs that each hold the old token and refresh at the same time would therefore end the session for both.

#### Acceptance Criteria

1. Every refresh SHALL run inside `navigator.locks.request('sa.refresh', ...)`. WHEN the lock is granted, THEN the code SHALL first skip the network call IF the tab already holds an access token valid for more than 60 seconds (adopted from another tab's broadcast). IF the stored refresh token differs from the one the caller started with (another tab rotated it) and no valid access token is held, THEN it SHALL wait up to 1 second for that tab's broadcast and adopt it. OTHERWISE it SHALL refresh with the refresh token freshly re-read from `localStorage` inside the lock, and SHALL NEVER present a token it read before taking the lock.
2. WHEN a tab refreshes successfully, THEN it SHALL broadcast the new `accessToken` and `accessTokenExpiresAtUtc` (never the refresh token, which other tabs read from `localStorage`) on a `BroadcastChannel('sa.session')`, so that other tabs adopt it, decode it and reschedule their timers without calling the server.
3. WHEN a tab receives a `session-updated` message, THEN it SHALL validate the payload shape, adopt the access token only if its `exp` is later than the one it holds, and update the `user` claims from it.
4. WHEN a tab logs out or ends the session, THEN it SHALL broadcast `session-ended` carrying a `reason` (`'logout'`, `'expired'` or `'invalid'`), and every other tab SHALL clear its in-memory session without calling `logout` again and navigate to `/login` (with `?reason=session-expired` and a `returnUrl` as in Requirement 8.2 WHEN the reason is `'expired'`, plain `/login` for `'logout'`, and without a toast for `'invalid'`; a tab already on `/login` or `/register` stays there). WHEN a tab observes `localStorage` `sa.refreshToken` removed by another tab (the `storage` event), THEN it SHALL do the same.
5. WHEN a tab logs in, THEN it SHALL broadcast `session-updated` so that other anonymous tabs become authenticated without a new login; a tab that is mid-login with its own result SHALL keep its own session.
6. A tab that has no memory of a token yet but finds a refresh token in `localStorage` (a second tab opened later) SHALL restore through the lock-guarded refresh of criterion 1; two such tabs opening at the same moment SHALL result in one `POST /api/auth/refresh` followed by one adoption, which an e2e or unit test with two store instances sharing the lock and channel mocks SHALL assert.
7. WHERE `navigator.locks` or `BroadcastChannel` is unavailable (an old browser, a non-secure context), THEN the system SHALL fall back to a per-tab in-process lock and `localStorage` `storage` events, SHALL log one console warning, and SHALL NOT crash. The fallback is documented as a weaker guarantee in Known gaps.
8. IF the lock is held longer than 15 seconds, THEN the waiting tab SHALL abort its wait with an `AppError` of `kind: 'timeout'` rather than wait forever.
9. Message handlers SHALL ignore messages from the same tab instance (a `tabId` per page load in each message) and SHALL ignore a message whose payload fails validation.

### Requirement 10: Route guards and role-based landing (FR-AUTH-003)

**User Story:** As a user, I want to be sent to the right area for my role and kept out of the others, so that I see only what I can use.

#### Acceptance Criteria

1. `authGuard` SHALL: WHILE `status` is `unknown`, wait for the session restore (Requirement 6.8) to settle before deciding (no flash of the login page for a signed-in user); WHEN `authenticated`, allow; WHEN `anonymous`, redirect to `/login?returnUrl=<requested url>` (a `UrlTree`, not an imperative navigation).
2. `guestGuard` (for `/login` and `/register`; the landing page `/` stays open to everyone and shows a "Go to my dashboard" action to a signed-in user, F2 Requirement 1) SHALL: WHEN `anonymous`, allow; WHEN `authenticated`, redirect to `resolvePostLoginTarget(role, returnUrl query value)` (criterion 7), that is a safe `returnUrl` the role may open, otherwise the role's landing route (criterion 4), so that a signed-in user does not see the login form.
3. `roleGuard(...roles)` SHALL: WHEN the session role is one of `roles`, allow; WHEN `authenticated` with another role, redirect to the user's own landing route (not to a generic error page) and show a toast "That area is not available for your account."; WHEN `anonymous`, behave as `authGuard`. It SHALL protect child routes as well as the route it is on.
4. The role landing routes SHALL be: `Customer` to `/book`, `Admin` to `/admin`, `Staff` to `/staff`. A pure function `landingRouteFor(role)` SHALL return them, and the post-login navigation of F2 SHALL use it unless a safe `returnUrl` exists (Requirement 8.4).
5. The client route table is **convenience, not security**: the services enforce the policies (`FR-AUTH-003`), and a hand-edited role in storage or memory SHALL NOT yield data (the API answers `403`). The spec records this in Known gaps rather than treating the guard as access control.
6. Guards SHALL be unit tested for each cell of status (`unknown` resolving to each outcome, `anonymous`, `authenticated`) by role (`Customer`, `Staff`, `Admin`) on routes requiring each role, including that a `Customer` on an `/admin` route lands on `/book`.
7. `core/auth/post-login-target.ts` SHALL export `roleCanOpen(role, url): boolean` and `resolvePostLoginTarget(role, rawReturnUrl): string`. `roleCanOpen` SHALL decide by the first path segment (`admin` is Admin only, `staff` Staff only, `book`, `appointments` and `profile` Customer only, any other segment open to every role). `resolvePostLoginTarget` SHALL return `safeReturnUrl(rawReturnUrl)` WHEN it is non-null and `roleCanOpen(role, it)`, otherwise `landingRouteFor(role)`, so the post-login redirect never bounces off `roleGuard` and never shows its "not available" toast. A unit test SHALL walk `app.routes.ts`, collect each top-level segment carrying a `roleGuard(...)`, and assert the map in `roleCanOpen` agrees with it.
8. `core/auth/landing-cta.ts` SHALL export `landingCtas()` (injection context) returning a signal `{ primary: Cta; secondary: Cta | null }`: anonymous gives primary "Create an account" to `/register` and secondary "Log in" to `/login`; authenticated gives primary "Go to my dashboard" to `landingRouteFor(role)` and no secondary. The public shell header (Requirement 11.3) and the F2 landing sections SHALL read it.

### Requirement 11: Application shells and route table (no FR-ID)

**User Story:** As a user, I want a navigation frame that fits my role and my device, so that I can move around the app comfortably.

#### Acceptance Criteria

1. `app.routes.ts` SHALL declare, all lazy (`loadComponent` or `loadChildren`), these areas and routes, each rendering a placeholder page with a heading and a one-line "Coming in F<n>" note (the placeholders' text is not product copy):
   - **Public shell**: `/` (landing, no guard), `/login` and `/register` (`guestGuard`).
   - **Customer shell** (`authGuard`, `roleGuard('Customer')`): `/book`, `/appointments`, `/appointments/:id`, `/profile`.
   - **Admin shell** (`authGuard`, `roleGuard('Admin')`): `/admin` (dashboard), `/admin/branches`, `/admin/services`, `/admin/slots`.
   - **Staff** (`authGuard`, `roleGuard('Staff')`): `/staff`, a placeholder page in a minimal shell that says the workspace is coming, with a logout button.
   - `**`: the 404 page (Requirement 12).
2. WHEN a signed-in user opens `/login` or `/register`, THEN the `guestGuard` redirect SHALL send them to their landing route, while `/` renders for them; WHEN an anonymous user opens `/book`, `/appointments`, `/profile`, `/admin` or `/staff`, THEN they SHALL be redirected to `/login?returnUrl=...`.
3. The **public shell** SHALL render a header with the application name (linked to `/`), the theme toggle of F0 and the call-to-action links from `landingCtas()` (anonymous: "Sign in" and "Create account"; signed in: "Go to my dashboard", so the shell, not the landing page, owns the swap), a `<main id="main-content">` outlet and a footer.
4. The **customer shell** SHALL render a top navigation bar on viewports of 768 px and wider with links Book, My appointments and Profile (the active link carrying `aria-current="page"`), the theme toggle, and a user menu showing `displayName` with a "Sign out" action; and, below 768 px, SHALL render a fixed bottom tab bar with the same three destinations as icon plus label, safe-area padding, and touch targets of at least 44 by 44 CSS pixels, with page content padded so that nothing hides behind it.
5. The **admin shell** SHALL render a collapsible sidebar (Dashboard, Branches, Services, Slot generation), a top bar with a sidebar toggle, breadcrumbs derived from the route (a `breadcrumb` entry in each route's `data`), the theme toggle and the same user menu. The collapsed state SHALL persist per viewer in `localStorage` (wrapped in try/catch like the theme preference); below 1024 px the sidebar SHALL be an off-canvas drawer opened by the toggle, closed on navigation, with focus trapped while open and returned to the toggle when closed (Spartan/CDK sheet).
6. Every shell SHALL provide a "Skip to content" link as the first focusable element, one `<main>` landmark, a labelled `<nav>`, and keyboard-operable menus (Escape closes them, focus returns to the trigger).
7. Router configuration SHALL include `withViewTransitions()` (skipped under `prefers-reduced-motion: reduce`), `withComponentInputBinding()` and scroll restoration (`scrollPositionRestoration: 'enabled'`), and each route SHALL set a `title` (for example "Book an appointment | Smart Appointments") so that the document title changes on navigation (the title format is always "<Page> | Smart Appointments", through one `TitleStrategy`, with the bare application name where a route has no title) and a screen reader announces the change via a live region updated after each navigation.
8. WHILE a lazy route chunk loads (more than 150 ms), the shell SHALL show a thin progress bar at the top that is hidden from assistive technology (`aria-hidden`).
9. The initial bundle SHALL stay within the F0 budgets (`pnpm size` below 250 kB gzipped): the shells' feature code SHALL be in lazy chunks, and the core services (session, error, outage) in the initial chunk only.
10. Component tests (Angular Testing Library, queries by role) SHALL cover: the customer shell shows the bottom tabs and hides the top links below 768 px and the reverse above; the admin shell sidebar collapses and expands and persists across a re-render; and sign out calls the session store's `logout`.
11. The visual frame components (shells, user menu, skip link, route progress, route announcer, rate-limit notice, outage banner) SHALL live under `src/app/shared/layout/` and `src/app/shared/ui/`; `src/app/core/` SHALL stay non-visual (the F0 import rule that `core` imports neither `shared` nor `features` is unchanged).
12. A root `PaletteLauncher` service in `core/ui/` SHALL expose `available` (a signal, initially `false`), `requests` (a counter signal) and `request()` (increments `requests`). WHEN `available()` is true, THEN the admin shell top bar SHALL render a button "Search or jump to…" (with the platform shortcut label, for example Ctrl K or the command-key symbol K, as a `<kbd>`) that calls `request()`; WHEN it is false the button SHALL NOT render. F1 registers no palette and handles no keyboard shortcut: a later feature (F5) sets `available`, reacts to `requests` and owns Ctrl/Cmd K.
13. The title strategy SHALL accept a route `title` that is a string or a function (`ResolveFn<string>`, as Angular supports) and SHALL produce "<Page> | Smart Appointments" for either; IF a function title resolves to an empty or non-string value or throws, THEN the bare application name SHALL be used. A unit test SHALL cover string, function, empty and throwing titles.

### Requirement 12: Not-found page (no FR-ID)

**User Story:** As a user who followed a wrong or stale link, I want a clear page with a way back, so that I am not stranded.

#### Acceptance Criteria

1. WHEN a URL matches no route, THEN the `**` route SHALL render a 404 page with the heading "Page not found", a one-sentence explanation, and a primary link to the user's landing route (signed in) or `/` (anonymous), and the document title SHALL be "Page not found | Smart Appointments".
2. The 404 page SHALL render inside the public shell for anonymous users and inside the user's own shell for signed-in users, so navigation remains available.
3. IF a user navigates to a known route their role cannot access, THEN criterion 10.3 applies (redirect), not the 404 page.
4. The page SHALL NOT echo the requested URL into the DOM unescaped (Angular's interpolation only), and SHALL set `<meta name="robots" content="noindex">` while it is shown.
5. nginx's SPA fallback (F0 Requirement 7.6.1) means the server returns `200 index.html` for these paths; a unit test SHALL assert the router renders the 404 page for an unknown path.

### Requirement 13: Time utilities (no FR-ID)

**User Story:** As a user, I want every time to be shown in the right zone, so that I do not turn up an hour early.

Backend timestamps are UTC instants; slots and branches carry an IANA `timeZoneId`; some serializations omit the trailing `Z`.

#### Acceptance Criteria

1. `core/time/` SHALL export `parseUtc(value: string): Date`. WHEN the string is an ISO-8601 date-time that ends in `Z` or in a numeric offset (`+02:00`), THEN it SHALL be parsed as given. WHEN it has a time but no zone designator (`2026-10-04T13:00:00`, with or without fractional seconds), THEN `Z` SHALL be appended before parsing so it is read as UTC rather than as browser-local time. IF the value is empty or unparsable, THEN it SHALL throw a `RangeError` whose message names the value (callers of API data do not pass user text).
2. `core/time/` SHALL export `formatInZone(value: Date | string, timeZoneId: string, options?)` built on `Intl.DateTimeFormat` with `timeZone` set, producing locale-formatted date and time (for example "Sun 4 Oct 2026, 15:00") for the browser's locale, with a `style` of `'date' | 'time' | 'datetime'`, an optional `showZoneName` (short zone name, for example "BST"), and a 12 or 24 hour clock that follows the locale.
3. IF `timeZoneId` is not a valid IANA identifier (`Intl.DateTimeFormat` throws `RangeError`), THEN `formatInZone` SHALL fall back to UTC and append "UTC", SHALL NOT throw, and SHALL log a console warning once per distinct identifier.
4. `core/time/` SHALL export `zoneDiffersFromBrowser(timeZoneId, at: Date): boolean`, true WHEN the UTC offset of `timeZoneId` at `at` differs from the browser's, so a screen can label a time ("15:00 Europe/London") only when it matters (an offset comparison, not an identifier comparison, because `Europe/London` and `Europe/Dublin` can share an offset).
5. Unit tests SHALL run under a fixed process time zone different from every zone tested and SHALL cover: a value with `Z`, with `+02:00`, with no designator (read as UTC), with fractional seconds, an invalid string, the same instant in `Pacific/Auckland`, `America/New_York` and `Asia/Kolkata`, a half-hour-offset zone, a DST boundary instant (for example `Europe/London` around the last Sunday of March and October), an invalid zone fallback, and `zoneDiffersFromBrowser` true and false.
6. No other code in F1 SHALL parse or format a backend timestamp with `new Date(string)`, `toLocaleString()` without a `timeZone`, or `DatePipe` with the browser zone; a lint rule (`no-restricted-syntax`) SHALL flag `new Date(<non-literal string>)` outside `core/time/`, or the CLAUDE.md convention SHALL say so if a lint rule is not practical.
7. `.ics` generation is F3 and is not provided here; this requirement supplies only the zone-correct parsing and formatting it will use.
8. `core/time/calendar-date.ts` SHALL export pure calendar-date helpers over `yyyy-MM-dd` strings, using only `Date.UTC` arithmetic (so a DST change can never shift a result) and `fromEpochMs`: `todayInZone(timeZoneId, nowMs): string` (the calendar date in that zone, UTC for an invalid zone with the one-warning rule of 13.3), `addDays(date, n): string`, `diffDays(from, to): number` (`to - from` in calendar days), `weekdayOf(date): DayName` (`'Monday'` to `'Sunday'`) and `eachDate(from, to): string[]` (inclusive; empty when `to < from`). `DayName` SHALL be exported as the single weekday type of the app.
9. `core/time/zone-math.ts` SHALL export `localToUtc(timeZoneId, date, minuteOfDay): { gap: boolean; utcMs: number }`: WHEN the wall time does not exist in the zone (a DST gap), THEN `gap` SHALL be `true` (callers skip it, as the backend's slot planner does); WHEN the wall time occurs twice (a DST fold), THEN it SHALL resolve to the standard-time (smaller UTC offset) occurrence, matching .NET's `TimeZoneInfo.ConvertTimeToUtc`.
10. `core/time/branch-time.ts` SHALL export the branch-zone helpers used by booking and appointments, taking a minimal structural `BranchSchedule` (`{ timeZoneId: string; workingHours: { dayOfWeek: DayName | number; opensAt: string; closesAt: string }[] }`) and an explicit instant, never reading the clock: `zonedParts(zoneId, at): { date, weekday, minutes }`, `dayStrip(todayInBranch): DayStripItem[]` (14 items), `todaysHours(branch, at): { opens; closes } | 'closed-today' | 'no-schedule'`, `isOpenNow(branch, at): boolean` (`opensAt <= minutes < closesAt`) and `hhmm(time): string`. A blank `timeZoneId` or empty `workingHours` is `no-schedule`. These helpers and those of 13.8 and 13.9 SHALL live inside `core/time/` so the `new Date(<value>)` lint rule of 13.6 stays unchanged and unexempted elsewhere.
11. Unit tests SHALL cover the helpers of 13.8 to 13.10 under the fixed process zone of 13.5: month and year rollover and a leap day for `addDays`, `diffDays` across a DST week, `todayInZone` at an instant just before and after local midnight for zones ahead of and behind the process zone, `weekdayOf` for known dates, `eachDate` bounds, `localToUtc` for `Europe/London` on 2026-03-29 (gap at 01:30) and 2026-10-25 (fold at 01:30), `America/New_York` on 2026-03-08 and 2026-11-01, `Pacific/Auckland` on 2026-09-27, and `Asia/Kolkata`; and `isOpenNow` at `opensAt` (open) and `closesAt` (closed), closed days, and `no-schedule`.

### Requirement 14: Testability and mock handlers (no FR-ID)

**User Story:** As a developer, I want realistic mocked auth endpoints, so that every F1 behaviour and every later screen can be tested without a backend.

#### Acceptance Criteria

1. `src/testing/handlers/auth.handlers.ts` SHALL export MSW handlers for `POST /api/auth/register` (`201` with `{ userId, email, role: 'Customer' }`, `400` `{status, detail}` for an existing email), `POST /api/auth/login` (`200` with a token pair, `401` "Invalid user or password." for a wrong password, `429` with `Retry-After: 60` WHEN a test sets the rate-limited flag), `POST /api/auth/refresh` (see criterion 2), `POST /api/auth/logout` (always `204`) and `GET /api/auth/me` (`200` with the profile for a valid bearer token, `401` with an empty body otherwise).
2. The refresh handler SHALL **model the real server rules**, so tests catch a client that breaks them: it keeps a family of tokens; a valid current token returns a new pair and revokes the old one; presenting a revoked token returns `401` "Invalid or expired refresh token." **and revokes the whole family** (so the latest token then also fails); an unknown or expired token returns `401`; each response includes `accessTokenExpiresAtUtc`.
3. A `makeAccessToken({ sub, email, role, expiresInSeconds })` test helper SHALL return an unsigned-signature but structurally valid JWT, so decode logic, expiry scheduling and role routing are exercised without a signing key.
4. The handlers SHALL respond with the `X-Correlation-ID` echoed from the request (or a generated value) on every response, and SHALL return the `{status, detail}` body with `application/problem+json` for every error with a body, matching the backend.
5. The handlers SHALL be test-only (no runtime mock switch in the app) and SHALL NOT ship in the production bundle: `grep -ri "msw" dist/` SHALL find nothing.
6. Tests of F1 SHALL use fake timers (`vi.useFakeTimers()`) for the proactive refresh, the countdown and the timeouts, and SHALL NOT use `fakeAsync`.
7. The F1 unit test suite SHALL include, at minimum: all criteria of Requirements 3, 4, 7, 9, 10 and 13 named above; the single-flight test with five concurrent `401`s sending exactly one refresh; the reuse scenario where a client that (wrongly) retries a consumed token ends in `anonymous` after the family is revoked; and the proactive refresh firing at expiry minus 60 seconds.
8. One Playwright e2e test (mocked with `page.route`, no backend) SHALL cover: an anonymous visit to `/book` redirects to `/login?returnUrl=%2Fbook`; with a stored refresh token a reload restores the session and lands on the role's page; and `POST /api/auth/refresh` returning `401` clears the session and shows the login route.

## Out of scope

- **Login and registration screens, the landing page content and the post-login navigation call.** F2 builds them on `SessionStore.login` and `landingRouteFor` (BRD FR-AUTH-001, FR-AUTH-002). F1 only provides placeholder routes.
- **Booking, availability search, appointment lists, cancel and profile screens** (F3, F4; FR-AVL-004, FR-BKG-001 to FR-BKG-005) and the **admin console screens** (F5; FR-AVL-001 to FR-AVL-003). The shells' navigation points at placeholders.
- **The command palette** (F5) and **empty, error and loading polish** beyond what Requirements 3, 5 and 11.8 need (F6).
- **Idempotency-key handling** (F3): the pipeline only avoids interfering with the header (Requirement 1.5).
- **Staff and queue features.** Staff gets a "coming soon" placeholder only; the backend (FR-BKG-004, FR-BKG-006, the queue service) does not exist.
- **Cookies, CSRF handling and a token-in-cookie design:** the backend returns the refresh token in the JSON body by decision.
- **Server-side rendering, offline support and service workers.**
- **Access-token revocation on logout:** an issued access token stays valid until it expires (`auth-refresh-tokens` Requirement 4.5); the SPA only discards it.
- **Internationalisation of messages:** the fallback texts are English.
- **Telemetry or error reporting services** (the correlation id is only shown to the user).

## Known gaps

- **The refresh token lives in `localStorage`.** Any script that runs on the page (an XSS) can read it, and a family stays usable for up to 30 days (`Jwt:RefreshTokenFamilyMaxDays`). This is an accepted decision (the SPA is separately hosted, so an `HttpOnly` cookie would need a cookie and CSRF design the backend deliberately excludes). Mitigations in place: the strict F0 CSP (`script-src 'self'`), reuse detection on the server, and the in-memory access token. Reconsider a backend-for-frontend if the threat model changes.
- **A hard reload loses the access token.** Every page load pays one `POST /api/auth/refresh` round trip (and one `GET /api/auth/me`) before the first guarded route renders; on a slow link the user sees the loading state first (Requirement 6.8). The refresh also counts against the 10 per minute per address limit, so reloading a tab rapidly can reach `429` (Requirement 7.8).
- **A benign refresh race ends the session.** The server treats the loser of two simultaneous redemptions as reuse and revokes the family (`auth-refresh-tokens` Known gap 1). `navigator.locks` and `BroadcastChannel` close this for tabs of one browser profile. The fallback of Requirement 9.7 (an old browser, no secure context) and two different browsers sharing one login are weaker or not covered.
- **A failed response on a successful rotation can strand the session.** IF the network drops after the server rotated the token but before the response reaches the SPA, THEN the stored token is already consumed and the next refresh is a reuse that revokes the family; the user must sign in again. Requirement 7.6 avoids making this worse by never retrying a refresh, but it cannot remove it. This is inherent to rotation without a grace window.
- **No `exp` verification against server time.** Proactive refresh uses the browser clock. A browser clock that is far off schedules refreshes wrongly; the on-demand `401` path (Requirement 7.3) covers it.
- **Role guards are not authorization.** A user can edit memory or storage to pass a client guard; the services still answer `403` (FR-AUTH-003). The `Staff` area exists only as a placeholder because no Staff screen has a backend.
- **The JWT carries no name, so the first paint after login or restore shows the email** until `GET /api/auth/me` returns (Requirement 6.7).
- **Rate limits are per client address behind Docker port publishing,** so all host clients may share the gateway's login and refresh limits (a known gap of the backend).
- **Generated types depend on the gateway's Development docs,** which are Development-only (`/openapi/{auth,availability,booking}/v1.json`); regenerating needs a locally running stack, and committed types can drift from the backend until someone reruns `pnpm gen:api` (CI does not check drift in F1).
- **`accessTokenExpiresAtUtc`, the refresh and logout endpoints and CORS are in-progress backend work.** Until they ship, F1 is verified only against MSW (Requirement 1.6 and 6.6 tolerate a missing field, but there is no real refresh).

## Downstream amendments

Approved by the user after the F3, F4 and F5 designs found small additions to F1 (recorded in Decisions above and implemented by tasks 1, 3.1, 12, 18 and 21):

1. Calendar, zone and branch-time helpers move into `core/time` (Req 13.8 to 13.11); `addDays` and the weekday type exist once.
2. `safe-storage` supports `localStorage` and `sessionStorage` (Req 6.12), so F3's idempotency-key store uses it instead of a private wrapper.
3. `SessionStore` exposes `profile()`, `profileStatus()`, `reloadProfile()` (Req 6.13) for the F4 profile page.
4. The admin shell has a "Search or jump to" button through `PaletteLauncher` (Req 11.12); F5 registers the palette and the shortcut.
5. The title strategy accepts function titles (Req 11.13).

## Open questions: resolved

Resolved by the user after design approval; the requirements above already reflect them.

1. **Shell location.** Visual frames live in `shared/layout/` (and `shared/ui/`); `core/` stays non-visual (Req 11.1).
2. **Path casing.** The services use the generated `paths` keys and auth-endpoint matching is case-insensitive; confirm the real casing after the first `pnpm gen:api`.
3. **Cross-tab `session-ended`** carries a `reason`, so other tabs also go to `/login?reason=session-expired` when it was an expiry (Req 9.4).
4. **Refresh delay** is `max(0, exp - 60 s - now)`, floored at last refresh + 5 s (Req 7.1, 7.9).
5. **Cross-tab adoption** waits 1 s for the broadcast, else refreshes with the freshly read stored token (Req 9.1).
6. **Error announcements.** The extra `role="alert"` announcer is dropped IF ngx-sonner supports assertive toasts (verified at implementation; otherwise it stays, Req 3.12).
7. **`OutageState.recovered`** is added now (Req 5.7).
8. **The public shell header** owns the signed-in "Go to my dashboard" swap (Req 11.3, 10.8).
9. **Staff** lands on the "coming soon" placeholder (Req 11.1).
10. **Absorbed from F2:** `post-login-target.ts` and `landing-cta.ts` in `core/auth/` (Req 10.7, 10.8), `guestGuard` honouring a safe `returnUrl` the role may open (Req 10.2), one countdown component announcing at start and end with the wording "Try again in N seconds" (Req 4.5), `ToastService.showSuccess` (Req 3.13), page title format "<Page> | Smart Appointments" (Req 11.7).
