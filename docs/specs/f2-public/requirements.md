# F2 Public (landing, login, register) — Requirements

## Introduction

This spec builds the public, signed-out part of the web client: a marketing landing page, a login page and a registration page, plus the guest-only routing that keeps signed-in users away from them. It lives under `src/app/features/public/` and renders inside the public shell from F1. It refines build phase F2 of the approved frontend plan and serves the backend's `FR-AUTH-001` (register a customer) and `FR-AUTH-002` (log in), as specified in the backend `docs/specs/auth-identity/requirements.md`.

F2 **consumes** F1 and does not redefine it: the F1 session store (login, refresh, logout, the current user and role), the F1 error handling (`AppError {status, message, correlationId}`, toasts, the `Retry-After` reading for a 429), the F1 guards and the F1 role-landing rule (Customer -> `/book`, Admin -> `/admin`, Staff -> `/staff`). Where a criterion below says "the F1 session store" or "the F1 error handling", it relies on that behaviour and tests it with a fake, not by re-testing F1. The pages call the gateway only (`POST /api/auth/register`, `POST /api/auth/login`); the visual language (teal-700 light / teal-400 dark accent, zinc neutrals, Inter, class-based dark mode, Spartan/ui helm components under `shared/ui`) is the F0 theme.

Backend contract this spec relies on (verified against `Auth.Application/Validations/` and the Auth spec):

- Register: `{ firstName, lastName, email, phoneNumber, password }`. `firstName` and `lastName` are required, max 50. `email` is required and a valid address. `phoneNumber` is required and matches `^\+?[1-9]\d{1,14}$`. `password` is at least 8 characters with an uppercase letter (`[A-Z]`), a lowercase letter (`[a-z]`), a digit (`[0-9]`) and a non-word character (`[\W]`). Success is `201`; the account is always a `Customer`. A duplicate email is `400` "Email is already registered." (Auth 1.4, 1.4a).
- Login: `{ email, password }`. Any credential failure (unknown email, inactive account, wrong password) is `401` "Invalid user or password." (Auth 2.3); a missing or malformed field is `400` (Auth 2.4). Success is `200` with the token pair, which F1 stores.
- The gateway limits login to 5 per minute per client address and answers `429` with `Retry-After` (backend CLAUDE.md, BRD 11.5). Every error body is `{status, detail}` as `application/problem+json`; a model-binding `ValidationProblemDetails` may still occur on malformed input, which F1 normalises.

## Decisions

Approved with these decisions:

- **`/` renders for signed-in users** with a "Go to my dashboard" call to action (Req 1.8); only `/login` and `/register` use `guestGuard`.
- **Password special-character rule** is `[^\p{L}\p{Mn}\p{Nd}\p{Pc}]` with the `u` flag, the exact complement of .NET's `\w` (`[\p{L}\p{Mn}\p{Nd}\p{Pc}]`); the checklist says an underscore does not count (Req 3.4, 3.6, Known gaps).
- **After registration the user always lands on `/book`**; a `returnUrl` is not used on that path (Req 3.9).
- **No consent checkbox** on the register form; there is no legal content (Req 3, Out of scope).
- **The phone number is normalised** (spaces, dashes and parentheses removed) before it is sent (Req 3.5).
- **The login `401` message is a fixed client string**, never the server `detail` (Req 2.7).
- **`safeReturnUrl` and `guestGuard` belong to F1** (F1 Requirements 8.4 and 10.2); F2 consumes them (Req 4.1, 5.1). F1 navigates to `/login?reason=session-expired&returnUrl=...` when a session ends, matching Req 2.13.
- **The gzip budget for the three lazy chunks is 50 kB** (Req 7.5), raised from 40 kB because `@angular/forms` is lazy.
- **Titles use the format `<Page> | Smart Appointments`**, matching F1.
- **Register success** redirects a failed auto-login to `/login?reason=registered&email=...`, and the "account created" notice shows only for `reason=registered` (Req 2.12, 3.9).
- **A post-login navigation that resolves `false`** falls back to `landingRouteFor(role)` (Req 2.11).
- **F1 owns** `post-login-target.ts`, `landing-cta.ts`, the shared countdown component, `ToastService.showSuccess` and the `guestGuard` safe-`returnUrl` behaviour; F2 consumes them.
- **Landing copy** may mention booking and cancelling; both ship in v1.

