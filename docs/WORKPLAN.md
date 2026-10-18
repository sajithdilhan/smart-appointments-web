# Work plan

The single place that says where the build stands and what happens next. Read it first when picking the work up again; update it whenever a task changes status.

Last updated: 18/10/2026 3:45pm

## How to resume

1. Read this file, then check that it matches reality (it can lag if a session stopped mid-task):
   - `git worktree list` (each phase has its own worktree under `../saw-wt/`).
   - For each active phase: `git -C ../saw-wt/<branch> status --short` and `git -C ../saw-wt/<branch> log --oneline -5`, and the ticked boxes in that worktree's `docs/specs/<branch>/tasks.md`.
2. Fix this file if something differs: tick what a commit already proved done (time from the commit), and note uncommitted work under the task as "in progress".
3. Pick the next tasks from **Next up**, delegate them (see **Delegation**), and record the start here.

## Conventions

- **Task ID** `F<phase>-T<n>`, where `n` is the number in that phase's `tasks.md` (for example `F3-T12`).
- **Status**: `todo`, `in progress`, `blocked (<reason>)`, `done <DD/MM/YYYY h:mmam>` (local time, the time the task's commit was made).
- **Owner**: `agent` (a Sonnet subagent), `main` (the orchestrating session), `user` (needs you: a running backend, a manual check, an approval or a PR decision).
- **Done means the tests pass.** A task is `done` only when the tests the task names (unit specs, and the Playwright suite for an e2e task) exist and pass, the whole gate `pnpm lint && pnpm test && pnpm build` passes, the code is committed in its worktree, and its box in `tasks.md` is ticked with a `_Done: <time>_` line in the same commit. Code written but with failing or missing tests stays `in progress`, with the failure noted.
- Every status change adds one line to the **Log** (newest first).

## Delegation

- One subagent per phase worktree at a time (`model: "sonnet"`, as CLAUDE.md requires), working only inside `C:/Users/sajit/source/repos/saw-wt/<branch>`. Phases in different worktrees can run in parallel.
- Take the `_Done:_` time with `date "+%d/%m/%Y %-I:%M%P"` immediately before `git commit`, after the gate has passed.
- The agent works through its assigned tasks in order, one commit per task (Conventional Commits, the commit attribution line, the tick and `_Done:_` line in the same commit), and stops at the first task it cannot finish, leaving a note under that task in `tasks.md`.
- Agents never push, open PRs, edit another worktree, edit this file or do `user` tasks. The main session updates this file from each agent's report.
- Port lanes so parallel Playwright runs do not collide (serve the built output with `pnpm exec sirv dist/smart-appointments-web/browser --single --port <port>` and run `E2E_BASE_URL=http://localhost:<port> pnpm e2e`): F2 4302, F3 4303, F4 4304, F5 4305. Never `pnpm start` on 4200 from an agent.

## Phases and merge order

| Phase           | Branch / worktree                            | Built on         | Merge order | PR          |
| --------------- | -------------------------------------------- | ---------------- | ----------- | ----------- |
| F2 Public       | `f2-public` / `saw-wt/f2-public`             | `main` (F1)      | 1st         | #4 merged   |
| F3 Booking      | `f3-booking` / `saw-wt/f3-booking`           | `main` (F1)      | 2nd         | #6 merged   |
| F4 Appointments | `f4-appointments` / `saw-wt/f4-appointments` | `main` merged in | after F3    | raised      |
| F5 Admin        | `f5-admin` / `saw-wt/f5-admin`               | `main` merged in | after F2    | #5 merged   |
| F6 Redesign     | not created                                  | `main` after F4  | after F4    | not specced |
| F7 Polish       | not created                                  | —                | after F6    | not specced |

The `backup-*` and `backup2-*` branches are old snapshots from earlier rebases; keep them until their phase is merged, then delete.

## F2 Public (`f2-public`)

Tasks 1 to 14 done before this plan.

| ID     | Task                                    | Status                 | Owner | Notes                                                                                                                    |
| ------ | --------------------------------------- | ---------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------ |
| F2-T15 | Chunk budget check                      | done 10/10/2026 9:41am | main  | `2f5c841`; public group 26.47 kB gzip of 50                                                                              |
| F2-T16 | Documentation                           | done 10/10/2026 9:51am | agent | `822fe0f`; README gains "What F2 provides" and "Known gaps (F2)"                                                         |
| F2-T17 | Manual verification against the gateway | done 18/10/2026 9:56am | user  | automated live pass 11/11 + API contract OK (17/10); Admin login, screen reader, keyboard and visual pass by you (18/10) |
| F2-PR  | Raise the F2 pull request               | in progress            | main  | `main` (Nx workspace) merged into `f2-public` first (`5ef0b3b`, `404be46`)                                               |

## F3 Booking (`f3-booking`)

Tasks 2 to 10 done before this plan.

| ID     | Task                                    | Status                  | Owner | Notes                                                                                                                      |
| ------ | --------------------------------------- | ----------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------- |
| F3-T1  | Generated types, API methods, MSW model | done 17/10/2026 4:56pm  | main  | `8adeeb8`; regeneration byte-identical (see Watch list)                                                                    |
| F3-T11 | Service step                            | done 10/10/2026 9:49am  | agent | `5a4d579`                                                                                                                  |
| F3-T12 | Date strip                              | done 10/10/2026 9:55am  | agent | `fc68a52`                                                                                                                  |
| F3-T13 | Slot chips and slot states              | done 10/10/2026 10:01am | agent | `641b919`; fixed a stale selection after forced refresh                                                                    |
| F3-T14 | Confirm flow (state machine)            | done 10/10/2026 10:06am | agent | `9c8c66c`                                                                                                                  |
| F3-T15 | Review step                             | done 10/10/2026 10:10am | agent | `e15c076`                                                                                                                  |
| F3-T16 | `buildIcs`, download, calendar button   | done 10/10/2026 10:13am | agent | `6f7e840`                                                                                                                  |
| F3-T17 | Success step and confetti               | done 10/10/2026 10:17am | agent | `57ff68e`                                                                                                                  |
| F3-T18 | Invariant test                          | done 10/10/2026 10:24am | agent | `14aac54`                                                                                                                  |
| F3-T19 | Playwright flows with mocked API        | done 10/10/2026 10:34am | agent | `3e72942`; 31/31 e2e on port 4303                                                                                          |
| F3-T20 | Accessibility and reflow checks         | done 10/10/2026 10:43am | agent | `d04128d`; fixed 84 px header overflow at 320 px (`UserMenu`)                                                              |
| F3-T21 | Chunk budget check                      | done 10/10/2026 10:48am | agent | `c891891`; `pnpm size:book`: 30.38 kB of 60                                                                                |
| F3-T22 | Documentation                           | done 10/10/2026 10:51am | agent | `b7daf44`                                                                                                                  |
| F3-T23 | Manual verification against the gateway | in progress             | user  | 18/10: booking end to end and viewing passed; retry, `409`, outage, `429`, no-schedule and accessibility steps not run yet |
| F3-PR  | Raise the F3 pull request               | in progress             | main  | `main` merged in (`be21a22`); PR raised with T23 partial (your call)                                                       |

## F4 Appointments (`f4-appointments`)

Tasks 1 to 8 done before this plan.

| ID     | Task                                              | Status                  | Owner | Notes                                                                               |
| ------ | ------------------------------------------------- | ----------------------- | ----- | ----------------------------------------------------------------------------------- |
| F4-T9  | Detail UI: sheet or page, cancel dialog, calendar | done 10/10/2026 9:53am  | agent | `bacb376`                                                                           |
| F4-T10 | Profile page                                      | done 10/10/2026 9:56am  | agent | `230202a`; `ProfilePage` and `ThemePicker`                                          |
| F4-T11 | Accessibility and motion pass                     | done 10/10/2026 10:01am | agent | `ea76676`; helm sheet and alert-dialog motion behind `motion-safe:`                 |
| F4-T12 | Playwright suites and size budget                 | done 10/10/2026 10:18am | agent | `f171c57`; 28/28 e2e; F4 lazy 36.63 kB of 40; axe fixed destructive-button contrast |
| F4-T13 | Documentation                                     | done 10/10/2026 10:22am | agent | `5691b66`                                                                           |
| F4-T14 | Manual verification against the gateway           | done 18/10/2026 3:45pm  | main  |                                                                                     |
| F4-PR  | Raise the F4 pull request                         | done 18/10/2026         | main  | after F3 merges and F4 is rebased on `main`                                         |

## F5 Admin (`f5-admin`)

Tasks 1 to 13 and 17 done before this plan.

| ID     | Task                                    | Status                  | Owner | Notes                                                                                                                                        |
| ------ | --------------------------------------- | ----------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| F5-T14 | Drawer frame and focus return           | done 10/10/2026 9:49am  | agent | `f2c69d1`; CDK `cdkTrapFocus`, helm `dialog` added                                                                                           |
| F5-T15 | Branch drawer (create and edit)         | done 10/10/2026 9:59am  | agent | `fbfef39`                                                                                                                                    |
| F5-T16 | Activate and deactivate                 | done 10/10/2026 10:04am | agent | `f2362d0`                                                                                                                                    |
| F5-T18 | Schedule page                           | done 10/10/2026 10:11am | agent | `18d044c`                                                                                                                                    |
| F5-T19 | Services list, drawer, duration stepper | done 10/10/2026 10:20am | agent | `15e51e8`                                                                                                                                    |
| F5-T20 | Command palette                         | done 10/10/2026 10:25am | agent | `c100486`                                                                                                                                    |
| F5-T21 | Slot generation page                    | done 10/10/2026 10:36am | agent | `602552a`                                                                                                                                    |
| F5-T22 | Size group, README note, e2e support    | done 10/10/2026 10:42am | agent | `de1afc8`; admin group 111.55 kB, limit raised to 120 (see Decisions)                                                                        |
| F5-T23 | Playwright and accessibility suites     | done 10/10/2026 10:52am | agent | `2778d14`; 29/29 e2e on port 4305                                                                                                            |
| F5-T24 | Documentation                           | done 10/10/2026 10:54am | agent | `ee5b79b`                                                                                                                                    |
| F5-T25 | Manual verification against the gateway | done 18/10/2026 10:24am | user  | by you against the Compose gateway (web on :4200); API checks: `TimeOnly` as `HH:mm:ss`, `PUT` returns the branch body, duplicate code `409` |
| F5-PR  | Raise the F5 pull request               | in progress             | main  | `main` merged in (`4f1b487`); admin size walker fixed (`5a0725e`, 90.03 kB)                                                                  |

## Next up

F2, F3 and F5 are merged (PRs #4, #6, #5; the Nx workspace is #3). F4 is complete and its PR is raised.

1. Review and merge the F4 PR. Then move the main checkout off the merged `build/nx-workspace` branch onto `main`, and delete the `backup-*` and `backup2-*` branches.
2. F6 Redesign (agreed 18/10/2026): an Indigo + Lavender theme in light and dark, plus the mockup's layouts: the landing hero and "Why choose us" tiles, the split register page with a gradient panel, the numbered wizard stepper, a month calendar with a time grid inside the 14-day window, the booking-summary review and the success reference card. Illustrations are inline SVG only. The spec goes in `docs/specs/f6-redesign/` (requirements, then design, then tasks, each approved by you).
3. F7 Polish takes over the old F6 items: unify the size scripts, the `size:admin` "shared" label, and revisiting the admin budget.

## Decisions for you

- **F5 admin chunk budget.** Resolved: the user accepted 120 kB gzip on 18/10/2026 (designed 80 kB, measured 111.55 kB; F5 design deviation 8). Remeasured 90.03 kB on 18/10/2026 after fixing the walker's over-count (it walked through `main` and into other features' lazy chunks). Revisit in F6.

## Watch list

- `pnpm size:admin` labels the whole admin group as "shared" since F3 merged (its shared count still walks without the stop set). The total and the limit check are right; fix the label in F6.
- `models.ts` holds two hand-written shapes for the same backend records (F3's `BranchResponse`/`ServiceTypeResponse`, F5's `Branch`/`ServiceType`). Collapse them when the backend documents its responses and `pnpm gen:api` replaces both.

- Nx daemon (since the Nx workspace, PR #3): the first `nx` command starts a background daemon that inherits the caller's stdout, so a script that captures `pnpm test` output with `$(...)` or a pipe never returns. Run gates with `NX_DAEMON=false` or write output to a file. Nx also caches task results; pass `--skip-nx-cache` when a fresh run is needed.
- Manual-check environment (18/10/2026): Windows reserved TCP 8071 to 8170 (Hyper-V/WinNAT, changes per reboot), so the web container could not bind 8081; it ran with `WEB_PORT=4200`. The backend Compose `Cors__AllowedOrigins__0: ${WEB_ORIGIN}` replaces the development list's 4200 entry, so the backend `.env` needed `WEB_ORIGIN=http://localhost:4200` (backend quirk to fix). The Compose database already held `admin@example.com` with an unknown password, so the seeder skipped; a QA admin `qa-admin@example.com` was registered and promoted to `Role=3` instead.
- When rebasing or merging F3 to F5 onto `main`: `angular.json` is gone, and any edit to it (for example F3's `statsJson`) moves to `project.json`.

- Backend OpenAPI gap: `pnpm gen:api` on 17/10/2026 matched the committed types exactly, because the Availability and Booking operations (and Auth `register`/`me`) declare no response bodies. The temporary types in `core/api/models.ts` (including F4's `MyAppointmentsPage`) stay until the backend adds response metadata (`Produces<T>` or typed results); then regenerate and delete them.
- Commit hooks broke on 17/10/2026: a `pnpm install` in `C:\Users\sajit` (an old `package.json` depending on the npm `node` package) left a broken `node.cmd` shim that lint-staged's tinyexec found on its `node_modules/.bin` walk ("The system cannot find the path specified"). Moved to `C:\Users\sajit\node-leftovers-backup-20261017`; delete that folder once nothing misses it.

- Possible flaky unit test on `f2-public`: one run of 825 tests had 1 failure (not captured) that did not reproduce on reruns (reported 10/10/2026 9:51am). If it recurs, capture the name with `pnpm test 2>&1 | grep -B2 -A20 FAIL`.

- `f4-appointments`: two sheet-opening specs (`a11y.spec.ts`, `appointment-detail.spec.ts`) timed out intermittently under full-suite load and were given a 20 s timeout. Look at the cause if more specs need this. Resolved 18/10/2026: kept F3's global 15 s plus F4's per-spec 20 s (they only raise it further for those two specs).
- `f4-appointments`: `pnpm format:check` warns about `tsconfig.json` (same `paths` formatting issue as F5-T14). Resolved 18/10/2026: the F4 merge took main's Prettier-formatted `paths`.
- F4 rebase on `main` after F3: reconcile the branches and services MSW handlers from F4-T2 with F3's; the temporary `MyAppointmentsPage` type in `core/api/models.ts` stays until `pnpm gen:api` (F3-T1). Resolved 18/10/2026: main's `availabilityHandlers` (booking backend) and F4's `appointmentsHandlers` (appointments backend, which also serves branches and services) stay separate, as they model different data; `routes.spec.ts` installs both, the booking one last so it wins on the overlap. The temporary type does not duplicate main's.
- Regenerating the helm `sheet` or `alert-dialog` drops F4's `motion-safe:` edits (F4 design deviation 11); re-apply them. Re-applied 18/10/2026 in the F4 merge (the add/add `alert-dialog` content and overlay take F4's `motion-safe:` versions, otherwise identical to F5's).

- Merge conflict ahead in `scripts/size.mjs`, `package.json` and `ci.yml`: F2 (`size:public`), F3 (`size:book`) and F4 (its own F4 check inside `pnpm size`) each added a chunk-group check, and F2 and F3 both turned on `statsJson`. When rebasing F3 and F4 on `main`, fold them into F2's `--group <name>` mechanism (`GROUP_DEFAULTS`). F4 part done 18/10/2026: F4's check moved to `--group appointments` (`pnpm size:appointments`, `scripts/size-appointments.mjs`, `MAX_GZIP_KB_APPOINTMENTS` default 40; plain `pnpm size` is the initial bundle only, as on main; CI runs the new step). Done 18/10/2026: F3's `book` group dispatches from `size.mjs` to `scripts/size-book.mjs` (`pnpm size:book`), alongside `public` and `admin`.
- Flaky unit test candidate: `core/http/http.pipeline.spec.ts` ("outage state is not set by 403") failed once in a parallel full run on `f3-booking` and passed otherwise; may be the same one-off failure seen on `f2-public`.
- `f3-booking` raised the global Vitest `testTimeout` to 15 s and Testing Library `asyncUtilTimeout` to 5 s in `src/testing/setup.ts` (first lazy-route render was slow under full parallel load); F4 used per-spec 20 s timeouts for the same symptom. Resolved 18/10/2026 (F4 merge): kept F3's global setting and F4's per-spec 20 s ones.
- `f3-booking` changed F1 shared code: `UserMenu` shows the display name only from 640 px; `ViewportService.prefersReducedMotion` added.

- Fourth size mechanism: resolved. One CLI: `--group admin` dispatches to `size-group.mjs` (which also follows dynamic imports); full unification deferred to F6.
- Flaky unit test candidate: `src/app/shared/ui/sonner/toast-service.spec.ts` ("renders the message and reference, and Copy writes the id") failed twice in full runs on `f5-admin` with `window.matchMedia is not a function` during fixture cleanup (F1's last fix shimmed `matchMedia` in the shared setup; a spec that restores stubbed globals may remove it).
- F5 changed shared code: `ToastService.showSuccess` takes an optional action; `tsconfig.json` `paths` is now Prettier-formatted (this also clears F4's format warning once merged).

## Log

- 18/10/2026 3:45pm: `main` (F2, F3, F5, Nx) merged into `f4-appointments` (`4f62c9b`, `570fd63`). Two e2e specs fixed after the merge (`945273f`): the login heading is now "Welcome back", and the booking axe check waits for the entrance animations. Gate, every size group and 95/95 e2e pass. F4-T14 done: a live pass against the Compose gateway, every step passed. F4 PR raised. F6 is now the Indigo + Lavender redesign; Polish moves to F7.

- 18/10/2026 10:42am: `main` (F2, F5, Nx) merged into `f3-booking` (`be21a22`; book size group in `scripts/size-book.mjs`); full gate passed. F3-T23 partly done (booking and viewing passed; the other steps are still open). At your call, the F3 PR is raised with T23 partial.

- 18/10/2026 10:24am: F5-T25 done (manual check by you). `main` (F2, Nx) merged into `f5-admin`; `size:admin` fixed to stop at `main` and other features' chunks (90.03 kB, was 124.01 with the over-count); CI MSW grep no longer matches `hlmSwitch`. Full gate passed. F5 PR next.

- 18/10/2026 9:56am: F2-T17 done (manual check by you against the Compose gateway, web on :4200). `main` with the Nx workspace merged into `f2-public`; gate passes (lint, format, typecheck, test with coverage, build, size, size:public, test:scripts). F2 PR next.

- 17/10/2026 5:12pm: F2-T17 in progress: live API contract checks and an 11-step Playwright pass against the gateway all passed (web container on :8081). Left for you: seed an Admin and check `/admin`, a screen-reader pass, and the register keyboard and visual check. Results drafted for the PR description.

- 17/10/2026 4:58pm: F3-T1 done (`8adeeb8`): gateway up, `pnpm gen:api` produced identical files; gate passes (82 files, 970 tests). Fixed the broken commit hooks (stray home-folder `node` shim). Next: F2-T17.

- 10/10/2026 10:56am: F5-T14 to T24 done (`f2c69d1` to `ee5b79b`); gate passes with 89 files and 1331 tests; e2e 29/29. Admin budget needs your decision. No agents running.

- 10/10/2026 10:53am: F3-T11 to T22 done (`5a4d579` to `b7daf44`); gate passes with 82 files and 970 tests; e2e 31/31. F3 waits on F3-T1, F3-T23 and the F2 merge.

- 10/10/2026 10:23am: F4-T9 to T13 done (`bacb376`, `230202a`, `ea76676`, `f171c57`, `5691b66`); gate passes with 85 files and 1090 tests; e2e 28/28. F4 waits on the F3 merge, F4-T14 and its PR.

- 10/10/2026 9:53am: F2-T16 done (`822fe0f`). F2 now waits only on F2-T17 (manual check, you), then the PR.
- 10/10/2026 9:47am: agents started on F2-T16, F3-T11 to T22, F4-T9 to T13 and F5-T14 to T24.
- 10/10/2026 9:45am: plan created (`dabf31e`); F2-T15 done (`2f5c841`).
