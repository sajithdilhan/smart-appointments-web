# F6 Redesign (Indigo + Lavender) — Design

## Overview

The re-skin is token-first. The helm components and most feature templates already take every colour from the semantic tokens in `src/styles.css`, so replacing those values (Req 1) changes the whole app at once, admin and appointments included (Req 9.1). The layout work is limited to the shells' header pieces, the landing page, the auth layout and the booking wizard's presentational components. **No store, route, URL rule, API call or guard changes**: the wizard store already exposes everything the month calendar needs (`date()`, `chooseDate()`, `todayInBranch()`, `branchZone()`, `strip()`), and F3 already ships the branch search and an open/closed badge, which F6 restyles rather than rebuilds.

Three things are new code rather than restyling: a pure month-grid model (`month-grid.ts`), the `MonthCalendarComponent` with a grid keyboard pattern, and a few inline-SVG illustration components. Everything else is template and class changes.

## Architecture

| Area                                                         | Contents                                                                                                                                                         |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/styles.css`                                             | New indigo `brand` ramp, `lavender` ramp, semantic tokens for light and dark, new `success-soft`, four `tile-*` token pairs, radius and shadow values (Req 1)    |
| `public/theme-init.js`, `src/index.html`                     | Unchanged logic; `theme-color` meta (light `#f8f7fe`, dark `#0f0d24`) if present (Req 1.7, 1.8)                                                                  |
| `src/app/core/config/config-error.ts`                        | Inline hex values swapped to the new palette (Req 1.7)                                                                                                           |
| `src/app/core/time/`                                         | `month-grid.ts` (pure): builds the weeks of a month with each day's bookability (Req 7.1, 7.2)                                                                   |
| `src/app/shared/ui/brand-mark/`                              | New `BrandMark` component: calendar-check icon tile + wordmark, used by every shell (Req 2.1)                                                                    |
| `src/app/shared/ui/theme-toggle/`                            | Segmented-control styling (Req 2.3)                                                                                                                              |
| `src/app/shared/ui/badge/`                                   | New `success` and `muted` variants (Req 6.3, 9.2)                                                                                                                |
| `src/app/shared/layout/*-shell/`                             | Use `BrandMark`; public header buttons; customer nav underline (Req 2)                                                                                           |
| `src/app/features/public/landing/`                           | Hero, new `hero-scene.component.ts` (SVG), reworked `hero-preview`, `value-props`, `how-it-works`, `cta-band` (Req 3, 4)                                         |
| `src/app/features/public/auth/`                              | Auth layout side swap and gradient panel, new calendar illustration, input icons (Req 5)                                                                         |
| `src/app/features/customer/book/components/`                 | Stepper, branch/service card styling, `month-calendar.component.ts` (replaces `date-strip`), time grid, review card, success step, confetti colours (Req 6 to 8) |
| `src/app/features/customer/appointments/`, `features/admin/` | Status badge variants only (Req 9.2)                                                                                                                             |

The dependency direction is unchanged: `month-grid.ts` lives in `core/time` next to `dayStrip`, `BrandMark` in `shared/ui`; features import them.

## Palette (Req 1.1 to 1.5)