## Requirements

### Requirement 1: Landing page (no FR-ID)

**User Story:** As a visitor, I want a clear, attractive page that explains what Smart Appointments does and how to start, so that I can decide to register or log in.

_(No FR-ID: the page is marketing content; the BRD has no requirement for it. Its calls to action lead to FR-AUTH-001 and FR-AUTH-002.)_

#### Acceptance Criteria

1. WHEN an anonymous visitor opens `/`, THEN the system SHALL render the landing page inside the public shell, with the document title `Book your next appointment | Smart Appointments` and exactly one `<h1>`.
2. The page SHALL contain, in this order: a hero (headline, one supporting sentence, a primary "Create an account" button linking to `/register` and a secondary "Log in" button linking to `/login`), a value-propositions section of three to four items (each an icon, a short title and one sentence), a "How it works" section of three numbered steps (choose a branch and service, pick a time, get confirmed), and a closing call-to-action band repeating the two buttons. Each section SHALL have a heading and be a labelled landmark region.
3. The hero SHALL have a subtle teal-tinted gradient and a low-opacity grain texture implemented in CSS or an inline SVG data URI (no raster image request and no third-party origin, consistent with the F0 CSP `img-src 'self' data:`), and SHALL NOT convey information by that background alone.
4. WHERE the page is shown in dark mode, the gradient, grain, icons, cards and text SHALL use the F0 dark tokens, and every text/background pair SHALL meet 4.5:1 (3:1 for large text and UI components). The page SHALL NOT use `teal-600` for body-size text on a light background.
5. WHILE the viewport is narrower than 640 px, the system SHALL stack the hero and the sections in one column, keep both hero buttons reachable, and show no horizontal page scroll down to a 320 px width.
6. WHILE the user has `prefers-reduced-motion: reduce`, the page SHALL show no entrance, parallax or looping animation (content is visible immediately and static). WHERE motion is not reduced, entrance effects SHALL be limited to opacity and transform transitions of 400 ms or less and SHALL NOT delay content from being readable.
7. The landing page SHALL make no API call.
8. IF the visitor is signed in (per the F1 session store), THEN `/` SHALL still render the landing page, and the header, hero and closing-band calls to action SHALL read "Go to my dashboard" and link to the role landing route instead of showing "Log in" and "Create an account".
9. The page SHALL provide a "Skip to main content" link as the first focusable element, a visible focus ring on every interactive element, and the F0 theme toggle in the header.

### Requirement 2: Login page (FR-AUTH-002)

**User Story:** As a registered user, I want to log in with my email and password, so that I can reach my part of the app.

#### Acceptance Criteria

