# F1 Core — Design

## Overview

F1 is plumbing: a typed API layer, one HTTP pipeline, an auth session that survives reloads and several tabs, guards, three shells and a few pure utilities. The approach is to keep every rule that can be a pure function a pure function (JWT decode, refresh delay, error normalization, `safeReturnUrl`, time parsing), and to put the stateful parts (tokens, timers, locks, channels, storage) behind small injectable abstractions so tests replace them without touching the browser. Seven decisions are not obvious and drive the rest:

1. **The interceptor chain is `correlationId → auth → error` (outermost first), so the error interceptor is the one closest to the network.** The auth interceptor therefore sees an already-normalized `AppError` (`kind: 'unauthorized'`) instead of an `HttpErrorResponse`, and the 401-retry logic never parses bodies or headers. Outage tracking lives in the error interceptor for the same reason: it sees every raw status (Req 2.1, 3.1, 5.1).
2. **There is no "base URL interceptor".** Services build absolute URLs from `AppConfig.apiBaseUrl` plus a generated `paths` key through one `ApiClient` helper. An interceptor that rewrites relative URLs would hide what is sent and make the "only our origin gets the token" rule depend on string surgery. The interceptors decide by comparing `new URL(req.url).origin` with the configured origin (Req 1.4, 2.2, 2.6).
3. **Refresh is a promise-based single-flight in a `RefreshCoordinator`, run inside a Web Lock.** Within the lock it always re-reads the refresh token and never presents the one it started with. A token that is the current one is never a reuse, so the worst case of a lost cross-tab message is one extra rotation, never a family revocation (Req 7.4, 9.1). Req 9.1 states exactly this: a tab that finds a newer stored token waits up to 1 s for the other tab's broadcast and, if none arrives, refreshes with the freshly read token.
4. **JWT decoding is hand-written (about 25 lines), no library.** The SPA needs four claims and does no verification; a library adds bundle and a verification temptation (Req 6.5).
5. **Time is injectable through a `Clock` token**, but tests mostly use Vitest fake timers (which also fake `Date`). The token exists for the code that stores deadlines (scheduler, countdown) so a test can also drive it with a manual clock (Req 4.2, 7.1).
6. **Shells (in `shared/layout/`) accept projected content with the router outlet as the default**: `<ng-content><router-outlet /></ng-content>`. The 404 route can then render the page inside the right shell without a second route tree (Req 12.2).
7. **Viewport-dependent layout uses a `ViewportService` (matchMedia signal) with `@if`, not CSS-only show/hide**, so there is exactly one `<nav>` landmark per shell and the component tests can stub `matchMedia` (jsdom does not evaluate media queries) (Req 11.4, 11.6, 11.10).

Verified at implementation time, not now (versions float, as in F0): the exact Spartan helm generator names and selectors, the ngx-sonner API for `action` and `duration`, the Vitest builder's handling of `process.env.TZ`, and the `openapi-typescript` programmatic API names.

## Architecture

Dependency direction as in F0: `features → shared, core`; `shared → core`; `core` imports neither. Shells live in `core/layout/` (they are app frame, not feature UI) and use helm components from `shared/ui/`. The ESLint zones of F0 apply unchanged.

| Area                     | Contents                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/app/core/api/`      | `generated/{auth,availability,booking}.d.ts`, `api-client.ts`, `api-types.ts`, `auth-api.service.ts`, `availability-api.service.ts`, `booking-api.service.ts`, `models.ts` (temporary type extensions, Req 1.6)                                                                                                                                                                |
| `src/app/core/http/`     | `http.providers.ts` (`provideCoreHttp()`), `correlation-id.interceptor.ts`, `error.interceptor.ts`, `app-error.ts`, `normalize-error.ts`, `outage-state.ts`, `retry-countdown.ts`, `http-context.ts` (context tokens), `origin.ts` (`isApiRequest`, `isAuthEndpoint`)                                                                                                          |
| `src/app/core/auth/`     | `session.store.ts`, `session.model.ts`, `token-storage.ts`, `jwt.ts`, `refresh-coordinator.ts`, `refresh-schedule.ts`, `cross-tab.ts`, `auth.interceptor.ts`, `session-ender.ts`, `guards.ts`, `landing.ts` (`landingRouteFor`), `safe-return-url.ts`, `post-login-target.ts` (`roleCanOpen`, `resolvePostLoginTarget`), `landing-cta.ts` (`landingCtas`), `auth.providers.ts` |
| `src/app/core/time/`     | `parse-utc.ts`, `format-in-zone.ts`, `zone-offset.ts`, `calendar-date.ts`, `zone-math.ts`, `branch-time.ts`, `index.ts`                                                                                                                                                                                                                                                        |
| `src/app/core/util/`     | `clock.ts` (`CLOCK` token), `safe-storage.ts` (`localStorage` and `sessionStorage`), `viewport.service.ts`                                                                                                                                                                                                                                                                     |
| `src/app/core/ui/`       | `palette-launcher.ts` (non-visual root service: `available`, `requests`, `request()`)                                                                                                                                                                                                                                                                                          |
| `src/app/core/notify/`   | `toast.service.ts`, `alert-announcer.ts` (non-visual: calls ngx-sonner's `toast` function; the announcer is dropped if sonner announces errors assertively)                                                                                                                                                                                                                    |
| `src/app/core/routing/`  | `app-title.strategy.ts` (non-visual)                                                                                                                                                                                                                                                                                                                                           |
| `src/app/shared/layout/` | `public-shell/`, `customer-shell/`, `admin-shell/`, `staff-shell/`, `user-menu/`, `skip-link/`, `route-progress/`, `route-announcer/`, `breadcrumb-trail/`, `outage-banner/`, `not-found/` (`NotFoundHost`, `NotFoundPage`)                                                                                                                                                    |
| `src/app/shared/ui/`     | new helm components generated by the CLI: `dropdown-menu`, `sheet`, `breadcrumb`, `separator`, `alert`; app primitive `rate-limit-notice/` (the one countdown component of the app) and F0's `theme-toggle/`, `button`, `sonner`                                                                                                                                               |
| `src/app/features/`      | `public/`, `customer/`, `admin/`, `staff/`: each holds only a `*.routes.ts` and placeholder page components (`PlaceholderPage`, one reusable component taking `data: {heading, phase}`)                                                                                                                                                                                        |
| `src/app/`               | `app.ts` (mounts toaster, banner, progress, announcer, outlet), `app.config.ts`, `app.routes.ts`                                                                                                                                                                                                                                                                               |
| `src/testing/`           | `handlers/auth.handlers.ts`, `auth-backend.ts` (stateful model), `make-access-token.ts`, `manual-clock.ts`, `fake-channel.ts`, `render-with-session.ts`                                                                                                                                                                                                                        |
| `scripts/`               | `gen-api.mjs`                                                                                                                                                                                                                                                                                                                                                                  |
| root                     | `eslint.config.js` (new restrictions), `.prettierignore`, `package.json` (`gen:api`)                                                                                                                                                                                                                                                                                           |

Shells and every other visual frame component live in `shared/layout/` (they may import `shared/ui` and `core`); `core/` stays non-visual, so the F0 zone rule `core` imports neither `shared` nor `features` holds unchanged (resolved Open question 1).

## Components and interfaces

### API generation and services (Req 1)

`scripts/gen-api.mjs` (Node, no extra dependency besides `openapi-typescript`):

```text
for each of [auth, availability, booking]:
  GET ${GATEWAY_URL ?? 'http://localhost:5290'}/openapi/<name>/v1.json  (AbortSignal.timeout(10s))
  on network error / non-200 / body without "openapi" key:
     print "Cannot reach <url>. Start the stack in Development (docker compose up) or set GATEWAY_URL."; exit 1
  type = await openapiTS(json)  ->  astToString(type)
  buffer[name] = header + text          // header: "/* generated by pnpm gen:api, do not edit */\n/* eslint-disable */"
only after all three succeed: write each file to <name>.d.ts.tmp then rename   // never truncate on failure (Req 1.2)
```

`package.json`: `"gen:api": "node scripts/gen-api.mjs"`. `.prettierignore` and the ESLint `ignores` list contain `src/app/core/api/generated/`; coverage excludes it.

Typed helper (`api-types.ts`), so service methods derive types instead of repeating them (Req 1.4):

```ts
import type { paths as AuthPaths } from './generated/auth';
type JsonBody<P, Path extends keyof P, M extends keyof P[Path]> = P[Path][M] extends {
  requestBody: { content: { 'application/json': infer B } };
}
  ? B
  : never;
type JsonResponse<
  P,
  Path extends keyof P,
  M extends keyof P[Path],
  S extends number,
> = P[Path][M] extends { responses: Record<S, { content: { 'application/json': infer R } }> }
  ? R
  : never;
