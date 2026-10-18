import { DAY_NAMES, addDays, localToUtc, todayInZone } from '../app/core/time';
import type {
  AppointmentResponse,
  BranchResponse,
  ServiceTypeResponse,
  SlotResponse,
  SlotSearchParams,
} from '../app/core/api/models';

/**
 * A stateful, in-memory model of the Availability and Booking rules the booking wizard meets:
 * the verbatim backend error strings, `Idempotency-Key` replay and `422`, the overlap rule,
 * slot capacity, and flags to inject outages and rate limits. No MSW in here: the handler
 * files turn a `BackendReply` into a response.
 */

export interface BackendReply {
  status: number;
  /** JSON body; for errors `{ status, detail }` (`application/problem+json`). */
  body?: unknown;
  headers?: Record<string, string>;
  /** The booking happened, but the response is lost (a network error for the client). */
  drop?: boolean;
}

export interface ModelSlot extends SlotResponse {
  startMs: number;
  endMs: number;
}

export interface IdempotencyEntry {
  bodyHash: string;
  reply: BackendReply;
}

export interface BackendFlags {
  /** Answer `429` to every slot search after this many searches. */
  searchRateLimitAfter: number | null;
  createRateLimited: boolean;
  /** Answer the next N create calls with `503`. */
  unavailableNext: number;
  /** Book the next create call, then lose the response. */
  dropResponseAfterBookingNext: boolean;
  /** Answer the next create call `409` "still being processed". */
  inProgressNext: boolean;
}

export interface BookingBackendState {
  nowMs: number;
  customerId: string;
  branches: BranchResponse[];
  services: ServiceTypeResponse[];
  slots: Map<string, ModelSlot>;
  appointments: AppointmentResponse[];
  idempotency: Map<string, IdempotencyEntry>;
  counters: { branches: number; services: number; search: number; create: number };
  flags: BackendFlags;
}

export const MESSAGES = {
  keyRequired: 'The Idempotency-Key header is required.',
  keyTooLong: 'The Idempotency-Key must be at most 128 characters.',
  keyReused: 'This Idempotency-Key was already used with a different request.',
  keyInProgress: 'A request with this Idempotency-Key is still being processed.',
  overlap: 'You already have an appointment at that time.',
  slotFull: 'Slot is full.',
  slotStarted: 'Slot has already started.',
  slotNotFound: 'Slot not found.',
  unavailable: 'The availability service is unavailable. Try again later.',
  tooMany: 'Too many requests.',
} as const;

/** Deterministic, valid v4-shaped GUIDs so id validation in the app accepts them. */
export function guid(group: number, n: number): string {
  const hex = (v: number, len: number) => v.toString(16).padStart(len, '0');
  return `${hex(group, 8)}-0000-4000-8000-${hex(n, 12)}`;
}

export const BRANCH_IDS = {
  auckland: guid(1, 1),
  london: guid(1, 2),
  newYork: guid(1, 3),
  noSchedule: guid(1, 4),
} as const;

export const SERVICE_IDS = {
  checkup: guid(2, 1),
  consult: guid(2, 2),
  longSession: guid(2, 3),
} as const;

/** 2026-10-04T10:00:00Z: a Sunday, and Auckland is already on Monday the 5th. */
export const DEFAULT_NOW_MS = Date.UTC(2026, 9, 4, 10, 0, 0);
export const DEFAULT_CUSTOMER_ID = guid(3, 1);

const MONDAY_TO_FRIDAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;
const SLOT_DAYS = 16;
const SLOT_CAPACITY = 2;

function scheduledBranch(
  n: number,
  code: string,
  name: string,
  zone: string,
  address: string,
): BranchResponse {
  return {
    id: guid(1, n),
    code,
    name,
    description: `${name} branch`,
    address,
    phoneNumber: `+00 555 01${n}0`,
    isActive: true,
    createdAtUtc: '2026-01-01T00:00:00Z',
    timeZoneId: zone,
    workingHours: MONDAY_TO_FRIDAY.map((dayOfWeek) => ({
      dayOfWeek,
      opensAt: '09:00:00',
      closesAt: '17:00:00',
    })),
  };
}