1. WHEN an anonymous visitor opens `/login`, THEN the system SHALL render the login page with the title `Log in | Smart Appointments` and a single `<h1>` "Welcome back".
2. WHERE the viewport is 1024 px wide or more, the page SHALL be split-screen: the form on one half, and on the other an illustration panel (inline SVG, decorative, `aria-hidden="true"`, teal accent, theme-aware). WHILE the viewport is narrower, the illustration panel SHALL be hidden and the form SHALL fill the width.
3. The form SHALL have an email field (`type="email"`, `autocomplete="username"`, `inputmode="email"`) and a password field (`autocomplete="current-password"`), each with a visible `<label>`, and a "Log in" submit button. It SHALL link to `/register` ("New here? Create an account") and, through the brand mark, to the landing page.
4. The password field SHALL have a show/hide button with the accessible name "Show password" / "Hide password" and `aria-pressed` reflecting the state, and SHALL default to hidden each time the page is opened. Toggling SHALL keep the caret position and the typed value.
5. WHEN the form is submitted with an empty email, a malformed email or an empty password, THEN the system SHALL NOT call the API, SHALL show these messages under the fields: "Email is required." / "Enter a valid email address." / "Password is required.", and SHALL move focus to the first invalid field. (Mirrors `LoginUserRequestValidator`; the login form does NOT apply the register password-strength rules.)
6. WHEN the form is valid and submitted, THEN the system SHALL call the F1 session store's login once with the trimmed email and the unmodified password. WHILE the call is pending, the submit button SHALL be disabled, show a spinner and carry `aria-busy="true"`, the fields SHALL be read-only, and a second submit (click or Enter) SHALL NOT start a second call.
7. IF login fails with `401`, THEN the system SHALL show the single inline message "Invalid email or password." in a `role="alert"` region above the form, keep the typed email, clear the password field, return focus to the password field, and NOT indicate which of the two was wrong. The message SHALL NOT be built from the server `detail`, so a changed server message cannot leak account state. A toast SHALL NOT be shown in addition.
8. IF login fails with `400` (a malformed field that client validation should have caught), THEN the system SHALL show the F1 normalised message inline in the same alert region.
9. IF login fails with `429`, THEN the system SHALL disable the submit button and show "Too many attempts. Try again in N seconds." in the alert region, where N is the `Retry-After` value from the F1 error handling and counts down once per second; WHEN N reaches 0, THEN the button SHALL be enabled again and the message replaced by "You can try again now." The countdown SHALL be rendered by F1's shared countdown component and SHALL NOT be announced every second: assistive technology hears the initial message once and the final one once. IF `Retry-After` is missing or not a positive integer, THEN the system SHALL use 60 seconds (the gateway's constant).
10. IF login fails with a network error or `502`/`503`/`504`, THEN the system SHALL show the F1 "service temporarily unavailable" message inline, re-enable the form, and keep both typed values.
11. WHEN login succeeds, THEN the system SHALL navigate to the validated `returnUrl` (Requirement 4) if there is one that the signed-in role may open, otherwise to the role landing route (Customer -> `/book`, Admin -> `/admin`, Staff -> `/staff`, from F1); IF a navigation resolves `false`, THEN the system SHALL fall back to `landingRouteFor(role)`. The navigation SHALL use `replaceUrl` so the Back button does not return to the login form.
12. WHERE the user arrives from a failed auto-login after registration (Requirement 3.9), the URL SHALL be `/login?reason=registered&email=<email>`, the email field SHALL be prefilled from the `email` query parameter, focus SHALL start on the password field, and the info message "Your account was created. Log in to continue." SHALL be shown ONLY WHEN `reason=registered` (an `email` parameter alone prefills the field silently). The password SHALL never be passed through the URL, history state or storage.
13. IF the user arrives with `?reason=session-expired` (set by F1 when a refresh fails), THEN the system SHALL show "Your session has ended. Log in again." as an info message above the form.

### Requirement 3: Register page (FR-AUTH-001)

**User Story:** As a prospective customer, I want to create an account with my name, email, phone number and a password, so that I can book appointments.

#### Acceptance Criteria

