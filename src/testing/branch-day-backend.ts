import { http, HttpResponse, type RequestHandler } from 'msw';
import { decodeAccessToken } from '../app/core/auth/jwt';
import type { Role } from '../app/core/auth/session.model';
import type {
  AppointmentResponse,
  Branch,
  BranchAppointment,
  BranchAppointmentCustomer,
  BranchAppointmentsPage,
  ServiceType,
} from '../app/core/api/models';
import { localToUtc } from '../app/core/time/zone-math';
import { todayInZone } from '../app/core/time/calendar-date';
import { isValidZone } from '../app/core/time/zone';
import { BRANCH_ID, CUSTOMER_ID, makeAppointment, SERVICE_ID } from './make-appointment';

/**
 * A stateful stand-in for the Booking staff endpoints and the two Availability reads the staff
 * workspace needs, written from the C# handlers (`ListBranchAppointmentsHandler`,
 * `MarkAppointmentHandler`, `BranchAppointmentsParameters`, `GetBranchHandler`), not from the
 * client. It answers what the real services answer: `application/problem+json`
 * `{ status, detail }` bodies, an echoed `X-Correlation-ID`, role checks from the token.
 *
 * Time is controllable: pass `now` (for example a `ManualClock`'s `now`) or move
 * `state.nowMs` with `setNow` / `advance`.
 */

export const BRANCH_DAY_API_BASE = 'http://gw.test:5290';

/** Verbatim backend texts (Booking.Application/Handlers/AppointmentErrors.cs and the validator). */
export const BRANCH_DAY_TEXTS = {
  validationPrefix: 'Invalid request data. Errors: ',
  invalidDate: 'The date must be a valid date in the format yyyy-MM-dd.',
  invalidStatus: 'The status must be Booked, Cancelled, Completed or NoShow.',
  invalidPage: 'The page must be a whole number of at least 1.',
  invalidPageSize: 'The pageSize must be a whole number from 1 to 100.',
  otherBranch: "You can only view your own branch's appointments.",
  notStarted: 'The appointment has not started yet.',
  forbidden: 'You do not have permission to perform this action.',
  unauthenticated: 'Authentication is required.',
  unavailable: 'The availability service is unavailable. Try again later.',
  notFound: (id: string) => `Appointment '${id}' was not found.`,
  branchNotFound: (id: string) => `Branch '${id}' was not found.`,
  notMarkable: (status: string, target: string) =>
    `The appointment is ${status} and cannot be marked ${target}.`,
} as const;

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ['Booked', 'Cancelled', 'Completed', 'NoShow'] as const;

export interface BranchDayRequest {
  method: string;
  path: string;
  search: string;
  headers: Headers;
}

export interface BranchDayState {
  /** The clock the rules use (`now` overrides it when given to the factory). */
  nowMs: number;
  branches: Branch[];
  services: ServiceType[];
  /** Auth's lookup data, by customer id. A customer missing from here is `customer: null`. */
  customers: Map<string, BranchAppointmentCustomer>;
  appointments: AppointmentResponse[];
  requests: BranchDayRequest[];
}

export interface BranchDayFlags {
  /** Auth is down: the page answers 200 with `customersUnavailable: true` and null customers. */
  customersUnavailable: boolean;
  /** Availability is down and the branch's zone is not cached: the day list answers 503. */
  zoneUnavailable: boolean;
  /** Every request answers this status (for 5xx tests). */
  failAll: number | null;
  /** The next request answers this status, then it clears. */
  failNext: number | null;
  networkError: boolean;
  rateLimited: boolean;
}

export interface BranchDayBackendOptions {
  baseUrl?: string;
  /** The clock; defaults to `state.nowMs`. */
  now?: () => number;
}

export interface BranchDayBackend {
  handlers: RequestHandler[];
  state: BranchDayState;
  flags: BranchDayFlags;
  reset(): void;
  setNow(ms: number): void;
  advance(ms: number): void;
  addBranch(partial?: Partial<Branch>): Branch;
  addService(partial?: Partial<ServiceType>): ServiceType;
  addCustomer(customerId: string, customer?: Partial<BranchAppointmentCustomer>): void;
  /** A Booked appointment of the default branch, customer and service unless overridden. */
  addAppointment(partial?: Partial<AppointmentResponse>): AppointmentResponse;
}

