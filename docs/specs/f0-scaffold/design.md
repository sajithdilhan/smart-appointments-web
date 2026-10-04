# F0 Scaffold and tooling — Design

## Overview

F0 is configuration, not application code. The approach is: generate the workspace with the Angular CLI, layer Tailwind v4 and Spartan on top, add the quality gates, make the API origin a runtime value, and ship the result as a hardened nginx image checked by CI. Four decisions are not obvious and drive the rest:

1. **The pre-paint theme script is an external same-origin file** (`/theme-init.js`), not an inline script with a hash. Angular rewrites `index.html` during the build, so a hash computed from the source file could drift, and an external file keeps `script-src 'self'` free of `'unsafe-inline'` and of build-time hashing (Req 2.8, 7.8). Cost: one tiny blocking request, served `no-cache`.
2. **Critical-CSS inlining is turned off** (`optimization.styles.inlineCritical: false`). Angular's inlining emits `<link media="print" onload="this.media='all'">`, an inline event handler that a strict `script-src` blocks. With it off, the stylesheet is a normal render-blocking `<link>` (Req 7.8).
3. **The config error page is plain DOM, not an Angular component.** If the config is bad, the initializer renders the page with `document.createElement` and aborts bootstrap by rejecting, so it works even when Tailwind, Spartan and the router never loaded (Req 6.4, 6.5).
4. **All runtime-generated nginx state goes under `/tmp/runtime`** (a `tmpfs`), so the root filesystem can be read-only and nginx-unprivileged can run as non-root (Req 7.3, 8.6).

Verified at scaffold time, not now (versions float, Req 1.4): the exact CLI flags, Spartan CLI generator names and Vitest builder options below. Record deviations in the README.

## Architecture

| Area                 | Contents                                                                                                                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/core/`      | `config/` (`app-config.ts` token and type, `load-config.ts` pure loader, `config-error.ts` DOM error page, `config.provider.ts` initializer), `theme/theme.service.ts`                                                                                                    |
| `src/app/shared/ui/` | Spartan helm components: `button`, `card`, `input`, `label`, `switch`, `sonner`; and `theme-toggle/` (app primitive)                                                                                                                                                      |
| `src/app/features/`  | empty (`.gitkeep`); F1+ add `public/`, `customer/`, `admin/`, `staff/`                                                                                                                                                                                                    |
| `src/app/`           | `app.ts` (placeholder page), `app.config.ts`, `app.routes.ts` (one lazy placeholder route)                                                                                                                                                                                |
| `public/`            | `config.json` (dev default), `theme-init.js`, `favicon.ico`                                                                                                                                                                                                               |
| `src/testing/`       | `setup.ts` (MSW server lifecycle), `server.ts`, `handlers.ts`                                                                                                                                                                                                             |
| `e2e/`               | `smoke.spec.ts`                                                                                                                                                                                                                                                           |
| `docker/`            | `nginx.conf`, `security.conf`, `config.json.template`, `40-config.sh`                                                                                                                                                                                                     |
| `scripts/`           | `size.mjs`                                                                                                                                                                                                                                                                |
| root                 | `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `.env.example`, `.github/workflows/ci.yml`, `.nvmrc`, `.editorconfig`, `.gitattributes`, `eslint.config.js`, `.prettierrc.json`, `commitlint.config.js`, `.husky/`, `playwright.config.ts`, `README.md`, `CLAUDE.md` |

Dependency direction: `features → shared, core`; `shared → core`; `core` imports neither (Req 1.8). ESLint enforces it with `no-restricted-imports` zones (Req 3.1).

## Components and interfaces

### Scaffold commands (Req 1.1, 1.2, 1.4, 1.5, 1.7)

```powershell
node -v                                   # must match .nvmrc
corepack enable; corepack prepare pnpm@latest --activate

# Generate beside the existing docs/ (ng new refuses a non-empty directory, so
# generate in a scratch folder, then move everything but .git into the repo).
ng new smart-appointments-web --directory scaffold-tmp `
  --style=css --routing --ssr=false --zoneless `
  --test-runner=vitest --package-manager=pnpm --skip-git --strict
```

Flag intent: plain CSS because Tailwind v4 is CSS-first and SCSS adds a second pipeline; `--zoneless` registers `provideZonelessChangeDetection()` and omits `zone.js`; `--ssr=false` (a pure SPA behind nginx); `--strict` turns on strict TypeScript and strict templates. If a flag is renamed in the then-current CLI, take the nearest equivalent and record it. After the move:

- `package.json`: add `"packageManager": "pnpm@<exact>"`, `"engines": {"node": ">=<LTS major>"}`, `"preinstall": "npx only-allow pnpm"`, and the scripts of Req 1.7: `start` `ng serve`, `build` `ng build`, `test` `ng test --watch=false`, `test:watch` `ng test`, `lint` `eslint . --max-warnings 0`, `format` `prettier --write .`, `format:check` `prettier --check .`, `typecheck` `tsc -p tsconfig.app.json --noEmit && tsc -p tsconfig.spec.json --noEmit`, `size` `node scripts/size.mjs`, `e2e` `playwright test`, `prepare` `husky`.
- `.nvmrc`: the LTS major only, e.g. `24`.
- `tsconfig.json`: add `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature`, `isolatedModules`; `angularCompilerOptions` gets `strictTemplates`, `strictInjectionParameters`, `strictInputAccessModifiers` (the CLI already sets some; ensure all).
- `angular.json`: assets move to the `public/` folder convention (the generated default); `polyfills` must not list `zone.js` (Req 1.5).

