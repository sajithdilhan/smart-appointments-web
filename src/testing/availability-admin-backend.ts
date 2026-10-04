import { http, HttpResponse, type RequestHandler } from 'msw';
import type { Branch, ServiceType, WorkingHours } from '../app/core/api/models';
import { localToUtc } from '../app/core/time/zone-math';
import contract from './fixtures/availability-contract.json';

/**
 * A stateful stand-in for the Availability admin API behind the gateway. Its validation is a
 * second, independent implementation written from the C# validators (patterns come from the
 * contract fixture, which copies them verbatim), so a mistake in the client rules is not hidden by
 * the same mistake here. It answers what the real service answers: `application/problem+json`
 * `{ status, detail }` bodies, an echoed `X-Correlation-ID`, `403` for a non-admin token.
 */

export const ADMIN_API_BASE = 'http://gw.test:5290';

export type Role = 'Customer' | 'Staff' | 'Admin';

const DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;
const PREFIX = contract.validationEnvelope.prefix;

const BRANCH_CODE = new RegExp(contract.patterns.branchCode.regex);
const SERVICE_CODE = new RegExp(contract.patterns.serviceCode.regex);
const PHONE = new RegExp(contract.patterns.phone.regex);
const TIME = new RegExp(contract.patterns.time.regex);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function message(id: string): string {
  const found = contract.messages.find((m) => m.id === id);
  if (!found) throw new Error(`Unknown contract message ${id}`);
  return found.text;
}

function errorText(id: string, values: Record<string, string>): string {
  const found = contract.errors.find((e) => e.id === id);
  if (!found) throw new Error(`Unknown contract error ${id}`);
  return found.template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '');
}

