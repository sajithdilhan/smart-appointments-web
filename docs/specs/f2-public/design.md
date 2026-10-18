# F2 Public (landing, login, register) — Design

## Overview

F2 is three lazy pages plus the small pure modules behind them. The approach, and the decisions that are not obvious:

1. **Rules and mappings are pure functions; components are thin.** Password rules, phone normalisation, field validation messages, the `AppError` to UI mapping for login and for register, and the post-login target are plain TypeScript with table-driven tests. The components only bind them to signals and templates (Req 7.1, 7.2).
2. **One a11y wiring, used by every field.** A `FieldView` (error text signal, hint ids) feeds both a `FieldA11yDirective` on the `<input>` (`aria-invalid`, `aria-describedby`, `aria-required`) and a `FormFieldComponent` that renders the label, hint and error. Login and register cannot drift apart on Req 6.2 to 6.4 because they share it.
3. **The password never lives in a signal.** The checklist is fed booleans derived from the control's `valueChanges`; the string stays inside the `FormControl` (Req 3.14).
4. **Post-login routing is an F1 `core/auth/` function that F2 consumes.** `core` may not import `features`, and F1's `guestGuard` also needs "return URL or landing", so F1 owns a pure `resolvePostLoginTarget(role, rawReturnUrl)` beside `landingRouteFor`; the login page and `guestGuard` both call it (Req 4.4, 5.3). F2 builds none of it (Open questions, resolved 1).
5. **The countdown is F1's shared component.** F1's `createRetryCountdown()` supplies the numbers and F1's single countdown component renders "Try again in N seconds" and announces only at the start and the end (Req 2.9). F2 contains no countdown UI of its own (Open questions, resolved 2).
6. **Motion is CSS-only and load-time-only.** One entrance animation on the hero, no scroll observers, no looping animation: reduced motion is a media query that sets the end state (Req 1.6).
7. **Everything stays inside the F0 CSP**: inline SVG, a `data:` SVG grain, `style` attributes (allowed by `style-src 'unsafe-inline'`), no inline scripts, no third-party origin (Req 1.3).

Assumptions about F1 (from its requirements; its design is written in parallel, so these are the seams to confirm): `SessionStore.login(email, password): Promise<void>` rejecting with an `AppError`; `AuthApiService.register(body): Observable<RegisterResponse>` whose errors are `AppError`; `SessionStore.status/role/isAuthenticated` signals; `createRetryCountdown()` and `retryCountdownFrom(error)`; `ToastService.showSuccess` (added by F1); `withComponentInputBinding()` enabled (F1 Req 11.7), so query params arrive as route inputs.

## Decisions

- **Generic form pieces live in `src/app/shared/forms/`** so F5's admin forms reuse them (approved with the F5 admin design): `form-field.component.ts`, `field-a11y.directive.ts`, `field-view.ts`, `focus-first-invalid.ts`, `form-alert.component.ts`, and the generic field rules (`field-rules.ts`: required, max length, email, E.164 phone; `validators.ts` wrappers; `phone.ts` with `normalizePhone`). Each is built and tested in `shared/forms/`, with no knowledge of login or register. The heading-focus directive stays in `shared/a11y/` (already shared). F2-specific pieces stay in `features/public/`: the password rules, checklist and show/hide `PasswordFieldComponent`, the F2 message strings, the login and register error mappers and forms, and the auth layout and illustration.

## Architecture

| Area                                         | Contents                                                                                                                                                                                                                                                                                        |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/core/auth/` (all F1, only consumed) | `post-login-target.ts` (`resolvePostLoginTarget`, `roleCanOpen`), `landing-cta.ts` (`landingCtas`), `guestGuard` with the safe-`returnUrl` redirect (Req 5.3), `safeReturnUrl`, `landingRouteFor`, `SessionStore`, `createRetryCountdown` and the shared countdown component                    |
| `src/app/shared/forms/`                      | `form-field.component.ts`, `field-a11y.directive.ts`, `field-view.ts` (`createFieldView`, `controlState`), `focus-first-invalid.ts`, `form-alert.component.ts`, `field-rules.ts`, `validators.ts`, `phone.ts`, with their specs. Reusable by every feature; imports only `core` and `shared/ui` |
| `src/app/shared/a11y/`                       | `focus-heading.directive.ts` (focus the page `<h1>` after a router navigation), `visually-hidden` utility class lives in `styles.css` (`sr-only` is Tailwind's)                                                                                                                                 |
| `src/app/shared/ui/`                         | Spartan helm: `button`, `input`, `label` (generated in F0), plus `card` if the landing uses it; **no new helm component beyond those**. The generic form primitives are in `shared/forms/` (next row)                                                                                           |
| `src/app/features/public/`                   | everything below                                                                                                                                                                                                                                                                                |
| `src/testing/handlers/`                      | F1's `auth.handlers.ts` reused; F2 adds per-test overrides only (no new global handlers)                                                                                                                                                                                                        |
| `e2e/`                                       | `public.spec.ts`, `public.a11y.spec.ts`, `support/mock-api.ts` (reuse F1's if it exists)                                                                                                                                                                                                        |
| `scripts/size.mjs`                           | gains `--group public` (Req 7.5)                                                                                                                                                                                                                                                                |
| `src/app/shell/public-shell` (F1)            | header actions use F1's `landingCtas()` ("Go to my dashboard" for a signed-in user, Req 1.8); F2 consumes the same function in the hero and band                                                                                                                                                |

```
src/app/features/public/
  titles.ts                         # the three page titles, one place (Req 6.1)
  public.routes.ts                  # route entries consumed by F1's public shell (Req 5.6)
  landing/
    landing.page.ts / .html         # composes the sections, one <h1>
    hero.component.ts / .html / .css      # copy, CTAs, gradient + grain, entrance animation
    hero-preview.component.ts       # decorative booking-card mock (HTML+SVG), aria-hidden
    value-props.component.ts
    how-it-works.component.ts
    cta-band.component.ts
  auth/
    auth-layout.component.ts / .html      # split screen, form slot, illustration slot (hidden < lg)
    auth-illustration.component.ts        # inline SVG, input variant 'login' | 'register'
    password-field.component.ts           # input + show/hide toggle (Req 2.4); uses shared/forms
  login/
    login.page.ts / .html
    login.form.ts                         # typed form factory + messages
    login-error.ts                        # mapLoginError(AppError): LoginOutcome
  register/
    register.page.ts / .html
    register.form.ts                      # typed form factory + messages
    register-error.ts                     # mapRegisterError(AppError): RegisterOutcome
    password-checklist.component.ts
  validation/
    password-rules.ts                     # PASSWORD_RULES, evaluatePasswordRules()
    password-validator.ts                 # ValidatorFn over passwordIsValid ('weak')
    messages.ts                           # F2's user-visible validation strings, one place (keys come from shared/forms rules)