interface Outcome {
  status: number;
  body?: unknown;
  failure?: { status: number; detail: string };
}

function fail(status: number, detail: string): Outcome {
  return { status, failure: { status, detail } };
}

function defaultBranch(): Branch {
  return {
    id: BRANCH_ID,
    code: 'LDN',
    name: 'London Central',
    description: null,
    address: '1 High Street',
    phoneNumber: '+442000000000',
    isActive: true,
    createdAtUtc: '2026-01-01T00:00:00Z',
    updatedAtUtc: null,
    timeZoneId: 'Europe/London',
    workingHours: [],
  };
}

function defaultService(): ServiceType {
  return {
    id: SERVICE_ID,
    code: 'CHK',
    name: 'Health check',
    description: null,
    durationMinutes: 30,
    isActive: true,
    createdAtUtc: '2026-01-01T00:00:00Z',
    updatedAtUtc: null,
  };
}

function freshState(initialNow: number): BranchDayState {
  return {
    nowMs: initialNow,
    branches: [defaultBranch()],
    services: [defaultService()],
    customers: new Map(),
    appointments: [],
    requests: [],
  };
}

function freshFlags(): BranchDayFlags {
  return {
    customersUnavailable: false,
    zoneUnavailable: false,
    failAll: null,
    failNext: null,
    networkError: false,
    rateLimited: false,
  };
}

/** Digits only, like `int.TryParse(raw, NumberStyles.None, ...)`; bigger than int.MaxValue fails. */
function wholeNumber(raw: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= min && n <= max ? n : null;
}

/** `yyyy-MM-dd` that is a real calendar date. */
function isRealDate(raw: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return (
    d.getUTCFullYear() === Number(m[1]) &&
    d.getUTCMonth() === Number(m[2]) - 1 &&
    d.getUTCDate() === Number(m[3])
  );
}

function nextDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** `[from, to)` of a branch-local day; a midnight inside a DST gap moves forward 30 minutes at a time. */
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

interface Caller {
  role: Role;
  branchId: string | null;
}

function callerOf(request: Request): Caller | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const claims = decodeAccessToken(header.slice(7));
  return claims ? { role: claims.role, branchId: claims.branchId } : null;
}