1. WHEN an anonymous visitor opens `/register`, THEN the system SHALL render the register page, with the title `Create your account | Smart Appointments`, a single `<h1>` "Create your account", the same split-screen layout and illustration behaviour as Requirement 2.2, and a link to `/login` ("Already have an account? Log in").
2. The form SHALL have these fields, each with a visible `<label>`, in this order, with these `autocomplete` values: First name (`given-name`), Last name (`family-name`), Email (`email`), Phone number (`tel`), Password (`new-password`). On widths of 640 px or more, first and last name MAY share a row. The password field SHALL have the show/hide control of Requirement 2.4.
3. The form SHALL NOT contain a role field or any way to choose a role, and the request body SHALL contain exactly `firstName`, `lastName`, `email`, `phoneNumber` and `password` (registration creates Customers only, Auth 1.1).
4. The client SHALL validate with these rules, which mirror `RegisterCustomerCommandValidator` and are defined once in a pure function used by the form and by its unit tests:
   - first name and last name: after trimming, non-empty ("First name is required." / "Last name is required.") and at most 50 characters ("First name cannot exceed 50 characters." / "Last name cannot exceed 50 characters."); the inputs SHALL carry `maxlength="50"`;
   - email: non-empty ("Email is required.") and a valid address ("Enter a valid email address.");
   - phone number: non-empty ("Phone number is required.") and, after removing spaces, dashes and parentheses, matching `^\+?[1-9]\d{1,14}$` ("Enter the number in international format, for example +14155550123.");
   - password: at least 8 characters, with an uppercase letter, a lowercase letter, a digit and a non-word character (see Known gaps for the exact non-word definition).
5. The phone field SHALL show a persistent hint "International format, for example +14155550123" associated with the input by `aria-describedby`, SHALL use `type="tel"` and `inputmode="tel"`, and WHEN the form is submitted, THEN the system SHALL send the value with spaces, dashes and parentheses removed, so the backend's E.164 pattern is satisfied by what the user typed in a friendlier form.
6. Below the password field the page SHALL show a live checklist of the five password rules (at least 8 characters; an uppercase letter; a lowercase letter; a digit; a special character, noting that `_` does not count). Each item SHALL update on every keystroke and be conveyed by an icon plus text and an accessible state ("met" / "not met"), never by colour alone. The checklist SHALL be associated with the password input by `aria-describedby`. The list SHALL NOT be an `aria-live` region updated on every keystroke; instead a single polite status SHALL announce "All password requirements met" when the last rule becomes satisfied.
7. Field errors SHALL be shown only after the field has been blurred or a submit was attempted (not while the user is still typing for the first time), SHALL be placed under the field, SHALL be linked with `aria-describedby` and `aria-invalid="true"`, and SHALL clear as soon as the value becomes valid. WHEN a submit is attempted while any field is invalid, THEN the system SHALL NOT call the API and SHALL move focus to the first invalid field in DOM order.
8. WHEN the form is valid and submitted, THEN the system SHALL call `POST /api/auth/register` once. WHILE the call is pending, the submit button SHALL be disabled with a spinner and `aria-busy="true"`, the fields SHALL be read-only, and a second submit SHALL NOT start a second call.
9. WHEN registration returns `201`, THEN the system SHALL immediately call the F1 session store's login with the same email and password, and IF that succeeds THEN navigate to `/book` (`replaceUrl`) and show a success toast "Welcome, {firstName}! Your account is ready." The password SHALL be discarded after the login attempt. IF the login attempt fails for any reason, THEN the system SHALL navigate to `/login?reason=registered&email=<the registered email>` (Requirement 2.12) and SHALL NOT show the register form again. (A valid `returnUrl` is not used here: a new customer always lands on `/book`, see Decisions.)
10. IF registration returns `400` with the detail "Email is already registered.", THEN the system SHALL show a message under the email field ("An account with this email already exists." with a link "Log in instead" to `/login?email=<email>`), set `aria-invalid` on the email field, move focus to it, keep every typed value, and NOT also show a toast.
11. IF registration returns any other `400`, THEN the system SHALL show the F1 normalised `detail` inline in a `role="alert"` region at the top of the form (the backend joins every failed rule into one message), keep every typed value, and move focus to the region.
12. IF registration fails with a network error or `502`/`503`/`504`, THEN the system SHALL show the F1 "service temporarily unavailable" message inline, re-enable the form and keep all typed values, including the password. IF it fails with `429`, THEN the system SHALL apply the same disabled-with-countdown behaviour as Requirement 2.9.
13. WHEN registration has returned `201`, THEN the pending state of criterion 8 SHALL stay until the navigation of criterion 9 completes, so a double click or a late Enter cannot create a second request.
14. The register page SHALL NOT log, store or place in the URL the password, and SHALL NOT keep it in any state beyond the form control's lifetime.

