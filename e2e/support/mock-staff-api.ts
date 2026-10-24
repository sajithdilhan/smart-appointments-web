import type { Page, Route } from '@playwright/test';
import { todayInZone } from '../../src/app/core/time/calendar-date';
import { localToUtc } from '../../src/app/core/time/zone-math';
import { API, mockBackend, type MockBackend, type MockOptions } from '../mock-backend';

/**
 * A stateful stand-in for the staff workspace endpoints of the gateway, for Playwright: the
 * branch day list, the Complete and No-show marks, and the two Availability reads the staff
 * screen makes (`GET /api/branches/{id}`, `GET /api/services`). It extends `mockBackend` (config,
 * auth) with a Staff login whose access token carries `branch_id`. The rules follow
 * `src/testing/branch-day-backend.ts` (which a Vitest spec pins against the C# handlers), kept
 * shorter here: one `400` listing every failure, `403` for another branch, `409` before the start
 * or from another status, a repeat of the same outcome is `200`.
 *
 * Time comes from `state.nowMs` when set, else the real clock, so a test can place appointments
 * relative to `Date.now()` or freeze the server's idea of "now".
 *
 * Admin pages: pass `{ role: 'Admin' }` (no claim) and `availability: false` when
 * `mock-admin-api.ts` already answers the branch and service reads; then seed the same branch in
 * `state.branches` here so the day list knows its zone.
 */

export const STAFF_BRANCH_ID = '00000000-0000-4000-8000-0000000000b1';
export const STAFF_SERVICE_ID = '00000000-0000-4000-8000-0000000000e1';
export const STAFF_CUSTOMER_ID = '00000000-0000-4000-8000-0000000000c1';

export interface MockStaffBranch {
  id: string;
  code: string;
  name: string;
  description: string | null;
  address: string;
  phoneNumber: string;
  isActive: boolean;
  createdAtUtc: string;
  updatedAtUtc: string | null;
  timeZoneId: string | null;
  workingHours: never[];
}

export interface MockStaffService {
  id: string;
  code: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  isActive: boolean;
  createdAtUtc: string;
  updatedAtUtc: string | null;
}

export type MockDayStatus = 'Booked' | 'Cancelled' | 'Completed' | 'NoShow';

export interface MockDayAppointment {
  id: string;
  customerId: string;
  slotId: string;
  branchId: string;
  serviceTypeId: string;
  startUtc: string;
  endUtc: string;
  status: MockDayStatus;
  createdAtUtc: string;
  updatedAtUtc: string;
  cancelledAtUtc: string | null;
  completedAtUtc: string | null;
  noShowAtUtc: string | null;
}

export interface MockCustomer {
  firstName: string;
  lastName: string;
  phoneNumber: string;
}

export interface MockStaffState {
  /** The server's clock; null means `Date.now()`. */
  nowMs: number | null;
  branches: MockStaffBranch[];
  services: MockStaffService[];
  appointments: MockDayAppointment[];
  /** Auth's lookup data by customer id; a customer missing here is `customer: null`. */
  customers: Map<string, MockCustomer>;
  /** Mark calls seen, in order. */
  marks: { id: string; kind: 'complete' | 'no-show' }[];
  /** Day-list requests seen (the query strings), in order. */
  dayRequests: string[];
  /** When true, the day list answers `customersUnavailable: true` and null customers. */
  customersUnavailable: boolean;
  /** When set, every day-list request answers this status (for 503 or 500 tests). */
  dayListStatus: number | null;
}

export interface MockStaffOptions extends Omit<MockOptions, 'branchId'> {
  /**
   * The `branch_id` claim of a Staff token: the default branch when omitted, no claim at all
   * when `null` (the not-linked state).
   */
  branchId?: string | null;
  /** Register the branch and service reads too (default true). */
  availability?: boolean;
}

export interface MockStaffApi extends MockBackend {
  readonly state: MockStaffState;
  seedBranch(partial?: Partial<MockStaffBranch>): MockStaffBranch;
  seedService(partial?: Partial<MockStaffService>): MockStaffService;
  seedCustomer(id: string, partial?: Partial<MockCustomer>): void;
  /** A Booked appointment of the default branch and service unless overridden. */
  seedAppointment(partial?: Partial<MockDayAppointment>): MockDayAppointment;
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE',
  'access-control-expose-headers': 'X-Correlation-ID, Retry-After, Location',
};

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES: MockDayStatus[] = ['Booked', 'Cancelled', 'Completed', 'NoShow'];
const PREFIX = 'Invalid request data. Errors: ';

