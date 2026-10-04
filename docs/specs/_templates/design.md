# <Feature name> — Design

<!--
Copy this file to docs/specs/<feature-name>/design.md.
Write it only after requirements.md is approved. Every decision below should name
the acceptance criteria it satisfies, e.g. "(Req 2.2)" for requirement 2,
criterion 2. If a decision satisfies nothing, either it is unnecessary or the
requirements are incomplete.
Follow the layout and conventions in CLAUDE.md.
Stop here and get approval before writing tasks.md.
-->

## Overview

<!-- A paragraph on the approach and anything non-obvious about it. -->

## Architecture

<!-- Which folder under src/app each piece lands in. Keep the dependency
direction right: features → shared and core; shared and core never import features. -->

| Area | Contents |
|---|---|
| `src/app/core/` | |
| `src/app/shared/ui/` | |
| `src/app/features/<area>/` | |
| `docker/`, CI, config | |

## Components and interfaces

<!-- The actual pieces: components, routes, services, stores, guards,
interceptors, with their signatures. -->

### Routes

| Path | Component | Guard | Notes |
|---|---|---|---|

### Components, stores and services

### API calls

<!-- Backend endpoints used, via the generated types and the *ApiService. -->

### Validation

<!-- Client-side form rules mirroring the backend validators, and the
criteria they enforce. -->

## State and data model

<!-- Signals, SignalStore state, resource lifecycles, persisted storage keys,
and the shape of any view models. -->

## Error handling

<!-- Failures arrive as AppError {status, message, correlationId} from the error
interceptor. Map each one to what the user sees. -->

| Condition | `AppError.status` | UI result |
|---|---|---|

## Testing strategy

<!-- Which acceptance criteria are covered by which kind of test. Follow the
tests/Auth.Tests style: xUnit + Moq, construct the controller or handler
directly, assert on the concrete IActionResult type. -->

## Open questions

<!-- Delete if none. -->