```

`ApiClient` (`@Injectable({providedIn:'root'})`) holds `inject(HttpClient)` and `inject(APP_CONFIG)`:

```ts
get<T>(path: string, opts?: { params?: Record<string,string|number|boolean>; headers?: Record<string,string>; context?: HttpContext }): Observable<T>
post<T>(path: string, body?: unknown, opts?: same): Observable<T>
put<T>(...): Observable<T>
delete<T>(...): Observable<T>
url(path: string): string   // new URL(path, apiBaseUrl).toString(); path must start with '/'
```

It sets `Content-Type: application/json` only when a body exists, never `Idempotency-Key` (Req 1.5), and returns the body (`observe: 'body'`). Callers needing `Location` or `X-Correlation-ID` on success pass `observe: 'response'` via a second overload (`postFull`).

`AuthApiService` (paths are the generated keys; the exact casing, `/api/Auth/login` versus `/api/auth/login`, is whatever the OpenAPI document emits, see Open question 2):

```ts
register(body: RegisterRequest): Observable<RegisterResponse>          // POST /api/Auth/register, 201
login(body: LoginRequest): Observable<TokenResponse>                  // POST /api/Auth/login
refresh(refreshToken: string): Observable<TokenResponse>               // POST /api/Auth/refresh, context: AUTH_ENDPOINT
logout(refreshToken: string): Observable<void>                         // POST /api/Auth/logout, 204
me(): Observable<ProfileResponse>                                      // GET  /api/Auth/me
```

`TokenResponse` is `components['schemas'][...]` extended in `models.ts` with `accessTokenExpiresAtUtc?: string` until the regenerated types contain it (Req 1.6, Decision "tolerate missing field"). `availability-api.service.ts` and `booking-api.service.ts` are `@Injectable` classes that inject `ApiClient` and have no methods yet.

### HTTP pipeline (Req 2, 3, 5)

```ts
// http.providers.ts
export function provideCoreHttp(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideHttpClient(
      withFetch(),
      withInterceptors([correlationIdInterceptor, authInterceptor, errorInterceptor]),
    ),
  ]);
}
```

Outermost first: the correlation id is set before auth (so a retried request keeps its id, see below), and the error interceptor wraps the network call directly.

`origin.ts`:

```ts
export function isApiRequest(req: HttpRequest<unknown>, config: AppConfig): boolean {
  try {
    return new URL(req.url).origin === new URL(config.apiBaseUrl).origin;
  } catch {
    return false;
  }
}
const AUTH_PATHS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/logout',
];
export function isAuthEndpoint(req: HttpRequest<unknown>): boolean {
  // case-insensitive path compare
  return AUTH_PATHS.includes(new URL(req.url).pathname.toLowerCase());
}
```

`http-context.ts` defines `HttpContextToken`s: `RETRIED` (boolean, set on the one retry), `OUTAGE_PROBE` (boolean, the `/healthz` probe), `SKIP_AUTH` (boolean, for tests and `me` in bootstrap if ever needed).

**correlationIdInterceptor** (Req 2.2): if `isApiRequest` and the request has no `X-Correlation-ID`, clone with `crypto.randomUUID()`. Other origins pass through untouched.

**authInterceptor** (Req 7.3 to 7.5, 8.1, 8.2):

```ts
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const cfg = inject(APP_CONFIG);
  const session = inject(SessionStore);
  if (!isApiRequest(req, cfg) || isAuthEndpoint(req) || req.context.get(SKIP_AUTH))
    return next(req);
  return from(session.accessTokenForRequest()).pipe(
    // waits for an in-flight refresh or one due within 10 s; null when anonymous
    switchMap((token) => send(req, token)),
  );
  function send(r, token) {
    return next(token ? r.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : r).pipe(
      catchError((err: unknown) => {
        if (!(err instanceof AppError) || err.kind !== 'unauthorized' || token === null)
          return throwError(() => err);
        if (r.context.get(RETRIED)) {
          session.endSession('expired');
          return throwError(() => err);
        } // Req 7.3 second 401
        return from(session.refreshAfterUnauthorized(token)).pipe(
          switchMap((fresh) => send(r.clone({ context: r.context.set(RETRIED, true) }), fresh)),
        );
      }),
    );
  }
};
```

`refreshAfterUnauthorized(usedToken)` returns the current access token immediately if `session.accessToken() !== usedToken` (an earlier 401 already refreshed it: this keeps five concurrent 401s at one refresh even when they finish a few ms apart), otherwise awaits the coordinator. A `null` token (anonymous caller) means the request was sent without a bearer; its `401` is returned as is and the guards own the redirect. A refresh failure rejects with the coordinator's `AppError` (network, timeout, rate-limited), which propagates to the caller unchanged (Req 7.7, 7.8); a refresh `401` makes the coordinator call `endSession('expired')` and rejects with that `AppError`.

**errorInterceptor** (innermost):

```ts
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const outage = inject(OutageState);
  const sentId = req.headers.get('X-Correlation-ID') ?? undefined;
  return next(req).pipe(
    timeout({ first: 30_000, with: () => throwError(() => new TimeoutError()) }), // unsubscribing aborts fetch
    tap((event) => {
      if (event instanceof HttpResponse)
        outage.onResponse(event.status, req.context.get(OUTAGE_PROBE));
    }),
    catchError((err: unknown) => {
      const appError = normalizeError(err, sentId);
      outage.onError(appError, req.context.get(OUTAGE_PROBE));
      return throwError(() => appError);
    }),
  );
};
```

`outage.onError` sets `down` for `kind` `unavailable`, `network`, `timeout`, unless `OUTAGE_PROBE` is true (a failed probe never sets, Req 5.5). `outage.onResponse` clears `down` for any HTTP response with status below 500, including the probe (Req 5.3). `HttpEventType.Response` only, so progress events are ignored.

### `AppError` and normalization (Req 3)

```ts
export type AppErrorKind =
  'http' | 'network' | 'timeout' | 'unauthorized' | 'rate-limited' | 'unavailable';