function seedBranches(): BranchResponse[] {
  return [
    scheduledBranch(1, 'AKL', 'Auckland', 'Pacific/Auckland', '1 Queen Street, Auckland'),
    scheduledBranch(2, 'LON', 'London', 'Europe/London', '10 Baker Street, London'),
    scheduledBranch(3, 'NYC', 'New York', 'America/New_York', '350 Fifth Avenue, New York'),
    {
      id: guid(1, 4),
      code: 'NOS',
      name: 'No Schedule',
      description: null,
      address: '1 Nowhere Road',
      phoneNumber: '+00 555 0140',
      isActive: true,
      createdAtUtc: '2026-01-01T00:00:00Z',
      timeZoneId: null,
      workingHours: [],
    },
  ];
}

function seedServices(): ServiceTypeResponse[] {
  const make = (n: number, code: string, name: string, mins: number): ServiceTypeResponse => ({
    id: guid(2, n),
    code,
    name,
    description: `${name} appointment`,
    durationMinutes: mins,
    isActive: true,
    createdAtUtc: '2026-01-01T00:00:00Z',
  });
  return [
    make(1, 'CHK', 'Check-up', 30),
    make(2, 'CON', 'Consultation', 45),
    make(3, 'LNG', 'Long session', 60),
  ];
}

