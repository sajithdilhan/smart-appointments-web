# Feature specs

This project follows **spec-driven development**, exactly like the backend repository. Every feature is described by three documents before it is built, and those documents stay in the repository as the record of what the feature is supposed to do.

## The backend contract lives elsewhere

This repo is the web client of [SmartAppointments](https://github.com/sajithdilhan/SmartAppointments). The backend's `docs/requirements.md` (the BRD) owns the FR-IDs (`FR-AUTH-001`, `FR-BKG-003`, …) and its `docs/specs/` own the API behaviour. A frontend spec cites the backend FR-IDs a screen serves, or says "(no FR-ID)" for pure frontend concerns (tooling, theming, deployment). The **API gateway is the only API** the SPA talks to (default `http://localhost:5290`); it never calls Auth, Availability or Booking directly. Where a screen needs a backend change, that change is specced and shipped in the backend repo first.

## The loop

```
requirements.md  ──►  design.md  ──►  tasks.md  ──►  implement
     approve            approve         approve
```

1. **One feature per folder.** A spec covers a bounded feature or build phase, not a whole app. Folders are named after the phase (`f0-scaffold`) or feature.
2. **Requirements are approved before a design is written.** The design is an answer to the acceptance criteria, so the criteria have to be settled first.
3. **The design is approved before tasks are written.** Tasks are coding steps derived from the design, nothing more.
4. **Tasks are checked off in the same commit as the code that satisfies them.** A checked box means the code exists, the tests the task names exist and pass, and `pnpm lint && pnpm test && pnpm build` pass. The tick carries a `_Done: <DD/MM/YYYY h:mmam>_` line under the task. An unchecked box is the backlog.
5. **Progress across phases is tracked in [`../WORKPLAN.md`](../WORKPLAN.md)**: task status, owner (subagent, main session or you), timestamps, merge order and how to resume. Update it whenever a task changes status.

Templates live in [`_templates/`](_templates/).

## Index

| Feature                                                                                           | Status      | FR-IDs                                             | Spec                                            |
| ------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------- | ----------------------------------------------- |
| F0 Scaffold and tooling                                                                           | Implemented | — (no FR-ID)                                       | [requirements](f0-scaffold/requirements.md)     |
| F1 Core (runtime config use, API types, error normalizer, auth store and refresh, guards, shells) | Built       | FR-AUTH-002, FR-AUTH-003, FR-AUTH-004, FR-AUTH-005 | [requirements](f1-core/requirements.md)         |
| F2 Public (landing, login, register)                                                              | Implemented | FR-AUTH-001, FR-AUTH-002                           | [requirements](f2-public/requirements.md)       |
| F3 Booking wizard, success and .ics                                                               | Built       | FR-AVL-004, FR-BKG-001                             | [requirements](f3-booking/requirements.md)      |
| F4 My appointments, detail, cancel, profile                                                       | Built       | FR-BKG-002, FR-BKG-003, FR-BKG-005, FR-AUTH-003    | [requirements](f4-appointments/requirements.md) |
| F5 Admin console (branches, schedule, services, slot generation, dashboard, command palette)      | Implemented | FR-AVL-001, FR-AVL-002, FR-AVL-003                 | [requirements](f5-admin/requirements.md)        |
| F6 Polish (a11y audit, motion, empty and error states, Playwright suites, Lighthouse budgets)     | Not specced | — (no FR-ID)                                       | —                                               |

Backend-dependent features (queue, staff workspace, notifications, reports) wait for their backends and are not planned here.