export class AppError extends Error implements AppErrorShape {
  constructor(
    readonly status: number,
    message: string,
    readonly kind: AppErrorKind,
    readonly correlationId?: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
```

It extends `Error` so RxJS and `firstValueFrom` treat it as an error, but `stack` is never rendered anywhere (Req 3.9; `toString` is not used for display, only `message`). `normalizeError(err, sentId)` is pure:

| Input                                                                            | `status` | `kind`         | `message`                                                               | Other                                                     |
| -------------------------------------------------------------------------------- | -------- | -------------- | ----------------------------------------------------------------------- | --------------------------------------------------------- |
| `HttpErrorResponse`, status 0 (`ProgressEvent`, offline, CORS block, reset)      | 0        | `network`      | "Cannot reach the server. Check your connection and try again."         | `correlationId = sentId`                                  |
| `TimeoutError` from `timeout()` or an `AbortError`/`TimeoutError` `DOMException` | 0        | `timeout`      | "The request took too long. Please try again."                          | `correlationId = sentId`                                  |
| 429                                                                              | 429      | `rate-limited` | `detail`, else fallback "Too many requests. Please wait and try again." | `retryAfterSeconds` from `Retry-After` if `^\d+$` else 60 |
| 502, 503, 504                                                                    | status   | `unavailable`  | `detail` if present, else the 5xx fallback                              |                                                           |
| 401                                                                              | 401      | `unauthorized` | `detail` or "You need to sign in."                                      |                                                           |
| other 4xx, 500, 501, 5xx                                                         | status   | `http`         | see body rule                                                           |                                                           |
| Anything else thrown (a bug)                                                     | 0        | `http`         | "Something went wrong."                                                 | logged once to `console.error` with the original error    |

Body rule (applied to the `error` payload of a failed response; with `withFetch()` a JSON body is already parsed when `Content-Type` is JSON, a text body arrives as a string): (1) object with a non-blank string `detail` becomes `message = detail`; (2) object with `errors` (a map of string arrays) becomes `detail ?? title`, else all `errors` values flattened and joined with `"; "`; (3) otherwise the per-status fallback of Req 3.4. A string body is never shown; it is only a signal that there is no JSON. `correlationId` is `response.headers.get('X-Correlation-ID') ?? sentId`. `status` is always the HTTP status (Req 3.2). Message length is capped at 500 characters with an ellipsis, so a hostile or oversized `detail` cannot flood a toast.

### Toasts (Req 3.10 to 3.12)

```ts
@Injectable({ providedIn: 'root' })
export class ToastService {
  showError(e: AppError): void; // always toasts
  handleError(e: AppError): void; // policy: toasts only for network, timeout, http 403 and http 5xx(non-outage: i.e. 500, 501)
  showInfo(message: string): void;
  showSuccess(message: string): void; // polite, auto-dismiss after 5 s; F2 uses it for the register welcome
  showSessionExpired(): void; // exactly one per ended session (guarded by SessionEnder)
}
```

`showError` calls ngx-sonner `toast.error(message, { description: e.correlationId ? 'Reference: ' + e.correlationId : undefined, duration: 10_000, action: e.correlationId ? { label: 'Copy reference', onClick: () => this.copy(e.correlationId) } : undefined })`. `copy` does `navigator.clipboard?.writeText(id).then(() => toast.success('Copied'), () => {})`, wrapped in try/catch; when the Clipboard API is missing or rejects, nothing else happens and the reference stays in the description. The description text is selectable (no `user-select: none`). Policy of `handleError`:

| `kind` / status                | Toast?                      | Reason                                                                                                |
| ------------------------------ | --------------------------- | ----------------------------------------------------------------------------------------------------- |
| `network`, `timeout`           | yes (and the outage banner) | no other message tells the user                                                                       |
| `http` with 403, 500, 501      | yes                         |                                                                                                       |
| `http` with 400, 404, 409, 422 | no                          | a form or page renders these inline; callers call `showError` explicitly if they have no inline place |
| `unauthorized`                 | no                          | session flow (Req 8)                                                                                  |
| `rate-limited`                 | no                          | countdown (Req 4)                                                                                     |
| `unavailable`                  | no                          | banner (Req 5)                                                                                        |

Accessibility (Req 3.12): ngx-sonner's region is `aria-live="polite"`; errors need assertive announcements. At implementation, first check whether the library offers assertive toasts natively; IF it does, the `AlertAnnouncer` below is not built (resolved Open question 6). `ToastService.showError` therefore also writes the message into a visually hidden `role="alert"` element (`AlertAnnouncer`, mounted once in `App`) after clearing it on the previous animation frame so repeated identical messages re-announce; sonner's own live region is left in place for the visual toast. Errors use `duration: 10_000` (at least 8 s); sonner's toasts are focusable and dismissible with Escape and its close button, verified in the component test.

### Retry-After countdown (Req 4)

```ts
export interface RetryCountdown {
  readonly remaining: Signal<number>; // whole seconds, ceil
  readonly active: Signal<boolean>;
  start(seconds: number): void;
  cancel(): void;
  startFrom(error: unknown): void; // retryCountdownFrom
}
export function createRetryCountdown(): RetryCountdown; // injection context: uses CLOCK and DestroyRef
```

State is a single `deadline = signal<number | null>(null)` (epoch ms) and a `now` signal refreshed by a 250 ms interval that exists only while a deadline is set. `remaining = computed(() => deadline ? max(0, ceil((deadline - now) / 1000)) : 0)`; `active = computed(() => deadline !== null && remaining() > 0)`; when `remaining` reaches 0 an effect clears the interval and the deadline. `start(n)` ignores non-positive or non-integer `n` (floors, then ignores `< 1`), replaces the deadline and reuses the interval (Req 4.3). The 250 ms tick plus deadline arithmetic is what gives the throttled-tab catch-up (Req 4.2): the first tick after the tab wakes recomputes from the clock. `DestroyRef.onDestroy` clears the interval.

`RateLimitNotice` (`shared/ui/rate-limit-notice/`, the only countdown component in the app; F2 and later features reuse it, Req 4.5): input `countdown: RetryCountdown`. Template: a visible `<p aria-hidden="true">Too many attempts. Try again in {{ remaining() }} seconds.</p>` (the sentence switches to "You can try again now." when `active()` is false after having been true) plus a visually hidden `<p class="sr-only" role="status">{{ announcement() }}</p>`. `announcement` is a signal written by an effect watching `countdown.active()`: on a `false` to `true` edge it captures the first `remaining()` and writes "Too many attempts. Try again in N seconds."; on a `true` to `false` edge it writes "You can try again now." The status text therefore changes exactly twice per countdown, never every second or every 5 seconds. `RetryCountdown` consequently no longer needs the `announce` signal; it is removed from the interface above.

### Outage banner (Req 5)

```ts
@Injectable({ providedIn: 'root' })
export class OutageState {
  readonly down = signal(false);
  readonly probing = signal(false);
  readonly recovered = signal(0); // +1 every time `down` goes true -> false; data not keyed on the router reloads on it (Req 5.7)
  onError(e: AppError, probe: boolean): void;
  onResponse(status: number, probe: boolean): void;
  async retry(): Promise<void>; // probing=true; GET /healthz with OUTAGE_PROBE; 200 -> down=false, router.navigateByUrl(router.url, { onSameUrlNavigation: 'reload' }); finally probing=false
}
```

`OutageBanner` (in `shared/layout/`, mounted once in `App`, above the router outlet, in flow, not fixed, so it can never cover the bottom tab bar, Req 5.6) renders `@if (outage.down())` an `alert` helm container with `role="alert"` (inserted content is announced; focus is not moved), the text "Service temporarily unavailable. Some features may not work.", and a **Retry** button (`[disabled]="probing()"`, `[attr.aria-busy]="probing()"`). Colours come from the `warning` / `warning-foreground` tokens (contrast already measured in F0: 5.02 light, 11.92 dark). `recovered` is incremented inside the single method that clears `down` (both the probe path and the "later request succeeded" path), so a consumer can `effect(() => { outage.recovered(); reload(); })` (skipping the initial run). `/healthz` returns `200` for `Healthy` and `Degraded`; the probe treats any HTTP response below 500 as reachable via the same `onResponse` path (`503`, the gateway's own failing check, stays down).

### Session: state machine and store (Req 6, 8)

```ts
export type SessionStatus = 'unknown' | 'anonymous' | 'authenticated';
export interface SessionUser {
  id: string;
  email: string;
  role: Role;
  firstName?: string;
  lastName?: string;
}
interface SessionState {
  status: SessionStatus;
  accessToken: string | null;
  accessTokenExpiresAtUtc: string | null;
  user: SessionUser | null;
  profile: Profile | null;
  profileStatus: 'idle' | 'loading' | 'ready' | 'error';
}
interface Profile {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string | null;
}
```

`SessionStore = signalStore({ providedIn: 'root' }, withState(initial), withComputed(isAuthenticated, role, displayName), withMethods(...))`. `displayName = computed(() => profile ? `${profile.firstName} ${profile.lastName}`.trim() || user.email : user.email)`; `profile()` and `profileStatus()` are exposed as store slices (Req 6.13). `SessionUser` keeps `firstName` and `lastName` optional for compatibility and they are filled from the profile.

State transitions (every transition clears or sets all three of `accessToken`, `user`, expiry together through one `patchState` call):

| From                     | Event                                                | To              | Effects                                                           |
| ------------------------ | ---------------------------------------------------- | --------------- | ----------------------------------------------------------------- |
| `unknown`                | restore: no stored refresh token                     | `anonymous`     | none, no network (Req 6.8)                                        |
| `unknown`                | restore: refresh ok + decode ok                      | `authenticated` | store tokens, schedule, load `/me` in the background              |
| `unknown`                | restore: refresh `401`                               | `anonymous`     | clear stored token (Req 6.9)                                      |
| `unknown`                | restore: network / timeout / 5xx / `429`             | `anonymous`     | keep stored token, outage banner via the pipeline (Req 6.9)       |
| `unknown` or `anonymous` | `login` ok                                           | `authenticated` | store, schedule, `me`, broadcast `session-updated` (Req 9.5)      |
| `unknown` or `anonymous` | `session-updated` from another tab                   | `authenticated` | adopt (Req 9.3, 9.6)                                              |
| `authenticated`          | refresh ok                                           | `authenticated` | replace both tokens, reschedule, broadcast                        |
| `authenticated`          | refresh `401`, retried request `401`, invalid decode | `anonymous`     | `endSession` (Req 8.2)                                            |
| `authenticated`          | refresh network / timeout / 5xx / `429`              | `authenticated` | no change; the failing request gets the `AppError` (Req 7.7, 7.8) |
| `authenticated`          | `logout()`                                           | `anonymous`     | API call, clear, broadcast `session-ended` (Req 6.10)             |
| `authenticated`          | `session-ended` message or `storage` removal         | `anonymous`     | clear memory only, navigate to `/login` (Req 9.4)                 |

`unknown` is only ever the initial state; it resolves exactly once per page load, and `settled(): Promise<void>` (a deferred resolved by the first transition out of `unknown`) is what guards await (Req 10.1).

Store methods:

```ts
login(email: string, password: string): Promise<void>                 // rejects with AppError; F2 renders it
restore(): Promise<void>                                              // never rejects; resolves settled()
logout(): Promise<void>                                               // never rejects
accessTokenForRequest(): Promise<string | null>
refreshAfterUnauthorized(usedToken: string): Promise<string>
refresh(): Promise<void>                                              // single-flight entry (RefreshCoordinator)
endSession(reason: 'expired' | 'invalid'): void                       // idempotent (SessionEnder)
loadProfile(): Promise<void>                                          // GET /me, one automatic retry on the next navigation (Req 6.7)
reloadProfile(): Promise<void>                                        // manual retry: profileStatus 'loading' then 'ready' | 'error'; never rejects (Req 6.13)
settled(): Promise<void>
```

`login`: `firstValueFrom(auth.login(...))`, then `applyTokens(response)`: `decodeAccessToken` (below), on invalid decode `endSession('invalid')` and throw an `AppError` (status 0, kind `http`, message "Sign-in failed. Please try again."); otherwise `storage.writeRefreshToken(response.refreshToken)` first, then `patchState`, `scheduler.schedule(expMs)`, `channel.broadcast({ type: 'session-updated', ... })`, `void loadProfile()`.

`loadProfile` (and `reloadProfile`, which is the same call made on demand and also resets `profileStatus` to `'loading'` first; `profileStatus` is `'idle'` and `profile` null whenever the session is `anonymous`): `me()`; it sets `profileStatus: 'loading'`, and on success `patchState` the `profile` (and the names on `user`) and `profileStatus: 'ready'`; a `401` goes to `endSession` through the normal interceptor path; any other error sets `profileStatus: 'error'` (the session stays authenticated), and a `NavigationEnd` listener (registered once in `provideAuth`) retries it once per page load (Req 6.7).

#### Token storage (Req 6.2, 6.3)

```ts
@Injectable({ providedIn: 'root' })
export class TokenStorage {
  read(): string | null; // localStorage 'sa.refreshToken', falls back to the in-memory copy; never throws
  write(token: string): void; // writes memory first, then localStorage in try/catch
  clear(): void; // clears both
}
```

An internal `memory` field holds the last written value so a blocked `localStorage` keeps the session alive for the page (Req 6.3). The access token has no storage abstraction: it exists only in the store state. `core/util/safe-storage.ts` (Req 6.12) is one factory over both web storages:

```ts
export interface SafeStorage {
  get(key: string): string | null; // storage value; on a throw, the memory copy
  set(key: string, value: string): void; // memory first, then storage in try/catch
  remove(key: string): void;
  keys(): string[]; // storage keys (try/catch), merged with memory keys when storage is unavailable
}
export function createSafeStorage(
  kind: 'local' | 'session',
  getStorage?: () => Storage,
): SafeStorage;
export const localSafe = createSafeStorage('local');
export const sessionSafe = createSafeStorage('session');
export const safeGet = (k: string) => localSafe.get(k); // shorthands kept for the F1 callers
export const safeSet = (k: string, v: string) => localSafe.set(k, v);
export const safeRemove = (k: string) => localSafe.remove(k);
```

The storage object is resolved lazily on each call (`globalThis.localStorage` can itself throw on access in a blocked browser), the optional `getStorage` argument is the test seam, and the memory map is per instance. `TokenStorage` and the admin sidebar preference use `localSafe`; F3's idempotency-key store and "just booked" marker use `sessionSafe` (so that feature drops its private wrapper). A test per kind stubs a throwing `getStorage` and asserts write-then-read still works, `keys()` still lists the key, and nothing throws.

#### JWT decode (Req 6.5, 6.6)

```ts
export interface AccessClaims {
  sub: string;
  email: string;
  role: Role;
  exp: number;
} // exp in seconds
export function decodeAccessToken(token: string): AccessClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const p = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>; // UTF-8 safe
    if (
      typeof p['sub'] !== 'string' ||
      typeof p['exp'] !== 'number' ||
      typeof p['email'] !== 'string'
    )
      return null;
    if (p['role'] !== 'Customer' && p['role'] !== 'Staff' && p['role'] !== 'Admin') return null;
    return { sub: p['sub'], email: p['email'], role: p['role'], exp: p['exp'] };
  } catch {
    return null;
  }
}
```

No signature check, no `iss`/`aud` check (the server does that). The expiry used everywhere is `exp * 1000`; `accessTokenExpiresAtUtc` from the response is stored for display and consistency but `exp` wins, and when the field is absent it is derived from `exp` (Req 6.6). A `null` result is treated as an invalid session.

#### Restore initializer (Req 6.8, 6.9)

```ts
// auth.providers.ts: registered after the config initializer in app.config.ts providers
provideAppInitializer(() => inject(SessionStore).restore());
```

Provider order in `app.config.ts`: config initializer, then the session initializer (Angular runs initializers in registration order and awaits promises), then `provideRouter`. `restore()`: if `TokenStorage.read()` is null, `patchState(status: 'anonymous')` and resolve; else it awaits `refresh()` (lock-guarded, Requirement 9), maps the outcome per the state table, and always resolves. While it runs, `index.html` contains a minimal static "Loading..." element inside `<app-root>` (replaced on bootstrap) so the user never sees a login screen or a blank page; F0's config error page is unaffected (it aborts before this initializer).

#### Refresh scheduler (Req 7.1, 7.9)

```ts
export function refreshDelayMs(
  expMs: number,
  nowMs: number,
  lastRefreshAtMs: number | null,
  marginMs = 60_000,
  minGapMs = 5_000,
): number {
  const due = Math.max(0, expMs - marginMs - nowMs);
  const notBefore = lastRefreshAtMs === null ? 0 : Math.max(0, lastRefreshAtMs + minGapMs - nowMs);
  return Math.max(due, notBefore);
}
```

`RefreshScheduler` (a root service) owns one timer and `schedule(expMs)`: clears the previous timer, computes the delay, and sets `clock.setTimer(() => void store.refresh(), delay)`. It records `lastRefreshAtMs` when a refresh completes. A `visibilitychange` listener (registered once) calls `reschedule()` when `document.visibilityState === 'visible'`: if `now >= expMs - margin` it refreshes immediately, otherwise it re-arms with the remaining delay. `cancel()` is called on session end. Delays above 2^31 ms cannot occur (the access token lifetime is 1 hour).

`Clock` (`core/util/clock.ts`):

```ts
export interface Clock {
  now(): number;
  setTimer(fn: () => void, ms: number): () => void;
}
export const CLOCK = new InjectionToken<Clock>('CLOCK', {
  providedIn: 'root',
  factory: () => ({
    now: () => Date.now(),
    setTimer: (fn, ms) => {
      const id = setTimeout(fn, ms);
      return () => clearTimeout(id);
    },
  }),
});
```

#### Refresh coordinator: single-flight, lock, 401 (Req 7, 9)

```ts
@Injectable({ providedIn: 'root' })
export class RefreshCoordinator {
  private inFlight: Promise<void> | null = null;
  refresh(): Promise<void> {
    return (this.inFlight ??= this.run().finally(() => {
      this.inFlight = null;
    }));
  }
  private async run(): Promise<void> {
    const startToken = this.storage.read();
    if (!startToken) {
      this.session.endSession('expired');
      throw new AppError(401, 'You need to sign in.', 'unauthorized');
    }
    await this.sync.withLock('sa.refresh', 15_000, async () => {
      // 1. someone else may have refreshed while we waited
      if (this.session.hasFreshAccessToken(60_000)) return; // adopted via broadcast, nothing to do
      const current = this.storage.read();
      if (!current) throw this.endedByOtherTab(); // logout elsewhere
      if (current !== startToken) await this.sync.waitForUpdate(1_000); // grace for the broadcast
      if (this.session.hasFreshAccessToken(60_000)) return;
      // 2. always present the freshest stored token, never the stale one we started with
      const token = this.storage.read()!;
      try {
        const res = await firstValueFrom(this.auth.refresh(token));
        this.session.applyTokens(res); // writes the new refresh token first, then state, schedule, broadcast
      } catch (e) {
        if (e instanceof AppError && e.kind === 'unauthorized') this.session.endSession('expired');
        throw e; // network / timeout / 5xx / 429 keep the session (Req 7.7, 7.8)
      }
    });
  }
}
```

- **Single flight:** every caller (restore, proactive timer, `accessTokenForRequest`, `refreshAfterUnauthorized`, visibility handler) goes through `refresh()`, so the shared promise gives one `POST /api/auth/refresh` for any number of concurrent callers in a tab (Req 7.4). The lock gives one across tabs (Req 9.1).
- **No retry** of the refresh call: `AuthApiService.refresh` is sent with `SKIP_AUTH` and no retry operator (Req 7.6). The error interceptor still normalizes it.
- **`429`** from refresh: the coordinator stores `blockedUntil = now + retryAfterSeconds*1000`; `refresh()` called before that time rejects immediately with the same `rate-limited` `AppError`, without a request (Req 7.8). The proactive scheduler re-arms for `blockedUntil`.
- `hasFreshAccessToken(ms)` is true when the store holds an access token whose `exp` is more than `ms` away.

`accessTokenForRequest()`: if `status !== 'authenticated'` return `null`; if a refresh is in flight, or `exp - now < 10_000`, `await coordinator.refresh()`; return the current token. A rejection (network etc.) propagates to the interceptor and the caller (Req 7.5, 7.7).

#### Cross-tab (Req 9)

```ts
export type SessionMessage =
  | { type: 'session-updated'; tabId: string; accessToken: string; accessTokenExpiresAtUtc: string }
  | { type: 'session-ended'; tabId: string; reason: 'logout' | 'expired' | 'invalid' }
  | { type: 'request-session'; tabId: string };       // asked by a tab that opened with a refresh token but has no access token