/** An unsigned JWT carrying the claims the backend reads (`sub`, `role`). Enough for this mock. */
export function tokenFor(role: Role, sub = 'user-1'): string {
  const enc = (o: object) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${enc({ alg: 'none', typ: 'JWT' })}.${enc({ sub, role })}.sig`;
}

function roleOf(request: Request): Role | null | 'invalid' {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  try {
    const payload = header.slice(7).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(payload)) as { role?: string };
    return claims.role === 'Admin' || claims.role === 'Staff' || claims.role === 'Customer'
      ? claims.role
      : 'invalid';
  } catch {
    return 'invalid';
  }
}

export interface RecordedRequest {
  method: string;
  path: string;
  search: string;
  body: unknown;
  headers: Headers;
}

export interface GeneratedSlot {
  branchId: string;
  serviceTypeId: string;
  startUtcMs: number;
  endUtcMs: number;
  capacity: number;
}

export interface AdminBackendState {
  branches: Branch[];
  services: ServiceType[];
  slots: GeneratedSlot[];
  /** The backend's clock for slot generation (epoch ms). */
  nowMs: number;
  requests: RecordedRequest[];
}

export interface AdminBackendFlags {
  /** Every request answers this status (a dead or erroring service). */
  failAll: number | null;
  /** The next request answers this status, then it clears. */
  failNext: number | null;
  /** Every request fails like a network error. */
  networkError: boolean;
  /** Every request answers `429` with `Retry-After: 60`. */
  rateLimited: boolean;
  /** Slot generation answers the concurrent-request `409`. */
  concurrentGeneration: boolean;
}

function freshState(): AdminBackendState {
  return { branches: [], services: [], slots: [], nowMs: Date.now(), requests: [] };
}

function freshFlags(): AdminBackendFlags {
  return {
    failAll: null,
    failNext: null,
    networkError: false,
    rateLimited: false,
    concurrentGeneration: false,
  };
}

interface Failure {
  status: number;
  detail: string;
}

type Outcome =
  { status: number; body?: unknown; headers?: Record<string, string> } | { failure: Failure };

const fail = (status: number, detail: string): Outcome => ({ failure: { status, detail } });
const invalid = (messages: string[]): Outcome => fail(400, `${PREFIX}${messages.join(',')}`);

type Body = Record<string, unknown>;

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const blank = (v: string | undefined): boolean => v === undefined || v.trim() === '';
const sortByName = <T extends { name: string; code: string }>(items: T[]): T[] =>
  [...items].sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));

function validateNameDescription(b: Body, form: 'branch' | 'service'): string[] {
  const out: string[] = [];
  const name = str(b['name']);
  if (blank(name)) out.push(message(`${form}.name.required`));
  else if (name!.length > 100) out.push(message(`${form}.name.max`));
  const description = b['description'];
  if (typeof description === 'string' && description.length > 500)
    out.push(message(`${form}.description.max`));
  return out;
}

function validateBranchCode(b: Body): string[] {
  const code = str(b['code']);
  if (blank(code)) return [message('branch.code.required')];
  return BRANCH_CODE.test(code!.trim()) ? [] : [message('branch.code.pattern')];
}

function validateBranchDetails(b: Body): string[] {
  const out = validateNameDescription(b, 'branch');
  const address = str(b['address']);
  if (blank(address)) out.push(message('branch.address.required'));
  else if (address!.length > 200) out.push(message('branch.address.max'));
  const phone = str(b['phoneNumber']);
  if (blank(phone)) out.push(message('branch.phone.required'));
  else if (!PHONE.test(phone!)) out.push(message('branch.phone.pattern'));
  return out;
}

function validateServiceCode(b: Body): string[] {
  const code = str(b['code']);
  if (blank(code)) return [message('service.code.required')];
  return SERVICE_CODE.test(code!.trim()) ? [] : [message('service.code.pattern')];
}

function validateDuration(b: Body): string[] {
  const d = b['durationMinutes'];
  const { min, max, step } = contract.limits.duration;
  const n = typeof d === 'number' ? d : NaN;
  const out: string[] = [];
  if (!Number.isInteger(n) || n < min || n > max) out.push(message('service.duration.range'));
  if (!Number.isInteger(n) || n % step !== 0) out.push(message('service.duration.step'));
  return out;
}

function validateServiceDetails(b: Body): string[] {
  return [...validateNameDescription(b, 'service'), ...validateDuration(b)];
}

function validZone(id: unknown): boolean {
  if (typeof id !== 'string' || id.trim() === '') return false;
  return id === 'UTC' || Intl.supportedValuesOf('timeZone').includes(id);
}

const minutesOf = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

function validateSchedule(b: Body): string[] {
  const out: string[] = [];
  if (!validZone(b['timeZoneId'])) out.push(message('schedule.zone'));
  const hours = b['workingHours'];
  if (!Array.isArray(hours)) {
    out.push(message('schedule.hoursRequired'));
    return out;
  }
  const days = hours.map((h: Body) => h['dayOfWeek']);
  if (new Set(days).size !== days.length) out.push(message('schedule.dayOnce'));
  for (const h of hours as Body[]) {
    const day = h['dayOfWeek'];
    if (!(
      (typeof day === 'string' && DAYS.includes(day as never)) ||
      (typeof day === 'number' && day >= 0 && day <= 6)
    ))
      out.push(message('schedule.dayInvalid'));
    const opens = str(h['opensAt']);
    const closes = str(h['closesAt']);
    if (blank(opens)) out.push("'Opens At' must not be empty.");
    if (opens === undefined || !TIME.test(opens)) out.push(message('schedule.opensFormat'));
    if (blank(closes)) out.push("'Closes At' must not be empty.");
    if (closes === undefined || !TIME.test(closes)) out.push(message('schedule.closesFormat'));
    if (opens !== undefined && closes !== undefined && TIME.test(opens) && TIME.test(closes)) {
      if (!(minutesOf(opens) < minutesOf(closes))) out.push(message('schedule.order'));
    }
  }
  return out;
}

function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

function validateGeneration(b: Body): string[] {
  const out: string[] = [];
  const empty = (v: unknown) =>
    typeof v !== 'string' || v === '' || /^0{8}-(0{4}-){3}0{12}$/.test(v);
  if (empty(b['branchId'])) out.push(message('generation.branchRequired'));
  if (empty(b['serviceTypeId'])) out.push(message('generation.serviceRequired'));
  const from = str(b['fromDate']);
  const to = str(b['toDate']);
  const ok = from !== undefined && to !== undefined && DATE.test(from) && DATE.test(to);
  if (ok) {
    const span = dayNumber(to!) - dayNumber(from!);
    if (span < 0) out.push(message('generation.order'));
    else if (span >= contract.limits.rangeDays.maxSpanned) out.push(message('generation.span'));
  }
  const capacity = b['capacity'];
  const { min, max } = contract.limits.capacity;
  if (
    typeof capacity !== 'number' ||
    !Number.isInteger(capacity) ||
    capacity < min ||
    capacity > max
  )
    out.push(message('generation.capacity'));
  return out;
}

/** Orders working hours Monday first, as the backend's response does. */
function mondayFirst(hours: WorkingHours[]): WorkingHours[] {
  const order = (d: string) => (DAYS.indexOf(d as never) + 6) % 7;
  return [...hours].sort((a, b) => order(a.dayOfWeek) - order(b.dayOfWeek));
}

function dayName(value: unknown): WorkingHours['dayOfWeek'] {
  return (typeof value === 'number' ? DAYS[value] : value) as WorkingHours['dayOfWeek'];
}

/**
 * The stand-in planner: one slot per back-to-back interval, with the same loop bounds as the real
 * `SlotPlanner`, built on `localToUtc`. Starts at or before "now" are dropped silently.
 */
function plan(
  branch: Branch,
  service: ServiceType,
  from: string,
  to: string,
  capacity: number,
  nowMs: number,
): GeneratedSlot[] {
  const out: GeneratedSlot[] = [];
  for (let n = dayNumber(from); n <= dayNumber(to); n++) {
    const date = new Date(n * 86_400_000).toISOString().slice(0, 10);
    const weekday = DAYS[new Date(n * 86_400_000).getUTCDay()];
    const hours = branch.workingHours.find((h) => h.dayOfWeek === weekday);
    if (!hours) continue;
    const closes = minutesOf(hours.closesAt);
    for (
      let start = minutesOf(hours.opensAt);
      start + service.durationMinutes <= closes;
      start += service.durationMinutes
    ) {
      const local = localToUtc(branch.timeZoneId!, date, start);
      if (local.gap || local.utcMs <= nowMs) continue;
      out.push({
        branchId: branch.id,
        serviceTypeId: service.id,
        startUtcMs: local.utcMs,
        endUtcMs: local.utcMs + service.durationMinutes * 60_000,
        capacity,
      });
    }
  }
  return out;
}

export interface AdminBackend {
  handlers: RequestHandler[];
  state: AdminBackendState;
  flags: AdminBackendFlags;
  reset(): void;
  seedBranch(partial?: Partial<Branch>): Branch;
  seedService(partial?: Partial<ServiceType>): ServiceType;
}

export function createAdminBackend(baseUrl = ADMIN_API_BASE): AdminBackend {
  const state = freshState();
  const flags = freshFlags();

  const nowIso = () => new Date(state.nowMs).toISOString();

  function seedBranch(partial: Partial<Branch> = {}): Branch {
    const branch: Branch = {
      id: crypto.randomUUID(),
      code: `B${state.branches.length + 1}0`,
      name: `Branch ${state.branches.length + 1}`,
      description: null,
      address: '1 Main Street',
      phoneNumber: '+14155550123',
      isActive: true,
      createdAtUtc: nowIso(),
      updatedAtUtc: null,
      timeZoneId: null,
      workingHours: [],
      ...partial,
    };
    state.branches.push(branch);
    return branch;
  }

  function seedService(partial: Partial<ServiceType> = {}): ServiceType {
    const service: ServiceType = {
      id: crypto.randomUUID(),
      code: `S${state.services.length + 1}0`,
      name: `Service ${state.services.length + 1}`,
      description: null,
      durationMinutes: 30,
      isActive: true,
      createdAtUtc: nowIso(),
      updatedAtUtc: null,
      ...partial,
    };
    state.services.push(service);
    return service;
  }

  function route(
    method: string,
    parts: string[],
    search: URLSearchParams,
    role: Role,
    body: Body,
  ): Outcome {
    const [resource, id, action] = parts;
    const isAdmin = role === 'Admin';
    const adminOnly = (): Outcome | null =>
      isAdmin ? null : fail(403, 'You do not have permission to perform this action.');
    const known = (r: string) => r === 'branches' || r === 'services';

    if (resource === 'slots') {
      if (id?.toLowerCase() !== 'generate') return { status: 404 };
      if (method !== 'POST') return { status: 405 };
      return adminOnly() ?? generate(body);
    }
    if (!known(resource)) return { status: 404 };
    const isBranch = resource === 'branches';
    const collection = (isBranch ? state.branches : state.services) as (Branch | ServiceType)[];

    if (id === undefined) {
      if (method === 'GET') {
        const include = search.get('includeInactive')?.toLowerCase() === 'true' && isAdmin;
        const rows = collection.filter((r) => include || r.isActive);
        return { status: 200, body: sortByName(rows) };
      }
      if (method === 'POST')
        return adminOnly() ?? (isBranch ? createBranch(body) : createService(body));
      return { status: 405 };
    }
    if (!GUID.test(id)) return { status: 404 }; // the {id:guid} route constraint: an empty 404
    const record = collection.find((r) => r.id === id.toLowerCase() || r.id === id);
    const missing = (): Outcome =>
      fail(404, errorText(isBranch ? 'branch.notFound' : 'service.notFound', { id }));

    if (action === undefined) {
      if (method === 'GET') {
        return !record || (!record.isActive && !isAdmin)
          ? missing()
          : { status: 200, body: record };
      }
      if (method === 'PUT')
        return adminOnly() ?? (isBranch ? updateBranch(id, body) : updateService(id, body));
      return { status: 405 };
    }
    if (isBranch && action === 'schedule') {
      if (method !== 'PUT') return { status: 405 };
      return adminOnly() ?? setSchedule(id, body);
    }
    if (action === 'activate' || action === 'deactivate') {
      if (method !== 'POST') return { status: 405 };
      const denied = adminOnly();
      if (denied) return denied;
      if (!record) return missing();
      const next = action === 'activate';
      if (record.isActive !== next) {
        record.isActive = next;
        record.updatedAtUtc = nowIso();
      }
      return { status: 204 };
    }
    return { status: 404 };
  }

  function createBranch(b: Body): Outcome {
    const errors = [...validateBranchCode(b), ...validateBranchDetails(b)];
    if (errors.length) return invalid(errors);
    const code = str(b['code'])!.trim().toUpperCase();
    if (state.branches.some((x) => x.code === code))
      return fail(409, errorText('branch.duplicate', { code }));
    const created = seedBranch({
      code,
      name: str(b['name'])!.trim(),
      description: blank(str(b['description'])) ? null : str(b['description'])!.trim(),
      address: str(b['address'])!.trim(),
      phoneNumber: str(b['phoneNumber'])!.trim(),
    });
    return {
      status: 201,
      body: created,
      headers: { Location: `${baseUrl}/api/Branches/${created.id}` },
    };
  }

  function updateBranch(id: string, b: Body): Outcome {
    const errors = validateBranchDetails(b);
    if (errors.length) return invalid(errors);
    const branch = state.branches.find((x) => x.id === id);
    if (!branch) return fail(404, errorText('branch.notFound', { id }));
    branch.name = str(b['name'])!.trim();
    branch.description = blank(str(b['description'])) ? null : str(b['description'])!.trim();
    branch.address = str(b['address'])!.trim();
    branch.phoneNumber = str(b['phoneNumber'])!.trim();
    branch.updatedAtUtc = nowIso();
    return { status: 200, body: branch };
  }

  function setSchedule(id: string, b: Body): Outcome {
    const errors = validateSchedule(b);
    if (errors.length) return invalid(errors);
    const branch = state.branches.find((x) => x.id === id);
    if (!branch) return fail(404, errorText('branch.notFound', { id }));
    branch.timeZoneId = b['timeZoneId'] as string;
    branch.workingHours = mondayFirst(
      (b['workingHours'] as Body[]).map((h) => ({
        dayOfWeek: dayName(h['dayOfWeek']),
        opensAt: h['opensAt'] as string,
        closesAt: h['closesAt'] as string,
      })),
    );
    branch.updatedAtUtc = nowIso();
    return { status: 200, body: branch };
  }

  function createService(b: Body): Outcome {
    const errors = [...validateServiceCode(b), ...validateServiceDetails(b)];
    if (errors.length) return invalid(errors);
    const code = str(b['code'])!.trim().toUpperCase();
    if (state.services.some((x) => x.code === code))
      return fail(409, errorText('service.duplicate', { code }));
    const created = seedService({
      code,
      name: str(b['name'])!.trim(),
      description: blank(str(b['description'])) ? null : str(b['description'])!.trim(),
      durationMinutes: b['durationMinutes'] as number,
    });
    return {
      status: 201,
      body: created,
      headers: { Location: `${baseUrl}/api/Services/${created.id}` },
    };
  }

  function updateService(id: string, b: Body): Outcome {
    const errors = validateServiceDetails(b);
    if (errors.length) return invalid(errors);
    const service = state.services.find((x) => x.id === id);
    if (!service) return fail(404, errorText('service.notFound', { id }));
    service.name = str(b['name'])!.trim();
    service.description = blank(str(b['description'])) ? null : str(b['description'])!.trim();
    service.durationMinutes = b['durationMinutes'] as number;
    service.updatedAtUtc = nowIso();
    return { status: 200, body: service };
  }

  function generate(b: Body): Outcome {
    const errors = validateGeneration(b);
    if (errors.length) return invalid(errors);
    const branchId = b['branchId'] as string;
    const serviceTypeId = b['serviceTypeId'] as string;
    const branch = state.branches.find((x) => x.id === branchId);
    if (!branch) return fail(404, errorText('branch.notFound', { id: branchId }));
    const service = state.services.find((x) => x.id === serviceTypeId);
    if (!service) return fail(404, errorText('service.notFound', { id: serviceTypeId }));
    if (!branch.isActive)
      return fail(409, errorText('generation.branchInactive', { code: branch.code }));
    if (!service.isActive)
      return fail(409, errorText('generation.serviceInactive', { code: service.code }));
    if (!branch.timeZoneId || branch.workingHours.length === 0)
      return fail(409, errorText('generation.noWorkingHours', { code: branch.code }));

    const candidates = plan(
      branch,
      service,
      b['fromDate'] as string,
      b['toDate'] as string,
      b['capacity'] as number,
      state.nowMs,
    );
    const existing = state.slots.filter(
      (s) => s.branchId === branch.id && s.serviceTypeId === service.id,
    );
    const toCreate = candidates.filter(
      (c) => !existing.some((e) => c.startUtcMs < e.endUtcMs && e.startUtcMs < c.endUtcMs),
    );
    if (toCreate.length > 0 && flags.concurrentGeneration)
      return fail(409, contract.errors.find((e) => e.id === 'generation.concurrent')!.template);
    state.slots.push(...toCreate);
    return {
      status: 200,
      body: { createdCount: toCreate.length, skippedCount: candidates.length - toCreate.length },
    };
  }

  const pattern = new RegExp(
    `^${baseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/api/(branches|services|slots)(/.*)?$`,
    'i',
  );

  const dispatcher = http.all(pattern, async ({ request }) => {
    const url = new URL(request.url);
    const correlation = request.headers.get('x-correlation-id') ?? crypto.randomUUID();
    const base = { 'X-Correlation-ID': correlation };
    const problem = (status: number, detail: string, extra: Record<string, string> = {}) =>
      new HttpResponse(JSON.stringify({ status, detail }), {
        status,
        headers: { ...base, ...extra, 'Content-Type': 'application/problem+json' },
      });

    let body: Body = {};
    const text = await request.text();
    if (text) {
      try {
        body = JSON.parse(text) as Body;
      } catch {
        body = {};
      }
    }
    state.requests.push({
      method: request.method,
      path: url.pathname,
      search: url.search,
      body: text ? body : undefined,
      headers: request.headers,
    });

    if (flags.networkError) return HttpResponse.error();
    if (flags.rateLimited)
      return problem(429, 'Too many requests. Try again later.', { 'Retry-After': '60' });
    const forced = flags.failNext ?? flags.failAll;
    flags.failNext = null;
    if (forced !== null) return problem(forced, 'The service is unavailable.');

    const role = roleOf(request);
    if (role === null || role === 'invalid') return problem(401, 'Authentication is required.');

    // The id keeps its case (a GUID is case-insensitive); the fixed segments are lower-cased.
    const segments = url.pathname
      .replace(/^\/api\//i, '')
      .split('/')
      .filter(Boolean)
      .map((segment, i) => (i === 1 ? segment : segment.toLowerCase()));

    const outcome = route(request.method, segments, url.searchParams, role, body);
    if ('failure' in outcome) return problem(outcome.failure.status, outcome.failure.detail);
    const headers = { ...base, ...outcome.headers };
    if (outcome.status === 204) return new HttpResponse(null, { status: 204, headers });
    if (outcome.body === undefined)
      return new HttpResponse(null, { status: outcome.status, headers });
    return HttpResponse.json(outcome.body as object, { status: outcome.status, headers });
  });

  return {
    handlers: [dispatcher],
    state,
    flags,
    reset() {
      Object.assign(state, freshState());
      Object.assign(flags, freshFlags());
    },
    seedBranch,
    seedService,
  };
}

const backend = createAdminBackend();

export const handlers: RequestHandler[] = backend.handlers;
export const state: AdminBackendState = backend.state;
export const flags: AdminBackendFlags = backend.flags;
export const reset = backend.reset;
export const seedBranch = backend.seedBranch;
export const seedService = backend.seedService;