```

Dependency direction as F0: `features/public` imports `core` and `shared`; `core` imports nothing from `features`. The two `core/auth` additions are the reason Decision 4 exists.

## Components and interfaces

### Routes (Req 5.1 to 5.7, 6.1)

| Path        | Component (lazy `loadComponent`) | Guard             | Title                       |
| ----------- | -------------------------------- | ----------------- | --------------------------- |
| `/`         | `LandingPage`                    | none              | `Book your next appointment | Smart Appointments` |
| `/login`    | `LoginPage`                      | `guestGuard` (F1) | `Log in                     | Smart Appointments` |
| `/register` | `RegisterPage`                   | `guestGuard` (F1) | `Create your account        | Smart Appointments` |

Each is its own `loadComponent`, so each is a separate chunk plus automatically shared chunks (forms, the auth components) (Req 5.6). Titles are constants in `titles.ts` and set through the route `title` property (Req 5.7, 6.1). Query parameters reach the pages as signal inputs (`email`, `reason`, `returnUrl`) through `withComponentInputBinding()`.

### Post-login target (F1, core/auth; consumed here) (Req 4.4, 4.5, 5.2, 5.3)

F1 builds and tests this module; it is reproduced as the contract F2 relies on.

```ts
// core/auth/post-login-target.ts
const AREA_ROLE: Record<string, Role> = {
  admin: 'Admin',
  staff: 'Staff',
  book: 'Customer',
  appointments: 'Customer',
  profile: 'Customer',
};
/** First path segment decides the area; unknown segments are open to every role. */
export function roleCanOpen(role: Role, url: string): boolean {
  const seg = new URL(url, 'http://app.invalid').pathname.split('/')[1] ?? '';
  const owner = AREA_ROLE[seg];
  return owner === undefined || owner === role;
}
export function resolvePostLoginTarget(role: Role, rawReturnUrl: unknown): string {
  const safe = safeReturnUrl(rawReturnUrl); // F1, owns the rules and tests
  return safe !== null && roleCanOpen(role, safe) ? safe : landingRouteFor(role);
}
```

A map by first segment is deliberate: guards are functions on routes and cannot be introspected, and the alternative (navigate and let `roleGuard` bounce) shows F1's "not available for your account" toast, which Req 4.4 forbids. To stop the map drifting from the route table, a unit test walks `app.routes.ts`, collects each top-level segment that has a `roleGuard(...)`, and asserts `AREA_ROLE` agrees (F1 owns this map next to `landingRouteFor`).

`guestGuard` (F1, including this behaviour) does: signed out, allow; signed in, `router.parseUrl(resolvePostLoginTarget(role, route.queryParamMap.get('returnUrl')))`. It already waits for the session restore (F1 Req 10.1, 6.8), which satisfies Req 5.4.

### Landing page (Req 1)

`LandingPage` renders, inside the F1 public shell's `<main id="main-content">` (the skip link is F1's, Req 1.9), in order: `HeroComponent`, `ValuePropsComponent`, `HowItWorksComponent`, `CtaBandComponent`. Each is `OnPush`, standalone, and a `<section aria-labelledby="…">` with an `<h2>` (the hero holds the single `<h1>`) (Req 1.1, 1.2). No component injects an HTTP service (Req 1.7).

**CTA set** (Req 1.2, 1.8): F1's `core/auth/landing-cta.ts` exposes

```ts
export function landingCtas(): Signal<{ primary: Cta; secondary: Cta | null }>; // inject-context
// anonymous  -> primary { 'Create an account', '/register' }, secondary { 'Log in', '/login' }
// signed in  -> primary { 'Go to my dashboard', landingRouteFor(role) }, secondary null
```

The hero, the closing band and the shell header all read it, so the three never disagree. (the hero and band use the signed-in variant too, approved; `status` is never `unknown` at render: F1 restores the session before the first navigation.)

**Copy.** All copy is in the templates in English and kept to claims the product will back by F4:

- Hero `<h1>`: "Book your next appointment in minutes." Supporting sentence: "Choose a branch and a service, pick a time that suits you, and get it confirmed. No phone calls, no waiting on hold."
- Value props (four; icon, title, sentence): _See real availability_ (calendar-search; "Only open times are shown, so what you pick is what you get."), _Confirmed straight away_ (calendar-check), _Times that make sense_ (globe; "Shown in the branch's own time zone."), _Cancel when plans change_ (calendar-x; "Free up your slot any time before it starts.").
- How it works (ordered list, three numbered steps): "Choose a branch and service", "Pick a day and time", "Get confirmed".
- Closing band: heading "Ready to book?" plus the same CTAs.

**Visual design.**

- _Hero background_ (Req 1.3, 1.4): three layers on one element, all CSS.
  ```css
  .hero {
    background:
      radial-gradient(
        60rem 28rem at 15% -10%,
        color-mix(in oklab, var(--color-brand-400) 24%, transparent),
        transparent 65%
      ),
      radial-gradient(
        42rem 22rem at 95% 0%,
        color-mix(in oklab, var(--color-brand-700) 14%, transparent),
        transparent 60%
      ),
      var(--color-background);
  }
  .hero::after {
    /* grain: inline SVG feTurbulence, no request */
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    opacity: 0.05;
  }
  :where(.dark) .hero {
    /* tints drop to 14% / 10%, grain to .07 */
  }
  ```
  Text sits on at most a 24 percent teal tint over the page background, so `foreground` (19.9:1 on white) and `muted-foreground` (7.73:1) keep their F0 ratios with margin; the dark equivalents are likewise lighter-than-text-on-near-black. The Playwright axe run in both themes is the check (Req 6.9); the hero CSS goes in `hero.component.css` (well under the 4 kB component-style warning). The data URI is allowed by the F0 CSP `img-src 'self' data:`.
- _Headline_: `text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight`, with one phrase wrapped in a `<span class="text-primary">` (teal-700 on white 5.47:1, teal-400 on zinc-950 10.69:1), which is large text anyway. No `teal-600` text anywhere (Req 1.4).
- _Buttons_: Spartan `hlmBtn` default variant for the primary (teal-700 fill, white text) and `outline` for the secondary; both `h-11 px-6`.
- _Layout_: a container `max-w-6xl`; hero is one column below 640 px (CTAs stacked full width) and a two-column grid from `lg`, the `HeroPreviewComponent` on the right. Value props are a `grid sm:grid-cols-2 lg:grid-cols-4` of cards (`rounded-xl border bg-card shadow-soft`); steps are a three-column list from `md`, connected by a hairline, stacked below. Nothing has a fixed width, so 320 px reflows (Req 1.5, 6.7); the preview card is `max-w-sm w-full` and the grain pseudo-element cannot cause overflow (`overflow-x: clip` on the hero).
- _`HeroPreviewComponent`_: a decorative `aria-hidden="true"` mock of the product (a booking summary card with a branch line, three time chips with the middle one selected, and a "Confirmed" badge with a check). HTML with Tailwind classes and a small inline SVG for the check, using the same tokens as the real UI, so it is theme-aware for free. It is non-interactive (`inert`) so it never enters the tab order, and every text pair in it still meets 4.5:1.
- _Illustrations_ are inline SVG components using `currentColor` and token classes (`text-primary`, `fill-accent`, `stroke-border`), never raster files.

**Motion** (Req 1.6): one keyframe, applied to the hero's children in sequence:

```css
@keyframes reveal {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.reveal {
  animation: reveal 360ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
  animation-delay: calc(var(--i, 0) * 60ms);
}
@media (prefers-reduced-motion: reduce) {
  .reveal {
    animation: none;
  }
}
```

`--i` is 0 to 3 (the last starts at 180 ms and ends at 540 ms; each element is already readable at its own start since `both` keeps `opacity: 0` only until its delay elapses, a total wait under 200 ms). Nothing loops, there is no parallax and no scroll observer. The global F0 reduced-motion block already collapses durations; the explicit rule makes the intent local and testable. Below-the-fold sections have no entrance effect.

### Auth layout (Req 2.2, 3.1)

`AuthLayoutComponent` has two content slots (`<ng-content select="[authForm]">` and the illustration, supplied as an `illustration` input of `'login' | 'register'`). Classes: `grid min-h-[calc(100dvh-var(--header-h,4rem))] lg:grid-cols-2`. The form column is `flex items-center justify-center px-4 py-10 sm:px-8`, with the form block `w-full max-w-md`. The illustration column is `<aside aria-hidden="true" class="hidden lg:block …">`, so below 1024 px it is `display: none` and costs no layout (Req 2.2). The panel is a fixed deep-teal gradient (`brand-900` to `brand-950`) with the grain layer in both themes and no text, so no contrast pair exists on it; the SVG uses `brand-300` and `brand-400` strokes and a white card. `AuthIllustrationComponent` draws a calendar card with a check mark (login) or a calendar with a plus and a small stack of time chips (register) as one SVG each, in one component with an `@switch` on the variant, `focusable="false"`, `role="presentation"`.

### Shared form pieces (`shared/forms/`, except `PasswordFieldComponent` and `CountdownMessage` notes below)

```ts
// shared/forms/field-view.ts
export interface FieldView {
  readonly id: string;
  readonly error: Signal<string | null>; // visible message, or null
  readonly describedBy: Signal<string | null>; // space-joined ids: extras, hint, error
}
export function controlState(
  c: AbstractControl,
): Signal<{ touched: boolean; invalid: boolean; errors: ValidationErrors | null }>;
export function createFieldView(opts: {
  id: string;
  control: AbstractControl;
  messages: Record<string, string>; // error key -> message
  submitAttempted: Signal<boolean>;
  serverError?: Signal<string | null>; // wins over the client error
  hint?: boolean;
  extraDescribedBy?: string[]; // e.g. the password checklist id
}): FieldView;
```

- `controlState` is `toSignal(control.events.pipe(startWith(null), map(snapshot)), { requireSync: true })`. Reactive forms do not notify a zoneless `OnPush` view by themselves; wrapping the unified `events` stream in a signal does (touched, value and status changes all emit).
- `error` is `serverError() ?? ((state.touched || submitAttempted()) && state.invalid ? messages[firstKey(state.errors)] : null)` (Req 3.7). It clears as soon as the control is valid, and a server error clears when the value changes (a `valueChanges` subscription sets `serverError` to `null`).
- `FieldA11yDirective` (`input[appField]`, `[appField]="view"`) host-binds `[attr.aria-invalid]="view.error() ? 'true' : null"`, `[attr.aria-describedby]="view.describedBy()"` and `aria-required="true"` (Req 6.2, 6.3). The ids are `{id}-hint` and `{id}-error`, the same ids `FormFieldComponent` renders, so the association cannot be wrong.
- `FormFieldComponent` (`<app-form-field [view] [label] [hint]>`): `<label for="{id}">` with a visual "required" marker that is `aria-hidden` (the input carries `aria-required`), `<ng-content/>` for the input, an optional `<p id="{id}-hint" class="text-sm text-muted-foreground">`, and `<p id="{id}-error" class="text-sm text-destructive flex gap-1.5">` containing a `circle-alert` icon (`aria-hidden`) and the message (not colour alone, Req 6.3), plus `<ng-content select="[errorAction]"/>` for the "Log in instead" link. The error `<p>` is rendered only when there is an error. It is not a live region; announcing happens through focus (Req 6.4).
- `focusFirstInvalid(host: ElementRef, injector)` runs `afterNextRender(() => host.nativeElement.querySelector('[aria-invalid="true"]')?.focus(), { injector })`. Deferring to after render guarantees the host bindings of the current pass are applied before the query (Req 3.7, 2.5, 6.4).
- `FormAlertComponent` (`<app-form-alert [tone]="'error'|'info'" [message] />`): a stable container that is always in the DOM, `role="alert"` for `error` and `role="status"` for `info`, `aria-atomic="true"`, with the message `<p>` inserted inside it; a stable region that content appears in is announced reliably, and re-renders that do not change the text do not re-announce (Req 6.4). It has `tabindex="-1"` and a `focus()` method (Req 3.11). Info uses `bg-accent text-accent-foreground`, error `bg-destructive/10 text-foreground` with a `border-l-4 border-destructive` and an icon; an optional `reference` input appends "Reference: {correlationId}" in small muted text for server faults.
- `PasswordFieldComponent` (`<app-password-field [view] [control] autocomplete label>`): an `<input hlmInput [type]="visible() ? 'text' : 'password'" [formControl]="control" [appField]="view" [readonly]="pending()" autocomplete=…>` and a button `type="button"` positioned inside the field, `h-10 w-10` (40 px, Req 6.5), with `aria-label` "Show password" / "Hide password" and `[attr.aria-pressed]="visible()"` (Req 2.4). `visible` starts `false` per page instance. On toggle it reads `selectionStart/End`, flips the signal and restores the range in `afterNextRender` (the same element keeps its value; some browsers reset the caret when `type` changes). The input has no `onpaste`/`autocomplete="off"` handling (Req 6.6).

### Validation (Req 2.5, 3.4 to 3.6)

Pure and tested without Angular. The generic rules (`field-rules.ts`, `validators.ts`, `phone.ts`) live in `shared/forms/`; the password rules, the password validator and the F2 message strings live in `features/public/validation/`.

```ts
// password-rules.ts
export type PasswordRuleId = 'length' | 'upper' | 'lower' | 'digit' | 'special';
export const PASSWORD_RULES: readonly {
  id: PasswordRuleId;
  label: string;
  test(p: string): boolean;
}[] = [
  { id: 'length', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { id: 'upper', label: 'One uppercase letter (A-Z)', test: (p) => /[A-Z]/.test(p) },
  { id: 'lower', label: 'One lowercase letter (a-z)', test: (p) => /[a-z]/.test(p) },
  { id: 'digit', label: 'One digit (0-9)', test: (p) => /[0-9]/.test(p) },
  {
    id: 'special',
    label: 'One special character, for example ! or @ (an underscore does not count)',
    test: (p) => /[^\p{L}\p{Mn}\p{Nd}\p{Pc}]/u.test(p),
  },
];
export interface PasswordRuleResult {
  id: PasswordRuleId;
  label: string;
  met: boolean;
}
export function evaluatePasswordRules(p: string): PasswordRuleResult[];
export function passwordIsValid(p: string): boolean; // every rule met
```

```ts
// shared/forms/phone.ts
export const normalizePhone = (raw: string): string => raw.replace(/[\s\-()]/g, '');
export const isE164 = (s: string): boolean => /^\+?[1-9]\d{1,14}$/.test(s);
```

```ts
// shared/forms/field-rules.ts: generic rules, each returns an error key or null; keys index a messages map supplied by the form
requiredTrimmed(v) -> 'required' | null          maxTrimmed(v, 50) -> 'maxlength' | null
email(v) -> 'email' | null                        // Angular Validators.email semantics (HTML living-standard pattern)
phone(v) -> 'pattern' | null                      // on normalizePhone(v)
// F2-only, in features/public/validation/password-validator.ts:
// password(v) -> 'weak' | null                      // via passwordIsValid
```

`validators.ts` wraps them as `ValidatorFn`s (`required` check first, so one message per field; the first failing rule wins, matching the backend's `NotEmpty` before `MaximumLength`). `messages.ts` is the only place a user-visible validation string appears:

| Field                      | `required`                                           | other keys                                                                                        |
| -------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| First / last name          | "First name is required." / "Last name is required." | `maxlength`: "First name cannot exceed 50 characters." / "Last name cannot exceed 50 characters." |
| Email (login and register) | "Email is required."                                 | `email`: "Enter a valid email address."                                                           |
| Phone                      | "Phone number is required."                          | `pattern`: "Enter the number in international format, for example +14155550123."                  |
| Password (register)        | "Password is required."                              | `weak`: "Password does not meet all the requirements." (the checklist says which)                 |
| Password (login)           | "Password is required."                              | none (Req 2.5: login does not apply strength rules)                                               |

Inputs carry `maxlength="50"` on the two name fields (Req 3.4); the phone input is `type="tel" inputmode="tel" autocomplete="tel"`, the email input `type="email" inputmode="email"`; all forms have `novalidate` (Req 6.2).

### Forms

Typed reactive forms with `nonNullable`:

```ts
// login.form.ts
export function createLoginForm() {
  return new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [requiredEmail] }),
    password: new FormControl('', { nonNullable: true, validators: [requiredOnly] }),
  });
}
// register.form.ts
export function createRegisterForm() {
  return new FormGroup({
    firstName: new FormControl('', { nonNullable: true, validators: [requiredTrimmedV, maxLen50] }),
    lastName: new FormControl('', { nonNullable: true, validators: [requiredTrimmedV, maxLen50] }),
    email: new FormControl('', { nonNullable: true, validators: [requiredEmail] }),
    phoneNumber: new FormControl('', { nonNullable: true, validators: [requiredPhone] }),
    password: new FormControl('', { nonNullable: true, validators: [strongPassword] }),
  });
}
```

Fields are made `readonly` (not `disabled`) while pending: a disabled control drops out of `form.value` and loses focus, a read-only one keeps both (Req 2.6, 3.8).

### Login page (Req 2, 4, 6)

State, all signals: `pending`, `submitAttempted`, `alert: { tone, message, reference? } | null`, `countdown = createRetryCountdown()`, `showPassword` (inside the password component). Inputs from the route: `email`, `reason`, `returnUrl`.

```
submit():
  if (pending()) return                              // synchronous re-entrancy guard (Req 2.6)
  submitAttempted.set(true)
  if (form.invalid) { focusFirstInvalid(); return }  // no API call (Req 2.5)
  if (countdown.active()) return
  pending.set(true); alert.set(null)
  try   { await session.login(email.trim(), password) }          // F1; password untouched
  catch (e) { applyOutcome(mapLoginError(toAppError(e))); pending.set(false); return }
  await router.navigateByUrl(resolvePostLoginTarget(session.role()!, returnUrl()), { replaceUrl: true })
  // pending stays true until here. If navigateByUrl resolves false, fall back to
  // router.navigateByUrl(landingRouteFor(role), { replaceUrl: true }); if that also resolves false, pending.set(false)
