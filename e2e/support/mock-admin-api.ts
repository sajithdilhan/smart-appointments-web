import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page, Route } from '@playwright/test';
import { API, mockBackend, type MockBackend, type MockOptions } from '../mock-backend';

/**
 * A stateful stand-in for the Availability admin endpoints of the gateway, for Playwright. It
 * extends `mockBackend` (config, auth, an Admin login) with branches, services and slot
 * generation, so a test can create a branch, set its schedule and generate slots end to end.
 * Validation uses the patterns of the contract fixture, so it rejects what the real service does.
 */

interface Hours {
  dayOfWeek: string;
  opensAt: string;
  closesAt: string;
}
export interface MockBranch {
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
  workingHours: Hours[];
}
export interface MockService {
  id: string;
  code: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  isActive: boolean;
  createdAtUtc: string;
  updatedAtUtc: string | null;
}

export interface MockAdminState {
  branches: MockBranch[];
  services: MockService[];
  /** `POST` and `PUT` bodies seen, in order, for assertions. */
  writes: { method: string; path: string; body: unknown }[];
}

export interface MockAdminApi extends MockBackend {
  readonly state: MockAdminState;
  seedBranch(partial?: Partial<MockBranch>): MockBranch;
  seedService(partial?: Partial<MockService>): MockService;
}

const contract = JSON.parse(
  readFileSync(join(process.cwd(), 'src/testing/fixtures/availability-contract.json'), 'utf8'),
) as {
  patterns: Record<string, { regex: string }>;
  messages: { id: string; text: string }[];
  validationEnvelope: { prefix: string };
  errors: { id: string; template: string }[];
};
const text = (id: string) => contract.messages.find((m) => m.id === id)!.text;
const errorText = (id: string, values: Record<string, string>) =>
  contract.errors
    .find((e) => e.id === id)!
    .template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '');

const BRANCH_CODE = new RegExp(contract.patterns['branchCode'].regex);
const SERVICE_CODE = new RegExp(contract.patterns['serviceCode'].regex);
const PHONE = new RegExp(contract.patterns['phone'].regex);
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WEEKDAY_BY_UTC = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE',
  'access-control-expose-headers': 'X-Correlation-ID, Retry-After, Location',
};

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
const invalid = (route: Route, messages: string[]) =>
  problem(route, 400, `${contract.validationEnvelope.prefix}${messages.join(',')}`);

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const str = (v: unknown) => (typeof v === 'string' ? v : '');

function validateDetails(b: Record<string, unknown>, branch: boolean): string[] {
  const kind = branch ? 'branch' : 'service';
  const out: string[] = [];
  const name = str(b['name']);
  if (name.trim() === '') out.push(text(`${kind}.name.required`));
  else if (name.length > 100) out.push(text(`${kind}.name.max`));
  if (str(b['description']).length > 500) out.push(text(`${kind}.description.max`));
  if (branch) {
    const address = str(b['address']);
    if (address.trim() === '') out.push(text('branch.address.required'));
    else if (address.length > 200) out.push(text('branch.address.max'));
    const phone = str(b['phoneNumber']);
    if (phone.trim() === '') out.push(text('branch.phone.required'));
    else if (!PHONE.test(phone.trim())) out.push(text('branch.phone.pattern'));
  } else {
    const d = b['durationMinutes'];
    if (typeof d !== 'number' || d < 5 || d > 480) out.push(text('service.duration.range'));
    else if (d % 5 !== 0) out.push(text('service.duration.step'));
  }
  return out;
}

