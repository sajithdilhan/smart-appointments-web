import type { AppointmentResponse } from '../app/core/api/models';

export const CUSTOMER_ID = '00000000-0000-4000-8000-0000000000c1';
export const BRANCH_ID = '00000000-0000-4000-8000-0000000000b1';
export const SERVICE_ID = '00000000-0000-4000-8000-0000000000e1';

let counter = 0;

/** A deterministic GUID: the same call order gives the same ids within a test file. */
export function nextGuid(): string {
  counter += 1;
  return `00000000-0000-4000-8000-${counter.toString(16).padStart(12, '0')}`;
}

export function resetMakeAppointment(): void {
  counter = 0x1000;
}

/**
 * A `Booked` appointment owned by `CUSTOMER_ID`, starting `2026-10-05T15:00:00Z` for 30
 * minutes unless overridden. `endUtc` follows `startUtc` (30 minutes) when only the start is given.
 */
export function makeAppointment(overrides: Partial<AppointmentResponse> = {}): AppointmentResponse {
  const startUtc = overrides.startUtc ?? '2026-10-05T15:00:00Z';
  const endUtc =
    overrides.endUtc ?? new Date(new Date(startUtc).getTime() + 30 * 60_000).toISOString();
  return {
    id: nextGuid(),
    customerId: CUSTOMER_ID,
    slotId: nextGuid(),
    branchId: BRANCH_ID,
    serviceTypeId: SERVICE_ID,
    status: 'Booked',
    createdAtUtc: '2026-09-01T09:00:00Z',
    updatedAtUtc: '2026-09-01T09:00:00Z',
    cancelledAtUtc: null,
    ...overrides,
    startUtc,
    endUtc,
  };
}
