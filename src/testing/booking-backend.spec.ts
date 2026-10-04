import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { APP_CONFIG } from '../app/core/config/app-config';
import { ApiClient } from '../app/core/api/api-client';
import { zonedParts } from '../app/core/time';
import { availabilityHandlers } from './availability.handlers';
import {
  BRANCH_IDS,
  MESSAGES,
  SERVICE_IDS,
  createBookingBackend,
  type BookingBackend,
} from './booking-backend';
import { bookingHandlers } from './booking.handlers';
import { server } from './server';
import type { AppointmentResponse, SlotResponse } from '../app/core/api/models';

const BASE = 'http://gw.test:5290';

function slotsOf(backend: BookingBackend, branchId: string, serviceId: string) {
  return [...backend.state.slots.values()].filter(
    (s) => s.branchId === branchId && s.serviceTypeId === serviceId,
  );
}

describe('createBookingBackend (model)', () => {
  it('seeds Auckland, London, New York and a branch with no schedule', () => {
    const { state } = createBookingBackend();
    expect(state.branches.map((b) => b.code)).toEqual(['AKL', 'LON', 'NYC', 'NOS']);
    expect(state.branches[3].workingHours).toEqual([]);
    expect(state.branches[3].timeZoneId).toBeNull();
  });

  it('generates future slots in each branch zone, none for the unscheduled branch', () => {
    const backend = createBookingBackend();
    for (const slot of backend.state.slots.values()) {
      expect(slot.startMs).toBeGreaterThan(backend.state.nowMs);
      expect(slot.branchId).not.toBe(BRANCH_IDS.noSchedule);
    }
    const first = slotsOf(backend, BRANCH_IDS.auckland, SERVICE_IDS.checkup)[0];
    const zone = backend.state.branches[0].timeZoneId!;
    const local = zonedParts(zone, new Date(first.startMs));
    const hh = String(Math.floor(local.minutes / 60)).padStart(2, '0');
    const mm = String(local.minutes % 60).padStart(2, '0');
    expect(local.date).toBe(first.date);
    expect(`${hh}:${mm}:00`).toBe(first.localStartTime);
  });

  it('answers 200 with [] for the branch with no schedule and 404 for unknown ids', () => {
    const backend = createBookingBackend();
    expect(
      backend.searchSlots({
        branchId: BRANCH_IDS.noSchedule,
        serviceId: SERVICE_IDS.checkup,
        date: '2026-10-05',
      }),
    ).toEqual({ status: 200, body: [] });
    expect(
      backend.searchSlots({ branchId: 'nope', serviceId: SERVICE_IDS.checkup, date: '2026-10-05' })
        .status,
    ).toBe(404);
  });

  it('rejects a missing key with 400', () => {
    const backend = createBookingBackend();
    const slot = [...backend.state.slots.values()][0];
    const reply = backend.createAppointment(null, { slotId: slot.id });
    expect(reply).toMatchObject({ status: 400, body: { detail: MESSAGES.keyRequired } });
  });

  it('books once and replays the first status and body for the same key and body', () => {
    const backend = createBookingBackend();
    const slot = [...backend.state.slots.values()][0];
    const first = backend.createAppointment('k1', { slotId: slot.id });
    const second = backend.createAppointment('k1', { slotId: slot.id });
    expect(first.status).toBe(201);
    expect(second).toEqual(first);
    expect(backend.bookedFor(slot.id)).toHaveLength(1);
    expect(backend.state.slots.get(slot.id)!.availableCapacity).toBe(1);
  });

  it('answers 422 for the same key with another body', () => {
    const backend = createBookingBackend();
    const [a, b] = [...backend.state.slots.values()];
    backend.createAppointment('k1', { slotId: a.id });
    expect(backend.createAppointment('k1', { slotId: b.id })).toMatchObject({
      status: 422,
      body: { detail: MESSAGES.keyReused },
    });
  });

  it('refuses an overlapping appointment with the verbatim 409', () => {
    const backend = createBookingBackend();
    const slot = slotsOf(backend, BRANCH_IDS.london, SERVICE_IDS.checkup)[0];
    // Same start in another service type: overlaps in time.
    const other = slotsOf(backend, BRANCH_IDS.london, SERVICE_IDS.consult).find(
      (s) => s.startMs === slot.startMs,
    )!;
    expect(backend.createAppointment('k1', { slotId: slot.id }).status).toBe(201);
    expect(backend.createAppointment('k2', { slotId: other.id })).toMatchObject({
      status: 409,
      body: { detail: MESSAGES.overlap },
    });
  });

  it('refuses a full slot with the verbatim 409', () => {
    const backend = createBookingBackend();
    const slot = backend.state.slots.values().next().value!;
    slot.availableCapacity = 0;
    expect(backend.createAppointment('k1', { slotId: slot.id })).toMatchObject({
      status: 409,
      body: { detail: MESSAGES.slotFull },
    });
  });

  it('refuses a started slot, an inactive branch and an inactive service', () => {
    const backend = createBookingBackend();
    const [a, b] = [...backend.state.slots.values()];
    a.startMs = backend.state.nowMs - 1;
    expect(backend.createAppointment('k1', { slotId: a.id }).body).toMatchObject({
      detail: MESSAGES.slotStarted,
    });
    backend.state.branches.find((x) => x.id === b.branchId)!.isActive = false;
    expect(backend.createAppointment('k2', { slotId: b.id }).body).toMatchObject({
      detail: expect.stringMatching(/^Branch '.+' is inactive\.$/),
    });
    const other = [...backend.state.slots.values()].find((s) => s.branchId !== b.branchId)!;
    backend.state.services.find((x) => x.id === other.serviceTypeId)!.isActive = false;
    expect(backend.createAppointment('k3', { slotId: other.id }).body).toMatchObject({
      detail: expect.stringMatching(/^Service type '.+' is inactive\.$/),
    });
  });

  it('answers 404 for an unknown slot', () => {
    expect(createBookingBackend().createAppointment('k1', { slotId: 'nope' })).toMatchObject({
      status: 404,
      body: { detail: MESSAGES.slotNotFound },
    });
  });

  it('flags: 503, in-progress, 429 and dropped response', () => {
    const backend = createBookingBackend();
    const slot = [...backend.state.slots.values()][0];
    backend.state.flags.unavailableNext = 1;
    expect(backend.createAppointment('k1', { slotId: slot.id }).status).toBe(503);
    backend.state.flags.inProgressNext = true;
    expect(backend.createAppointment('k1', { slotId: slot.id })).toMatchObject({
      status: 409,
      body: { detail: MESSAGES.keyInProgress },
    });
    backend.state.flags.createRateLimited = true;
    expect(backend.createAppointment('k1', { slotId: slot.id })).toMatchObject({
      status: 429,
      headers: { 'Retry-After': '60' },
    });
    backend.state.flags.createRateLimited = false;
    backend.state.flags.dropResponseAfterBookingNext = true;
    const dropped = backend.createAppointment('k1', { slotId: slot.id });
    expect(dropped.drop).toBe(true);
    expect(backend.bookedFor(slot.id)).toHaveLength(1);
    // The retry with the same key replays the original 201.
    expect(backend.createAppointment('k1', { slotId: slot.id }).status).toBe(201);
    expect(backend.bookedFor(slot.id)).toHaveLength(1);
  });

  it('rate-limits searches after the configured count', () => {
    const backend = createBookingBackend();
    backend.state.flags.searchRateLimitAfter = 2;
    const params = {
      branchId: BRANCH_IDS.london,
      serviceId: SERVICE_IDS.checkup,
      date: '2026-10-05',
    };
    expect(backend.searchSlots(params).status).toBe(200);
    expect(backend.searchSlots(params).status).toBe(200);
    expect(backend.searchSlots(params)).toMatchObject({
      status: 429,
      headers: { 'Retry-After': '60' },
    });
  });
});