```

- _Prefill_ (Req 2.12): an `effect` that runs once when `email()` is present sets the control to `email().slice(0, 254)` (Angular sets it as text, never HTML) and focuses the password input in `afterNextRender`; the control is filled from `email()` whenever it is present (silent prefill). The info alert depends only on `reason()`: `'registered'` gives "Your account was created. Log in to continue." (Req 2.12) and `'session-expired'` gives "Your session has ended. Log in again." (Req 2.13); any other value or none shows no notice. Focus goes to the password only when `reason() === 'registered'` and `email()` is present.
- _Links_: "New here? Create an account" is `routerLink="/register" [queryParams]="{ returnUrl: safeReturn() }"` where `safeReturn = computed(() => safeReturnUrl(returnUrl()))`; a `null` query value is omitted by the router, so a rejected value is never carried (Req 4.6, 4.5). The brand mark in the F1 header links to `/` (Req 2.3).
- _Heading focus_: the `<h1>` carries `appFocusHeading` (below), except when a prefill moves focus to the password.

### Register page (Req 3, 4.6, 6)

State: `pending`, `submitAttempted`, `alert`, `emailTaken` (a `serverError` signal for the email `FieldView`), `countdown`, and `passwordResults = toSignal(password.valueChanges.pipe(startWith(''), map(evaluatePasswordRules)))`: the password string itself is never copied into a signal (Req 3.14).

```
submit():
  if (pending()) return
  submitAttempted.set(true)
  if (form.invalid) { focusFirstInvalid(); return }
  if (countdown.active()) return
  pending.set(true); alert.set(null); emailTaken.set(null)
  const v = form.getRawValue()
  const body = { firstName: v.firstName.trim(), lastName: v.lastName.trim(), email: v.email.trim(),
                 phoneNumber: normalizePhone(v.phoneNumber), password: v.password }   // exactly 5 keys (Req 3.3, 3.5)
  try   { await firstValueFrom(authApi.register(body)) }
  catch (e) { applyOutcome(mapRegisterError(toAppError(e))); pending.set(false); return }
  try   { await session.login(body.email, body.password) }                              // Req 3.9
  catch { await router.navigate(['/login'], { queryParams: { reason: 'registered', email: body.email }, replaceUrl: true }); return }
  form.controls.password.reset('')                                                      // discard (Req 3.14)
  toast.showSuccess(`Welcome, ${body.firstName}! Your account is ready.`)   // F1 ToastService
  await router.navigateByUrl('/book', { replaceUrl: true })                              // always /book (Decisions)