### Requirement 4: Safe return URL (no FR-ID)

**User Story:** As a user who was sent to log in from a protected page, I want to land back where I was going, so that logging in does not lose my place, without letting a crafted link send me to another site.

_(No FR-ID: this is a frontend security concern. The F1 guards add `returnUrl`; F2 consumes it.)_

#### Acceptance Criteria

1. The login page SHALL turn the `returnUrl` query parameter into a navigation only through F1's `safeReturnUrl` (F1 Requirement 8.4, which owns its rules and unit tests). F2 SHALL NOT define its own check.
2. (Merged into F1 Requirement 8.4.)
3. (Merged into F1 Requirement 8.4.)
4. WHEN login succeeds AND `safeReturnUrl` returns a path, THEN the system SHALL navigate to it only IF the signed-in role is allowed to open it according to the F1 route guards; IF the guard would redirect (for example a customer with `returnUrl=/admin`), THEN the user SHALL be sent to the role landing route instead of seeing a forbidden page.
5. IF `returnUrl` is absent or rejected, THEN the system SHALL silently use the role landing route; a rejected value SHALL NOT be echoed in the page or logged.
6. WHEN the login page links to `/register` (or the register page to `/login`), THEN the system SHALL carry a `returnUrl` across the link only if it already passed `safeReturnUrl`. (After a successful registration the user lands on `/book`; carrying the value serves the failed-auto-login path through the login page.)

### Requirement 5: Guest-only routes (FR-AUTH-002)

**User Story:** As a signed-in user, I want `/login` and `/register` to take me straight to my landing page, so that I do not see an irrelevant login form.

#### Acceptance Criteria

1. The routes `/login` and `/register` SHALL be protected by F1's `guestGuard` (F1 Requirement 10.2); F2 adds only the safe-`returnUrl` redirect of criterion 3 to it if F1 does not already do so. `/` SHALL NOT use it (Requirement 1.8).
2. WHEN a user who is signed in per the F1 session store opens `/login` or `/register`, THEN the guard SHALL return a `UrlTree` for that user's role landing route (Customer -> `/book`, Admin -> `/admin`, Staff -> `/staff`) and the form SHALL NOT render, not even for one frame.
3. WHEN a signed-in user opens `/login?returnUrl=/appointments`, and `safeReturnUrl` accepts it, and the role may open it, THEN the guard SHALL redirect to that path instead of the landing route.
4. WHILE the F1 session store is still restoring the session at start (a stored refresh token exists and the first refresh is in flight), the guard SHALL wait for that restore to finish (with the F1 timeout) before deciding, so a reload of `/login` by a signed-in user does not flash the form. IF the restore fails, THEN the user SHALL be treated as signed out and the form SHALL render.
5. WHEN a user is signed out, THEN the guard SHALL allow the route.
6. All three routes SHALL be lazy-loaded (`loadComponent`) from `app.routes.ts` as separate chunks, so the initial bundle is not enlarged by a page the visitor never opens.
7. The routes SHALL set `title` in route data (Requirement 6.1). An unknown path is handled by F1's not-found route, not by F2.

### Requirement 6: Accessibility and page titles (no FR-ID)

**User Story:** As a user of assistive technology or a keyboard, I want the public pages to be fully usable, so that I can register and log in without a mouse or sight.