@Injectable({ providedIn: 'root' })
export class CrossTabSync {
  readonly tabId = crypto.randomUUID();
  broadcast(m: DistributiveOmit<SessionMessage, 'tabId'>): void;
  readonly messages: Signal-less stream: subscribe(handler): () => void;     // validated, own-tab messages dropped (Req 9.9)
  withLock<T>(name: string, waitMs: number, fn: () => Promise<T>): Promise<T>;
  waitForUpdate(ms: number): Promise<void>;                                    // resolves on the next valid session-updated or after ms
  readonly supported: boolean;
}
```

- **Primary implementation.** `BroadcastChannel('sa.session')` and `navigator.locks.request(name, { signal }, fn)`. `withLock` creates an `AbortController` aborted after `waitMs` (Req 9.8); an `AbortError` while waiting is mapped to `new AppError(0, 'The request took too long. Please try again.', 'timeout')`. The signal only cancels the wait for the lock, not a lock already granted.
- **Validation (Req 9.3, 9.9).** An incoming message is accepted only if `typeof data === 'object'`, `data.tabId` is a string different from this tab's, `type` is one of the three, and (for `session-updated`) `accessToken` and `accessTokenExpiresAtUtc` are strings and `decodeAccessToken(accessToken)` is non-null. The store adopts only when the incoming `exp` is later than its own (or it has no token), and sets `user` from the claims (names stay as already loaded, or `loadProfile()` runs when absent).
- **`session-ended`** carries a `reason` (resolved Open question 3, Req 9.4). A receiving tab calls `session.clearLocal()` (memory only: no API call, no further broadcast) and navigates: reason `'expired'` goes to `/login?reason=session-expired&returnUrl=<its own current url>` (omitting `returnUrl` and staying put when it is already on `/login` or `/register`), `'logout'` to plain `/login`, `'invalid'` to plain `/login` with no toast. Only the originating tab shows the "Your session has expired" toast; receiving tabs show none, to avoid one toast per tab. A `storage` event on key `sa.refreshToken` with `newValue === null` (the fallback path) is treated as reason `'logout'` because the cause is unknown.
- **`request-session`.** A tab that restored while another tab holds a valid access token may send it; any tab with a valid token answers with `session-updated`. It is used by `waitForUpdate` callers only, never required for correctness: after the 1 s grace the tab refreshes itself with the current stored token (safe, it is the current token).
- **Fallback (Req 9.7).** When `navigator.locks` or `BroadcastChannel` is missing, `supported = false`, one `console.warn('Cross-tab session coordination is unavailable; ...')` is logged, `withLock` serializes through a module-level promise chain (per tab only), `broadcast` is a no-op, and cross-tab logout relies on the `storage` event alone. Other tabs then refresh on demand with the freshest stored token, which is the weaker guarantee recorded in Known gaps.
- **Ordering inside the lock.** The success path writes the new refresh token to storage, patches state, schedules, and calls `broadcast` before the callback returns, so the lock is released only after the other tabs have been told.

#### Session end and logout (Req 6.10, 8.2, 8.3)

```ts
@Injectable({ providedIn: 'root' })
export class SessionEnder {
  private ending = false;
  end(reason: 'expired' | 'invalid'): void {
    if (this.ending) return;
    this.ending = true; // dedupes simultaneous failures (Req 8.3)
    session.clearLocal();
    storage.clear();
    scheduler.cancel();
    sync.broadcast({ type: 'session-ended', reason });
    const url = router.url.split('?')[0];
    const onAuthPage = url === '/login' || url === '/register';
    void router
      .navigate(['/login'], {
        queryParams: onAuthPage
          ? { reason: 'session-expired' }
          : { reason: 'session-expired', returnUrl: router.url },
      })
      .finally(() => (this.ending = false));
    toast.showSessionExpired();
  }
}
```

`reason: 'invalid'` (decode failure) navigates the same way but without the toast, because there was no session the user expected to keep. `ending` resets after the navigation settles so a later new session can end again. `SessionStore.logout()`:

```ts
async logout() {
  const token = storage.read();
  scheduler.cancel();
  clearLocal(); storage.clear();                                        // UI is signed out immediately
  sync.broadcast({ type: 'session-ended', reason: 'logout' });
  if (token) firstValueFrom(auth.logout(token)).catch(() => {});        // fire and forget; failures are not shown (Req 6.10)
  await router.navigate(['/login']);
}
```

The `logout` request goes out with `SKIP_AUTH` implicitly (auth endpoint) and carries the token read before clearing.

### Guards and landing (Req 10)

```ts
export const landingRouteFor = (role: Role): string =>
  ({ Customer: '/book', Admin: '/admin', Staff: '/staff' })[role];