```

`pending` stays `true` from the `201` through the navigation (Req 3.13), so a double click or a late Enter cannot start a second `POST`. The register link to `/login` carries the same safe `returnUrl` (Req 4.6). The `FormAlert` and the duplicate-email message use the error mapping below.

### Password checklist (Req 3.6)

`PasswordChecklistComponent` (`[results]: PasswordRuleResult[]`, `[id]`): a `<ul [id]>` of five `<li>`; each shows a lucide `check` (met, `text-success`) or `circle` (not met, `text-muted-foreground`) icon, `aria-hidden="true"`, then the label, then `<span class="sr-only">, met</span>` or `, not met`. Met items also get `line-through`-free emphasis only (`text-foreground` versus `text-muted-foreground`), and the text/icon pair is never the only cue because of the sr-only suffix and the icon shape. `success` on white is 5.02:1 and on the dark card 11.42:1 (F0 table). The list is **not** a live region. A sibling `<p class="sr-only" role="status">` shows "All password requirements met" while every rule is met and is empty otherwise, so assistive technology hears one message when the last rule is satisfied, not one per keystroke. The checklist `id` is passed as `extraDescribedBy` to the password `FieldView`, so the input is described by the list and then by the error (Req 6.3).

### Focus management and page titles (Req 6.1, 6.4)

`FocusHeadingDirective` (`h1[appFocusHeading]`, `tabindex="-1"` host binding, `outline: none` on that element since a heading is not interactive): in the constructor, `if (router.navigated) afterNextRender(() => el.focus({ preventScroll: true }))`. After the first navigation completes `router.navigated` is true, so the heading is focused on every in-app navigation, and not on the very first page load, where moving focus would be surprising. The title announcement itself is F1's route announcer (F1 Req 11.7); the page title is set by the router `title`. The three pages use the directive on their `<h1>`.

Initial focus within forms: none, except the password input after a prefill (Req 2.12) and the first invalid field, the alert region or the email field after an error (below).

### Error mapping (Req 2.7 to 2.10, 3.10 to 3.12)

Two pure functions return a discriminated outcome; the page applies it.

```ts
type Outcome =
  | { kind: 'alert'; message: string; reference?: string; focus: 'password' | 'alert' | 'none' }
  | { kind: 'countdown'; seconds: number }
  | { kind: 'field-email-taken' }; // register only