const reply = (route: Route, status: number, body?: unknown) =>
  route.fulfill({
    status,
    headers: { ...CORS, 'content-type': 'application/json', 'x-correlation-id': 'e2e' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const problem = (route: Route, status: number, detail: string) =>
  route.fulfill({
    status,
    headers: { ...CORS, 'content-type': 'application/problem+json', 'x-correlation-id': 'e2e' },
    body: JSON.stringify({ status, detail }),
  });

function wholeNumber(raw: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= min && n <= max ? n : null;
}

function nextDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

function isRealDate(raw: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** `[from, to)` of a branch-local day; a midnight inside a DST gap moves forward 30 minutes. */
function dayRange(date: string, zone: string): { from: number; to: number } {
  const midnight = (d: string) => {
    let minute = 0;
    let r = localToUtc(zone, d, minute);
    while (r.gap) {
      minute += 30;
      r = localToUtc(zone, d, minute);
    }
    return r.utcMs;
  };
  return { from: midnight(date), to: midnight(nextDate(date)) };
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Mocks the staff workspace endpoints on top of `mockBackend` (a Staff login with a branch claim). */
export async function mockStaffApi(
  page: Page,
  options: MockStaffOptions = {},
): Promise<MockStaffApi> {
  const role = options.role ?? 'Staff';
  const claim =
    options.branchId === null
      ? undefined
      : (options.branchId ?? (role === 'Staff' ? STAFF_BRANCH_ID : undefined));
  const backend = await mockBackend(page, { ...options, role, branchId: claim });

  const iso = (ms: number) => new Date(ms).toISOString();
  const state: MockStaffState = {
    nowMs: null,
    branches: [],
    services: [],
    appointments: [],
    customers: new Map(),
    marks: [],
    dayRequests: [],
    customersUnavailable: false,
    dayListStatus: null,
  };
  const nowMs = () => state.nowMs ?? Date.now();

  const seedBranch = (partial: Partial<MockStaffBranch> = {}): MockStaffBranch => {
    const n = state.branches.length + 1;
    const branch: MockStaffBranch = {
      id: n === 1 ? STAFF_BRANCH_ID : crypto.randomUUID(),
      code: `B${n}0`,
      name: `Branch ${n}`,
      description: null,
      address: '1 Main Street',
      phoneNumber: '+14155550123',
      isActive: true,
      createdAtUtc: iso(nowMs()),
      updatedAtUtc: null,
      timeZoneId: 'Europe/London',
      workingHours: [],
      ...partial,
    };
    state.branches.push(branch);
    return branch;
  };
  const seedService = (partial: Partial<MockStaffService> = {}): MockStaffService => {
    const n = state.services.length + 1;
    const service: MockStaffService = {
      id: n === 1 ? STAFF_SERVICE_ID : crypto.randomUUID(),
      code: `S${n}0`,
      name: `Service ${n}`,
      description: null,
      durationMinutes: 30,
      isActive: true,
      createdAtUtc: iso(nowMs()),
      updatedAtUtc: null,
      ...partial,
    };
    state.services.push(service);
    return service;
  };
  const seedCustomer = (id: string, partial: Partial<MockCustomer> = {}) => {
    state.customers.set(id, {
      firstName: 'Ana',
      lastName: 'Perera',
      phoneNumber: '+94771234567',
      ...partial,
    });
  };
  const seedAppointment = (partial: Partial<MockDayAppointment> = {}): MockDayAppointment => {
    const n = state.appointments.length + 1;
    const startUtc = partial.startUtc ?? iso(nowMs());
    const appointment: MockDayAppointment = {
      id: `00000000-0000-4000-8000-${(0x1000 + n).toString(16).padStart(12, '0')}`,
      customerId: STAFF_CUSTOMER_ID,
      slotId: `00000000-0000-4000-8000-${(0x2000 + n).toString(16).padStart(12, '0')}`,
      branchId: STAFF_BRANCH_ID,
      serviceTypeId: STAFF_SERVICE_ID,
      endUtc: iso(Date.parse(startUtc) + 30 * 60_000),
      status: 'Booked',
      createdAtUtc: iso(nowMs() - 86_400_000),
      updatedAtUtc: iso(nowMs() - 86_400_000),
      cancelledAtUtc: null,
      completedAtUtc: null,
      noShowAtUtc: null,
      ...partial,
      startUtc,
    };
    state.appointments.push(appointment);
    return appointment;
  };

  const escaped = API.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Policy: Admin or Staff. The mock issues the token, so the caller is known without decoding it.
  const callerBranch = claim;
  const hidden = (branchId: string) =>
    role === 'Staff' && (callerBranch === undefined || !same(callerBranch, branchId));

  await page.route(
    new RegExp(`^${escaped}/api/appointments/branch/[^/?]+(\\?.*)?$`, 'i'),
    async (route) => {
      const request = route.request();
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      const url = new URL(request.url());
      state.dayRequests.push(url.search);
      if (state.dayListStatus !== null) {
        return problem(route, state.dayListStatus, 'The availability service is unavailable.');
      }
      const branchId = url.pathname.split('/').at(-1)!;
      if (!GUID.test(branchId)) return reply(route, 404);

      const errors: string[] = [];
      const rawDate = url.searchParams.get('date');
      const rawStatus = url.searchParams.get('status');
      const rawPage = url.searchParams.get('page');
      const rawPageSize = url.searchParams.get('pageSize');
      if (rawDate !== null && !isRealDate(rawDate)) {
        errors.push('The date must be a valid date in the format yyyy-MM-dd.');
      }
      const status =
        rawStatus === null
          ? null
          : STATUSES.find((s) => s.toLowerCase() === rawStatus.toLowerCase());
      if (rawStatus !== null && !status) {
        errors.push('The status must be Booked, Cancelled, Completed or NoShow.');
      }
      const pageNo = rawPage === null ? 1 : wholeNumber(rawPage, 1, 2_147_483_647);
      if (pageNo === null) errors.push('The page must be a whole number of at least 1.');
      const pageSize = rawPageSize === null ? 20 : wholeNumber(rawPageSize, 1, 100);
      if (pageSize === null) errors.push('The pageSize must be a whole number from 1 to 100.');
      if (errors.length > 0) return problem(route, 400, PREFIX + errors.join(','));

      if (hidden(branchId)) {
        return problem(route, 403, "You can only view your own branch's appointments.");
      }
      const branch = state.branches.find((b) => same(b.id, branchId));
      if (!branch) return problem(route, 404, `Branch '${branchId}' was not found.`);

      const zone = branch.timeZoneId?.trim() ? branch.timeZoneId : 'UTC';
      const day = rawDate ?? todayInZone(zone, nowMs());
      const range = dayRange(day, zone);
      let rows = state.appointments.filter((a) => {
        const start = Date.parse(a.startUtc);
        return same(a.branchId, branchId) && start >= range.from && start < range.to;
      });
      if (status) rows = rows.filter((a) => a.status === status);
      rows.sort(
        (a, b) => Date.parse(a.startUtc) - Date.parse(b.startUtc) || (a.id < b.id ? -1 : 1),
      );

      const skip = (pageNo! - 1) * pageSize!;
      const slice = skip >= rows.length ? [] : rows.slice(skip, skip + pageSize!);
      const unavailable = slice.length > 0 && state.customersUnavailable;
      return reply(route, 200, {
        items: slice.map((a) => ({
          ...a,
          customer: unavailable ? null : (state.customers.get(a.customerId) ?? null),
        })),
        page: pageNo,
        pageSize,
        totalCount: rows.length,
        customersUnavailable: unavailable,
      });
    },
  );

  await page.route(
    new RegExp(`^${escaped}/api/appointments/[^/?]+/(complete|no-show)(\\?.*)?$`, 'i'),
    async (route) => {
      const request = route.request();
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      if (role === 'Customer') return problem(route, 403, 'You do not have permission.');
      const segments = new URL(request.url()).pathname.split('/');
      const kind = segments.at(-1)!.toLowerCase() === 'complete' ? 'complete' : 'no-show';
      const id = segments.at(-2)!;
      state.marks.push({ id, kind });
      const target: MockDayStatus = kind === 'complete' ? 'Completed' : 'NoShow';

      const found = state.appointments.find((a) => same(a.id, id));
      if (!found || hidden(found.branchId)) {
        return problem(route, 404, `Appointment '${id}' was not found.`);
      }
      if (found.status === target) return reply(route, 200, found);
      if (found.status !== 'Booked') {
        return problem(
          route,
          409,
          `The appointment is ${found.status} and cannot be marked ${target}.`,
        );
      }
      if (nowMs() < Date.parse(found.startUtc)) {
        return problem(route, 409, 'The appointment has not started yet.');
      }
      const stamp = iso(nowMs());
      found.status = target;
      found.updatedAtUtc = stamp;
      if (target === 'Completed') found.completedAtUtc = stamp;
      else found.noShowAtUtc = stamp;
      return reply(route, 200, found);
    },
  );

  if (options.availability !== false) {
    await page.route(new RegExp(`^${escaped}/api/branches/[^/?]+(\\?.*)?$`, 'i'), async (route) => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: CORS });
      }
      const id = new URL(route.request().url()).pathname.split('/').at(-1)!;
      const branch = state.branches.find((b) => same(b.id, id));
      // An inactive branch is a 404 for everyone but an admin.
      return !branch || (!branch.isActive && role !== 'Admin')
        ? problem(route, 404, `Branch '${id}' was not found.`)
        : reply(route, 200, branch);
    });
    await page.route(new RegExp(`^${escaped}/api/services(\\?.*)?$`, 'i'), async (route) => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: CORS });
      }
      return reply(
        route,
        200,
        state.services.filter((s) => s.isActive || role === 'Admin'),
      );
    });
  }

  return { ...backend, state, seedBranch, seedService, seedCustomer, seedAppointment };
}