export const authGuard: CanActivateFn = async (_r, state) => {
  const s = inject(SessionStore),
    router = inject(Router);
  await s.settled();
  return s.status() === 'authenticated'
    ? true
    : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
export const guestGuard: CanActivateFn = async (route) => {
  await s.settled();
  return s.status() === 'authenticated'
    ? router.parseUrl(resolvePostLoginTarget(s.role()!, route.queryParamMap.get('returnUrl'))) // Req 10.2
    : true;
};
export const roleGuard =
  (...roles: Role[]): CanActivateFn & CanActivateChildFn =>
  async (_r, state) => {
    await s.settled();
    if (s.status() !== 'authenticated')
      return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
    if (roles.includes(s.role()!)) return true;
    inject(ToastService).showInfo('That area is not available for your account.');
    return router.createUrlTree([landingRouteFor(s.role()!)]);
  };
```

The `returnUrl` written here is `state.url`, which is app-generated; it is only trusted when read back through `safeReturnUrl` (Req 8.4). `post-login-target.ts` (Req 10.7; absorbed from F2's design, one source of truth shared by `guestGuard` and F2's login page):

```ts
const AREA_ROLE: Record<string, Role> = {
  admin: 'Admin',
  staff: 'Staff',
  book: 'Customer',
  appointments: 'Customer',
  profile: 'Customer',
};
export function roleCanOpen(role: Role, url: string): boolean {
  // first path segment decides; unknown segments are open
  const seg = new URL(url, 'http://app.invalid').pathname.split('/')[1] ?? '';
  const owner = AREA_ROLE[seg];
  return owner === undefined || owner === role;
}
export function resolvePostLoginTarget(role: Role, rawReturnUrl: unknown): string {
  const safe = safeReturnUrl(rawReturnUrl);
  return safe !== null && roleCanOpen(role, safe) ? safe : landingRouteFor(role);
}
```

A map by first segment is deliberate (guards cannot be introspected, and letting `roleGuard` bounce would show its "not available" toast). A drift test walks `app.routes.ts`, collects each top-level path that has a `roleGuard(...)` and asserts `AREA_ROLE` agrees.

`landing-cta.ts` (Req 10.8; the public shell header and F2's hero and closing band read it, so the three never disagree):

```ts
export interface Cta {
  label: string;
  href: string;
}
export function landingCtas(): Signal<{ primary: Cta; secondary: Cta | null }> {
  // injection context
  const s = inject(SessionStore);
  return computed(() =>
    s.status() === 'authenticated'
      ? {
          primary: { label: 'Go to my dashboard', href: landingRouteFor(s.role()!) },
          secondary: null,
        }
      : {
          primary: { label: 'Create an account', href: '/register' },
          secondary: { label: 'Log in', href: '/login' },
        },
  );
}
```

`safeReturnUrl(raw: unknown): string | null` (pure, Req 8.4):

```ts
export function safeReturnUrl(raw: unknown, origin = location.origin): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return null;
  if (!/^\/(?![\/\\])/.test(raw)) return null; // exactly one leading slash, not followed by / or \
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return null; // control characters, backslash
  if (/^\/(login|register)(?![A-Za-z0-9_-])/i.test(raw)) return null; // no loops
  try {
    const u = new URL(raw, origin);
    if (u.origin !== origin) return null;
  } catch {
    return null;
  }
  return raw;
}
```

A percent-encoded control character (`/%09/evil.example`) is decoded by the `new URL` pathname but the raw string has no control character; the test list therefore also asserts that a value which _decodes_ to a leading `//` or a control character at the start is rejected: the function additionally runs `decodeURIComponent(raw)` in a try/catch (malformed encoding returns `null`) and applies the same two character checks to the decoded form. The decoded form is only checked, never returned.

### Route table and shells (Req 11, 12)

`provideRouter(routes, withViewTransitions({ onViewTransitionCreated: skipIfReducedMotion }), withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }))`, plus `{ provide: TitleStrategy, useClass: AppTitleStrategy }` (format always "<Page> | Smart Appointments"; the bare application name when a route has no title, Req 11.7). Function titles (Req 11.13): Angular resolves a route `title` given as a function or `ResolveFn` into `snapshot.title` before `updateTitle` runs, so `AppTitleStrategy extends TitleStrategy` simply reads `this.buildTitle(snapshot)`; the strategy formats the result, falls back to the bare application name for an empty or non-string value, and wraps the read in try/catch. A route that needs a fresh title when a query parameter changes sets `runGuardsAndResolvers: 'paramsOrQueryParamsChange'` itself (F3).

| Path                                                                   | Component                                                       | Guard                                                                                          | Notes                                                             |
| ---------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `` (shell)                                                             | `PublicShell`                                                   | none                                                                                           | children below                                                    |
| `/`                                                                    | `PlaceholderPage` (`data: { heading: 'Welcome', phase: 'F2' }`) | none                                                                                           | stays open to signed-in users (Decision)                          |
| `/login`, `/register`                                                  | `PlaceholderPage`                                               | `guestGuard`                                                                                   | titles "Sign in", "Create account"                                |
| `` (shell)                                                             | `CustomerShell`                                                 | `canActivate: [authGuard, roleGuard('Customer')]`, `canActivateChild: [roleGuard('Customer')]` |                                                                   |
| `/book`                                                                | `PlaceholderPage` ("F3")                                        |                                                                                                | title "Book an appointment"                                       |
| `/appointments`, `/appointments/:id`                                   | `PlaceholderPage` ("F4")                                        |                                                                                                | `:id` bound by `withComponentInputBinding`                        |
| `/profile`                                                             | `PlaceholderPage` ("F4")                                        |                                                                                                |                                                                   |
| `/admin` (shell)                                                       | `AdminShell`                                                    | `[authGuard, roleGuard('Admin')]` + `canActivateChild`                                         | `data.breadcrumb: 'Admin'`                                        |
| `/admin` (index), `/admin/branches`, `/admin/services`, `/admin/slots` | `PlaceholderPage` ("F5")                                        |                                                                                                | `data.breadcrumb`: Dashboard, Branches, Services, Slot generation |
| `/staff`                                                               | `StaffShell` > `StaffPlaceholder`                               | `[authGuard, roleGuard('Staff')]`                                                              | "The staff workspace is coming." + logout button                  |
| `**`                                                                   | `NotFoundHost`                                                  | none                                                                                           | see below                                                         |

Each area is `loadChildren: () => import('./features/<area>/<area>.routes')` and each page `loadComponent`, so only the shells' core code is in the initial chunk (Req 11.9). The shells themselves are lazily loaded as parents of their `loadChildren` route. `core/auth`, `core/http`, `core/notify` (session, error, outage) are initial.

**Shell template convention:** each shell's `<main id="main-content" tabindex="-1">` contains `<ng-content><router-outlet /></ng-content>`; `SkipLink` is the first focusable element; `RouteAnnouncer` and the progress bar are root-level.

- **`PublicShell`:** header (`<a routerLink="/">Smart Appointments</a>`, `ThemeToggle`, and the buttons from `landingCtas()`: "Sign in" and "Create account" when anonymous, "Go to my dashboard" when signed in, because `/` is open to signed-in users; the shell owns this swap, Req 11.3), `<main>`, footer. Colours: `bg-background`, `border-border`, primary buttons `bg-primary text-primary-foreground` (teal-700 / teal-400, F0 contrast table).
- **`CustomerShell`:** `ViewportService.isMd()` (`matchMedia('(min-width: 768px)')`, signal). `@if (isMd())` renders a sticky top bar with `<nav aria-label="Main">` (Book, My appointments, Profile as `routerLink` with `routerLinkActive="text-primary" ariaCurrentWhenActive="page"`), `ThemeToggle` and `UserMenu`; `@else` renders a compact top bar (name, theme toggle, user menu) and a fixed bottom `<nav aria-label="Main">` with three links (lucide `calendar-plus`, `calendar-days`, `user`, with labels), each `min-h-11 min-w-11` (44 px), `pb-[env(safe-area-inset-bottom)]`; the content area gets `pb-[calc(4rem+env(safe-area-inset-bottom))]` on mobile (Req 11.4). Active colour is `text-primary`; teal-600 is not used for text (F0 rule).
- **`AdminShell`:** `isLg()` (`min-width: 1024px`). Desktop: a left `<aside>` with `<nav aria-label="Admin">` (Dashboard `layout-dashboard`, Branches `building-2`, Services `list-checks`, Slot generation `calendar-range`); width `w-60` expanded, `w-14` collapsed (icons only, each with `aria-label`/tooltip text via `title`); collapsed state in a signal initialised from `safeGet('sa.admin.sidebar')` and written with `safeSet` (Req 11.5). Below `lg`: the sidebar renders inside the helm `sheet` (CDK dialog based, focus trapped, Escape closes, focus returns to the toggle), closed on `NavigationEnd`. The top bar has the sidebar toggle button (`aria-expanded`, `aria-controls`), `<nav aria-label="Breadcrumb">` built by a small `BreadcrumbTrail` that walks `ActivatedRoute` snapshots and reads `data['breadcrumb']`, `ThemeToggle` and `UserMenu`.
- **Palette hook (Req 11.12).** `PaletteLauncher` (`core/ui/palette-launcher.ts`, `providedIn: 'root'`): `available = signal(false)`, `requests = signal(0)`, `request(): void { this.requests.update(n => n + 1) }`. The admin shell top bar renders `@if (launcher.available()) { <button hlmBtn variant="outline" (click)="launcher.request()">Search or jump to… <kbd>{{ shortcutLabel }}</kbd></button> }` (the label is "Ctrl K" or the command-key form chosen from `navigator.platform` / `userAgentData`, display only, Ctrl/Cmd K itself is not handled in F1). On viewports below 640 px only a search icon button with `aria-label="Search or jump to"` shows. F1 never sets `available`; F5's lazy admin frame sets it on init, resets it on destroy and reacts to `requests`.
- **`StaffShell`:** top bar only (name, theme toggle, "Sign out"), no sidebar.
- **`UserMenu`:** helm `dropdown-menu` trigger button with `aria-label` "Account menu", shows `displayName()`; items "Profile" (only for Customer, linking `/profile`) and "Sign out" (`session.logout()`). Escape closes, focus returns to the trigger (CDK menu behaviour).
- **`NotFoundHost`:** `@switch (session.role()) { @case ('Admin') { <app-admin-shell><app-not-found/></app-admin-shell> } @case ('Customer') {...CustomerShell} @case ('Staff') {...StaffShell} @default {...PublicShell} }`. `NotFoundPage` shows the heading "Page not found", one sentence, and a primary link to `landingRouteFor(role)` or `/`; it sets `<meta name="robots" content="noindex">` through `Meta` on init and removes it on destroy, and the title via a `title` route property (Req 12.1 to 12.4). The URL is never rendered.
- **Root `App`:** `<app-skip...>` is per shell; `App` template is `<app-route-progress/><app-outage-banner/><router-outlet/><hlm-toaster/><app-alert-announcer/><app-route-announcer/>`. `RouteProgress` subscribes to `NavigationStart`/`End`/`Cancel`/`Error`, shows a thin `h-0.5 bg-primary` bar only if navigation lasts more than 150 ms (a `setTimeout` cleared on end), `aria-hidden="true"`. `RouteAnnouncer` writes the new document title into a visually hidden `aria-live="polite"` element after each `NavigationEnd` (Req 11.7).

### Time utilities (Req 13)