```

Login (`mapLoginError`, `AppError` from F1):

| Condition                                      | `AppError`                   | UI result                                                                                                                                                           |
| ---------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wrong credentials, unknown or inactive account | `401`, `unauthorized`        | Alert (error): fixed text "Invalid email or password." Password cleared, email kept, focus to the password input. No toast. Server `detail` is never read (Req 2.7) |
| Malformed field that client rules missed       | `400`, `http`                | Alert with `AppError.message`; focus to the alert (Req 2.8)                                                                                                         |
| Rate limited                                   | `429`, `rate-limited`        | `countdown.start(retryAfterSeconds ?? 60)`; submit disabled while `active`; F1's shared countdown component shown in the alert region (Req 2.9). No toast           |
| Server down, gateway timeout                   | `502/503/504`, `unavailable` | Alert: "Service temporarily unavailable. Please try again in a moment."; form re-enabled, both values kept; F1's global banner also shows (Req 2.10)                |
| Offline, DNS, CORS, reset                      | `0`, `network`               | Alert: `AppError.message` ("Cannot reach the server. Check your connection and try again."); values kept                                                            |
| Client timeout                                 | `0`, `timeout`               | Alert: `AppError.message`; values kept                                                                                                                              |
| Other 5xx                                      | `500`, `http`                | Alert: `AppError.message` plus "Reference: {correlationId}"; values kept. No second toast: this page owns the display (F1's `handleError` is not called)            |
| Anything else (403, 404, 409)                  | `http`                       | Alert: `AppError.message`                                                                                                                                           |

Register (`mapRegisterError`): the same rows for `429`, `unavailable`, `network`, `timeout`, 5xx and other statuses (the form keeps every value, including the password), plus:

| Condition                    | `AppError`                                                                            | UI result                                                                                                                                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duplicate email              | `400` and `message.trim()` equals `"Email is already registered."` (case-insensitive) | `field-email-taken`: the email `FieldView` gets `serverError` "An account with this email already exists." with an `errorAction` link "Log in instead" to `/login?email=<email>`; `aria-invalid` is set; focus to the email input; no toast, no alert (Req 3.10) |
| Any other validation failure | `400`, `http`                                                                         | Alert with `AppError.message` (the backend joins every failed rule); focus to the alert; all values kept (Req 3.11)                                                                                                                                              |

The duplicate match is on the backend's fixed message text because it is the only signal the API gives (Known gap in requirements); if the wording changes the page degrades to the general-400 alert, which is still correct.

`toAppError(e)` narrows `unknown` to `AppError` (F1 throws one); anything else becomes a generic "Something went wrong" `AppError` so the pages never read `HttpErrorResponse` (F1 Req 3.1).

### 429 countdown wiring (Req 2.9, 3.12)

The page owns `countdown = createRetryCountdown()` (cleared on destroy by F1's implementation). On a `rate-limited` outcome: `countdown.start(retryAfter)` (F1 already defaults a missing or invalid header to 60, so the page does not repeat that logic; a unit test passes a mapped error with no `retryAfterSeconds` to confirm the fallback of 60 reaches the page). The submit button is `[disabled]="pending() || countdown.active()"`; the alert region contains F1's shared countdown component, which renders "Try again in N seconds" and announces only at the start and the end. When `active` becomes false it shows "You can try again now.", the button re-enables, and nothing retries automatically (F1 Req 4.6). Fake timers drive the tests.

### Accessibility summary (Req 6)

- Landmarks: one `<main>` (F1 shell), sections labelled by their headings, `<form novalidate aria-labelledby="{h1 id}">` on both forms.
- Every input has a visible `<label for>`; required is shown by a visual asterisk marked `aria-hidden` and `aria-required` on the input; hints and errors linked by `aria-describedby`; invalid inputs `aria-invalid="true"` (Req 6.2, 6.3).
- Focus: first invalid field on a failed submit; the password after a login `401`; the alert region (`tabindex="-1"`) after a register general `400`; the email field after a duplicate (Req 6.4); the `<h1>` after navigation.
- Targets: inputs and buttons `h-11` (44 px); the show/hide button and the F0 theme toggle at least 40 px; inline links in the footer lines of the forms have `py-2` padding so the hit area exceeds 24 px (Req 6.5).
- Focus indicator: the F0 `:focus-visible` outline is `outline-2 outline-offset-2` in `ring` (teal-600 on white 3.74:1, teal-400 on dark 10.69:1: both above the 3:1 non-text minimum); the sticky F1 header uses `scroll-padding-top` so a focused field is not hidden behind it (Req 6.5).
- Decorative elements (`AuthIllustration`, `HeroPreview`, icons beside text) are `aria-hidden="true"`; the checklist icons are decorative because the sr-only "met / not met" text carries the state (Req 6.8).
- Reflow: single column with `max-w-md` and fluid widths; no `overflow-x`; tested at 320 px width and 200% zoom by Playwright viewport (Req 6.7).
- Paste and managers: no paste blocking, correct `autocomplete` tokens (`username`, `current-password`, `given-name`, `family-name`, `email`, `tel`, `new-password`) (Req 6.6).

## State and data model

No SignalStore and no persisted storage in F2. Component-local signals only:

| Where          | State                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Login page     | `pending: boolean`, `submitAttempted: boolean`, `alert: Alert \| null`, `countdown` (F1), route inputs `email`, `reason`, `returnUrl` |
| Register page  | the same, plus `emailTaken: string \| null`, `passwordResults: PasswordRuleResult[]`                                                  |
| Password field | `visible: boolean` (never persisted; resets per page instance)                                                                        |
| Landing        | `ctas` computed from F1's `SessionStore.isAuthenticated` and `role`                                                                   |

`Alert = { tone: 'error' | 'info'; message: string; reference?: string }`. The only data crossing the URL is `email` and `returnUrl` (both non-secret); the password is never put in the URL, history state or storage (Req 2.12, 3.14).

## Testing strategy

Vitest plus Angular Testing Library (queries by role and label, `userEvent`), MSW for HTTP, `vi.useFakeTimers()` for time, no `fakeAsync`. The `SessionStore` is replaced with a fake (`{ login: vi.fn(), status, role, isAuthenticated }`) and the real `AuthApiService` runs against F1's `auth.handlers.ts`, overridden per test with `server.use(...)`.

| Requirement        | Verified by                                                                                                                                                                                                                                                                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1, 1.2, 1.7, 1.9 | `landing.page.spec.ts`: one `<h1>`, section headings in order, links (`/register`, `/login`), no request issued (MSW `onUnhandledRequest: 'error'` would fail)                                                                                                                                                                                                   |
| 1.3, 1.4, 1.5, 1.6 | `hero.component.spec.ts` (CSS classes present, no `<img>` or external URL in the template); reduced-motion rule asserted by reading `hero.component.css` for the `prefers-reduced-motion` block; contrast and reflow by the Playwright axe run in both themes and a 320 px viewport screenshot assertion for no horizontal scroll (`scrollWidth <= clientWidth`) |
| 1.8                | `landing.page.spec.ts` / `hero.component.spec.ts`: with a fake session (anonymous, then each role) the hero and band show the CTAs F1's `landingCtas()` returns; the function's own tests are F1's                                                                                                                                                               |
| 2.1 to 2.4         | `login.page.spec.ts`: heading, labels, attributes, toggle name and `aria-pressed`, value kept while toggling; layout classes asserted by `auth-layout.spec.ts` (illustration `aria-hidden`, `hidden lg:` classes)                                                                                                                                                |
| 2.5, 2.6           | `login.page.spec.ts`: each empty/malformed case shows its message, no request, focus on the first invalid field; submit disables, double submit sends one `login` call                                                                                                                                                                                           |
| 2.7 to 2.10        | `login-error.spec.ts` (table over the mapping) and `login.page.spec.ts` (password cleared and focused on `401`, no toast, 400/5xx/network rows)                                                                                                                                                                                                                  |
| 2.9, 3.12          | `login.page.spec.ts` and `register.page.spec.ts` with fake timers: `Retry-After: 3` counts 3, 2, 1 then re-enables; missing header uses 60; the `role="status"` text changes exactly twice (a spy on its text content mutations)                                                                                                                                 |
| 2.11, 4.4, 4.5     | `login.page.spec.ts`: navigation to the target `resolvePostLoginTarget` returns, with `replaceUrl: true`, and the `false` fallback to `landingRouteFor(role)`; the function's own table tests (including `/admin` for a Customer and `https://evil.example`) are F1's                                                                                            |
| 2.12, 2.13         | `login.page.spec.ts`: `email` prefill, password focus, both info messages, the password is not in the URL                                                                                                                                                                                                                                                        |
| 3.1 to 3.5         | `register.page.spec.ts`: labels, order, `autocomplete`, no role field, request body equals exactly five keys and the phone is normalised (asserted by an MSW handler capturing the body)                                                                                                                                                                         |
| 3.4, 7.2           | `password-rules.spec.ts` (F2), `shared/forms/field-rules.spec.ts` and `phone.spec.ts`: table-driven; the boundary list of Req 7.2; `é` and `_` do not satisfy the special rule; `€` and a space do                                                                                                                                                               |
| 3.6                | `password-checklist.spec.ts`: five items, met/not met text, `aria-describedby` linkage, the polite status written once when all rules are met                                                                                                                                                                                                                    |
| 3.7, 6.2 to 6.4    | `register.page.spec.ts` and `shared/forms/field-a11y.spec.ts`: errors only after blur or submit, `aria-invalid`, `aria-describedby` ids resolve to existing elements, first-invalid focus                                                                                                                                                                        |
| 3.8, 3.9, 3.13     | `register.page.spec.ts`: pending state; success calls `login` then navigates to `/book` with `replaceUrl`; `login` rejection navigates to `/login?reason=registered&email=`; the form is not shown again; a second submit during pending sends no request                                                                                                        |
| 3.10, 3.11         | `register-error.spec.ts` and the page spec: duplicate on the email field (focus, link `href`, no toast), other `400` in the alert (focus)                                                                                                                                                                                                                        |
| 3.14               | `register.page.spec.ts`: after success the password control is `''`; no signal or URL holds it (the checklist receives booleans only, asserted by its input type)                                                                                                                                                                                                |
| 4.1, 4.6           | `safeReturnUrl` tests are F1's (Req 8.4); F2 asserts the login and register links carry only a value that passed it                                                                                                                                                                                                                                              |
| 5.1 to 5.5         | F1's `guest.guard.spec.ts` covers the guard (signed in with and without a valid `returnUrl`, signed out, restore pending then resolved); F2 asserts only that the routes use it (5.1)                                                                                                                                                                            |
| 5.6, 5.7           | a route-config spec asserting the three entries use `loadComponent`, the guard, and the titles from `titles.ts`                                                                                                                                                                                                                                                  |
| 6.1                | `focus-heading.spec.ts`: focus moves after an in-app navigation and not on first load; title assertions on the route config                                                                                                                                                                                                                                      |
| 6.9                | the per-form unit assertions above plus `e2e/public.a11y.spec.ts`                                                                                                                                                                                                                                                                                                |
| 7.3, 7.4           | the guard and Playwright specs as listed                                                                                                                                                                                                                                                                                                                         |
| 7.5                | `pnpm size --group public` in CI                                                                                                                                                                                                                                                                                                                                 |

