# F0 Scaffold and tooling — Tasks

<!--
Rules (from docs/specs/_templates/tasks.md): coding steps only, each citing the
requirements it implements, each small enough to finish in one sitting and leaving
`pnpm lint && pnpm test && pnpm build` green (once the workspace exists, task 1).
Check a box in the same commit as the code. Commit messages follow Conventional
Commits (enforced from task 6).
-->

- [x] 1. Initialise the repository and generate the Angular workspace
  - Create `.gitignore` (node_modules, dist, .angular, coverage, playwright-report, test-results, `.env`), `.editorconfig` and `.gitattributes` (LF; binaries), then `git init` (branch `main`) and make the initial commit of the existing `docs/` and these files.
  - Check `node -v` matches the current LTS; `corepack enable`.
  - Generate in a scratch folder: `ng new smart-appointments-web --directory scaffold-tmp --style=css --routing --ssr=false --zoneless --test-runner=vitest --package-manager=pnpm --skip-git --strict`; move its contents (not `.git`) into the repo root; delete the scratch folder. Adjust flags to the current CLI and note any deviation.
  - Add `packageManager` (exact pnpm), `engines.node`, the `preinstall` `only-allow pnpm` guard, `.nvmrc`, and the full script set (`start`, `build`, `test`, `test:watch`, `lint` placeholder until task 6, `format`, `format:check`, `typecheck`, `size`, `e2e`); commit `pnpm-lock.yaml`.
  - Apply the extra strict `tsconfig` flags and `angularCompilerOptions`; confirm `zone.js` is absent from `package.json` and `polyfills`.
  - Create `src/app/{core,shared/ui,features}/` with `.gitkeep`; keep the generated placeholder `App` rendering the application name "Smart Appointments".
  - Run `pnpm test` and `pnpm build` once to confirm green (lint is added in task 6; until then the gate is test + build + typecheck).
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 3.5_

- [x] 2. Tailwind v4, token sheet and Inter font
  - Install `tailwindcss` with the plugin matching the current builder (`@tailwindcss/postcss` with `.postcssrc.json`, or `@tailwindcss/vite`), `@fontsource-variable/inter`.
  - Write `src/styles.css`: `@import "tailwindcss"`, font import, `@custom-variant dark`, the `@theme` block (teal brand ramp, semantic tokens, radius, shadows, font), the `:root` and `.dark` value blocks, base layer (focus ring, `color-scheme`, body) and the reduced-motion block, exactly as in the design's token sheet. No `tailwind.config.js`.
  - Set `optimization.styles.inlineCritical: false` and `fonts: false` in the production build configuration.
  - Add `contrast.spec.ts` that parses the `:root` and `.dark` blocks and asserts every documented text pair meets 4.5:1 and UI pairs 3:1.
  - _Requirements: 2.1, 2.3, 2.4, 2.5, 2.10, 7.8_

- [x] 3. Spartan/ui baseline components
  - Install `@angular/cdk`, `@spartan-ng/brain`, `@spartan-ng/cli`, `lucide-angular`, `ngx-sonner`; run `ng g @spartan-ng/cli:init` and generate `button`, `card`, `input`, `label`, `switch` (and `sonner`) with the helm output under `src/app/shared/ui/` and an `@app/shared/ui/*` path alias (use the fallback in design open question 2 if the CLI forces `libs/ui`).
  - Render a button, and a card with a labelled input, on the placeholder page; add a render test using Angular Testing Library (queries by role) covering the app heading and the button.
  - Run `pnpm build`; IF the initial bundle trips the 500 kB warning, remove `sonner` from F0 (generate in F1) and note it in the README.
  - _Requirements: 2.2, 4.2, 4.3, 5.4_