```ts
// parse-utc.ts
const NO_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;
export function parseUtc(value: string): Date {
  const s = value.trim();
  const d = new Date(NO_ZONE.test(s) ? s + 'Z' : s); // the one place allowed to call new Date(string)
  if (!s || Number.isNaN(d.getTime())) throw new RangeError(`Invalid date-time: "${value}"`);
  return d;
}
```

Also `fromEpochMs(ms: number): Date` and `toIsoUtc(d: Date): string` so other code never needs `new Date(x)`.

```ts
// format-in-zone.ts
export type TimeStyle = 'date' | 'time' | 'datetime';
export function formatInZone(
  value: Date | string,
  timeZoneId: string,
  options: { style?: TimeStyle; showZoneName?: boolean; locale?: string } = {},
): string;
```

- A module-level `Map<string, Intl.DateTimeFormat>` keyed by `locale|zone|style|zoneName` caches formatters (construction is expensive).
- `style` maps to `{ weekday:'short', day:'numeric', month:'short', year:'numeric' }` (date), `{ hour:'2-digit', minute:'2-digit' }` (time; the hour cycle follows the locale), or both (datetime, joined by the locale pattern). `showZoneName` adds `timeZoneName: 'short'`.
- An invalid zone (`RangeError` at construction) falls back to `timeZone: 'UTC'`, appends " UTC", and logs `console.warn` once per distinct id (a `Set<string>`), never throws (Req 13.3).

```ts
// zone-offset.ts
export function zoneOffsetMinutes(timeZoneId: string, at: Date | number): number {
  // exported: F5's localToUtc and estimates pass epoch milliseconds
  // format `at` with hourCycle h23 in the zone via formatToParts, rebuild Date.UTC(parts), subtract at (floored to the second), / 60000
}
export function zoneDiffersFromBrowser(timeZoneId: string, at: Date): boolean {
  return zoneOffsetMinutes(timeZoneId, at) !== -at.getTimezoneOffset();
}
```

The parts method works in every browser (no dependency on `longOffset`). An invalid zone returns UTC (0), consistent with `formatInZone`.

```ts
// calendar-date.ts: pure, yyyy-MM-dd strings, Date.UTC arithmetic, no DST error possible (Req 13.8)
export type DayName =
  'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
export function todayInZone(timeZoneId: string, nowMs: number): string; // Intl.DateTimeFormat('en-CA', { timeZone, year, month, day }).formatToParts; invalid zone -> UTC + one warning
export function addDays(date: string, n: number): string; // fromEpochMs(Date.UTC(y, m-1, d+n)) -> yyyy-MM-dd
export function diffDays(from: string, to: string): number; // (Date.UTC(to) - Date.UTC(from)) / 86_400_000, calendar days
export function weekdayOf(date: string): DayName; // getUTCDay of the UTC midnight of that calendar date
export function eachDate(from: string, to: string): string[]; // inclusive; [] when to < from
```

```ts
// zone-math.ts (Req 13.9), built on zoneOffsetMinutes
export function localToUtc(
  timeZoneId: string,
  date: string,
  minuteOfDay: number,
): { gap: boolean; utcMs: number } {
  // local = Date.UTC(y, m-1, d, 0, minuteOfDay)  (the wall time read as if it were UTC)
  // o0 = offset at (local); o1 = offset at (local - o0*60000); o = offset at (local - o1*60000)   (fixed point in at most two steps)
  // gap  : the round trip (local - o*60000) formatted back in the zone does not read `local`  -> { gap: true, utcMs: local - o*60000 }
  // fold : both candidate offsets are valid -> choose the smaller offset (standard time), as .NET's ConvertTimeToUtc does
}
```

```ts
// branch-time.ts (Req 13.10): moved here from F3's feature code; F3, F4 and F5 import it from core/time
export type Weekday = DayName;
export interface BranchSchedule {
  timeZoneId: string;
  workingHours: { dayOfWeek: DayName | number; opensAt: string; closesAt: string }[];
}
export interface ZonedParts {
  date: string;
  weekday: DayName;
  minutes: number;
} // minutes since local midnight
export interface DayStripItem {
  date: string;
  weekdayShort: string;
  day: number;
  monthShort: string | null;
  isToday: boolean;
  fullLabel: string;
}
export function zonedParts(zoneId: string, at: Date): ZonedParts; // cached Intl formatter per zone, hourCycle h23; invalid zone -> UTC + one warning
export function dayStrip(todayInBranch: string): DayStripItem[]; // 14 items; labels built at noon UTC so a label never shifts a day
export function todaysHours(
  b: BranchSchedule,
  at: Date,
): { opens: string; closes: string } | 'closed-today' | 'no-schedule';
export function isOpenNow(b: BranchSchedule, at: Date): boolean; // opensAt <= minutes < closesAt
export function hhmm(t: string): string; // "09:30:00" -> "09:30"
```

`DayName` has one definition (calendar-date.ts) and `Weekday` is an alias, so F3's `Weekday` and F5's `DayName` are the same type. A numeric `dayOfWeek` (the backend may serialize the .NET enum as a number, 0 = Sunday) is normalised by one private `dayNameOf(value)`; the generated type decides which form occurs (F3 Open question 8). All of these live in `core/time/`, so the `new Date(<value>)` rule needs no exemption outside it. The F5 fixture `slot-planner-vectors.json` (generated from the backend `SlotPlanner`) is F5's and exercises `localToUtc`; F1 tests `localToUtc` on the transition dates of Req 13.11 directly.

**ESLint (Req 13.6)**, in `eslint.config.js`, a block for `src/**/*.ts`:

```js
{
  files: ['src/**/*.ts'],
  ignores: ['src/app/core/time/**', 'src/**/*.spec.ts', 'src/testing/**'],
  rules: {
    'no-restricted-syntax': ['error',
      { selector: "NewExpression[callee.name='Date'][arguments.length>0]",
        message: 'Use parseUtc/fromEpochMs from core/time. new Date(<value>) is only allowed in core/time.' },
      { selector: "CallExpression[callee.property.name=/^toLocale(Date|Time)?String$/]",
        message: 'Use formatInZone from core/time so a time zone is always explicit.' },
    ],
    'no-restricted-imports': ['error', { paths: [
      { name: '@angular/common', importNames: ['DatePipe'], message: 'DatePipe formats in the browser zone. Use formatInZone.' } ] }],
  },
}
```

`new Date()` with no arguments stays allowed (the current instant). The selector also flags `new Date(someNumber)`, which is intended: epoch arithmetic goes through `fromEpochMs`. A second block applies the F0 `no-restricted-imports` zones. The `Date.parse` call is covered by adding `{ selector: "CallExpression[callee.object.name='Date'][callee.property.name='parse']" }` to the same list.

### Test doubles (Req 14)

`src/testing/auth-backend.ts` (`createAuthBackend(opts)`) returns `{ handlers, state, reset }`:

```ts
interface BackendState {
  users: Map<
    string,
    { id: string; email: string; password: string; role: Role; firstName: string; lastName: string }
  >;
  families: Map<
    string,
    { tokens: Map<string, { revoked: boolean; expiresAtMs: number }>; revokedAll: boolean }
  >;
  tokenToFamily: Map<string, string>;
  counters: { login: number; refresh: number; logout: number; me: number };
  flags: {
    loginRateLimited: boolean;
    refreshRateLimited: boolean;
    refreshFailure: null | 'network' | 500 | 503;
  };
  accessTokenSeconds: number; // default 3600
  refreshTokenDays: number; // default 7
}
```

- `login`: unknown user or wrong password returns `401 {status:401, detail:'Invalid user or password.'}` (`application/problem+json`); `flags.loginRateLimited` returns `429` with `Retry-After: 60`; success creates a family with one token `rt_<n>_<rand>` and returns `{ accessToken: makeAccessToken(...), refreshToken, accessTokenExpiresAtUtc }`.
- `refresh` (models the server rules, Req 14.2): unknown, expired or malformed returns `401 'Invalid or expired refresh token.'`; a **revoked** token revokes every token in its family (`revokedAll = true`) and returns the same `401`; a valid current token is marked revoked and a successor is added to the same family and returned; the body always carries `accessTokenExpiresAtUtc`. `counters.refresh` increments on every call so tests assert "exactly one refresh". `flags.refreshFailure` simulates `HttpResponse.error()` or `503`.
- `logout`: revokes the token's family if known, always `204`.
- `me`: needs `Authorization: Bearer <token>` whose decoded claims match a known user (`401` with empty body otherwise).
- Every handler echoes `X-Correlation-ID` (or generates one) and returns errors as `application/problem+json` `{status, detail}` (Req 14.4). Handlers are registered per test with `server.use(...auth.handlers)`; the default empty list of F0 stays.

`makeAccessToken({ sub, email, role, expiresInSeconds, nowMs? })` base64url-encodes `{alg:'HS256',typ:'JWT'}` and the payload, with a fixed fake signature. `manual-clock.ts` implements `Clock` for scheduler tests. `fake-channel.ts` provides an in-memory `CrossTabSync` pair with a shared lock (a promise queue) and synchronous-by-microtask message delivery, so two `SessionStore` instances can be tested together (Req 9.6). `render-with-session.ts` wraps Angular Testing Library `render` with a configured `AppConfig`, `provideCoreHttp()`, and a seeded session.

Fake timers: tests call `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })`, deliberately leaving `queueMicrotask`, `nextTick` and `setImmediate` real so MSW and Promises still resolve, and advance with `vi.advanceTimersByTimeAsync`. No `fakeAsync`.

## State and data model

| Item                                      | Where                                                                    | Notes                             |
| ----------------------------------------- | ------------------------------------------------------------------------ | --------------------------------- |
| Access token                              | `SessionStore` state, memory                                             | never persisted (Req 6.2)         |
| Refresh token                             | `localStorage` `sa.refreshToken` plus in-memory shadow in `TokenStorage` | Req 6.3                           |
| Admin sidebar collapsed                   | `localStorage` `sa.admin.sidebar` (`"1"` or `"0"`)                       | try/catch via `safeGet`/`safeSet` |
| Theme preference                          | F0 `sa.theme`                                                            | unchanged                         |
| `OutageState.down`, `probing`             | root service signals                                                     |                                   |
| Countdown                                 | per-consumer `createRetryCountdown()`                                    |                                   |
| Cross-tab channel                         | `BroadcastChannel('sa.session')`, Web Lock `sa.refresh`                  |                                   |
| Refresh `blockedUntil`, `lastRefreshAtMs` | `RefreshCoordinator` / `RefreshScheduler` fields                         | in memory                         |

