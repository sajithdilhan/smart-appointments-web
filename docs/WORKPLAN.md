# Work plan

The single place that says where the build stands and what happens next. Read it first when picking the work up again; update it whenever a task changes status.

Last updated: 10/10/2026 9:53am

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

| Phase           | Branch / worktree                            | Built on                   | Merge order                 | PR          |
| --------------- | -------------------------------------------- | -------------------------- | --------------------------- | ----------- |
| F2 Public       | `f2-public` / `saw-wt/f2-public`             | `main` (F1)                | 1st                         | not raised  |
| F3 Booking      | `f3-booking` / `saw-wt/f3-booking`           | `main` (F1)                | 2nd                         | not raised  |
| F4 Appointments | `f4-appointments` / `saw-wt/f4-appointments` | F3 commits up to `afc816b` | after F3 (rebase on `main`) | not raised  |
| F5 Admin        | `f5-admin` / `saw-wt/f5-admin`               | F2 commits up to `a12dd9a` | after F2 (rebase on `main`) | not raised  |
| F6 Polish       | not created                                  | —                          | after F5                    | not specced |

The `backup-*` and `backup2-*` branches are old snapshots from earlier rebases; keep them until their phase is merged, then delete.

## F2 Public (`f2-public`)

Tasks 1 to 14 done before this plan.

| ID     | Task                                    | Status                 | Owner | Notes                                                            |
| ------ | --------------------------------------- | ---------------------- | ----- | ---------------------------------------------------------------- |
| F2-T15 | Chunk budget check                      | done 10/10/2026 9:41am | main  | `2f5c841`; public group 26.47 kB gzip of 50                      |
| F2-T16 | Documentation                           | done 10/10/2026 9:51am | agent | `822fe0f`; README gains "What F2 provides" and "Known gaps (F2)" |
| F2-T17 | Manual verification against the gateway | todo                   | user  | needs the backend running; result goes in the PR description     |
| F2-PR  | Raise the F2 pull request               | todo                   | user  | after T16; T17 result in the description                         |

## F3 Booking (`f3-booking`)

Tasks 2 to 10 done before this plan.

| ID     | Task                                    | Status                                                   | Owner | Notes                                                      |
| ------ | --------------------------------------- | -------------------------------------------------------- | ----- | ---------------------------------------------------------- |
| F3-T1  | Generated types, API methods, MSW model | blocked (needs `pnpm gen:api` against a running gateway) | user  | methods and MSW model exist; only the regeneration is left |
| F3-T11 | Service step                            | in progress (staged; agent started 10/10/2026 9:47am)    | agent | verify and commit first                                    |
| F3-T12 | Date strip                              | todo                                                     | agent |                                                            |
| F3-T13 | Slot chips and slot states              | todo                                                     | agent |                                                            |
| F3-T14 | Confirm flow (state machine)            | todo                                                     | agent |                                                            |
| F3-T15 | Review step                             | todo                                                     | agent |                                                            |
| F3-T16 | `buildIcs`, download, calendar button   | todo                                                     | agent |                                                            |
| F3-T17 | Success step and confetti               | todo                                                     | agent |                                                            |
| F3-T18 | Invariant test                          | todo                                                     | agent |                                                            |
| F3-T19 | Playwright flows with mocked API        | todo                                                     | agent | port 4303                                                  |
| F3-T20 | Accessibility and reflow checks         | todo                                                     | agent | port 4303                                                  |
| F3-T21 | Chunk budget check                      | todo                                                     | agent |                                                            |
| F3-T22 | Documentation                           | todo                                                     | agent |                                                            |
| F3-T23 | Manual verification against the gateway | todo                                                     | user  |                                                            |

## F4 Appointments (`f4-appointments`)

Tasks 1 to 8 done before this plan.

| ID     | Task                                              | Status                                                     | Owner | Notes                   |
| ------ | ------------------------------------------------- | ---------------------------------------------------------- | ----- | ----------------------- |
| F4-T9  | Detail UI: sheet or page, cancel dialog, calendar | in progress (uncommitted; agent started 10/10/2026 9:47am) | agent | finish and commit first |
| F4-T10 | Profile page                                      | todo                                                       | agent |                         |
| F4-T11 | Accessibility and motion pass                     | todo                                                       | agent |                         |
| F4-T12 | Playwright suites and size budget                 | todo                                                       | agent | port 4304               |
| F4-T13 | Documentation                                     | todo                                                       | agent |                         |
| F4-T14 | Manual verification against the gateway           | todo                                                       | user  |                         |

## F5 Admin (`f5-admin`)

Tasks 1 to 13 and 17 done before this plan.

| ID     | Task                                    | Status                                                     | Owner | Notes                                                  |
| ------ | --------------------------------------- | ---------------------------------------------------------- | ----- | ------------------------------------------------------ |
| F5-T14 | Drawer frame and focus return           | in progress (uncommitted; agent started 10/10/2026 9:47am) | agent | helm `dialog` added, `tsconfig.json` paths reformatted |
| F5-T15 | Branch drawer (create and edit)         | todo                                                       | agent |                                                        |
| F5-T16 | Activate and deactivate                 | todo                                                       | agent |                                                        |
| F5-T18 | Schedule page                           | todo                                                       | agent |                                                        |
| F5-T19 | Services list, drawer, duration stepper | todo                                                       | agent |                                                        |
| F5-T20 | Command palette                         | todo                                                       | agent |                                                        |
| F5-T21 | Slot generation page                    | todo                                                       | agent |                                                        |
| F5-T22 | Size group, README note, e2e support    | todo                                                       | agent |                                                        |
| F5-T23 | Playwright and accessibility suites     | todo                                                       | agent | port 4305                                              |
| F5-T24 | Documentation                           | todo                                                       | agent |                                                        |
| F5-T25 | Manual verification against the gateway | todo                                                       | user  |                                                        |

## Next up

1. Running since 10/10/2026 9:47am, one agent per worktree: F2-T16; F3-T11 to T22; F4-T9 to T13; F5-T14 to T24. Each commits per task, so a stop loses at most the task in hand.
2. You: start the backend gateway to unblock F3-T1 (`pnpm gen:api`) and the manual checks (F2-T17 first, so the F2 PR can be raised).

## Watch list

- Possible flaky unit test on `f2-public`: one run of 825 tests had 1 failure (not captured) that did not reproduce on reruns (reported 10/10/2026 9:51am). If it recurs, capture the name with `pnpm test 2>&1 | grep -B2 -A20 FAIL`.

## Log

- 10/10/2026 9:53am: F2-T16 done (`822fe0f`). F2 now waits only on F2-T17 (manual check, you), then the PR.
- 10/10/2026 9:47am: agents started on F2-T16, F3-T11 to T22, F4-T9 to T13 and F5-T14 to T24.
- 10/10/2026 9:45am: plan created (`dabf31e`); F2-T15 done (`2f5c841`).