Ramps (Tailwind's indigo and violet scales):

- `--color-brand-*` indigo: 50 `#eef2ff`, 100 `#e0e7ff`, 200 `#c7d2fe`, 300 `#a5b4fc`, 400 `#818cf8`, 500 `#6366f1`, 600 `#4f46e5`, 700 `#4338ca`, 800 `#3730a3`, 900 `#312e81`, 950 `#1e1b4b`.
- `--color-lavender-*` violet: 50 `#f5f3ff`, 100 `#ede9fe`, 200 `#ddd6fe`, 300 `#c4b5fd`, 400 `#a78bfa`, 500 `#8b5cf6`, 600 `#7c3aed`, 700 `#6d28d9`, 800 `#5b21b6`, 900 `#4c1d95`, 950 `#2e1065`.

Semantic tokens, with the measured contrast of each text pair (WCAG ratio):

| Token                                | Light                 | Dark                  | Contrast (light / dark) |
| ------------------------------------ | --------------------- | --------------------- | ----------------------- |
| `background` / `foreground`          | `#f8f7fe` / `#1e1b4b` | `#0f0d24` / `#eeecff` | 15.0 / 16.4             |
| `card`, `popover` / `-foreground`    | `#ffffff` / `#1e1b4b` | `#17153a` / `#eeecff` | 16.1 / 15.0             |
| `primary` / `primary-foreground`     | `#4f46e5` / `#ffffff` | `#a5b4fc` / `#1e1b4b` | 6.3 / 8.0               |
| `primary` as text on background      | —                     | —                     | 5.9 / 9.6               |
| `secondary` / `-foreground`          | `#eeecfb` / `#312e81` | `#24214f` / `#eeecff` | > 9 / > 12              |
| `muted` / `muted-foreground`         | `#f1effb` / `#5b5876` | `#24214f` / `#b4b0d9` | 6.0 / 7.2               |
| `accent` / `accent-foreground`       | `#ede9fe` / `#3730a3` | `#2e2763` / `#ddd6fe` | 8.4 / 9.5               |
| `border`                             | `#e4e1f7`             | `#2e2a5e`             | decorative              |
| `input` (field borders, 3:1)         | `#7c78a8`             | `#7a76ad`             | 4.1 / 4.2               |
| `ring` (focus, 3:1)                  | `#6366f1`             | `#a5b4fc`             | 4.2 / 9.6               |
| `success` / `-foreground`            | `#047857` / `#ffffff` | `#6ee7b7` / `#022c22` | 5.5 / 9.9               |
| `success-soft` / `-foreground` (new) | `#d1fae5` / `#065f46` | `#063b2c` / `#a7f3d0` | 6.8 / 9.8               |
| `destructive` / `-foreground`        | `#dc2626` / `#ffffff` | `#f87171` / `#0f0d24` | 4.8 / 6.9               |
| `warning` / `-foreground`            | `#b45309` / `#ffffff` | `#fbbf24` / `#0f0d24` | 5.0 / > 10              |

Landing tile tokens (Req 4.2), icon on tile: lavender `#ede9fe`/`#6d28d9` (6.0) and dark `#2e2763`/`#c4b5fd` (7.2); blue `#dbeafe`/`#1d4ed8` (5.5) and `#172554`/`#93c5fd` (8.2); mint `#d1fae5`/`#047857` (4.8) and `#063b2c`/`#6ee7b7` (8.3); peach `#ffedd5`/`#c2410c` (4.5) and `#431407`/`#fdba74` (9.3).

Shape: `--radius` 0.75 rem (buttons, inputs), cards `rounded-2xl` (1 rem). Shadows get a lavender tint: `--shadow-soft: 0 1px 2px rgb(30 27 75 / 0.04), 0 6px 16px rgb(79 70 229 / 0.06)` and `--shadow-lifted: 0 2px 4px rgb(30 27 75 / 0.06), 0 16px 40px rgb(79 70 229 / 0.12)` (Req 1.5). The helm card gets `shadow-soft` by default.

Teal removal (Req 1.1) is checked by a Vitest spec that scans `src/` (and `public/`) for the old teal hex values and `teal-` class names.

## Components and interfaces

### Routes

No route changes.

### Shared

- **`BrandMark`** (`shared/ui/brand-mark`): `<span class="size-8 rounded-lg bg-primary text-primary-foreground">` with the lucide `calendar-check` icon (`aria-hidden`), then the wordmark. The shells keep their existing `<a routerLink>` around it, so the accessible name stays "Smart Appointments" (Req 2.1).
- **Theme toggle** (Req 2.3): a `rounded-full border bg-card p-0.5` track; the checked radio is `bg-primary text-primary-foreground` with a `shadow-soft`, so selection shows by fill and elevation. Names and roles unchanged.
- **Public header** (Req 2.2): "Sign in" `hlmBtn variant="outline"`, "Create account" default variant. Customer desktop nav (Req 2.4): active link `text-primary` with a 2 px `after:` underline; the tab bar's active item `text-primary`. `routerLinkActive` and `aria-current` unchanged; no layout-class changes (Req 2.5).
- **Badge** gains `success` (`bg-success-soft text-success-soft-foreground`) and `muted` (`bg-muted text-muted-foreground`) variants (Req 6.3, 9.2).

### Landing (Req 3, 4)

- `hero.component.html`: pill (`rounded-full bg-accent text-accent-foreground text-xs`), `<h1>` "Book your next appointment" + `<span class="block text-primary">in just a few clicks.</span>`, sentence, `app-cta-buttons` (the primary gets a trailing `lucideArrowRight`, `aria-hidden`).
- `hero-scene.component.ts` (new, inline SVG, `aria-hidden`, `focusable="false"`): two or three lavender blob paths, a simplified reception desk, chairs and a plant in flat lavender/indigo tones, using `fill-lavender-*`/`fill-brand-*` utilities so dark mode switches through classes. Shown from `lg`; hidden below (Req 3.2).
- `hero-preview.component.ts` reworked as the floating card over the scene: "Appointment Confirmed!" with a mint check, map-pin "Downtown Branch / General consultation", calendar "12 Oct 2026" and a mint time chip "10:00 AM", and "Confirmed" (Req 3.2). Stays `aria-hidden` and `inert`.
- `hero.component.css`: the teal radial gradients become lavender ones; the grain and `.reveal` stay; the file stays under 4 kB (Req 3.4).
- `value-props.component.ts`: heading "Why choose us?"; four cards as in Req 4.1 with lucide `zap`, `calendar-check`, `map-pin`, `shield-check` in `size-11 rounded-xl` tiles coloured by `bg-tile-* text-tile-*-foreground`.
- `how-it-works` and `cta-band`: token changes only (numbered `bg-primary` circles; band `bg-accent/60`).

### Auth (Req 5)

- `auth-layout.component.ts`: the form slot moves to the first grid column and the aside to the second (DOM order: form first, so reading order is unchanged on every width). Aside classes keep `hidden lg:flex`; its background becomes `bg-linear-to-br from-lavender-600 to-brand-700` (dark: `from-lavender-900 to-brand-950`), keeping the grain. New input `tagline` and `subtitle`; register passes "Small steps, better access." / "Get started today and manage your appointments easily.", login passes "Welcome back to easier booking." / "Sign in to see and manage your appointments." White text on `lavender-600` is 5.7:1 and on `brand-700` 7.9:1.
- `auth-illustration.component.ts` redrawn: a 3D-style calendar (front face, top binding rings, a page curl, a lavender shadow ellipse), a mint check badge, and a leafy plant on the side; theme-independent because it sits on the gradient.
- Eyebrow (Req 5.3): `<p class="text-xs font-semibold uppercase tracking-wider text-primary">` above each `<h1>`.
- Input icons (Req 5.4): `app-form-field` gets an optional `icon` input; when set it renders an absolutely positioned `ng-icon` (`aria-hidden`) and adds `ps-10` to the projected input through a CSS rule on the field wrapper, so input elements and their labels are untouched. The password field puts the lock on the left; its show/hide button stays on the right.
- Checklist (Req 5.5): met `lucideCircleCheck text-success`, unmet `lucideCircle text-muted-foreground`; the `.sr-only` spans stay.
- Submit buttons `w-full` with a trailing arrow; the switch link `text-primary underline` (Req 5.6).

### Booking wizard (Req 6 to 8)

- **Stepper** (`step-indicator.component.ts`, Req 6.1): same inputs, output, `aria-current` and `ol aria-label="Booking progress"`. From 640 px each item is a column: a `size-8 rounded-full` circle and the label under it, joined by a `h-0.5 flex-1` connector (`bg-primary` once passed, `bg-border` otherwise). Completed: `border-2 border-primary text-primary` with `lucideCheck` and an sr-only "completed". Earlier steps stay `<button>`s. For `step() === 'success'` the indicator renders the same list with all four completed (replacing the plain "Booked" text) and no buttons; below 640 px it keeps "Booked". Below 640 px other steps keep "Step N of 4: name".
- **Branch step** (Req 6.2, 6.3): F3's search field (`Search branches`, 150 ms debounce, accent-insensitive) and its no-match empty state already satisfy Req 6.2; it gets a leading `lucideSearch` icon and a clear button (`aria-label="Clear search"`) when non-empty. The card keeps F3's **"Open now" / "Closed"** badge computed by `isOpenNow` in the branch's zone, restyled to the `success` / `muted` variants. **This replaces Req 6.3's "Open today / Closed today" wording** (see Open questions): "Open now" is what F3 already computes and tests, and it is the more useful fact.
- **Selected card** (Req 6.4): `aria-checked:border-primary aria-checked:bg-accent/50` plus a leading 16 px radio dot (`rounded-full border-2`, inner dot when checked), `aria-hidden`. Same for service cards.
- **Action bar** (Req 6.5): Back gets `lucideArrowLeft`, Continue/Confirm `lucideArrowRight`; position classes unchanged.

#### Month calendar (Req 7)

`core/time/month-grid.ts`:

```ts
export interface MonthDay {
  date: string; // 'yyyy-MM-dd'
  day: number;
  inMonth: boolean; // false for leading/trailing days of adjacent months
  bookable: boolean; // inside [today, today + LAST_DAY_OFFSET]
  isToday: boolean;
  fullLabel: string; // 'Wednesday, 21 October 2026'
}
export interface MonthGrid {
  year: number;
  month: number;
  title: string;
  weeks: MonthDay[][];
}
/** Weeks Monday to Sunday covering `month`; bookability from the window's first and last day. */
export function monthGrid(
  year: number,
  month: number,
  firstBookable: string,
  lastBookable: string,
): MonthGrid;
/** The months (as 'yyyy-MM') the window touches: one or two. */
export function windowMonths(firstBookable: string, lastBookable: string): string[];
```

It formats with `Intl` in `timeZone: 'UTC'` on noon-UTC instants, exactly like `dayStrip`, so a day's label never shifts with the browser's zone. The window comes from `store.strip()` (first and last item), so `LAST_DAY_OFFSET` stays the single source.

`MonthCalendarComponent` (`components/month-calendar.component.ts`), replacing `DateStripComponent` in `date-time-step`:

- State: `visibleMonth = linkedSignal(() => month of store.date() ?? store.todayInBranch())`; previous/next buttons (`aria-label="Previous month"` / `"Next month"`) move within `windowMonths`, disabled at the ends (Req 7.2).
- Markup and pattern (Req 7.4): the **WAI-ARIA date-picker grid**: `<table role="grid" aria-labelledby="<title id>">`, weekday `<th scope="col" abbr="Monday">Mon</th>`, each day a `<td role="gridcell" aria-selected>` holding a `<button>` with `aria-label` = full date (prefixed "Today, " for today) and `disabled`/`aria-disabled` when not bookable. Days outside the visible month render empty cells. One roving `tabindex="0"` on the focused day (the selected day, else the first bookable one).
- Keys: ArrowLeft/Right ±1 day, ArrowUp/Down ±7 days, Home/End first/last day of the week, PageUp/PageDown previous/next month (clamped to the window), Enter/Space select. Moves skip to the nearest bookable day in that direction and stop at the window's edge; crossing a month boundary switches `visibleMonth`. Focus never selects (selection is an explicit Enter/Space or click), unlike the strip's radio behaviour, because the grid pattern separates focus from selection; the slot search debounce is therefore not stressed.
- Look (Req 7.3): days `size-10 rounded-full`; selected `bg-primary text-primary-foreground`; today `ring-2 ring-primary/50`; non-bookable `text-muted-foreground/60`, no hover.
- Selecting calls `store.chooseDate(date)`; nothing else changes in the store (Req 7.3, 7.7).

Layout (Req 7.5): `date-time-step` becomes `md:grid md:grid-cols-[minmax(0,20rem)_1fr] md:gap-6`, calendar in a card on the left, the zone line and `app-slots-status` (title "Available times") on the right.

Time grid (Req 7.6): `slot-groups` grid becomes `grid-cols-2 sm:grid-cols-3` with the day-part headings kept; `slot-chip` becomes `rounded-lg border border-input bg-card h-11` with `aria-checked:bg-primary aria-checked:text-primary-foreground aria-checked:border-primary`; the capacity hint moves under the time in `text-xs`. Roles, names and the radio group are unchanged.

#### Review (Req 8.1, 8.2)

`review-card.component.ts` becomes the "Booking summary" card: a header row with the title (an `<h3>`) and four `dl` rows (`grid-cols-[auto_1fr_auto]`, `divide-y`): icon tile, the term and value, and an "Edit" `<button>` (`aria-label="Edit branch"` etc.) that emits `edit` with the step id; `review-step` maps it to `store.goTo(step)`, which keeps the earlier choices (F3: editing the branch starts over, editing the service keeps the branch, editing the date keeps branch and service). The success step renders the same card without Edit buttons (`editable` input, default `false`).

Contact row: a new `contact` input (`{ email, phoneNumber } | null`). `review-step` and `success-step` read `SessionStore.profile()` and call its existing `fetchProfile()` when `profileStatus()` is `idle`; while the profile is not ready the row shows the session email only, and on a failed fetch it shows the email only (no error UI; the row is informative).

#### Success (Req 8.3 to 8.5)

`success-step.component.ts`: a `size-20 rounded-full bg-success-soft` circle around `success-check` (stroke `text-success`); `<h2>` **"Booking confirmed!"**; the sentence; the reference card `rounded-xl bg-success-soft text-success-soft-foreground` with the label "Booking reference", the id in `font-mono` (wraps with `break-all`) and the existing copy button; the summary card; actions: `app-calendar-button` (filled), `<a hlmBtn variant="outline" [routerLink]="['/appointments', id]">View details</a>`, then text links "Book another" (`store.bookAnother()`) and "Back to home" (`/`). Confetti colours read `--color-brand-500`, `--color-lavender-400`, `--color-success` with a fallback `['#6366f1', '#a78bfa', '#34d399', '#c7d2fe']` (Req 8.5, 1.7).

### Other screens (Req 9)

Appointment status badge: Booked `default` (indigo), Cancelled `muted`. Admin status badge: Active `success`, Inactive `muted`. No other template changes; a visual pass lists anything that looks wrong as tasks before the PR.

### API calls

None added or changed. The profile fetch already exists (`GET /api/auth/me` via `SessionStore`).

## State and data model

No new persisted state; `sa.theme` unchanged. New local state: `MonthCalendarComponent.visibleMonth` and its focused date (component signals, not in the URL).

## Error handling

No new error paths. The Contact row degrades to the email when the profile is unavailable (Req 8.1).

## Accessibility summary

- Contrast by construction (table above); axe suites in both themes stay the gate (Req 1.4).
- The calendar follows the WAI-ARIA date-picker grid; every day has a full-date name; disabled days are announced as unavailable (Req 7.4).
- Illustrations and the hero card are `aria-hidden` and not focusable (Req 3.3, 5.1).
- Icons added to buttons and inputs are `aria-hidden`; names do not change (Req 2, 5.4, 6.5).
- Motion stays within F2/F3 rules; the calendar has no animation.

## Chunk budget

Inline SVGs are the main growth: the hero scene and card (estimated 4 to 6 kB gzip) land in the public group (30.2 of 50 kB), and the calendar plus `month-grid` (about 3 kB) in the book group. The date strip goes away. Budgets stay unchanged (Req 10.3).

## Testing strategy

| Req           | Test                                                                                                                                                                                                                                                                                                                                    |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1, 1.7      | Vitest: no teal hex or `teal-` in `src/`/`public/`; confetti reads `--color-*` names                                                                                                                                                                                                                                                    |
| 1.2 to 1.4, 9 | Existing axe e2e suites (public, book, appointments, admin) in light and dark, unchanged                                                                                                                                                                                                                                                |
| 2             | `theme-toggle.spec`, shell specs: names, roles, `aria-current`, unchanged layout classes                                                                                                                                                                                                                                                |
| 3, 4          | `landing.page.spec` and `landing-sections.spec` updated: pill, headline, four tiles, no `<img>`/external URL, reveal rules                                                                                                                                                                                                              |
| 5             | `auth-layout.component.spec` (form first, aside `hidden lg:flex`, tagline input), register/login specs (eyebrow, icons `aria-hidden`, accessible names unchanged, 5 `.sr-only`)                                                                                                                                                         |
| 6.1           | `step-indicator.component.spec` rewritten: circles, completed state, success all-complete, small-screen text                                                                                                                                                                                                                            |
| 6.2, 6.4      | `branch-step.component.spec`: clear button, existing search tests kept                                                                                                                                                                                                                                                                  |
| 7             | `month-grid.spec` (window inside one month, across two months, month/year boundary, leading/trailing days, labels in a non-UTC browser zone); `month-calendar.component.spec` (only bookable enabled, navigation limits, every key, focus vs selection, `chooseDate` called, today/selected marks); `date-strip.component.spec` deleted |
| 7.6, 7.7      | `slot-groups.component.spec`, `slots-status.component.spec` kept green                                                                                                                                                                                                                                                                  |
| 8             | `review-step.component.spec` (Edit goes to the step, Contact row with and without profile), `success-step.component.spec` (heading, reference card, View details link)                                                                                                                                                                  |
| 10.2          | e2e `book-helpers.ts` gains `pickDate(page, date)` (clicks the calendar day by its full-date name); "You're booked" becomes "Booking confirmed!" in the 13 places                                                                                                                                                                       |
| 10.4          | Manual check against the Compose gateway, screenshots at 1280 and 390 px, light and dark                                                                                                                                                                                                                                                |

## Open questions

1. **Req 6.3 badge wording.** F3 already shows "Open now" / "Closed" (computed live in the branch's zone, with today's hours). The design keeps that and restyles it, instead of adding "Open today" / "Closed today". Approving this design amends Req 6.3 accordingly.
2. **Calendar selection model.** The grid pattern moves focus with the arrows and selects with Enter/Space or a click (the strip selected on arrow). This is the standard date-picker behaviour; approving the design accepts it.

## Implementation deviations

Where the build differs from this design:

- Stepper buttons keep the F3 names ("N. Label") through screen-reader text, with "completed" added by `aria-describedby`.
- The inline "Clear search" button shows only when results exist; the empty state has its own.
- The Open now / Closed badge sits top-right on the branch card and is part of its `aria-describedby`.
- Calendar: the arrows, Home and End clamp to the 14-day window, Page Up and Page Down do nothing outside it, and clicking the selected day again does nothing.
- "Available times" is a `<p>`, not an `<h3>`, because the F3 slot-groups spec asserts the `<h3>` list.
- Day labels include the year and follow the runtime locale.
- The summary is one `<dl>` per row with per-row Edit buttons ("Edit branch", "Edit service", "Edit date and time"), hidden while a confirm is in flight.
- "Book another" stays a button styled as a link; "View my appointments" was replaced by "View details" and "Back to home".
- The landing secondary call to action also got an arrow.
- The landing `<h1>` text changed, so `e2e/public.a11y`, `e2e/smoke` and `routes.spec` were updated.
- Tasks 4 and 5 were one commit.
- The collapsed admin sidebar shows only the icon tile (its `aria-label` is kept).
- The wordmark truncates at 320 px.
- Past Booked appointments use the muted badge.
- Polish after the screenshot review:
  - The dark hero gradient never applied, because the `:where(.dark) .hero` rule does not survive Angular's view encapsulation and the light lavender gradient showed through as a grey band. It now uses `:host-context(.dark)` with a deep indigo and violet glow, and a lighter grain.
  - The public and staff headers collapse the brand to its icon tile below `sm` (a new `collapseOnPhone` input on `BrandMark`; the name stays as screen-reader text), so the theme toggle and buttons fit one row at 390 px. At 320 px the public header may still wrap.
  - The booking reference uses a smaller, tighter monospace (`text-sm`, `sm:text-base`, `tracking-tight`, still `break-all`) so the 36-character id fits one line on desktop.
  - The summary card has top padding above "You can cancel this appointment from My appointments."