### Tailwind v4 and Spartan (Req 2.1, 2.2)

```powershell
pnpm add tailwindcss @tailwindcss/postcss postcss        # or @tailwindcss/vite if the builder uses Vite
pnpm add @fontsource-variable/inter lucide-angular ngx-sonner
pnpm add @angular/cdk @spartan-ng/brain
pnpm add -D @spartan-ng/cli prettier-plugin-tailwindcss
pnpm ng g @spartan-ng/cli:init
pnpm ng g @spartan-ng/cli:ui button card input label switch sonner
```

- `.postcssrc.json`: `{ "plugins": { "@tailwindcss/postcss": {} } }` (Angular's application builder reads it).
- `src/styles.css` begins `@import "tailwindcss";` then the font import, `@custom-variant dark (&:where(.dark, .dark *));`, the token sheet below, and a `@layer base` block (Req 2.3).
- Spartan CLI is configured through `components.json` (or its prompts) so the helm output path is `src/app/shared/ui/` and the import alias is `@app/shared/ui/*` (add to `tsconfig.json` `paths`). The default `libs/ui` location is overridden.
- F0 generates only `button`, `card`, `input`, `label`, `switch` and `sonner`: the baseline every later screen needs. The placeholder page renders a button (Req 2.2) and a card containing a disabled-looking sample input and label so that all four visual primitives are exercised; `sonner` is generated but its `<hlm-toaster>` is only mounted once F1 has toasts. Further helm components are generated by the feature that needs them.
- Helm components use shadcn-style semantic classes (`bg-primary`, `text-muted-foreground`, `border-input`, `ring-ring`). The token sheet defines exactly those names, so generated components need no recolouring.

### Token sheet (Req 2.3, 2.4, 2.5)

`src/styles.css` (illustrative; hex values are the Tailwind v4 palette values and are final):

```css
@import 'tailwindcss';
@import '@fontsource-variable/inter';
@custom-variant dark (&:where(.dark, .dark *));

@theme {
  --font-sans: 'Inter Variable', ui-sans-serif, system-ui, sans-serif;

  /* Brand ramp: teal. Only 700 (light) and 400 (dark) carry text or filled buttons. */
  --color-brand-50: #f0fdfa;
  --color-brand-100: #ccfbf1;
  --color-brand-200: #99f6e4;
  --color-brand-300: #5eead4;
  --color-brand-400: #2dd4bf;
  --color-brand-500: #14b8a6;
  --color-brand-600: #0d9488;
  --color-brand-700: #0f766e;
  --color-brand-800: #115e59;
  --color-brand-900: #134e4a;
  --color-brand-950: #042f2e;

  /* Semantic tokens: values switch with the theme (see :root and .dark below). */
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);

  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;
  --shadow-soft: 0 1px 2px rgb(0 0 0 / 0.05), 0 4px 12px rgb(0 0 0 / 0.06);
  --shadow-lifted: 0 2px 4px rgb(0 0 0 / 0.06), 0 12px 32px rgb(0 0 0 / 0.12);
}

:root {
  /* light */
  --background: #ffffff;
  --foreground: #09090b; /* zinc-950 */
  --card: #ffffff;
  --card-foreground: #09090b;
  --muted: #f4f4f5;
  --muted-foreground: #52525b; /* zinc-100 / zinc-600 */
  --border: #e4e4e7;
  --input: #71717a; /* zinc-200 / zinc-500 */
  --ring: #0d9488; /* teal-600 */
  --primary: #0f766e;
  --primary-foreground: #ffffff; /* teal-700 */
  --accent: #f0fdfa;
  --accent-foreground: #115e59; /* teal-50 / teal-800 */
  --destructive: #dc2626;
  --destructive-foreground: #ffffff;
  --success: #15803d;
  --success-foreground: #ffffff;
  --warning: #b45309;
  --warning-foreground: #ffffff;
}

.dark {
  --background: #09090b;
  --foreground: #fafafa;
  --card: #18181b;
  --card-foreground: #fafafa; /* zinc-900 */
  --muted: #27272a;
  --muted-foreground: #a1a1aa; /* zinc-800 / zinc-400 */
  --border: #27272a;
  --input: #71717a;
  --ring: #2dd4bf; /* teal-400 */
  --primary: #2dd4bf;
  --primary-foreground: #09090b;
  --accent: #134e4a;
  --accent-foreground: #99f6e4;
  --destructive: #f87171;
  --destructive-foreground: #09090b;
  --success: #4ade80;
  --success-foreground: #09090b;
  --warning: #fbbf24;
  --warning-foreground: #09090b;
}

@layer base {
  html {
    color-scheme: light;
  }
  html.dark {
    color-scheme: dark;
  }
  body {
    @apply bg-background font-sans text-foreground antialiased;
  }
  *:focus-visible {
    @apply outline-2 outline-offset-2 outline-ring;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  ::before,
  ::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

**Measured WCAG contrast** (WCAG relative-luminance formula; computed during design). Thresholds: 4.5:1 text, 3:1 large text and UI components (Req 2.4).

| Pair                                      | Ratio        | Use                              | Result                                              |
| ----------------------------------------- | ------------ | -------------------------------- | --------------------------------------------------- |
| teal-600 `#0d9488` on white               | 3.74         | focus ring, icons, large text    | passes 3:1 only                                     |
| white on teal-600                         | 3.74         | (not used for buttons)           | **fails 4.5:1** — reason the brand-fill is teal-700 |
| white on teal-700 `#0f766e`               | 5.47         | light primary button, text links | passes                                              |
| zinc-950 on teal-400 `#2dd4bf`            | 10.69        | dark primary button              | passes                                              |
| teal-400 on zinc-950 / on zinc-900        | 10.69 / 9.52 | dark ring, links                 | passes                                              |
| zinc-950 on white                         | 19.9         | body text, light                 | passes                                              |
| zinc-600 on white                         | 7.73         | muted text, light                | passes                                              |
| zinc-400 on zinc-950 / zinc-900           | 7.76 / 6.91  | muted text, dark                 | passes                                              |
| zinc-500 `#71717a` on white / on zinc-950 | 4.83 / 4.12  | input border (needs 3:1)         | passes                                              |
| white on red-600; zinc-950 on red-400     | 4.83; 7.19   | destructive, light; dark         | passes                                              |
| white on green-700; zinc-950 on green-400 | 5.02; 11.42  | success                          | passes                                              |
| white on amber-700; zinc-950 on amber-400 | 5.02; 11.92  | warning                          | passes                                              |
| zinc-200 border on white                  | ~1.2         | decorative card dividers only    | not required (non-interactive)                      |

Rules that follow: teal-600 is never text on white; interactive control boundaries (input, checkbox) use `--input` (3:1+), not `--border`; and muted text never uses zinc-500 on a dark background (4.12 fails 4.5). A unit test reads the token sheet and asserts each text pair meets the ratio (a small `contrast.spec.ts` with the luminance formula, parsing `:root` and `.dark` blocks), so a later token edit cannot regress this silently (Req 2.4).

Font: `@import '@fontsource-variable/inter'` makes the build emit the woff2 files as hashed assets under the app origin, so `font-src 'self'` suffices (Req 2.5, 7.8).

### Theme (Req 2.6-2.10)

```ts
export type ThemePreference = 'system' | 'light' | 'dark';
const KEY = 'sa.theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly preference = signal<ThemePreference>(this.read());
  readonly isDark = computed(() => /* preference === 'dark' || (preference === 'system' && systemDark()) */);
  private readonly systemDark = signal(matchMedia('(prefers-color-scheme: dark)').matches);
  constructor() {
    // media query listener updates systemDark; an effect applies
    // document.documentElement.classList.toggle('dark', this.isDark())
  }
  set(pref: ThemePreference): void { /* update signal; try { localStorage.setItem(KEY, pref) } catch {} */ }
  private read(): ThemePreference { /* try { validate stored value } catch { return 'system' } */ }
}
```

- Storage is wrapped in `try/catch` on every read and write; an invalid stored value is treated as `system` (Req 2.7).
- `theme-init.js` in `public/` (blocking, in `<head>` before the stylesheet) duplicates the read logic in about 8 lines of ES5: read `sa.theme` in a `try`, resolve against `matchMedia`, add `dark` to `<html>` (Req 2.8). A unit test loads the file text and evaluates it against stubbed `localStorage`/`matchMedia` so the two copies cannot diverge.
- `ThemeToggle` (`shared/ui/theme-toggle/`): a three-option segmented control (`system`, `light`, `dark`; lucide `monitor`, `sun`, `moon`) with `role="radiogroup"`, each option a `role="radio"` button with `aria-checked`, arrow-key navigation, visible focus ring, and an `aria-label` per option ("Use system theme", ...). It satisfies "accessible name, announced state, keyboard operable" (Req 2.9). The e2e smoke test clicks "Use dark theme" (Req 4.7).
- The reduced-motion rule is the global block in the token sheet (Req 2.10).

### Runtime configuration (Req 6.1-6.7)

```ts
export interface AppConfig {
  readonly apiBaseUrl: string;
}
export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG');

export type ConfigResult = { ok: true; config: AppConfig } | { ok: false; reason: string }; // human-readable, no response body

export async function loadConfig(fetchFn: typeof fetch, timeoutMs = 5000): Promise<ConfigResult>;
```

`loadConfig` fetches `'/config.json'` with `{ cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) }`, then: network error / abort → `"could not reach config.json"`; non-2xx → `"config.json returned <status>"`; invalid JSON → `"config.json is not valid JSON"`; missing/blank → `"apiBaseUrl is missing"`; fails `new URL()` or protocol not `http:`/`https:` → `"apiBaseUrl is not a valid http(s) URL"`; success → `{ apiBaseUrl: url.origin }` (Req 6.3, 6.4). It is pure apart from the fetch it is handed, so unit tests pass a stub (Req 6.6).

`config.provider.ts`:

```ts
export function provideAppConfig(): EnvironmentProviders {
  let loaded: AppConfig;
  return makeEnvironmentProviders([
    provideAppInitializer(async () => {
      const result = await loadConfig(fetch);
      if (!result.ok) {
        renderConfigError(result.reason);
        throw new Error(result.reason);
      }
      loaded = result.config;
    }),
    { provide: APP_CONFIG, useFactory: () => loaded },
  ]);
}
```

`main.ts` catches the bootstrap rejection and does nothing further (the page is already rendered). `renderConfigError(reason)` replaces `document.body` content with a centred block built by DOM calls: an `<h1>` "Configuration error", a paragraph "The application is not configured correctly. Ask whoever runs this deployment to check the API address.", the `reason` as `textContent` (never `innerHTML`), and a `<button>` "Try again" calling `location.reload()`. It sets `document.title = 'Configuration error'`, uses element `style` assignments only (system font, large readable text, dark-on-light with 7:1 contrast; no Tailwind), focuses the button, and uses `role="alert"` on the container. The reason is one of the fixed strings above, so no response body is ever shown (Req 6.5).

`public/config.json` is `{ "apiBaseUrl": "http://localhost:5290" }` and is copied by the build as an asset; the container overwrites what nginx serves at that URL (Req 6.2, 7.4). `grep -r "localhost:5290" dist/` finds only that file: the CI `build` job runs it (Req 6.7, 9.2).

### Quality gates (Req 3)

- **ESLint** (`eslint.config.js`, flat): `tseslint.config(...)` with `eslint.configs.recommended`, `tseslint.configs.recommended`/`stylistic`, `angular.configs.tsRecommended` and `angular.configs.templateRecommended` + `templateAccessibility`. Rules: `@angular-eslint/prefer-on-push-component-change-detection: error`, `prefer-standalone: error`, `prefer-inject: error`, `@typescript-eslint/no-explicit-any: error`, directive/component selector prefixes `app` (helm files exempt via an override for `src/app/shared/ui/**`, which are generated and use `hlm`/`brn` prefixes). `no-restricted-imports` zones for the layering. `ignores`: `dist`, `.angular`, `coverage`, `playwright-report`, `src/app/core/api/generated` (F1) (Req 3.1).
- **Prettier** (`.prettierrc.json`): `singleQuote`, `printWidth: 100`, `plugins: ["prettier-plugin-tailwindcss"]`, with `tailwindStylesheet: "./src/styles.css"` (v4 requires it) and an `overrides` entry for `*.html` with `parser: "angular"`. `.prettierignore`: `dist`, `.angular`, `coverage`, `pnpm-lock.yaml`, generated API types (Req 3.2).
- **Husky**: `pnpm exec husky init`, then `.husky/pre-commit` = `pnpm exec lint-staged`, `.husky/commit-msg` = `pnpm exec commitlint --edit "$1"`. The `prepare` script is `husky`; in CI `HUSKY=0` is set (Req 3.3, 3.6).
- **lint-staged** (`package.json`): `"*.{ts,html}": ["eslint --fix --max-warnings 0", "prettier --write"]`, `"*.{css,json,md,yml,yaml}": "prettier --write"` (Req 3.3).
- **commitlint** (`commitlint.config.js`): `export default { extends: ['@commitlint/config-conventional'] }`. Verify with `echo "fix stuff" | pnpm exec commitlint` (fails) and `echo "feat(core): add theme service" | pnpm exec commitlint` (passes) (Req 3.4).
- **EditorConfig / attributes**: `.editorconfig` (`root`, `utf-8`, `lf`, two spaces, final newline, trim trailing whitespace except `*.md`); `.gitattributes`: `* text=auto eol=lf` plus `*.png *.ico *.woff2 binary` (Req 3.5).

### Unit tests (Req 4.1-4.5)

- The CLI's Vitest builder runs `ng test`; `angular.json` `test` target gets `setupFiles: ["src/testing/setup.ts"]` and `coverage` reporters (`text`, `html`, `lcov`) so `pnpm test -- --coverage` works (Req 4.4).
- Dev dependencies: `@testing-library/angular`, `@testing-library/dom`, `@testing-library/jest-dom`, `@testing-library/user-event`, `msw`.
- `src/testing/setup.ts`: `import '@testing-library/jest-dom/vitest'`; `beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))`, `afterEach(() => server.resetHandlers())`, `afterAll(() => server.close())`. `server.ts` exports `setupServer(...handlers)` from `msw/node`; `handlers.ts` exports `[]` (Req 4.5).
- Tests: `app.spec.ts` renders `App` with `render()` and asserts `getByRole('heading', { name: /smart appointments/i })` (Req 4.3a); `theme.service.spec.ts` (Req 4.3b, with `vi.stubGlobal('matchMedia', ...)` and a throwing `localStorage`); `load-config.spec.ts` with a table of cases (200 valid, trailing slash and path normalised, 404, 500, network reject, abort/timeout via fake timers, invalid JSON, missing, blank, `ftp://x`, `not a url`) (Req 6.6); `config-error.spec.ts` asserts heading, reason text, the title, and the button's reload; `contrast.spec.ts` (token sheet); `theme-init.spec.ts`. Queries are by role; no `fakeAsync` (zoneless).

### Playwright (Req 4.6-4.8)

`playwright.config.ts`:

```ts
const baseURL = process.env['E2E_BASE_URL'] ?? 'http://localhost:4200';
export default defineConfig({
  testDir: 'e2e',
  retries: process.env['CI'] ? 2 : 0,
  use: { baseURL, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env['E2E_BASE_URL']
    ? undefined
    : { command: 'pnpm start', url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});
```

- Locally the suite runs against `ng serve`. In CI the `e2e` job serves the already built static files: `pnpm exec sirv dist/smart-appointments-web/browser --single --port 4300` (devDependency `sirv-cli`; `--single` is the SPA fallback), then `E2E_BASE_URL=http://localhost:4300 pnpm e2e`. This tests the production bundle with no dev server.
- `e2e/smoke.spec.ts`, three tests: (1) opens `/`, expects the title and the heading "Smart Appointments"; (2) clicks "Use dark theme", expects `html` to have class `dark`, reloads, expects it still has it (proves persistence and the pre-paint script); (3) `page.route('**/config.json', r => r.fulfill({ status: 500 }))`, opens `/`, expects the title `Configuration error` and an enabled "Try again" button. None needs the backend (Req 4.7).

### Bundle budgets and size check (Req 5)

`angular.json`, production configuration:

```json
"budgets": [
  { "type": "initial", "maximumWarning": "500kB", "maximumError": "700kB" },
  { "type": "anyComponentStyle", "maximumWarning": "4kB", "maximumError": "8kB" }
],
"optimization": { "scripts": true, "styles": { "minify": true, "inlineCritical": false }, "fonts": false }
```

(`fonts: false` also stops the build fetching Google Fonts, matching Req 2.5.) The numbers are justified in Req 5.2: the scaffold should land near 100 to 150 kB raw, leaving at least 550 kB of headroom for F1 to F5.

`scripts/size.mjs` (Node ESM, no dependencies): read `dist/smart-appointments-web/browser/index.html`; collect `<script src>`, `<link rel="modulepreload" href>` and `<link rel="stylesheet" href>` targets (these are the initial files); gzip each with `zlib.gzipSync(buf, { level: 9 })`; print a table (file, raw kB, gzip kB) and the total; exit 1 if the gzip total exceeds 250 kB (`MAX_GZIP_KB`, default 250). Font files are excluded because they are not in the initial script/style set and are loaded on demand by the stylesheet (Req 5.3, 5.4). `app.routes.ts` declares `{ path: 'about', loadComponent: () => import('./features/placeholder/placeholder') }` style lazy placeholder and a `**` redirect (Req 5.5).

### Container (Req 7)

`Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1
ARG NODE_VERSION=24
ARG NGINX_TAG=1.29-alpine        # nginxinc/nginx-unprivileged; pin at scaffold time

FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
RUN corepack enable
# Dependencies first: only package.json and the lock file invalidate this layer.
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm fetch && pnpm install --frozen-lockfile --offline --ignore-scripts
COPY . .
RUN pnpm build

FROM nginxinc/nginx-unprivileged:${NGINX_TAG}
COPY --from=build /app/dist/smart-appointments-web/browser /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/security.conf /etc/nginx/snippets/security.conf
COPY docker/config.json.template /etc/nginx/runtime/config.json.template
COPY --chmod=0755 docker/40-config.sh /docker-entrypoint.d/40-config.sh
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
```

`pnpm fetch` populates the store from the lock file alone and `--ignore-scripts` skips `prepare` (Husky) in the image (Req 7.1). The base is `nginxinc/nginx-unprivileged` (UID 101, port 8080, pid and temp files in `/tmp`) (Req 7.3). `.dockerignore` per Req 7.2, plus `docs`, `e2e` and `.github`.

`docker/nginx.conf` (replaces `default.conf`):

```nginx
server {
  listen 8080;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  gzip on;
  gzip_comp_level 6;
  gzip_min_length 256;
  gzip_vary on;
  gzip_types text/plain text/css application/javascript text/javascript
             application/json image/svg+xml;

  server_tokens off;

  location = /healthz {
    access_log off;
    default_type text/plain;
    include /etc/nginx/snippets/security.conf;
    return 200 "ok\n";
  }

  # Written at start by 40-config.sh; the root filesystem is read-only.
  location = /config.json {
    alias /tmp/runtime/config.json;
    default_type application/json;
    add_header Cache-Control "no-cache" always;
    include /etc/nginx/snippets/security.conf;
  }

  location = /theme-init.js {
    add_header Cache-Control "no-cache" always;
    include /etc/nginx/snippets/security.conf;
  }

  # Hashed build output and self-hosted fonts.
  location ~* \.(?:js|css|woff2?)$ {
    add_header Cache-Control "public, max-age=31536000, immutable" always;
    include /etc/nginx/snippets/security.conf;
    try_files $uri =404;
  }

  # Anything else with a file extension must exist; otherwise 404 (Req 7.6.1).
  location ~* \.[a-z0-9]+$ {
    include /etc/nginx/snippets/security.conf;
    try_files $uri =404;
  }

  # SPA fallback: extension-less paths get index.html, revalidated every time.
  location / {
    add_header Cache-Control "no-cache" always;
    include /etc/nginx/snippets/security.conf;
    try_files $uri /index.html;
  }

  error_page 404 /404.txt;
  location = /404.txt { internal; return 404 "not found\n"; include /etc/nginx/snippets/security.conf; }
}
```

Notes: the `theme-init.js` block precedes the extension regexes because exact-match locations win. `include` inside `location = /404.txt` ensures headers on error responses (Req 7.7); every location that uses `add_header` repeats the include because nginx does not inherit `add_header` once a location defines its own.

`docker/security.conf`:

```nginx
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;
add_header X-Frame-Options "DENY" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;
include /tmp/runtime/csp.conf;
```

`/tmp/runtime/csp.conf` is generated and holds one line, `add_header Content-Security-Policy "<policy>" always;` (Req 7.5, 7.7, 7.8).

`docker/config.json.template`: `{"apiBaseUrl":"${API_BASE_URL_JSON}"}`.

`docker/40-config.sh` (POSIX sh, LF endings, executable):

```sh
#!/bin/sh
set -eu
OUT=/tmp/runtime
mkdir -p "$OUT"
RAW="${API_BASE_URL:-}"

# JSON-escape backslashes and quotes (Req 7.4).
API_BASE_URL_JSON=$(printf '%s' "$RAW" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')
export API_BASE_URL_JSON
envsubst '${API_BASE_URL_JSON}' < /etc/nginx/runtime/config.json.template > "$OUT/config.json"

# Origin for connect-src: scheme://host[:port] only, strict charset, else none (Req 7.5).
ORIGIN=$(printf '%s' "$RAW" | sed -nE 's#^(https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?)(/.*)?$#\1#p')
CONNECT="'self'"
[ -n "$ORIGIN" ] && CONNECT="'self' $ORIGIN"

CSP="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src ${CONNECT}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"
printf 'add_header Content-Security-Policy "%s" always;\n' "$CSP" > "$OUT/csp.conf"
echo "config: apiBaseUrl='${RAW}' connect-src=${CONNECT}"
```

The strict character class cannot pass a quote, semicolon or space into the CSP, so a hostile value cannot inject policy directives (Req 7.5). An empty `API_BASE_URL` yields `{"apiBaseUrl":""}` and the SPA shows the error page (Req 7.4). Verify with `docker run -e API_BASE_URL='http://x"; evil' ...` that `connect-src` is `'self'` and `config.json` is valid JSON (a CI step, below). IPv6 literal origins are not supported and fall back to `'self'` (Known gap in practice; recorded under Open questions).

`docker-compose.yml` (Req 8):

```yaml
services:
  web:
    build: .
    image: smart-appointments-web:local
    ports:
      - '${WEB_PORT:-8081}:8080'
    environment:
      API_BASE_URL: ${API_BASE_URL:-http://localhost:5290}
    restart: unless-stopped
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
    cap_drop: [ALL]
```

`.env.example`: `API_BASE_URL=http://localhost:5290` and `WEB_PORT=8081`; `.env` is gitignored. The image's `HEALTHCHECK` provides `healthy` status (Req 8.1-8.4, 8.6). The README states the backend `WEB_ORIGIN=http://localhost:8081` requirement (Req 8.5).

### CI (Req 9)

`.github/workflows/ci.yml`:

```yaml
name: CI
on:
  pull_request:
  push: { branches: [main] }
concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }
permissions: { contents: read }
env: { HUSKY: "0" }

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4          # version from packageManager
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm format:check
      - run: pnpm typecheck

  test:
    needs: lint
    runs-on: ubuntu-latest
    steps:
      # checkout, pnpm, node, install as above
      - run: pnpm test -- --coverage
      - uses: actions/upload-artifact@v4
        with: { name: coverage, path: coverage }

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      # checkout, pnpm, node, install as above
      - run: pnpm build
      - run: pnpm size
      - run: "! grep -r 'localhost:5290' dist --exclude=config.json"
      - uses: actions/upload-artifact@v4
        with: { name: dist, path: dist }

  e2e:
    needs: build
    runs-on: ubuntu-latest
    steps:
      # checkout, pnpm, node, install as above
      - uses: actions/download-artifact@v4
        with: { name: dist, path: dist }
      - run: pnpm exec playwright install --with-deps chromium
      - run: |
          pnpm exec sirv dist/smart-appointments-web/browser --single --port 4300 &
          pnpm exec wait-on http://localhost:4300
          E2E_BASE_URL=http://localhost:4300 pnpm e2e
      - if: failure()
        uses: actions/upload-artifact@v4
        with: { name: playwright-report, path: playwright-report }

  docker:
    needs: e2e
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t web:ci .
      - run: |
          docker run -d --name web -p 8081:8080 -e API_BASE_URL=http://localhost:5290 web:ci
          for i in $(seq 1 20); do curl -fs localhost:8081/healthz && break; sleep 1; done
          test "$(curl -s localhost:8081/config.json)" = '{"apiBaseUrl":"http://localhost:5290"}'
          curl -sI localhost:8081/ | grep -i "content-security-policy.*connect-src 'self' http://localhost:5290"
          test "$(curl -s -o /dev/null -w '%{http_code}' localhost:8081/appointments/123)" = 200
          test "$(curl -s -o /dev/null -w '%{http_code}' localhost:8081/missing.js)" = 404
          curl -sI localhost:8081/config.json | grep -i 'cache-control: no-cache'
          test "$(docker exec web id -u)" != 0
          docker rm -f web
          docker run -d --name web2 -p 8082:8080 -e 'API_BASE_URL=http://x"; evil' web:ci
          sleep 3; curl -s localhost:8082/config.json | python3 -m json.tool
          curl -sI localhost:8082/ | grep -i "connect-src 'self';"
```

The `wait-on` tool is a devDependency. The `# checkout, pnpm, node, install` lines stand for a shared composite action `.github/actions/setup` (created at implementation) so the four jobs do not repeat the block. Actions are pinned to major versions (Req 9.5). `lint → test → build → e2e → docker` ordering via `needs` (Req 9.2); Node from `.nvmrc`, pnpm store cached by `cache: pnpm` keyed on the lock file (Req 9.3); a budget error fails `pnpm build` and the gzip limit fails `pnpm size` (Req 9.4); the README badge is `![CI](https://github.com/<owner>/smart-appointments-web/actions/workflows/ci.yml/badge.svg)` (Req 9.6).

### Documentation outline (Req 10)

`README.md`: title and one-paragraph purpose; badge; stack table; prerequisites; "Run it" (`pnpm install`, `pnpm start`, open `http://localhost:4200`; backend from the SmartAppointments repo and its CORS `WEB_ORIGIN`); "Test" (`pnpm test`, `pnpm lint`, `pnpm e2e` with the Chromium install, `pnpm size`); "Docker" (`docker compose up --build`, `http://localhost:8081`, `API_BASE_URL`); "Runtime configuration" (the `config.json` contract, the error page); "Project layout"; "Specs" link to `docs/specs/README.md`; "Versions" (the Angular, Tailwind, Spartan and Node versions chosen at scaffold time) (Req 10.1).

`CLAUDE.md` sections, in the backend's order: Project status (scaffold only; plan phases aspirational); Commands; Local settings (runtime config, `API_BASE_URL`, backend gateway `http://localhost:5290`, CORS `WEB_ORIGIN`); Architecture conventions (layout, layering rule, standalone/zoneless/signals/OnPush/control flow/`inject()`/typed forms/lazy routes, tokens not raw colours, helm under `shared/ui`); Backend contract rules (gateway only, `{status, detail}` errors, `X-Correlation-ID`, `Idempotency-Key`, times are UTC `*Utc`); Testing conventions; Spec-driven development (pointer to `docs/specs/README.md`, the loop, tasks checked in the same commit); Working with Claude Code subagents (Sonnet, `model: "sonnet"` on every spawn) (Req 10.2, 10.3).

## State and data model

- `ThemeService.preference` (`signal<'system'|'light'|'dark'>`), `systemDark` (`signal<boolean>`), `isDark` (`computed`). Persisted: `localStorage['sa.theme']` (one of the three strings, anything else ignored).
- `APP_CONFIG` holds `{ apiBaseUrl: string }` (origin only) once the initializer resolves; it is immutable for the page's lifetime.
- No other state exists in F0.

## Error handling

| Condition                                                                                | Where                           | Result                                                                                                                     |
| ---------------------------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `config.json` unreachable, non-2xx, timeout, bad JSON, missing or malformed `apiBaseUrl` | `loadConfig`                    | `{ ok:false, reason }`; initializer renders the DOM error page and rejects (Req 6.4)                                       |
| `localStorage` throws on read/write                                                      | `ThemeService`, `theme-init.js` | in-memory preference, no error (Req 2.7)                                                                                   |
| `API_BASE_URL` empty or invalid at container start                                       | `40-config.sh`                  | container starts; `config.json` has the raw/empty value; CSP `connect-src 'self'`; SPA shows the error page (Req 7.4, 7.5) |
| Missing file with extension                                                              | nginx                           | `404` with security headers (Req 7.6.1, 7.7)                                                                               |
| Budget exceeded / gzip over 250 kB                                                       | build, `size.mjs`               | build or CI job fails (Req 5)                                                                                              |

## Testing strategy

| Requirement | Verified by                                                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1-1.8     | `pnpm build` and `typecheck` in CI; a unit test asserting `package.json` has no `zone.js` and the scripts exist; `only-allow` by manual check |
| 2.1-2.5     | `styles.css` contrast spec; `pnpm build`; `app.spec.ts` renders the button; manual: no third-party requests in the network panel              |
| 2.6-2.10    | `theme.service.spec.ts`, `theme-init.spec.ts`, `theme-toggle.spec.ts` (role queries, keyboard), e2e smoke test 2                              |
| 3.1-3.6     | CI `lint`/`format:check`; manual commitlint accept/reject cases recorded in the task                                                          |
| 4.1-4.8     | `pnpm test` itself; `setup.ts` fails on unhandled requests (a spec performs an unmocked `fetch` and expects rejection)                        |
| 5.1-5.5     | `pnpm build` with budgets; `pnpm size` in CI                                                                                                  |
| 6.1-6.7     | `load-config.spec.ts`, `config-error.spec.ts`, e2e smoke test 3, CI `grep` step                                                               |
| 7.1-7.10    | CI `docker` job curl assertions, including the hostile `API_BASE_URL` case; `docker run id -u`                                                |
| 8.1-8.6     | manual `docker compose up --build`, `docker compose ps`; CI builds the image only                                                             |
| 9.1-9.6     | the workflow itself on the first PR                                                                                                           |
| 10.1-10.4   | review against the outlines above                                                                                                             |

## Open questions — resolved

All seven were approved at the stated defaults.

1. **Resolved: scaffold in a scratch directory and move in.** **`ng new` into a non-empty directory.** The design generates into `scaffold-tmp/` and moves files in. If the then-current CLI accepts `--directory .` over a folder holding only `docs/`, use that instead.
2. **Resolved: verify the Spartan CLI at scaffold time, with the fallback.** **Spartan generator names and output path.** `@spartan-ng/cli:init`/`ui` and the `components.json` path override are as of this writing; if the CLI forces `libs/ui`, the fallback is a `tsconfig` path alias plus moving the generated files into `src/app/shared/ui/` by hand, recorded in the README.
3. **Resolved: pick the plugin matching the current builder.** **Tailwind integration.** `@tailwindcss/postcss` is assumed; if the application builder in the then-current Angular uses Vite plugins natively, `@tailwindcss/vite` is the equivalent. Either satisfies Req 2.1.
4. **Resolved: drop sonner to F1 if the 500 kB warning trips.** **Initial bundle contents.** Spartan `sonner` and `lucide-angular` are only mounted when used. If the F0 initial bundle exceeds the 500 kB warning with only the placeholder page, `sonner` is dropped from F0 and generated in F1 (the budgets win over the baseline list).
5. **Resolved: fall back to `'self'`.** **IPv6 or internationalised hostnames in `API_BASE_URL`** are not matched by the strict origin regex and degrade to `connect-src 'self'`; acceptable for local and typical deployments. Widen only if needed.
6. **Resolved: keep it revalidated (`no-cache`).** **`theme-init.js` is `no-cache`.** It is revalidated on each load (a conditional request, usually `304`). If that proves noticeable, it could be content-hashed by a build step; deferred.
7. **Resolved: a local composite action is allowed.** **Shared CI setup.** Whether to use a local composite action for the repeated checkout/pnpm/node/install steps (proposed) or repeat them inline.

## Scaffold-time deviations

Recorded during implementation (Angular CLI 22.2.1, Node 24.18, pnpm 12.4.1). Requirements are unchanged.

- **Versions:** Angular 22.2, TypeScript 6.0, Vitest 5, Tailwind 4.3, Spartan brain 1.5, Playwright 1.63, MSW 3, ESLint 10. `ng new` gained `--skip-install --defaults` for non-interactive use; the other flags were accepted as designed.
- **Strict flags:** the generated `tsconfig.json` lacked `strict` and `strictTemplates`; both were added. The CLI default already enables zoneless but does not register `provideZonelessChangeDetection()`; it was added explicitly (Req 1.5).
- **pnpm 12:** dependency build scripts need approval; `pnpm-workspace.yaml` `allowBuilds` records them, and the Dockerfile copies that file before installing. pnpm is installed directly (no corepack prepare needed); `packageManager` is `pnpm@12.4.1`.
- **`"type": "module"`** added to `package.json` so `eslint.config.js` and `commitlint.config.js` use ESM as designed.
- **Spartan:** `ng g @spartan-ng/cli:init` rewrites `styles.css` with its own theme; only its layered Tailwind imports and the `hlm-tailwind-preset.css` import were kept, and the project token sheet was retained (with `--popover`, `--secondary` and their foregrounds, and `--radius`, added because helm components use them; contrast pairs added to the spec). `components.json` (`componentsPath: src/app/shared/ui`, `importAlias: @app/shared/ui`) made the CLI honour the output path, so the `libs/ui` fallback was not needed. The CLI writes one `paths` entry per component instead of a `@app/shared/ui/*` wildcard, and it takes one component name per call (`--interactive=false`). The default style is `vega`; hover on `bg-primary/80` slightly lowers contrast on hover only.
- **Icons:** `lucide-angular` has no Angular 22 support (peer range 13 to 21) and Spartan itself uses `@ng-icons/lucide`; `lucide-angular` was removed and the theme toggle uses `@ng-icons/lucide`.
- **`sonner`** was kept: the initial bundle is 353 kB raw, below the 500 kB warning.
- **MSW 3** renamed `onUnhandledRequest` to `onUnhandledFrame`.
- **Test commands:** pnpm 12 forwards a literal `--`, so coverage is `pnpm test --coverage` (not `pnpm test -- --coverage`). `pnpm test --filter` is consumed by pnpm; use `pnpm exec ng test --watch=false --filter <name>`. `@vitest/coverage-v8` and `@types/node` (spec files read `styles.css` and `theme-init.js`) were added.
- **Prettier** reformatted existing files (including these spec documents) in the task 6 commit.
- **Nginx:** an exact `location = /index.html` with `Cache-Control: no-cache` was added, because `/` and the SPA fallback are internally redirected to `/index.html`, which otherwise matched the extension regex and lost the header. `/healthz` also sends `no-cache`. The JSON-escape `sed` in `40-config.sh` uses `#` delimiters. Image tag pinned to `nginxinc/nginx-unprivileged:1.29-alpine`.
- **Docker build:** `pnpm fetch` plus an offline install worked as designed.
- **CI:** `actionlint` (run through its Docker image) is clean; the workflow has not run on GitHub because the repository has no remote. `pnpm/action-setup@v4` with pnpm 12 in `packageManager` is unverified until the first run.
- **Config error flow:** Angular also logs the initializer rejection to the console (`ERROR Error: config.json returned 500`); this is expected.