- [x] 4. Theme service, pre-paint script and toggle
  - Add `public/theme-init.js` (blocking, ES5, try/catch around storage) and reference it from `index.html` before the stylesheet.
  - Implement `ThemeService` (signals `preference`, `systemDark`, `computed isDark`, storage key `sa.theme`, try/catch on every storage access, class toggle on `<html>` via an effect, `matchMedia` listener).
  - Implement `ThemeToggle` in `shared/ui/theme-toggle/` (radiogroup of system/light/dark, `aria-checked`, arrow-key navigation, per-option labels such as "Use dark theme", focus ring) and place it on the placeholder page.
  - Tests: `theme.service.spec.ts` (each preference, live system change, throwing `localStorage`, invalid stored value), `theme-init.spec.ts` (evaluate the script against stubs, same outcomes as the service), `theme-toggle.spec.ts` (roles, keyboard, state).
  - _Requirements: 2.6, 2.7, 2.8, 2.9, 4.3_

- [x] 5. Runtime configuration and the configuration error page
  - Add `public/config.json` with `{ "apiBaseUrl": "http://localhost:5290" }`.
  - Implement `AppConfig`/`APP_CONFIG`, the pure `loadConfig(fetchFn, timeoutMs)` with the fixed reason strings, `renderConfigError(reason)` (DOM only, `textContent`, title `Configuration error`, `role="alert"`, "Try again" button reloading the page, focus on the button), and `provideAppConfig()` using `provideAppInitializer`; register it in `app.config.ts`; `main.ts` swallows the aborted-bootstrap rejection.
  - Tests: `load-config.spec.ts` table (valid, trailing slash and path normalised to the origin, 404, 500, network error, timeout, invalid JSON, missing, blank, `ftp://x`, `not a url`) and `config-error.spec.ts` (heading, reason text, title, button reloads, response body never shown).
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 4.3_