**MSW.** F2 relies on F1's handlers (`register` 201 and duplicate 400, `login` 200/401/429, `logout`, `me`, refresh). A test sets the F1 rate-limited flag for the 429 cases and uses `server.use(http.post('*/api/auth/register', …))` to capture the body. No handler ships in the production bundle (F1 Req 14.5).

**Playwright** (`e2e/public.spec.ts`, mocked API, no backend; `page.route` with CORS headers on the fulfilled responses and an `OPTIONS` handler, because the SPA origin differs from the stubbed `apiBaseUrl`; a shared `support/mock-api.ts`, reused from F1 if present):

1. Register success: fill the form, intercept `POST /api/auth/register` (`201`) and `POST /api/auth/login` (token for a Customer), expect URL `/book`.
2. Register duplicate email: `400 {status, detail}`; the email field shows the message, is `aria-invalid`, and has focus.
3. Login for Customer, Admin and Staff (a table of three): the access token's `role` claim drives the final URL (`/book`, `/admin`, `/staff`).
4. Login `401`: generic message, password cleared and focused.
5. Login `429`: `Retry-After: 3`; `page.clock.install()` then `fastForward`; the button re-enables after 3 seconds.
6. `returnUrl`: `/login?returnUrl=%2Fappointments` lands on `/appointments`; `?returnUrl=https%3A%2F%2Fevil.example` lands on the role landing and the page URL never leaves the app origin.
7. Signed-in visit to `/login` redirects (stored refresh token and a mocked `refresh`).
8. Keyboard-only completion: `Tab` and `Enter` through both forms, the password toggle by `Space`.
9. Axe (`e2e/public.a11y.spec.ts`, `@axe-core/playwright`): `/`, `/login`, `/register`, light and dark (the theme set through the F0 toggle), `bypassCSP: true` on the browser context only for the axe injection; fail on `serious` or `critical`. The Playwright run serves the build with sirv, which sends no CSP header, so CSP behaviour is covered by F0's docker job (curl) and by the design constraints above, not by e2e.