_(No FR-ID: WCAG 2.2 AA is the plan's quality bar; the F6 phase audits the whole app, F2 is expected to pass for its own pages.)_

#### Acceptance Criteria

1. The route titles SHALL be `Book your next appointment | Smart Appointments` (landing), `Log in | Smart Appointments` and `Create your account | Smart Appointments`, set through the router `title` property so each navigation updates `document.title`. WHEN the route changes, THEN the new title SHALL be announced (by the F1 shell's route announcer or a live region added here) and focus SHALL move to the page's `<h1>` or `<main>` (`tabindex="-1"`), not stay on the previous link.
2. Every form control SHALL have a programmatically associated visible `<label>`; placeholders SHALL NOT be the only label. Required fields SHALL be marked visually and with `aria-required="true"`; the forms SHALL use `novalidate` so the app's messages replace the browser's.
3. WHEN a field is invalid, THEN the system SHALL set `aria-invalid="true"` and link the error element by `aria-describedby` (together with any hint, such as the phone hint or the password checklist); error text SHALL NOT be conveyed by colour alone.
4. WHEN a submit fails client validation, THEN focus SHALL move to the first invalid field. WHEN a server error is shown in the alert region, THEN that region SHALL carry `role="alert"` so it is announced once, and SHALL NOT be re-announced on unrelated re-renders.
5. Every interactive element SHALL be reachable and operable with the keyboard in a logical DOM order, show a focus indicator of at least 3:1 contrast that is not hidden by a sticky header (WCAG 2.4.11), and have a target size of at least 24 x 24 CSS px (WCAG 2.5.8); the show/hide password button and the theme toggle SHALL be at least 40 x 40 px on touch viewports.
6. The pages SHALL NOT block paste on the password or email fields (WCAG 3.3.8 Accessible Authentication) and SHALL allow password managers to fill (the `autocomplete` values above; no `autocomplete="off"`).
7. The pages SHALL be usable at 200% zoom and at a 320 px width without loss of content or two-dimensional scrolling (WCAG 1.4.10), in both themes.
8. The illustration panel and every decorative icon SHALL be `aria-hidden="true"`; informative icons (checklist state) SHALL have text alternatives.
9. A unit test (Vitest + Angular Testing Library, queries by role and label) SHALL cover each form's labels, `aria-invalid`, `aria-describedby` wiring and first-invalid focus; a Playwright test with `@axe-core/playwright` SHALL run on `/`, `/login` and `/register` in light and dark and fail on any `serious` or `critical` violation. (The full audit remains F6.)

### Requirement 7: Tests and delivery (no FR-ID)

**User Story:** As a maintainer, I want the public pages covered by unit and end-to-end tests that need no backend, so that CI proves the flows and regressions are caught.

#### Acceptance Criteria

1. Component tests SHALL fake the F1 session store and use MSW for the register call (the F0 setup has `onUnhandledRequest: 'error'`), and cover: every client validation message of Requirements 2.5 and 3.4; pending state and double-submit protection (2.6, 3.8); the 401 inline message with the password cleared (2.7); the 429 countdown with `Retry-After` of 3, missing and invalid values, using Vitest fake timers (no zone-based `fakeAsync`) (2.9); the duplicate-email handling (3.10); other 400s (3.11); the auto-login success path to `/book` and the failed-auto-login path to `/login?reason=registered&email=` (3.9); the password checklist for each rule, including that `_` alone does not satisfy the special-character rule (3.6).
2. The pure functions (`safeReturnUrl`, the register validation rules, the phone normaliser) SHALL have table-driven unit tests, including the rejected inputs of Requirement 4.3 and, for the password, the boundary cases `Abcdefg1!` (valid), `Abcdefg1_` (invalid, `_` is a word character), `abcdefg1!` (no uppercase), `ABCDEFG1!` (no lowercase), `Abcdefgh!` (no digit), `Abcdefg1` (no special), `Abc1!` (too short).
3. The guard SHALL have unit tests for: signed in with and without a valid `returnUrl`, signed out, and session restore pending then resolved (5.2 to 5.5).
4. The Playwright suite, with mocked API responses (route interception; no backend), SHALL cover: register success then arrival on `/book`; register with a duplicate email; login success for a Customer, an Admin and a Staff user landing on `/book`, `/admin` and `/staff`; login `401`; login `429` with a countdown (fake clock); `returnUrl=/appointments` honoured and `returnUrl=https://evil.example` ignored; a signed-in visit to `/login` redirected; keyboard-only completion of both forms; the axe checks of Requirement 6.9.
5. The three lazy chunks SHALL together add no more than 50 kB gzipped (reported by `pnpm size`), and the F0 budgets SHALL still pass.
6. WHERE a real backend is available (the Compose stack), a documented manual check SHALL register a new customer, log in and reach `/book`, and SHALL send six rapid wrong-password logins to see the `429` countdown.

## Out of scope

- **Password reset, forgot-password, change password** and **email verification**: the backend has none (Auth spec, Out of scope).
- **Social login or SSO**, magic links and multi-factor authentication.
- **Staff and admin creation**: registration creates Customers only; there is no endpoint for the other roles. Staff and Admin accounts can log in through the same page (Auth 2.2).
- **"Remember me"** and session-length choices: session lifetime is the F1 refresh-token behaviour, not a per-login option.
- **Terms of service, privacy policy and cookie banners**: no legal content exists, so the register page has no consent checkbox.
- **Marketing content beyond one page**: no pricing, blog, contact or FAQ pages; no analytics.
- **The profile screen, logout button and session handling** (F1 provides the session; the profile is F4).
- **Account-enumeration hardening of registration**: the backend deliberately reveals a duplicate email (Auth 1.4), and the page follows that contract.
- **Translations**: English only.

## Known gaps

- **Registration reveals whether an email is registered.** This is the backend's contract (`400` "Email is already registered."), and Requirement 3.10 depends on it. It enables account enumeration, bounded only by gateway limits; login stays uniform. A neutral "check your inbox" flow needs email verification, which does not exist.
- **Registration is not rate limited at the gateway.** The backend limits login (5/min), `POST /api/appointments` and slot search, but not `POST /api/auth/register`, so the 429 branch of Requirement 3.12 is defensive and cannot be exercised end to end until a backend limit exists.
- **Backend `\W` is Unicode-aware, JavaScript's is ASCII-only.** .NET's `[\W]` treats an accented letter such as `é` as a word character (it does not satisfy the special-character rule), while a naive JS `\W` treats it as non-word. The client rule SHALL use the Unicode-aware equivalent `[^\p{L}\p{Mn}\p{Nd}\p{Pc}]` with the `u` flag; a mismatch would surface as a server `400` that the client had accepted. An underscore is a word character in both, which the checklist states. The `[A-Z]`, `[a-z]` and `[0-9]` rules are ASCII-only on both sides.
- **Client email validation can differ from `EmailAddress()`.** FluentValidation and the browser or Angular check differ at the edges (for example quoted local parts); a rare address can pass the client and fail on the server, which Requirement 3.11 covers with the inline alert.
- **A failed auto-login after a successful registration is not diagnosed.** The account exists but the login returned an error (`401`, `429`, `5xx`); Requirement 3.9 sends the user to the login page with their email and they retype the password.
- **The server joins every failed rule into one `detail` string** (Auth 1.3), so server-side field-level messages cannot be reliably parsed; the page shows the string as one alert and does not try to map it to fields.
- **Two tabs logging in at once** is handled by the F1 session store, not by these pages.
- **`returnUrl` is not signed.** It is validated as a same-app relative path (Requirement 4), which prevents open redirects, but a user can still be sent to any in-app path the guards allow.
- **Illustration and hero art are placeholders** (inline SVG and CSS drawn for this spec); commissioned art is a content task, not a code one.
- **The 50 kB gzip figure in Requirement 7.5 is an estimate** until the pages exist; the design records the measured value.