Models: `Role = 'Customer' | 'Staff' | 'Admin'` (a constant tuple in `core/auth/session.model.ts`, the single definition; the generated `components` types for role are not trusted for guards).

## Error handling

Failures arrive as `AppError`. What the user sees:

| Condition                                  | `AppError.status` / `kind` | UI result                                                                                                                                          |
| ------------------------------------------ | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server unreachable, DNS, CORS block        | 0 / `network`              | outage banner; toast via `handleError`; the caller's pending state ends                                                                            |
| No answer in 30 s                          | 0 / `timeout`              | outage banner; toast                                                                                                                               |
| Gateway `502` / `504`, service `503`       | 5xx / `unavailable`        | outage banner with Retry; no toast                                                                                                                 |
| `401` on a normal call                     | 401 / `unauthorized`       | transparent refresh and one retry; if refresh fails with `401`, `endSession`: one toast, redirect to `/login?reason=session-expired&returnUrl=...` |
| `401` on login                             | 401 / `unauthorized`       | caller (F2) shows "Invalid user or password." inline; no redirect (auth endpoints skip the retry path)                                             |
| `401` on refresh                           | 401 / `unauthorized`       | session ends as above; at restore the stored token is cleared and the user is anonymous with no toast                                              |
| Refresh fails with network / timeout / 5xx | 0 or 5xx                   | session kept; failing request gets the error; banner shows                                                                                         |
| Refresh or any call `429`                  | 429 / `rate-limited`       | caller starts a `RetryCountdown` and shows `RateLimitNotice`; no toast; session kept                                                               |
| `403`                                      | 403 / `http`               | session kept; guard-level redirect for role mismatch at navigation; for an API call, toast via `handleError`                                       |
| `400`, `404`, `409`, `422`                 | status / `http`            | inline in the form or page; `showError` if none                                                                                                    |
| `500`, `501`                               | status / `http`            | toast with copyable reference                                                                                                                      |
| Token fails to decode                      | not an HTTP error          | `endSession('invalid')`: anonymous, redirect, no toast                                                                                             |
| `localStorage` unavailable                 | not an HTTP error          | session works for the page lifetime; a reload requires a new login                                                                                 |

## Testing strategy

Vitest through the Angular builder, Angular Testing Library (queries by role), MSW (`server.use(...)` per test, `onUnhandledRequest: 'error'` from F0), fake timers as above, process time zone fixed with `process.env.TZ = 'Pacific/Kiritimati'` at the top of `src/testing/setup.ts` (UTC+14, different from every tested zone; verified at implementation that the builder honours it, otherwise the time tests pass explicit zones and assert via `Intl` only).

| Requirement                                                                                                                                                    | Test (file)                                                                                                                                                                                                                                                                                                                                        | Kind                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| 1.1, 1.2                                                                                                                                                       | `scripts/gen-api.spec.mjs`: stub `fetch`; failure leaves existing files byte-identical, exits 1, message names URL                                                                                                                                                                                                                                 | node unit               |
| 1.3, 1.4, 1.7                                                                                                                                                  | `auth-api.service.spec.ts`: each method's verb, absolute URL from a configured base, body, through MSW                                                                                                                                                                                                                                             | integration             |
| 1.5                                                                                                                                                            | `api-client.spec.ts`: no `Idempotency-Key` added; caller header preserved                                                                                                                                                                                                                                                                          | unit                    |
| 2.1, 2.2, 2.6                                                                                                                                                  | `http.pipeline.spec.ts`: header added for the API origin only; token and id absent for `https://other.example`; an existing id is kept                                                                                                                                                                                                             | integration             |
| 2.3                                                                                                                                                            | same: error carries the response id; network failure carries the sent id                                                                                                                                                                                                                                                                           | integration             |
| 2.4                                                                                                                                                            | assert `credentials` is not `include` (spy on `fetch` init)                                                                                                                                                                                                                                                                                        | unit                    |
| 3.1 to 3.9                                                                                                                                                     | `normalize-error.spec.ts`: table-driven, one row per body shape, status, network (status 0), timeout, 429 with and without `Retry-After`, HTTP-date `Retry-After`, oversized detail, string body                                                                                                                                                   | unit                    |
| 3.5, 3.6                                                                                                                                                       | `error.interceptor.spec.ts`: MSW `HttpResponse.error()` gives `network`; a never-resolving handler with fake timers gives `timeout` at 30 s                                                                                                                                                                                                        | integration             |
| 3.10 to 3.13                                                                                                                                                   | `toast.service.spec.ts` and a component test of `<hlm-toaster>`: message, reference line, Copy action writes the id, denied clipboard does not throw, announcer region gets the text, policy table                                                                                                                                                 | component               |
| 4.1 to 4.4, 4.6, 4.7                                                                                                                                           | `retry-countdown.spec.ts`: start, tick down, replace, cancel, catch-up after `advanceTimersByTime(30_000)` in one jump, destroy clears interval                                                                                                                                                                                                    | unit                    |
| 4.5                                                                                                                                                            | `rate-limit-notice.spec.ts`: the visible text is `aria-hidden`; the `role="status"` text changes exactly twice across a full countdown (start with N seconds, end with "You can try again now."); wording "Try again in N seconds"                                                                                                                 | component               |
| 5.1 to 5.7                                                                                                                                                     | `outage.spec.ts`: `503`, `504`, network show the banner; `404`, `429`, `401` do not; Retry calls `/healthz` once, `Degraded` clears and re-navigates, failure keeps it, button disabled and `aria-busy` while in flight; a failed probe does not set `down`; a later `200` clears; `recovered` increments once per recovery                        | integration + component |
| 6.1 to 6.4, 6.6                                                                                                                                                | `session.store.spec.ts`: login sets state, derives expiry when the field is absent, trusts `exp` on mismatch, `me` loads names, access token never appears in `localStorage`/`sessionStorage` (spy on both)                                                                                                                                        | unit/integration        |
| 6.3, 6.12                                                                                                                                                      | `token-storage.spec.ts` and `safe-storage.spec.ts`: a throwing `localStorage` or `sessionStorage` keeps working in memory (`get`, `set`, `remove`, `keys`), independent memory per instance, no throw                                                                                                                                              | unit                    |
| 6.13                                                                                                                                                           | `session.store.spec.ts`: `profile()` and `profileStatus()` through idle, loading, ready; `me` 500 gives `error` and keeps the session; `reloadProfile()` retries and reaches `ready`; `displayName` uses the profile then the email                                                                                                                | integration             |
| 6.5                                                                                                                                                            | `jwt.spec.ts`: valid, missing padding, non-ASCII `email`, malformed, missing `sub`/`exp`, role `Owner`                                                                                                                                                                                                                                             | unit                    |
| 6.7                                                                                                                                                            | `session.store.spec.ts`: `me` 500 keeps session and falls back to email; retried once on next `NavigationEnd`                                                                                                                                                                                                                                      | integration             |
| 6.8, 6.9                                                                                                                                                       | `restore.spec.ts`: no token means no request; token means one refresh before the initializer resolves; `401` clears token; 503 / network keep the token and leave `anonymous`                                                                                                                                                                      | integration             |
| 6.10                                                                                                                                                           | `logout.spec.ts`: one `logout` call with the stored token, state cleared, `/login`, failure of the call is silent, no call without a token                                                                                                                                                                                                         | integration             |
| 7.1, 7.9                                                                                                                                                       | `refresh-schedule.spec.ts` (pure `refreshDelayMs` table) and `scheduler.spec.ts`: fires at exp minus 60 s with fake timers; recompute on `visibilitychange`; 5 s minimum gap; cleared on logout                                                                                                                                                    | unit                    |
| 7.2                                                                                                                                                            | `session.store.spec.ts`: refresh writes the new refresh token to storage before state changes (order asserted with a spy)                                                                                                                                                                                                                          | unit                    |
| 7.3, 7.4                                                                                                                                                       | `auth.interceptor.spec.ts`: 401 then refresh then retry succeeds; five concurrent requests with 401 produce `counters.refresh === 1`; a retried `401` ends the session and refreshes only once                                                                                                                                                     | integration             |
| 7.5                                                                                                                                                            | same: a request with a token expiring in 5 s waits for refresh first                                                                                                                                                                                                                                                                               | integration             |
| 7.6                                                                                                                                                            | same: no retry of refresh on 503/network; refresh carries no `Authorization`                                                                                                                                                                                                                                                                       | integration             |
| 7.7, 7.8                                                                                                                                                       | `refresh-failure.spec.ts`: 401 clears; 503, network, timeout keep the stored token and show the banner; 429 does not clear and blocks a second attempt before `Retry-After`                                                                                                                                                                        | integration             |
| 8.1                                                                                                                                                            | `auth.interceptor.spec.ts`: no bearer on the four auth endpoints or other origins                                                                                                                                                                                                                                                                  | integration             |
| 8.2, 8.3                                                                                                                                                       | `session-ender.spec.ts`: navigation to `/login?reason=session-expired&returnUrl=...`; none when already on `/login`; five simultaneous failures give one navigation and one toast                                                                                                                                                                  | integration             |
| 8.4                                                                                                                                                            | `safe-return-url.spec.ts`: the full accept and reject list of Req 8.4, plus a percent-encoded `//` and malformed `%`                                                                                                                                                                                                                               | unit                    |
| 8.5                                                                                                                                                            | `auth.interceptor.spec.ts`: `403` leaves the session and shows no redirect                                                                                                                                                                                                                                                                         | integration             |
| 9.1 to 9.4, 9.6, 9.9 (incl. `reason` routing: `expired` goes to `/login?reason=session-expired&returnUrl=...`, `logout` to plain `/login`, `invalid` no toast) | `cross-tab.spec.ts`: two store instances with `fake-channel` sharing a lock: simultaneous restore gives one refresh and both authenticated; refresh in A is adopted by B without a request; logout in A clears B; `storage` event removal clears B; own and invalid messages ignored; the reuse scenario never occurs (backend family not revoked) | integration             |
| 9.5                                                                                                                                                            | same: login in A authenticates anonymous B                                                                                                                                                                                                                                                                                                         | integration             |
| 9.7                                                                                                                                                            | `cross-tab-fallback.spec.ts`: delete `navigator.locks` and `BroadcastChannel`, one warning, serial refreshes, no crash                                                                                                                                                                                                                             | unit                    |
| 9.8                                                                                                                                                            | same: held lock for more than 15 s rejects the waiter with `timeout`                                                                                                                                                                                                                                                                               | unit                    |
| 10.1 to 10.4, 10.6                                                                                                                                             | `guards.spec.ts`: full matrix of status (including `unknown` that resolves later) by role by required role, `UrlTree` targets, toast on role mismatch, `landingRouteFor`                                                                                                                                                                           | unit                    |
| 10.2, 10.7                                                                                                                                                     | `post-login-target.spec.ts`: `roleCanOpen` per role and area, `resolvePostLoginTarget` for safe, unsafe, wrong-role and absent `returnUrl`; drift test walking `app.routes.ts`; `guestGuard` redirects an authenticated user to a safe returnUrl the role may open and otherwise to the landing route                                              | unit                    |
| 10.8, 11.3                                                                                                                                                     | `landing-cta.spec.ts`: anonymous set versus each role; public shell header shows "Go to my dashboard" when signed in                                                                                                                                                                                                                               | unit/component          |
| 10.5                                                                                                                                                           | covered by the guards matrix comment plus Known gaps; no separate test                                                                                                                                                                                                                                                                             |                         |
| 11.1, 11.2                                                                                                                                                     | `routes.spec.ts`: `RouterTestingHarness` navigates to each path as anonymous, Customer, Staff and Admin and asserts the final URL and heading                                                                                                                                                                                                      | integration             |
| 11.3 to 11.6, 11.10                                                                                                                                            | `*-shell.spec.ts`: stub `matchMedia`; customer shows bottom tabs below 768 and top links above; admin collapse persists across re-render (`safeGet`), drawer opens below 1024 and returns focus; skip link first in tab order; one `main`, labelled `nav`s; sign out calls `logout`; menus close on Escape                                         | component               |
| 11.12                                                                                                                                                          | `admin-shell.spec.ts`: no button while `available()` is false; button with `kbd` when true; click increments `requests`; F1 never sets `available`                                                                                                                                                                                                 | component               |
| 11.7, 11.13, 11.8                                                                                                                                              | `title-and-progress.spec.ts`: title strategy suffix, string and function titles, empty and throwing function titles fall back to the app name, announcer text, progress bar appears after 150 ms only                                                                                                                                              | component               |
| 11.9                                                                                                                                                           | CI `pnpm size` (F0 Req 5.3) and a build check that `core` chunks contain no feature code; manual review of `stats`                                                                                                                                                                                                                                 | build                   |
| 12.1 to 12.5                                                                                                                                                   | `not-found.spec.ts`: unknown path renders the page in the public shell (anonymous) and in the matching shell per role; link target; `noindex` meta added and removed; URL not echoed                                                                                                                                                               | integration             |
| 13.8 to 13.11                                                                                                                                                  | `calendar-date.spec.ts`, `zone-math.spec.ts`, `branch-time.spec.ts`: every case of Req 13.11 (rollover, leap day, DST week `diffDays`, midnight edges ahead/behind the process zone, gap and fold in London, New York, Auckland, Kolkata, open at `opensAt` and closed at `closesAt`, `no-schedule`, invalid zone warns once)                      | unit                    |
| 13.1 to 13.5                                                                                                                                                   | `time.spec.ts`: all listed cases, including DST boundary instants for `Europe/London`, `Asia/Kolkata`, `Pacific/Auckland`, `America/New_York`, invalid zone fallback with a single warning                                                                                                                                                         | unit                    |
| 13.6                                                                                                                                                           | `eslint-rules.spec.mjs`: lint a string with `new Date(x)`, `toLocaleString()` and `DatePipe` import in a fake path outside and inside `core/time`                                                                                                                                                                                                  | node unit               |
| 14.1 to 14.4                                                                                                                                                   | `auth-backend.spec.ts`: rotation, revoked token revokes family (latest also fails), unknown/expired 401, counters, echoed correlation id, error content type                                                                                                                                                                                       | unit                    |
| 14.5                                                                                                                                                           | CI build step `! grep -ri msw dist/` (F0 `docker` job style)                                                                                                                                                                                                                                                                                       | build                   |
| 14.6, 14.7                                                                                                                                                     | covered by the suite conventions above and the named single-flight, reuse and exp minus 60 s tests                                                                                                                                                                                                                                                 |                         |
| 14.8                                                                                                                                                           | `e2e/session.spec.ts` (Playwright, `page.route`, no backend): anonymous `/book` redirect with `returnUrl=%2Fbook`; reload with stored refresh token restores and lands on the role page; refresh `401` clears the session and shows `/login`                                                                                                       | e2e                     |