function minutesOf(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function clockText(total: number): string {
  const h = String(Math.floor(total / 60)).padStart(2, '0');
  const m = String(total % 60).padStart(2, '0');
  return `${h}:${m}:00`;
}

function iso(ms: number): string {
  return new Date(ms).toISOString().replace('.000Z', 'Z');
}

function generateSlots(
  branches: BranchResponse[],
  services: ServiceTypeResponse[],
  nowMs: number,
): Map<string, ModelSlot> {
  const slots = new Map<string, ModelSlot>();
  let n = 0;
  for (const branch of branches) {
    const zone = branch.timeZoneId;
    if (!zone || !branch.workingHours?.length) continue;
    const today = todayInZone(zone, nowMs);
    for (const service of services) {
      for (let day = 0; day < SLOT_DAYS; day++) {
        const date = addDays(today, day);
        const [y, m, d] = date.split('-').map(Number);
        const weekday = DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
        const hours = branch.workingHours.find((h) => h.dayOfWeek === weekday);
        if (!hours) continue;
        const opens = minutesOf(hours.opensAt);
        const closes = minutesOf(hours.closesAt);
        for (
          let at = opens;
          at + service.durationMinutes <= closes;
          at += service.durationMinutes
        ) {
          const start = localToUtc(zone, date, at);
          const end = localToUtc(zone, date, at + service.durationMinutes);
          if (start.gap || end.gap || start.utcMs <= nowMs) continue;
          const id = guid(4, ++n);
          slots.set(id, {
            id,
            branchId: branch.id,
            serviceTypeId: service.id,
            date,
            startAtUtc: iso(start.utcMs),
            endAtUtc: iso(end.utcMs),
            localStartTime: clockText(at),
            localEndTime: clockText(at + service.durationMinutes),
            capacity: SLOT_CAPACITY,
            availableCapacity: SLOT_CAPACITY,
            startMs: start.utcMs,
            endMs: end.utcMs,
          });
        }
      }
    }
  }
  return slots;
}

function problem(status: number, detail: string, headers?: Record<string, string>): BackendReply {
  return { status, body: { status, detail }, headers };
}

function toSlotResponse(slot: ModelSlot): SlotResponse {
  const { startMs, endMs, ...response } = slot;
  void startMs;
  void endMs;
  return response;
}

export interface BookingBackend {
  state: BookingBackendState;
  listBranches(): BackendReply;
  listServices(): BackendReply;
  searchSlots(params: Partial<SlotSearchParams>): BackendReply;
  createAppointment(idempotencyKey: string | null, body: unknown): BackendReply;
  /** Appointments currently booked for the slot (the invariant test counts these). */
  bookedFor(slotId: string): AppointmentResponse[];
}

export function createBookingBackend(
  options: { nowMs?: number; customerId?: string } = {},
): BookingBackend {
  const nowMs = options.nowMs ?? DEFAULT_NOW_MS;
  const branches = seedBranches();
  const services = seedServices();
  const state: BookingBackendState = {
    nowMs,
    customerId: options.customerId ?? DEFAULT_CUSTOMER_ID,
    branches,
    services,
    slots: generateSlots(branches, services, nowMs),
    appointments: [],
    idempotency: new Map(),
    counters: { branches: 0, services: 0, search: 0, create: 0 },
    flags: {
      searchRateLimitAfter: null,
      createRateLimited: false,
      unavailableNext: 0,
      dropResponseAfterBookingNext: false,
      inProgressNext: false,
    },
  };
  let appointmentCount = 0;

  const slotReason = (slot: ModelSlot): BackendReply | null => {
    const branch = state.branches.find((b) => b.id === slot.branchId);
    const service = state.services.find((s) => s.id === slot.serviceTypeId);
    if (!branch?.isActive) return problem(409, `Branch '${branch?.code}' is inactive.`);
    if (!service?.isActive) return problem(409, `Service type '${service?.code}' is inactive.`);
    if (slot.startMs <= state.nowMs) return problem(409, MESSAGES.slotStarted);
    if (slot.availableCapacity <= 0) return problem(409, MESSAGES.slotFull);
    return null;
  };

  const book = (slot: ModelSlot): BackendReply => {
    slot.availableCapacity--;
    const stamp = iso(state.nowMs);
    const appointment: AppointmentResponse = {
      id: guid(5, ++appointmentCount),
      customerId: state.customerId,
      slotId: slot.id,
      branchId: slot.branchId,
      serviceTypeId: slot.serviceTypeId,
      startUtc: slot.startAtUtc,
      endUtc: slot.endAtUtc,
      status: 'Booked',
      createdAtUtc: stamp,
      updatedAtUtc: stamp,
      cancelledAtUtc: null,
    };
    state.appointments.push(appointment);
    return {
      status: 201,
      body: appointment,
      headers: { Location: `/api/appointments/${appointment.id}` },
    };
  };

  return {
    state,
    listBranches() {
      state.counters.branches++;
      return { status: 200, body: state.branches.filter((b) => b.isActive) };
    },
    listServices() {
      state.counters.services++;
      return { status: 200, body: state.services.filter((s) => s.isActive) };
    },
    searchSlots({ branchId, serviceId, date }) {
      state.counters.search++;
      const limit = state.flags.searchRateLimitAfter;
      if (limit !== null && state.counters.search > limit) {
        return problem(429, MESSAGES.tooMany, { 'Retry-After': '60' });
      }
      if (!branchId || !serviceId || !date) {
        return problem(400, 'branchId, serviceId and date are required.');
      }
      const branch = state.branches.find((b) => b.id === branchId);
      const service = state.services.find((s) => s.id === serviceId);
      if (!branch?.isActive) return problem(404, 'Branch not found.');
      if (!service?.isActive) return problem(404, 'Service type not found.');
      const found = [...state.slots.values()]
        .filter(
          (s) =>
            s.branchId === branchId &&
            s.serviceTypeId === serviceId &&
            s.date === date &&
            s.startMs > state.nowMs,
        )
        .sort((a, b) => a.startMs - b.startMs)
        .map(toSlotResponse);
      return { status: 200, body: found };
    },
    createAppointment(key, body) {
      state.counters.create++;
      if (state.flags.createRateLimited) {
        return problem(429, MESSAGES.tooMany, { 'Retry-After': '60' });
      }
      if (state.flags.unavailableNext > 0) {
        state.flags.unavailableNext--;
        return problem(503, MESSAGES.unavailable);
      }
      if (key === null || key.trim() === '') return problem(400, MESSAGES.keyRequired);
      if (key.length > 128) return problem(400, MESSAGES.keyTooLong);
      const bodyHash = JSON.stringify(body ?? null);
      const known = state.idempotency.get(key);
      if (known) {
        return known.bodyHash === bodyHash ? known.reply : problem(422, MESSAGES.keyReused);
      }
      if (state.flags.inProgressNext) {
        state.flags.inProgressNext = false;
        return problem(409, MESSAGES.keyInProgress);
      }
      const slotId = (body as { slotId?: unknown } | null)?.slotId;
      const slot = typeof slotId === 'string' ? state.slots.get(slotId) : undefined;
      let reply: BackendReply;
      if (!slot) {
        reply = problem(404, MESSAGES.slotNotFound);
      } else {
        const overlap = state.appointments.some(
          (a) =>
            a.customerId === state.customerId &&
            a.status === 'Booked' &&
            Date.parse(a.startUtc) < slot.endMs &&
            Date.parse(a.endUtc) > slot.startMs,
        );
        reply = overlap ? problem(409, MESSAGES.overlap) : (slotReason(slot) ?? book(slot));
      }
      state.idempotency.set(key, { bodyHash, reply });
      if (reply.status === 201 && state.flags.dropResponseAfterBookingNext) {
        state.flags.dropResponseAfterBookingNext = false;
        return { status: reply.status, drop: true };
      }
      return reply;
    },
    bookedFor(slotId) {
      return state.appointments.filter((a) => a.slotId === slotId && a.status === 'Booked');
    },
  };
}