export function createBranchDayBackend(options: BranchDayBackendOptions = {}): BranchDayBackend {
  const baseUrl = options.baseUrl ?? BRANCH_DAY_API_BASE;
  const INITIAL_NOW = Date.parse('2026-10-24T09:00:00Z');
  const state = freshState(INITIAL_NOW);
  const flags = freshFlags();
  const nowMs = () => (options.now ? options.now() : state.nowMs);

  function addBranch(partial: Partial<Branch> = {}): Branch {
    const n = state.branches.length + 1;
    const branch: Branch = {
      ...defaultBranch(),
      id: crypto.randomUUID(),
      code: `B${n}0`,
      name: `Branch ${n}`,
      ...partial,
    };
    state.branches.push(branch);
    return branch;
  }

  function addService(partial: Partial<ServiceType> = {}): ServiceType {
    const n = state.services.length + 1;
    const service: ServiceType = {
      ...defaultService(),
      id: crypto.randomUUID(),
      code: `S${n}0`,
      name: `Service ${n}`,
      ...partial,
    };
    state.services.push(service);
    return service;
  }

  function addCustomer(customerId: string, customer: Partial<BranchAppointmentCustomer> = {}) {
    state.customers.set(customerId, {
      firstName: 'Ana',
      lastName: 'Perera',
      phoneNumber: '+94771234567',
      ...customer,
    });
  }

  function addAppointment(partial: Partial<AppointmentResponse> = {}): AppointmentResponse {
    const appointment = makeAppointment({
      completedAtUtc: null,
      noShowAtUtc: null,
      ...partial,
    });
    state.appointments.push(appointment);
    return appointment;
  }

  function listDay(caller: Caller, branchId: string, search: URLSearchParams): Outcome {
    // Raw values: an empty string is present and therefore invalid, an absent one is a default.
    const read = (name: string): string | null => {
      for (const [k, v] of search) if (k.toLowerCase() === name.toLowerCase()) return v;
      return null;
    };
    const rawDate = read('date');
    const rawStatus = read('status');
    const rawPage = read('page');
    const rawPageSize = read('pageSize');

    const errors: string[] = [];
    if (rawDate !== null && !isRealDate(rawDate)) errors.push(BRANCH_DAY_TEXTS.invalidDate);
    const status =
      rawStatus === null ? null : STATUSES.find((s) => s.toLowerCase() === rawStatus.toLowerCase());
    if (rawStatus !== null && !status) errors.push(BRANCH_DAY_TEXTS.invalidStatus);
    const page = rawPage === null ? 1 : wholeNumber(rawPage, 1, 2_147_483_647);
    if (page === null) errors.push(BRANCH_DAY_TEXTS.invalidPage);
    const pageSize =
      rawPageSize === null ? DEFAULT_PAGE_SIZE : wholeNumber(rawPageSize, 1, MAX_PAGE_SIZE);
    if (pageSize === null) errors.push(BRANCH_DAY_TEXTS.invalidPageSize);
    if (errors.length > 0) {
      return fail(400, BRANCH_DAY_TEXTS.validationPrefix + errors.join(','));
    }

    // A staff member sees only their own branch; a missing claim matches nothing.
    if (caller.role === 'Staff' && caller.branchId?.toLowerCase() !== branchId.toLowerCase()) {
      return fail(403, BRANCH_DAY_TEXTS.otherBranch);
    }

    if (flags.zoneUnavailable) return fail(503, BRANCH_DAY_TEXTS.unavailable);
    const branch = state.branches.find((b) => b.id.toLowerCase() === branchId.toLowerCase());
    if (!branch) return fail(404, BRANCH_DAY_TEXTS.branchNotFound(branchId));

    // A null, blank or unknown zone falls back to UTC.
    const zone =
      branch.timeZoneId && branch.timeZoneId.trim() && isValidZone(branch.timeZoneId)
        ? branch.timeZoneId
        : 'UTC';
    const day = rawDate ?? todayInZone(zone, nowMs());
    const range = dayRange(day, zone);

    let rows = state.appointments.filter((a) => {
      if (a.branchId.toLowerCase() !== branchId.toLowerCase()) return false;
      const start = Date.parse(a.startUtc);
      return start >= range.from && start < range.to;
    });
    if (status) rows = rows.filter((a) => a.status === status);
    rows = [...rows].sort((a, b) => {
      const d = Date.parse(a.startUtc) - Date.parse(b.startUtc);
      return d !== 0 ? d : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    const total = rows.length;
    const skip = (page! - 1) * pageSize!;
    const slice = skip >= total ? [] : rows.slice(skip, skip + pageSize!);
    const customersUnavailable = slice.length > 0 && flags.customersUnavailable;
    const items: BranchAppointment[] = slice.map((a) => ({
      ...a,
      completedAtUtc: a.completedAtUtc ?? null,
      noShowAtUtc: a.noShowAtUtc ?? null,
      cancelledAtUtc: a.cancelledAtUtc ?? null,
      customer: customersUnavailable ? null : (state.customers.get(a.customerId) ?? null),
    }));
    const body: BranchAppointmentsPage = {
      items,
      page: page!,
      pageSize: pageSize!,
      totalCount: total,
      customersUnavailable,
    };
    return { status: 200, body };
  }

  function mark(caller: Caller, id: string, target: 'Completed' | 'NoShow'): Outcome {
    // Policy: Admin or Staff only.
    if (caller.role === 'Customer') return fail(403, BRANCH_DAY_TEXTS.forbidden);
    const found = state.appointments.find((a) => a.id.toLowerCase() === id.toLowerCase());
    const hidden =
      !found ||
      (caller.role === 'Staff' && caller.branchId?.toLowerCase() !== found.branchId.toLowerCase());
    if (hidden) return fail(404, BRANCH_DAY_TEXTS.notFound(id));

    // Same outcome already recorded: a repeat is a 200 and changes nothing.
    if (found.status === target) return { status: 200, body: { ...found } };
    if (found.status !== 'Booked') {
      return fail(409, BRANCH_DAY_TEXTS.notMarkable(String(found.status), target));
    }
    if (nowMs() < Date.parse(found.startUtc)) return fail(409, BRANCH_DAY_TEXTS.notStarted);

    const stamp = new Date(nowMs()).toISOString();
    found.status = target;
    found.updatedAtUtc = stamp;
    if (target === 'Completed') found.completedAtUtc = stamp;
    else found.noShowAtUtc = stamp;
    return { status: 200, body: { ...found } };
  }

  function route(method: string, request: Request, caller: Caller, segments: string[]): Outcome {
    const url = new URL(request.url);
    const resource = segments[0]?.toLowerCase();
    const [, id, rawAction] = segments;
    const action = rawAction?.toLowerCase();

    if (resource === 'appointments') {
      if (id?.toLowerCase() === 'branch' && segments.length === 3 && method === 'GET') {
        if (!GUID.test(rawAction)) return { status: 404 };
        // Policy: Admin or Staff only.
        if (caller.role === 'Customer') return fail(403, BRANCH_DAY_TEXTS.forbidden);
        return listDay(caller, rawAction, url.searchParams);
      }
      if (
        id !== undefined &&
        GUID.test(id) &&
        method === 'POST' &&
        (action === 'complete' || action === 'no-show')
      ) {
        return mark(caller, id, action === 'complete' ? 'Completed' : 'NoShow');
      }
      return { status: 404 };
    }

    if (resource === 'branches' && id !== undefined && segments.length === 2 && method === 'GET') {
      if (!GUID.test(id)) return { status: 404 };
      const branch = state.branches.find((b) => b.id.toLowerCase() === id.toLowerCase());
      // An inactive branch is a 404 for everyone but an admin.
      return !branch || (!branch.isActive && caller.role !== 'Admin')
        ? fail(404, BRANCH_DAY_TEXTS.branchNotFound(id))
        : { status: 200, body: branch };
    }

    if (resource === 'services' && id === undefined && method === 'GET') {
      const rows = state.services.filter((s) => s.isActive || caller.role === 'Admin');
      return { status: 200, body: rows };
    }
    return { status: 404 };
  }

  const escaped = baseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escaped}/api/(appointments|branches|services)(/.*)?$`, 'i');

  const dispatcher = http.all(pattern, ({ request }) => {
    const url = new URL(request.url);
    const base = {
      'X-Correlation-ID': request.headers.get('x-correlation-id') ?? crypto.randomUUID(),
    };
    const problem = (status: number, detail: string, extra: Record<string, string> = {}) =>
      new HttpResponse(JSON.stringify({ status, detail }), {
        status,
        headers: { ...base, ...extra, 'Content-Type': 'application/problem+json' },
      });

    state.requests.push({
      method: request.method,
      path: url.pathname,
      search: url.search,
      headers: request.headers,
    });

    if (flags.networkError) return HttpResponse.error();
    if (flags.rateLimited) {
      return problem(429, 'Too many requests. Try again later.', { 'Retry-After': '60' });
    }
    const forced = flags.failNext ?? flags.failAll;
    flags.failNext = null;
    if (forced !== null) return problem(forced, BRANCH_DAY_TEXTS.unavailable);

    const caller = callerOf(request);
    if (!caller) return problem(401, BRANCH_DAY_TEXTS.unauthenticated);

    const segments = url.pathname
      .replace(/^\/api\//i, '')
      .split('/')
      .filter(Boolean);

    const outcome = route(request.method, request, caller, segments);
    if (outcome.failure) return problem(outcome.failure.status, outcome.failure.detail);
    if (outcome.body === undefined)
      return new HttpResponse(null, { status: outcome.status, headers: base });
    return HttpResponse.json(outcome.body as object, { status: outcome.status, headers: base });
  });

  return {
    handlers: [dispatcher],
    state,
    flags,
    reset() {
      Object.assign(state, freshState(INITIAL_NOW));
      Object.assign(flags, freshFlags());
    },
    setNow(ms) {
      state.nowMs = ms;
    },
    advance(ms) {
      state.nowMs += ms;
    },
    addBranch,
    addService,
    addCustomer,
    addAppointment,
  };
}

export { BRANCH_ID, CUSTOMER_ID, SERVICE_ID };