Reuse scenario (Req 14.7): a test configures a client that "wrongly" retries the consumed token by calling the API's `refresh` twice with the same stored token through the real stack; the second call returns `401`, the backend family is revoked, and the store ends `anonymous`.

## Traceability

| Requirement                                         | Design sections                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------ |
| 1 Typed API layer                                   | API generation and services                                              |
| 2 HTTP pipeline                                     | HTTP pipeline; Overview 1, 2                                             |
| 3 Error normalization, toasts                       | `AppError` and normalization; Toasts                                     |
| 4 Countdown (one `RateLimitNotice`)                 | Retry-After countdown                                                    |
| 5 Outage banner                                     | Outage banner; HTTP pipeline (error interceptor)                         |
| 6 Session and storage                               | Session state machine; Token storage; JWT decode; Restore initializer    |
| 7 Refresh                                           | Refresh scheduler; Refresh coordinator; HTTP pipeline (auth interceptor) |
| 8 Session end, `safeReturnUrl`                      | Session end and logout; Guards and landing                               |
| 9 Cross-tab                                         | Cross-tab; Refresh coordinator; Overview 3                               |
| 10 Guards, landing, post-login target, landing CTAs | Guards and landing                                                       |
| 11 Shells, routes, palette hook, function titles    | Route table and shells (Palette hook); Overview 6, 7                     |
| 12 404                                              | Route table and shells (`NotFoundHost`)                                  |
| 13 Time (incl. calendar, zone and branch helpers)   | Time utilities                                                           |
| 14 Testability                                      | Test doubles; Testing strategy                                           |

## Downstream amendments

Approved after the F3, F4 and F5 designs; each is already merged into the sections above.

1. **`core/time` helpers** (`calendar-date.ts`, `zone-math.ts`, `branch-time.ts`) replace F3's `features/customer/shared/branch-time.ts` and F5's `core/time` proposals; one `addDays`, one `DayName`. (Req 13.8 to 13.11)
2. **`safe-storage` for both storages** with a memory fallback; F3's private `sessionStorage` wrapper is not needed. (Req 6.12)
3. **`SessionStore.profile()`, `profileStatus()`, `reloadProfile()`** for the F4 profile page. (Req 6.13)
4. **`PaletteLauncher` and the admin shell button**, with F5 owning the palette and Ctrl/Cmd K. (Req 11.12)
5. **Function titles** in `AppTitleStrategy`. (Req 11.13)

## Open questions: resolved

All nine open questions of the first draft were resolved by the user after approval; the sections above already reflect them.

1. **Shell location:** visual frames in `shared/layout/` (and `shared/ui/`); `core/` stays non-visual.
2. **Path casing:** use the generated `paths` keys, match auth endpoints case-insensitively, confirm the real casing after the first `pnpm gen:api` (task 2).
3. **`session-ended` reason:** the broadcast carries `reason`; other tabs follow it (see Cross-tab).
4. **Refresh delay:** `max(0, exp - 60 s - now)`, floored at last refresh + 5 s (Req 7.1; `refreshDelayMs` implements exactly this).
5. **Cross-tab adoption:** wait 1 s for the broadcast, else refresh with the freshly read stored token (Req 9.1).
6. **Assertive error announcements:** drop `AlertAnnouncer` if ngx-sonner supports assertive toasts (checked in the ToastService task, task 7).
7. **`OutageState.recovered`:** added (Req 5.7).
8. **Signed-in header swap:** owned by the public shell via `landingCtas()`.
9. **Staff:** lands on the "coming soon" placeholder.
10. **Absorbed from F2:** `post-login-target.ts`, `landing-cta.ts`, `guestGuard` honouring a safe `returnUrl`, one `RateLimitNotice` announcing at the edges with "Try again in N seconds", `ToastService.showSuccess`, title format "<Page> | Smart Appointments".

## Implementation deviations

Where an assumption of this design proved wrong at implementation time, the option closest to the requirements was taken. Recorded as the tasks were built.

1. **Path casing (resolved Open question 2, task 2).** The gateway's Development OpenAPI documents emit `/api/Auth/login`, `/api/Auth/register`, `/api/Auth/profile` and `/api/Auth/me` (the controller route `api/[controller]`), `/api/Branches...`, `/api/Services...`, `/api/Slots/...`, and lowercase `/api/appointments...` for Booking. `AuthApiService` therefore calls `/api/Auth/...`. The test handlers (task 6) answer both casings, and `isAuthEndpoint` compares case-insensitively as designed.
2. **The generated documents (backend `master`) contain refresh, logout and `accessTokenExpiresAtUtc` (task 2).** `TokenResponse`, `RefreshTokenRequest` and `LogoutRequest` come from the generated schema; `accessTokenExpiresAtUtc` is typed as required, and the session still derives the expiry from `exp` when it is absent (defensive, Req 6.6). The Auth document still gives `register` and `me` no response body ("no content"), so `core/api/models.ts` keeps temporary `RegisterResponse` and `ProfileResponse` extensions (Req 1.6). `JsonBody` / `JsonResponse` in `api-types.ts` are provided, but the services use the named schema types directly.
3. **Node unit tests of `scripts/` (task 2).** `scripts/gen-api.spec.mjs` runs under `node --test` (`pnpm test:scripts`), not Vitest, because the Angular builder only collects `src/**` specs. `gen-api.mjs` exports a `generate()` function so the test injects `fetch`; the CLI path is also tested by running it against a closed port.
4. **lint-staged ignores ignored files (task 2).** The generated `*.d.ts` files are in the ESLint `ignores` list, and ESLint warns on an explicitly passed ignored file, which `--max-warnings 0` turns into a failed commit. The lint-staged ESLint command now passes `--no-warn-ignored`.