## Chunk budget (Req 7.5)

The three pages are separate lazy chunks; `@angular/forms` and the `auth/` components land in one shared lazy chunk that both form pages import (`ReactiveFormsModule` is not in the F1 initial bundle if F1 uses no forms). Estimate, gzip: `@angular/forms` reactive part about 18 to 22 kB, the shared auth components and rules about 5 kB, `LoginPage` about 3 kB, `RegisterPage` with the checklist about 5 kB, `LandingPage` with its sections and icons about 7 kB, and the lucide icons (about 12, tree-shaken, 0.4 kB each) about 5 kB. The total is about 43 to 47 kB, so the original 40 kB was too tight, mainly because of the forms library. The approved group budget is **50 kB gzip**; the measured figure is recorded here at implementation; a real overrun is addressed by (a) dropping the form-library dependency from the checklist (it already uses none), (b) not importing icons by the full module, and (c) as a last resort template-driven forms for login only.

`scripts/size.mjs --group public` builds on the Angular `--stats-json` metafile: it sums the gzip size of each output whose `entryPoint` is under `src/app/features/public/` plus the non-initial files those outputs statically import (the shared chunk counted once), prints the table, and exits 1 over `MAX_GZIP_KB_PUBLIC` (default 50). CI runs it in the `build` job after `pnpm size`. The initial bundle is unaffected: no F2 code is imported by `app.routes.ts` except through `import()`.

