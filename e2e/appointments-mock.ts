import type { Page, Route } from '@playwright/test';
import { API } from './mock-backend';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE',
  'access-control-expose-headers': 'X-Correlation-ID, Retry-After, Location',
};

export const BRANCH_ID = '00000000-0000-4000-8000-0000000000b1';
export const SERVICE_ID = '00000000-0000-4000-8000-0000000000e1';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface Appt {
  id: string;
  customerId: string;
  slotId: string;
  branchId: string;
  serviceTypeId: string;
  startUtc: string;
  endUtc: string;
  status: 'Booked' | 'Cancelled' | 'Completed' | 'NoShow';
  createdAtUtc: string;
  updatedAtUtc: string;
  cancelledAtUtc: string | null;
  completedAtUtc: string | null;
  noShowAtUtc: string | null;
}

export type CancelMode = 'ok' | 'conflict' | 'unavailable-cancelled' | 'unavailable-booked';

export interface AppointmentsMock {
  readonly items: Appt[];
  /** Number of cancel POSTs seen. */
  readonly cancelCalls: () => number;
  setCancelMode(mode: CancelMode): void;
}

export interface AppointmentsOptions {
  upcoming?: number;
  past?: number;
  /** The statuses of the past appointments (replaces `past`), newest first. */
  pastStatuses?: Appt['status'][];
  cancel?: CancelMode;
}

const guid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

export function makeAppt(n: number, startMs: number, status: Appt['status'] = 'Booked'): Appt {
  const iso = (ms: number) => new Date(ms).toISOString();
  return {
    id: guid(0x1000 + n),
    customerId: guid(0xc1),
    slotId: guid(0x2000 + n),
    branchId: BRANCH_ID,
    serviceTypeId: SERVICE_ID,
    startUtc: iso(startMs),
    endUtc: iso(startMs + HOUR / 2),
    status,
    createdAtUtc: iso(startMs - 10 * DAY),
    updatedAtUtc: iso(startMs - 10 * DAY),
    cancelledAtUtc: status === 'Cancelled' ? iso(startMs - DAY) : null,
    completedAtUtc: status === 'Completed' ? iso(startMs + HOUR) : null,
    noShowAtUtc: status === 'NoShow' ? iso(startMs + HOUR) : null,
  };
}

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const problem = (route: Route, status: number, detail: string) =>
  route.fulfill({
    status,
    headers: { ...CORS, 'content-type': 'application/problem+json' },
    body: JSON.stringify({ status, detail }),
  });

/**
 * Mocks the appointment, branch and service endpoints with `page.route`. Register after
 * `mockBackend` (routes added later win); other requests fall back to it.
 */
export async function mockAppointments(
  page: Page,
  options: AppointmentsOptions = {},
): Promise<AppointmentsMock> {
  const now = Date.now();
  const items: Appt[] = [];
  for (let i = 0; i < (options.upcoming ?? 2); i++) {
    items.push(makeAppt(i, now + (i + 2) * DAY));
  }
  const past = options.pastStatuses ?? Array.from({ length: options.past ?? 1 }, () => 'Booked');
  past.forEach((status, i) => {
    items.push(makeAppt(500 + i, now - (i + 2) * DAY, status as Appt['status']));
  });
  let mode: CancelMode = options.cancel ?? 'ok';
  let cancelCalls = 0;

  await page.route(`${API}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.toLowerCase();

    if (request.method() === 'GET' && path === '/api/branches') {
      return json(route, 200, [
        {
          id: BRANCH_ID,
          code: 'LDN',
          name: 'London Central',
          description: null,
          address: '1 High Street',
          phoneNumber: '+44 20 0000 0000',
          isActive: true,
          timeZoneId: 'Europe/London',
          workingHours: [],
        },
      ]);
    }
    if (request.method() === 'GET' && path === '/api/services') {
      return json(route, 200, [
        {
          id: SERVICE_ID,
          code: 'CHK',
          name: 'Health check',
          description: null,
          durationMinutes: 30,
          isActive: true,
        },
      ]);
    }
    if (request.method() === 'GET' && path === '/api/appointments/my') {
      const q = url.searchParams;
      const when = q.get('when');
      const status = q.get('status');
      const pageNo = Number(q.get('page') ?? 1);
      const size = Number(q.get('pageSize') ?? 20);
      let rows = items.filter((a) => (status ? a.status === status : true));
      if (when === 'upcoming') rows = rows.filter((a) => Date.parse(a.startUtc) >= Date.now());
      else rows = rows.filter((a) => Date.parse(a.startUtc) < Date.now());
      rows.sort((a, b) =>
        when === 'upcoming'
          ? Date.parse(a.startUtc) - Date.parse(b.startUtc)
          : Date.parse(b.startUtc) - Date.parse(a.startUtc),
      );
      return json(route, 200, {
        items: rows.slice((pageNo - 1) * size, pageNo * size),
        page: pageNo,
        pageSize: size,
        totalCount: rows.length,
      });
    }
    const one = /^\/api\/appointments\/([0-9a-f-]{36})(\/cancel)?$/.exec(path);
    if (one) {
      const found = items.find((a) => a.id === one[1]);
      if (!found) return problem(route, 404, 'Appointment not found.');
      if (request.method() === 'GET' && !one[2]) return json(route, 200, found);
      if (request.method() === 'POST' && one[2]) {
        cancelCalls++;
        const doCancel = () => {
          found.status = 'Cancelled';
          found.cancelledAtUtc = new Date().toISOString();
        };
        switch (mode) {
          case 'conflict':
            return problem(
              route,
              409,
              'The appointment has already started and can no longer be cancelled.',
            );
          case 'unavailable-cancelled':
            doCancel();
            return problem(route, 503, 'Service unavailable.');
          case 'unavailable-booked':
            mode = 'ok';
            return problem(route, 503, 'Service unavailable.');
          default:
            doCancel();
            return route.fulfill({ status: 204, headers: CORS });
        }
      }
    }
    return route.fallback();
  });

  return {
    items,
    cancelCalls: () => cancelCalls,
    setCancelMode: (m) => {
      mode = m;
    },
  };
}
