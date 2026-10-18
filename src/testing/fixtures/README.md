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

## slot-planner-vectors.json

Cases for `estimateSlots` (`features/admin/slots/slot-estimate.ts`): each has a zone, weekly hours, a
duration, a date range and "now", plus what the backend's real `SlotPlanner.Plan` creates before
overlap checks (`days`, `slots`, `closedDays`, `droppedPast`). It includes Europe/London 2026-03-29
and 2026-10-25, America/New_York 2026-03-08 and 2026-11-01, Pacific/Auckland 2026-09-27,
Asia/Kolkata, a duration that does not divide the interval, a 31-date range and "now" mid-day today.

It is generated, not hand-written, by the one-off dotnet program in
`scripts/slot-planner-vectors/` (`Program.cs` holds the case list). Regeneration is manual and CI
does not check drift:

1. Copy `scripts/slot-planner-vectors/` to a folder outside both repositories (so no `obj/` or
   `bin/` appears in either).
2. From that folder run, with the path to the backend's `Availability.Domain.csproj` and an
   artifacts folder of your own (keeps the backend checkout free of build output):

   ```powershell
   dotnet run -p:AvailabilityDomain=C:/path/to/SmartAppointments/src/Services/Availability/Availability.Domain/Availability.Domain.csproj `
     -p:UseArtifactsOutput=true -p:ArtifactsPath=C:/path/to/scratch/artifacts -- C:/path/to/scratch/slot-planner-vectors.json
   ```

3. Copy the written file over `src/testing/fixtures/slot-planner-vectors.json` and run `pnpm test`.

The program needs the .NET SDK the backend targets (net10.0). Add a case by appending to the `cases`
list in `Program.cs`.