- [x] 6. Lint, format and commit hooks
  - Install and configure angular-eslint + typescript-eslint flat config (rules and the layering `no-restricted-imports` zones, helm override for `src/app/shared/ui/**`, ignores) and wire the real `lint` script (`eslint . --max-warnings 0`).
  - Install Prettier with `prettier-plugin-tailwindcss` (`tailwindStylesheet`), `.prettierrc.json`, `.prettierignore`; run `pnpm format` once and commit the formatting.
  - Install Husky (`prepare`), lint-staged config, commitlint with `@commitlint/config-conventional`; create `.husky/pre-commit` and `.husky/commit-msg`.
  - Verify: `pnpm lint` and `pnpm format:check` pass with zero warnings; commit message `fix stuff` is rejected and `feat(core): add theme service` accepted (record the check in the commit body of this task's commit).
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6_

- [x] 7. MSW and coverage in the unit-test setup
  - Install `msw`, `@testing-library/jest-dom`, `@testing-library/user-event`; add `src/testing/{setup,server,handlers}.ts` (empty handlers, `onUnhandledRequest: 'error'`, listen/reset/close hooks) and register `setupFiles` and coverage reporters in the `test` target of `angular.json`.
  - Add a spec proving an unmocked `fetch` fails the test; confirm `pnpm test -- --coverage` writes `coverage/`.
  - _Requirements: 4.1, 4.4, 4.5_

- [x] 8. Routes, lazy placeholder, budgets and the size script
  - Add `app.routes.ts` with one lazy `loadComponent` placeholder route and a `**` redirect.
  - Set the `budgets` (initial 500 kB / 700 kB, anyComponentStyle 4 kB / 8 kB) in the production configuration.
  - Write `scripts/size.mjs` (parse `index.html` for initial scripts, modulepreloads and stylesheets, gzip level 9, print the table, exit 1 above `MAX_GZIP_KB` default 250); add a small spec for the parsing/threshold function if it is factored into a testable module.
  - Run `pnpm build && pnpm size` and record the result in the commit message; confirm `grep -r "localhost:5290" dist/` only matches `config.json`.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.7_

- [x] 9. Playwright and the smoke test
  - Install `@playwright/test`, `sirv-cli`, `wait-on`; add `playwright.config.ts` (Chromium only, `E2E_BASE_URL`, `webServer` running `pnpm start` when unset, retries 2 and trace on first retry in CI) and `e2e/smoke.spec.ts` (title and heading; dark toggle persists across reload; `config.json` forced to `500` shows the error page). Add `playwright-report` and `test-results` to `.gitignore`.
  - Run `pnpm exec playwright install chromium` and `pnpm e2e` locally against `ng serve`, then once against `sirv` on the built output.
  - _Requirements: 4.6, 4.7, 4.8_

- [ ] 10. Container image: nginx config, entrypoint and Dockerfile
  - Add `docker/nginx.conf`, `docker/security.conf`, `docker/config.json.template`, `docker/40-config.sh` (executable, LF), `Dockerfile` (node build stage with `pnpm fetch` cache, `nginxinc/nginx-unprivileged` final stage, `HEALTHCHECK`) and `.dockerignore`.
  - Build and verify with `curl -i` as in the design's CI list: `config.json` content, CSP `connect-src 'self' http://localhost:5290`, SPA fallback `200` for `/appointments/123`, `404` for `/missing.js`, gzip on, immutable on hashed assets, `no-cache` on `/`, `/index.html`, `/config.json`, `/theme-init.js`, `/healthz`, all security headers on `200` and `404`, `id -u` not `0`, and the hostile value `API_BASE_URL='http://x"; evil'` yielding valid JSON and `connect-src 'self'`; empty `API_BASE_URL` still starts.
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10_

- [ ] 11. Docker Compose
  - Add `docker-compose.yml` (service `web`, `${WEB_PORT:-8081}:8080`, `API_BASE_URL` default, `restart: unless-stopped`, `read_only`, `tmpfs: /tmp`, `no-new-privileges`, `cap_drop: ALL`) and `.env.example`.
  - Verify `docker compose up --build` works with no `.env`, serves `http://localhost:8081`, and `docker compose ps` reports `healthy` within 30 s; verify the read-only filesystem does not break start-up.
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.6_

- [ ] 12. GitHub Actions CI
  - Add the composite action `.github/actions/setup` (pnpm/action-setup, setup-node with `node-version-file: .nvmrc` and pnpm cache, `pnpm install --frozen-lockfile`) and `.github/workflows/ci.yml` with jobs `lint` → `test` → `build` → `e2e` → `docker`, `concurrency`, `permissions: contents: read`, `HUSKY=0`, artefact upload/download, the `grep` check, and the container curl assertions from the design. Pin actions to majors.
  - Validate the YAML locally (for example `actionlint` if available) and push a branch to confirm the first run passes; fix until green.
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 3.6_

- [ ] 13. Documentation: README.md and CLAUDE.md
  - Write `README.md` per the design outline (purpose, CI badge, stack and chosen versions, prerequisites, run/test/docker commands including the Playwright browser install, runtime configuration and the error page, backend link and its `WEB_ORIGIN`/CORS requirement, layout, specs link).
  - Write `CLAUDE.md` per the design outline (status: scaffold only; commands; layout and layering; conventions; backend contract rules; testing conventions; spec-driven loop; subagent Sonnet rule).
  - Update `docs/specs/README.md` F0 status to "Implemented" and tick all F0 tasks.
  - _Requirements: 9.6, 10.1, 10.2, 10.3, 10.4_

- [ ] 14. Manual end-to-end verification
  - Start the backend from the SmartAppointments repo (`docker compose up --build`, with its `WEB_ORIGIN` set to `http://localhost:8081` once the gateway-cors spec has shipped; before that, F0 makes no API calls so this is only a smoke of the config path).
  - In the web repo run `docker compose up --build`; open `http://localhost:8081`: the app shows; the theme toggle switches and survives reload and a `prefers-color-scheme` change in `system` mode; no flash of the wrong theme on reload; no third-party requests in the network panel.
  - Config error page: run the container with `API_BASE_URL` empty (and separately stop serving `config.json`) and confirm the friendly page, its title, keyboard operation and "Try again".
  - Headers: `curl -i http://localhost:8081/` shows the CSP with `connect-src 'self' http://localhost:5290` and the other security headers; the browser console shows no CSP violations on the placeholder page.
  - Confirm `pnpm lint && pnpm test && pnpm build && pnpm size && pnpm e2e` all pass on a clean clone (`pnpm install --frozen-lockfile` first).
  - Record results (and any deviation from the design) in the PR description.
  - _Requirements: 2.8, 2.9, 4.7, 6.4, 6.5, 7.8, 7.10, 8.4_
