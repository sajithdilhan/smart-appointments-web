# F2 Public (landing, login, register) — Tasks

<!--
Rules (from the template):
- Coding steps only; each task cites the requirement numbers it implements.
- Each task is small enough to finish and test in one sitting and leaves
  `pnpm lint && pnpm test && pnpm build` green.
- A box is checked only when the code exists and those three commands pass, in the same commit as the code.
-->

**Prerequisite.** F2 starts after these F1 pieces exist and are tested: `SessionStore` (with `login`, `status`, `role`), `AuthApiService.register`, `AppError` and the error interceptor, `ToastService.showSuccess`, `createRetryCountdown` and the shared countdown component, `safeReturnUrl`, `landingRouteFor`, `resolvePostLoginTarget`/`roleCanOpen`, `landingCtas()`, `guestGuard` (with the safe-`returnUrl` redirect), the public shell with its route announcer and the F1 MSW auth handlers (`src/testing/handlers/auth.handlers.ts`). F2 consumes them and builds none of them; if one is missing, finish it in F1 first.

**Where code lands.** The generic form pieces (form field, field a11y directive, field view, first-invalid focus, form alert, generic field rules, validators and `normalizePhone`) are built in `src/app/shared/forms/` so F5's admin forms reuse them. F2-specific code (password rules and checklist, show/hide password field, F2 messages, error mappers, forms, auth layout) stays in `src/app/features/public/`.

- [x] 1. Route entries, titles and lazy page stubs
  - Add `features/public/titles.ts` with the three titles: `Book your next appointment | Smart Appointments`, `Log in | Smart Appointments`, `Create your account | Smart Appointments`.
  - Add `features/public/public.routes.ts` with the `/`, `/login` and `/register` entries (each its own `loadComponent`, `title` from `titles.ts`, `guestGuard` on the last two) and register them in the F1 public shell children, replacing F1's placeholder entries.
  - Create minimal `LandingPage`, `LoginPage` and `RegisterPage` components, each with a single `<h1 appFocusHeading>` placeholder text, so the routes resolve.
  - Route-config spec: three `loadComponent` entries, guards, titles from `titles.ts`.
  - _Requirements: 5.1, 5.6, 5.7, 6.1_