/** Mocks the admin endpoints on top of `mockBackend` (an Admin login unless `role` says otherwise). */
export async function mockAdminApi(page: Page, options: MockOptions = {}): Promise<MockAdminApi> {
  const backend = await mockBackend(page, { role: 'Admin', ...options });
  const state: MockAdminState = { branches: [], services: [], writes: [] };
  const now = () => new Date().toISOString();

  const seedBranch = (partial: Partial<MockBranch> = {}): MockBranch => {
    const branch: MockBranch = {
      id: crypto.randomUUID(),
      code: `B${state.branches.length + 1}0`,
      name: `Branch ${state.branches.length + 1}`,
      description: null,
      address: '1 Main Street',
      phoneNumber: '+14155550123',
      isActive: true,
      createdAtUtc: now(),
      updatedAtUtc: null,
      timeZoneId: null,
      workingHours: [],
      ...partial,
    };
    state.branches.push(branch);
    return branch;
  };
  const seedService = (partial: Partial<MockService> = {}): MockService => {
    const service: MockService = {
      id: crypto.randomUUID(),
      code: `S${state.services.length + 1}0`,
      name: `Service ${state.services.length + 1}`,
      description: null,
      durationMinutes: 30,
      isActive: true,
      createdAtUtc: now(),
      updatedAtUtc: null,
      ...partial,
    };
    state.services.push(service);
    return service;
  };

  const pattern = new RegExp(
    `^${API.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/api/(branches|services|slots)(/.*)?$`,
    'i',
  );

  await page.route(pattern, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(request.url());
    const [, resource, id, action] = url.pathname.toLowerCase().split('/').slice(1);
    const method = request.method();
    const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
    if (method !== 'GET') {
      state.writes.push({ method, path: url.pathname, body });
    }

    if (resource === 'slots') return generate(route, body);

    const isBranch = resource === 'branches';
    const list = (isBranch ? state.branches : state.services) as (MockBranch | MockService)[];

    if (id === undefined) {
      if (method === 'GET') {
        const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name));
        return reply(route, 200, sorted);
      }
      const errors = [
        ...(str(body['code']).trim() === ''
          ? [text(`${isBranch ? 'branch' : 'service'}.code.required`)]
          : (isBranch ? BRANCH_CODE : SERVICE_CODE).test(str(body['code']).trim())
            ? []
            : [text(`${isBranch ? 'branch' : 'service'}.code.pattern`)]),
        ...validateDetails(body, isBranch),
      ];
      if (errors.length) return invalid(route, errors);
      const code = str(body['code']).trim().toUpperCase();
      if (list.some((r) => r.code === code)) {
        return problem(
          route,
          409,
          errorText(isBranch ? 'branch.duplicate' : 'service.duplicate', { code }),
        );
      }
      const created = isBranch
        ? seedBranch({
            code,
            name: str(body['name']).trim(),
            description: str(body['description']).trim() || null,
            address: str(body['address']).trim(),
            phoneNumber: str(body['phoneNumber']).trim(),
          })
        : seedService({
            code,
            name: str(body['name']).trim(),
            description: str(body['description']).trim() || null,
            durationMinutes: body['durationMinutes'] as number,
          });
      return route.fulfill({
        status: 201,
        headers: {
          ...CORS,
          'content-type': 'application/json',
          location: `${API}/api/${resource}/${created.id}`,
        },
        body: JSON.stringify(created),
      });
    }

    const record = list.find((r) => r.id.toLowerCase() === id);
    const missing = () =>
      problem(route, 404, errorText(isBranch ? 'branch.notFound' : 'service.notFound', { id }));
    if (action === undefined) {
      if (method === 'GET') return record ? reply(route, 200, record) : missing();
      const errors = validateDetails(body, isBranch);
      if (errors.length) return invalid(route, errors);
      if (!record) return missing();
      record.name = str(body['name']).trim();
      record.description = str(body['description']).trim() || null;
      if (isBranch) {
        (record as MockBranch).address = str(body['address']).trim();
        (record as MockBranch).phoneNumber = str(body['phoneNumber']).trim();
      } else {
        (record as MockService).durationMinutes = body['durationMinutes'] as number;
      }
      record.updatedAtUtc = now();
      return reply(route, 200, record);
    }
    if (action === 'schedule' && isBranch) {
      if (!record) return missing();
      const hours = (body['workingHours'] as Hours[] | undefined) ?? [];
      const messages: string[] = [];
      const zoneOk = (() => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: str(body['timeZoneId']) });
          return str(body['timeZoneId']) !== '';
        } catch {
          return false;
        }
      })();
      if (!zoneOk) messages.push(text('schedule.zone'));
      if (new Set(hours.map((h) => h.dayOfWeek)).size !== hours.length)
        messages.push(text('schedule.dayOnce'));
      if (hours.some((h) => minutes(h.opensAt) >= minutes(h.closesAt)))
        messages.push(text('schedule.order'));
      if (messages.length) return invalid(route, messages);
      (record as MockBranch).timeZoneId = str(body['timeZoneId']);
      (record as MockBranch).workingHours = [...hours].sort(
        (a, b) => DAYS.indexOf(a.dayOfWeek) - DAYS.indexOf(b.dayOfWeek),
      );
      record.updatedAtUtc = now();
      return reply(route, 200, record);
    }
    if (action === 'activate' || action === 'deactivate') {
      if (!record) return missing();
      record.isActive = action === 'activate';
      return route.fulfill({ status: 204, headers: { ...CORS, 'x-correlation-id': 'e2e' } });
    }
    return problem(route, 404, 'Not mocked.');
  });

  function generate(route: Route, body: Record<string, unknown>) {
    const branch = state.branches.find((b) => b.id === body['branchId']);
    const service = state.services.find((s) => s.id === body['serviceTypeId']);
    if (!branch)
      return problem(route, 404, errorText('branch.notFound', { id: str(body['branchId']) }));
    if (!service)
      return problem(route, 404, errorText('service.notFound', { id: str(body['serviceTypeId']) }));
    if (!branch.isActive) return problem(route, 409, `Branch '${branch.code}' is inactive.`);
    if (!service.isActive)
      return problem(route, 409, `Service type '${service.code}' is inactive.`);
    if (!branch.timeZoneId || branch.workingHours.length === 0) {
      return problem(route, 409, `Branch '${branch.code}' has no working hours.`);
    }
    let created = 0;
    const from = Date.parse(`${str(body['fromDate'])}T00:00:00Z`);
    const to = Date.parse(`${str(body['toDate'])}T00:00:00Z`);
    for (let t = from; t <= to; t += 86_400_000) {
      const day = WEEKDAY_BY_UTC[new Date(t).getUTCDay()];
      const h = branch.workingHours.find((x) => x.dayOfWeek === day);
      if (h)
        created += Math.floor((minutes(h.closesAt) - minutes(h.opensAt)) / service.durationMinutes);
    }
    return reply(route, 200, { createdCount: created, skippedCount: 0 });
  }

  return { ...backend, state, seedBranch, seedService };
}