describe('booking handlers over HTTP', () => {
  function setup() {
    const backend = createBookingBackend();
    server.use(...availabilityHandlers(backend, BASE), ...bookingHandlers(backend, BASE));
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } }],
    });
    return { backend, api: TestBed.inject(ApiClient) };
  }

  it('serves searches, echoes the correlation id and writes problem+json', async () => {
    const { backend, api } = setup();
    const slots = await firstValueFrom(
      api.get<SlotResponse[]>('/api/Slots/available', {
        params: { branchId: BRANCH_IDS.london, serviceId: SERVICE_IDS.checkup, date: '2026-10-05' },
      }),
    );
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => !('startMs' in s))).toBe(true);

    const res = await fetch(`${BASE}/api/appointments`, {
      method: 'POST',
      headers: { 'X-Correlation-ID': 'abc', 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotId: slots[0].id }),
    });
    expect(res.status).toBe(400);
    expect(res.headers.get('Content-Type')).toContain('application/problem+json');
    expect(res.headers.get('X-Correlation-ID')).toBe('abc');
    expect(await res.json()).toEqual({ status: 400, detail: MESSAGES.keyRequired });
    expect(backend.state.counters.create).toBe(1);
  });

  it('creates an appointment and loses the response on request', async () => {
    const { backend, api } = setup();
    const slot = [...backend.state.slots.values()][0];
    const created = await firstValueFrom(
      api.post<AppointmentResponse>(
        '/api/appointments',
        { slotId: slot.id },
        { headers: { 'Idempotency-Key': 'k' } },
      ),
    );
    expect(created.slotId).toBe(slot.id);
    backend.state.flags.dropResponseAfterBookingNext = true;
    const other = [...backend.state.slots.values()][1];
    await expect(
      firstValueFrom(
        api.post(
          '/api/appointments',
          { slotId: other.id },
          { headers: { 'Idempotency-Key': 'k2' } },
        ),
      ),
    ).rejects.toBeTruthy();
    expect(backend.bookedFor(other.id)).toHaveLength(1);
  });
});
