# Test fixtures

## availability-contract.json

The Availability service's validation rules, copied by hand from its C# sources: every validation
message, the code, phone and time regexes (verbatim) with sample vectors, the numeric limits and the
error texts the admin screens branch on (duplicate code, not found, the slot-generation conflicts).
Each message and error names its source file and the rule it came from.

Two things read it, so a backend wording change is one edit here and a failing test, not a silent
mismatch:

- the client contract tests (`features/admin/validation/*.spec.ts`) assert that every client message
  that mirrors the backend equals the fixture and that every entry of the server-message tables
  exists in it;
- the stateful MSW admin backend (`src/testing/availability-admin-backend.ts`) validates requests
  with its own implementation built from the fixture, so a mistake in the client rules is not hidden
  by the same mistake in the mock.

To update it, re-read the validators under `Availability.Application/Validations/` and the handlers'
error factories under `Availability.Application/Handlers/` in the backend repository and edit the
entries; nothing checks drift automatically.