- [x] 2. Generic field rules, password rules and messages
  - In `shared/forms/`: `phone.ts` (`normalizePhone` removing spaces, dashes and parentheses; `isE164`), `field-rules.ts` (required, max length, email, E.164 phone) and `validators.ts` (`ValidatorFn` wrappers, required checked first).
  - In `features/public/validation/`: `password-rules.ts` (`PASSWORD_RULES`, `evaluatePasswordRules`, `passwordIsValid`) with the special rule `/[^\p{L}\p{Mn}\p{Nd}\p{Pc}]/u`, `password-validator.ts`, and `messages.ts` (F2's validation strings).
  - Table-driven specs: the password boundary list (`Abcdefg1!`, `Abcdefg1_`, `abcdefg1!`, `ABCDEFG1!`, `Abcdefgh!`, `Abcdefg1`, `Abc1!`), `é` and `_` not special, `€`, space and `!` special, phone cases (`+14155550123`, `(415) 555-0123` after normalising, `0123`, `+0123`, 16 digits), name 50/51 characters, email cases.
  - _Requirements: 2.5, 3.4, 3.5, 3.6, 7.2_

- [x] 3. Heading focus directive
  - (Stays in `shared/a11y/`, already shared.)
  - `shared/a11y/focus-heading.directive.ts` (`h1[appFocusHeading]`: `tabindex="-1"`, no outline, focuses after render when `router.navigated` is true, `preventScroll`).
  - Spec: focus moves after an in-app navigation and not on the first load.
  - _Requirements: 6.1_

- [x] 4. Field view, field a11y directive and form field (in `shared/forms/`)
  - `shared/forms/field-view.ts` (`controlState` over `control.events`, `createFieldView` with `submitAttempted`, optional `serverError`, `extraDescribedBy`).
  - `shared/forms/field-a11y.directive.ts` (`aria-invalid`, `aria-describedby`, `aria-required`) and `shared/forms/form-field.component.ts` (label, hint, error with icon, `errorAction` slot, ids `{id}-hint` and `{id}-error`).
  - `shared/forms/focus-first-invalid.ts` (`afterNextRender` focus of the first `[aria-invalid="true"]`).
  - Specs (colocated in `shared/forms/`): error appears only after blur or submit and clears when valid, a server error wins and clears on edit, every `aria-describedby` id resolves to an element, first-invalid focus in DOM order.
  - _Requirements: 3.7, 6.2, 6.3, 6.4_

- [x] 5. Form alert (shared) and password field (F2)
  - `shared/forms/form-alert.component.ts` (stable `role="alert"` / `role="status"` region, `tabindex="-1"`, `focus()`, optional reference line).
  - `features/public/auth/password-field.component.ts` (input plus a 40 px show/hide button with `aria-label` and `aria-pressed`, default hidden, keeps value and restores the selection on toggle, read-only while pending, no paste blocking).
  - Specs: toggle name and pressed state, value and caret kept, alert role per tone and re-render does not duplicate the message.
  - _Requirements: 2.4, 6.4, 6.5, 6.6_

- [x] 6. Auth layout and illustration
  - `auth/auth-layout.component.ts` (two columns from `lg`, form slot, `aria-hidden` illustration panel hidden below `lg`, deep-teal gradient and grain, no text on the panel).
  - `auth/auth-illustration.component.ts` (inline SVG, variants `login` and `register`, `focusable="false"`).
  - Spec: panel is `aria-hidden` and has the responsive hiding classes; form slot renders.
  - _Requirements: 2.2, 3.1, 6.8_

- [x] 7. Login error mapping
  - `login/login.form.ts` (typed `FormGroup`, validators, messages) and `login/login-error.ts` (`mapLoginError(AppError): Outcome` per the design table).
  - Table-driven spec: `401` gives the fixed "Invalid email or password." and never reads `detail`; `400`, `429`, `502/503/504`, network, timeout, other 5xx with reference, anything else.
  - _Requirements: 2.5, 2.7, 2.8, 2.9, 2.10_

- [x] 8. Login page
  - `login/login.page.ts / .html`: `AuthLayout` with the form, `FormField`s, `PasswordField`, `FormAlert`, F1's countdown component, submit button with spinner, `aria-busy` and disabled while pending or counting down, links to `/register` carrying only a `safeReturnUrl`-accepted `returnUrl`.
  - `submit()` per the design: validation and first-invalid focus, one `session.login(trimmedEmail, password)` call, outcome handling (clear password and focus it on `401`, `429` starts the countdown from `retryAfterSeconds`), navigation to `resolvePostLoginTarget(role, returnUrl())` with `replaceUrl: true`, falling back to `landingRouteFor(role)` when it resolves `false`.
  - Route inputs `email`, `reason` and `returnUrl`: silent email prefill; info notices for `reason=registered` (with password focus) and `reason=session-expired`.
  - Component spec with a faked `SessionStore` and F1 MSW handlers: labels and attributes, every validation message with no request, pending and double-submit, `401` (password cleared, focus, no toast), `400`, `429` with fake timers (`Retry-After` 3, missing, invalid; button re-enables), outage rows, success navigation including the `false` fallback, prefill and notices, the password never appearing in the URL.
  - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 4.4, 4.5, 4.6, 6.1, 6.2, 6.3, 6.4_

- [x] 9. Password checklist
  - `register/password-checklist.component.ts` (`results` input of booleans, five items with icon, label and sr-only "met" / "not met", not a live region, one polite status "All password requirements met").
  - Spec: each rule toggles its item, `_` alone leaves the special rule unmet, the status text appears once when the last rule is met, the input receives booleans only.
  - _Requirements: 3.6, 3.14_

- [x] 10. Register error mapping
  - `register/register.form.ts` (typed `FormGroup` of five controls) and `register/register-error.ts` (`mapRegisterError`: duplicate email by the exact backend message, other `400` as an alert, `429`, outage, network, timeout, 5xx).
  - Table-driven spec including a case-insensitive duplicate match and a changed message degrading to the general alert.
  - _Requirements: 3.4, 3.10, 3.11, 3.12_

- [x] 11. Register page
  - `register/register.page.ts / .html`: `AuthLayout` with first and last name (two columns from 640 px), email, phone (hint, `type="tel"`), password with `PasswordField` and `PasswordChecklist` (described-by wiring), `FormAlert`, countdown, links to `/login` carrying a safe `returnUrl`.
  - `submit()` per the design: validation and focus, one `POST /api/auth/register` with exactly five keys and the normalised phone, then `session.login`; success calls `ToastService.showSuccess`, resets the password control and navigates to `/book` with `replaceUrl`; a `login` failure navigates to `/login?reason=registered&email=<email>`; duplicate email on the email field (message, "Log in instead" link, `aria-invalid`, focus, no toast); other `400` in the alert with focus; pending stays until the navigation completes.
  - Component spec with MSW capturing the body: field order and `autocomplete` values, no role field, request body keys, phone normalised, validation messages and first-invalid focus, pending and double submit, both success paths, duplicate email, other `400`, `429`, offline, password control emptied on success.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14, 4.6, 6.2, 6.3, 6.4_

- [x] 12. Landing sections
  - `landing/hero.component.ts / .html / .css` (headline, supporting sentence, `landingCtas()` buttons, gradient and `data:` SVG grain layers, `.reveal` entrance with the reduced-motion rule) and `landing/hero-preview.component.ts` (decorative `aria-hidden`, `inert` booking-card mock).
  - `landing/value-props.component.ts` (four items), `landing/how-it-works.component.ts` (ordered list of three steps), `landing/cta-band.component.ts` (labelled sections, `<h2>` each).
  - Compose them in `landing/landing.page.ts` with a single `<h1>`; register only the lucide icons used.
  - Specs: one `<h1>`, section order and headings, CTAs for anonymous and for each role from a fake session, no request issued, no `<img>` or external URL in the templates, the `prefers-reduced-motion` block present in the hero CSS.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_

- [x] 13. Playwright flows with mocked API
  - `e2e/support/mock-api.ts` (reuse F1's if present): `page.route` handlers with CORS headers and `OPTIONS`, plus an unsigned test JWT helper per role.
  - `e2e/public.spec.ts`: register success to `/book`; duplicate email; login for Customer, Admin and Staff landing on `/book`, `/admin` and `/staff`; login `401`; login `429` with `page.clock` and re-enabling; `returnUrl=/appointments` honoured and `https://evil.example` ignored; signed-in visit to `/login` redirected; keyboard-only completion of both forms.
  - _Requirements: 2.6 to 2.11, 3.8 to 3.10, 4.4, 4.5, 5.2, 5.3, 7.4_

- [ ] 14. Accessibility and reflow checks
  - Add `@axe-core/playwright`; `e2e/public.a11y.spec.ts` runs axe on `/`, `/login` and `/register` in light and dark (theme set through the F0 toggle, `bypassCSP` on the context only for the axe injection) and fails on `serious` or `critical`.
  - A 320 px viewport assertion for no horizontal scroll (`scrollWidth <= clientWidth`) on each page.
  - _Requirements: 1.4, 1.5, 6.5, 6.7, 6.9, 7.4_

- [ ] 15. Chunk budget check
  - Extend `scripts/size.mjs` with `--group public` (sums the gzip size of outputs whose `entryPoint` is under `src/app/features/public/` plus their non-initial static imports, shared chunk counted once; fails over `MAX_GZIP_KB_PUBLIC`, default 50). Add `pnpm size:public` and a CI `build`-job step. Record the measured total in `design.md`.
  - Confirm the F0 budgets still pass and no F2 code is in the initial bundle.
  - _Requirements: 5.6, 7.5_

- [ ] 16. Documentation
  - Update `README.md` and `CLAUDE.md` project status (landing, login, register built; the F2 folder layout; the `reason=registered`, `reason=session-expired` and `returnUrl` query parameters) and the spec index in `docs/specs/README.md` (F2 row status).
  - Add the F2 `Known gaps` that remain open (enumeration via duplicate-email message, no gateway limit on register) to the README's known-gaps list if one exists.
  - _Requirements: Introduction, Known gaps_

- [ ] 17. Manual verification against the live gateway
  - Start the backend with `docker compose up --build` (its `WEB_ORIGIN` set to the web origin) and the web app with `pnpm start` or the web compose file.
  - Register a new customer and confirm the auto-login lands on `/book`; log in as that customer and as the seeded Admin and confirm `/book` and `/admin`; try a wrong password and confirm the generic message.
  - Send six rapid wrong-password logins and confirm the 429 countdown and the re-enabling; register the same email twice and confirm the inline duplicate message.
  - Open `/login?returnUrl=%2Fappointments` and `?returnUrl=https%3A%2F%2Fevil.example` and confirm the safe and unsafe outcomes; open `/login` while signed in and confirm the redirect.
  - Run through both forms with only the keyboard, with a screen reader on at least one pass, in light and dark, and with reduced motion enabled.
  - Record the result in the PR description; tick this box only when every step passed.
  - _Requirements: 7.6_