**Measured (task 15):** the public group is **26.47 kB gzip** (86.41 kB raw) over seven chunks: the shared forms chunk 16.34 kB, `RegisterPage` 3.77 kB, `LandingPage` 2.94 kB, `LoginPage` 2.49 kB, and four small shared and route chunks under 0.35 kB each. The initial bundle measures 153.71 kB gzip under the F0 limit of 250 kB, and none of the public outputs are initial files. The stats metafile comes from `statsJson: true` in the production configuration; it is written beside `browser/` (`dist/smart-appointments-web/browser-stats.json`), so it is neither served nor copied into the image.

## Traceability

| Requirement     | Satisfied by (this document)                                                                         |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| R1.1 to 1.9     | Landing page (sections, CTA set, visual design, motion), Architecture (shell header), Testing        |
| R2.1 to 2.4     | Auth layout, Password field, Login page                                                              |
| R2.5            | Validation, Forms, Login page, `focusFirstInvalid`                                                   |
| R2.6            | Login page `submit()`, read-only fields                                                              |
| R2.7 to 2.10    | Error mapping (login), Login page                                                                    |
| R2.9            | F1's shared countdown component, 429 countdown wiring                                                |
| R2.11           | Post-login target, Login page                                                                        |
| R2.12, 2.13     | Login page (prefill, reason)                                                                         |
| R3.1 to 3.3     | Auth layout, Forms, Register page                                                                    |
| R3.4, 3.5       | Validation (rules, messages, phone normaliser), Register `submit()`                                  |
| R3.6            | Password checklist                                                                                   |
| R3.7            | `createFieldView`, `focusFirstInvalid`                                                               |
| R3.8, 3.9, 3.13 | Register `submit()`                                                                                  |
| R3.10 to 3.12   | Error mapping (register), 429 wiring                                                                 |
| R3.14           | Overview decision 3, Password checklist, State                                                       |
| R4.1            | F1's `safeReturnUrl`, consumed by `resolvePostLoginTarget`                                           |
| R4.4, 4.5       | Post-login target                                                                                    |
| R4.6            | Login and register links                                                                             |
| R5.1 to 5.5     | Routes, Post-login target (`guestGuard` change)                                                      |
| R5.6, 5.7       | Routes, Chunk budget                                                                                 |
| R6.1            | Routes, Focus management and page titles                                                             |
| R6.2 to 6.4     | Shared form pieces in `shared/forms/` (`FieldA11y`, `FormField`, `FormAlert`), Accessibility summary |
| R6.5 to 6.8     | Accessibility summary, Auth layout                                                                   |
| R6.9            | Testing strategy (unit and axe)                                                                      |
| R7.1 to 7.4     | Testing strategy                                                                                     |
| R7.5            | Chunk budget                                                                                         |
| R7.6            | Manual check, run at the end of implementation (not designed further)                                |

## Open questions — resolved

All ten were approved with these resolutions.

1. **Resolved: F1 owns the shared pieces.** F1 absorbs `post-login-target.ts` (`roleCanOpen`, `resolvePostLoginTarget`) and `landing-cta.ts` in `core/auth/`, and the `guestGuard` safe-`returnUrl` behaviour. F2 consumes them and builds none of them. The hero and the closing band also use the signed-in CTA.
2. **Resolved: one shared F1 countdown component.** It announces only at the start and the end, with the wording "Try again in N seconds". F2's local `CountdownMessageComponent` is dropped.
3. **Resolved: `ToastService.showSuccess`.** F1 adds it; the register page uses it.
4. **Resolved: chunk budget 50 kB gzip** for the three lazy chunks (`pnpm size --group public`).
5. **Resolved: exact special-character rule.** `[^\p{L}\p{Mn}\p{Nd}\p{Pc}]` with the `u` flag, the complement of .NET's `\w`.
6. **Resolved: page titles are `<Page> | Smart Appointments`**, matching F1.
7. **Resolved: register-then-login-failure goes to `/login?reason=registered&email=...`**, and the "account created" notice shows only for `reason=registered`; an `email` parameter alone prefills silently.
8. **Resolved: a post-login navigation that resolves `false`** falls back to `landingRouteFor(role)`.
9. **Resolved: landing copy** may mention booking and cancelling; both ship in v1, so the copy stays as drafted.
10. **Assumptions about F1** (the `SessionStore.login` promise, the `AuthApiService.register` observable, `AppError` rejections, route inputs through `withComponentInputBinding()`) stand until F1's design is final; a mismatch is fixed in F2's tasks, not in this design.

## Implementation deviations

- **`createFieldView` takes a `WritableSignal` for `serverError`** (the design typed it `Signal`), because the view itself clears a server error when the control's value changes. `controlState` uses `toSignal(..., { initialValue })` with a snapshot taken at creation instead of `requireSync` (the `events` stream does not emit synchronously on subscribe, so `startWith(null)` plus the snapshot as the initial value keeps it typed and correct).
- **Shared validators are composed, not stacked.** `validators.ts` adds `firstFailing(...rules)` and `fromRule`; the ready-made `emailValidator`, `phoneValidator`, `maxLengthValidator(n)` (required first, then the rule) each report one key, so a field never carries two errors. The forms use these instead of the `[requiredTrimmedV, maxLen50]` arrays in the sketch.
- **Password required is checked on the raw value** (an empty string only), in both login and register, so a password of spaces counts as typed and is judged by the strength rules in register.
- **`PasswordChecklistComponent.results` carries `{ id, label, met }`** (structurally `PasswordRuleResult`) rather than bare booleans, so the labels come from `PASSWORD_RULES` in one place. It still never receives the password. `PasswordFieldComponent` wraps its own `app-form-field` (label, hint, error) and exposes `focus()` and `pending`/`hint` inputs.
- **`Outcome`, `mapCommonError` and `toAppError` live in `features/public/auth/outcome.ts`**, shared by `mapLoginError` and `mapRegisterError`, so the common rows (429, outage, network, timeout, 5xx, other) cannot drift. The outcome focus for a non-400, non-network "other" status is `alert`.
- **Auth layout and illustration** use inline templates (no `.html` files) and the grain layer is a component style, not an inline `style` attribute.
- **`statsJson` is on in the production configuration** rather than passed as `--stats-json` in CI, so `pnpm build` alone produces what `pnpm size:public` reads. `scripts/size.mjs` exports `initialFiles` and `groupFiles` for `scripts/size.spec.mjs`; `STATS_JSON` overrides the metafile path.
