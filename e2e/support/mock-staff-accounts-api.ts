import type { Page, Route } from '@playwright/test';
import { API, type MockOptions } from '../mock-backend';
import { mockAdminApi, type MockAdminApi } from './mock-admin-api';

/**
 * A stateful stand-in for the Auth staff endpoints (`/api/auth/staff...`) of the gateway, for
 * Playwright, on top of `mock-admin-api.ts` (an Admin login plus branches and services). The
 * branch rule (`422` for an unknown or inactive branch) reads the branches the admin mock holds,
 * so a test seeds them with `seedBranch`. The rules follow `src/testing/staff-accounts-backend.ts`
 * (a Vitest spec pins that model against the C# handlers): oldest first, deleted excluded,
 * `isActive` and `branchId` filters, `400` "Email is already registered." and "Invalid request
 * data. Errors: ...", a `503` switch for the branch check, Admin only.
 */

export interface MockStaffAccount {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  role: 'Staff';
  branchId: string;
  isActive: boolean;
  registeredAtUtc: string;
}

export interface MockStaffAccountsState {
  accounts: (MockStaffAccount & { deleted: boolean })[];
  /** Emails of other users (customers, admins) that are already registered. */
  takenEmails: string[];
  /** Create and move bodies seen, passwords included (so a test can check what was sent). */
  writes: { method: string; path: string; body: unknown }[];
  /** How many sessions each staff id lost (move, deactivate, delete). */
  revocations: Record<string, number>;
  /** When true, create, move and reactivate answer `503` (Availability down). */
  branchCheckUnavailable: boolean;
  /** When set, the next staff request answers this status. */
  failNext: number | null;
}

export interface MockStaffAccountsApi extends MockAdminApi {
  readonly accounts: MockStaffAccountsState;
  seedStaff(partial?: Partial<MockStaffAccount> & { deleted?: boolean }): MockStaffAccount;
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE',
  'access-control-expose-headers': 'X-Correlation-ID, Retry-After, Location',
};

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';
const PHONE = /^\+?[1-9]\d{1,14}$/;
const EMAIL = /^[^@\s]+@[^@\s]+$/;
const UNAVAILABLE = 'The availability service is unavailable. Try again later.';
const PREFIX = 'Invalid request data. Errors: ';

const reply = (route: Route, status: number, body?: unknown, extra: Record<string, string> = {}) =>
  route.fulfill({
    status,
    headers: {
      ...CORS,
      ...extra,
      'content-type': 'application/json',
      'x-correlation-id': 'e2e',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const problem = (route: Route, status: number, detail: string) =>
  route.fulfill({
    status,
    headers: { ...CORS, 'content-type': 'application/problem+json', 'x-correlation-id': 'e2e' },
    body: JSON.stringify({ status, detail }),
  });
const invalid = (route: Route, messages: string[]) =>
  problem(route, 400, PREFIX + messages.join(','));

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const notFound = (id: string) => `Staff member '${id}' was not found.`;

function wholeNumber(raw: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= min && n <= max ? n : null;
}

/** Mocks the staff account endpoints on top of `mockAdminApi` (an Admin login). */
export async function mockStaffAccountsApi(
  page: Page,
  options: MockOptions = {},
): Promise<MockStaffAccountsApi> {
  const admin = await mockAdminApi(page, options);
  const accounts: MockStaffAccountsState = {
    accounts: [],
    takenEmails: [],
    writes: [],
    revocations: {},
    branchCheckUnavailable: false,
    failNext: null,
  };
  let seq = 0;

  const seedStaff = (
    partial: Partial<MockStaffAccount> & { deleted?: boolean } = {},
  ): MockStaffAccount => {
    const n = accounts.accounts.length + 1;
    seq += 1;
    const { deleted, ...rest } = partial;
    const account: MockStaffAccount & { deleted: boolean } = {
      id: crypto.randomUUID(),
      firstName: `Staff${n}`,
      lastName: 'Member',
      email: `staff${n}@example.com`,
      phoneNumber: '+94771234567',
      role: 'Staff',
      branchId: admin.state.branches[0]?.id ?? EMPTY_GUID,
      isActive: true,
      registeredAtUtc: new Date(Date.UTC(2026, 0, 1) + seq * 1000).toISOString(),
      deleted: deleted ?? false,
      ...rest,
    };
    accounts.accounts.push(account);
    return account;
  };

  const view = ({ deleted, ...account }: MockStaffAccount & { deleted: boolean }) => {
    void deleted;
    return account;
  };
  const find = (id: string) => accounts.accounts.find((a) => same(a.id, id) && !a.deleted);
  const revoke = (id: string) => {
    accounts.revocations[id] = (accounts.revocations[id] ?? 0) + 1;
  };

  /** The branch rule shared by create, move and reactivate: null when usable, else the failure. */
  function branchProblem(branchId: string): { status: number; detail: string } | null {
    if (accounts.branchCheckUnavailable) return { status: 503, detail: UNAVAILABLE };
    const branch = admin.state.branches.find((b) => same(b.id, branchId));
    return !branch || !branch.isActive
      ? { status: 422, detail: `Branch '${branchId}' does not exist or is inactive.` }
      : null;
  }

  const escaped = API.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await page.route(
    new RegExp(`^${escaped}/api/auth/staff(/[^?]*)?(\\?.*)?$`, 'i'),
    async (route) => {
      const request = route.request();
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      const url = new URL(request.url());
      const method = request.method();
      const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
      if (method !== 'GET') accounts.writes.push({ method, path: url.pathname, body });

      if (accounts.failNext !== null) {
        const status = accounts.failNext;
        accounts.failNext = null;
        return problem(route, status, UNAVAILABLE);
      }

      const [, , , , id, action] = url.pathname.split('/');
      const verb = action?.toLowerCase();

      if (id === undefined) {
        if (method === 'GET') return list(route, url.searchParams);
        if (method === 'POST') return create(route, body);
        return reply(route, 405);
      }
      if (!GUID.test(id)) return reply(route, 404);
      if (action === undefined) {
        if (method === 'GET') {
          const found = find(id);
          return found ? reply(route, 200, view(found)) : problem(route, 404, notFound(id));
        }
        if (method === 'DELETE') {
          const found = find(id);
          if (!found) return problem(route, 404, notFound(id));
          found.deleted = true;
          revoke(found.id);
          return reply(route, 204);
        }
        return reply(route, 405);
      }
      if (verb === 'branch' && method === 'PUT') return move(route, id, body);
      if ((verb === 'activate' || verb === 'deactivate') && method === 'POST') {
        return setActive(route, id, verb === 'activate');
      }
      return problem(route, 404, 'Not mocked.');
    },
  );

  function list(route: Route, search: URLSearchParams) {
    const errors: string[] = [];
    const rawBranch = search.get('branchId');
    const rawActive = search.get('isActive');
    const rawPage = search.get('page');
    const rawPageSize = search.get('pageSize');
    let branchId: string | null = null;
    if (rawBranch !== null) {
      if (GUID.test(rawBranch) && rawBranch !== EMPTY_GUID) branchId = rawBranch;
      else errors.push('The branchId must be a valid, non-empty GUID.');
    }
    let isActive: boolean | null = null;
    if (rawActive !== null) {
      if (rawActive.toLowerCase() === 'true') isActive = true;
      else if (rawActive.toLowerCase() === 'false') isActive = false;
      else errors.push('The isActive must be true or false.');
    }
    const pageNo = rawPage === null ? 1 : wholeNumber(rawPage, 1, 2_147_483_647);
    if (pageNo === null) errors.push('The page must be a whole number of at least 1.');
    const pageSize = rawPageSize === null ? 20 : wholeNumber(rawPageSize, 1, 100);
    if (pageSize === null) errors.push('The pageSize must be a whole number from 1 to 100.');
    if (errors.length > 0) return invalid(route, errors);

    let rows = accounts.accounts.filter((a) => !a.deleted);
    if (branchId) rows = rows.filter((a) => same(a.branchId, branchId));
    if (isActive !== null) rows = rows.filter((a) => a.isActive === isActive);
    rows = [...rows].sort(
      (a, b) =>
        Date.parse(a.registeredAtUtc) - Date.parse(b.registeredAtUtc) || (a.id < b.id ? -1 : 1),
    );
    const skip = (pageNo! - 1) * pageSize!;
    return reply(route, 200, {
      items: skip >= rows.length ? [] : rows.slice(skip, skip + pageSize!).map(view),
      page: pageNo,
      pageSize,
      totalCount: rows.length,
    });
  }

  function create(route: Route, b: Record<string, unknown>) {
    const firstName = str(b['firstName']);
    const lastName = str(b['lastName']);
    const email = str(b['email']);
    const phone = str(b['phoneNumber']);
    const password = str(b['password']);
    const branchId = GUID.test(str(b['branchId'])) ? str(b['branchId']) : EMPTY_GUID;

    const errors: string[] = [];
    if (!firstName) errors.push('First name is required.');
    else if (firstName.length > 50) errors.push('First name cannot exceed 50 characters.');
    if (!lastName) errors.push('Last name is required.');
    else if (lastName.length > 50) errors.push('Last name cannot exceed 50 characters.');
    if (!email) errors.push('Email is required.');
    else if (!EMAIL.test(email)) errors.push('Invalid email format.');
    if (!phone) errors.push('Phone number is required.');
    else if (!PHONE.test(phone)) errors.push('Invalid phone number format.');
    if (!password) errors.push('Password is required.');
    else {
      if (password.length < 8) errors.push('Password must be at least 8 characters long.');
      if (!/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter.');
      }
      if (!/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter.');
      }
      if (!/[0-9]/.test(password)) errors.push('Password must contain at least one digit.');
      if (!/[^\p{L}\p{Mn}\p{Nd}\p{Pc}]/u.test(password)) {
        errors.push('Password must contain at least one special character.');
      }
    }
    if (branchId === EMPTY_GUID) errors.push('Branch is required.');
    if (errors.length > 0) return invalid(route, errors);

    const taken =
      accounts.accounts.some((a) => same(a.email, email)) ||
      accounts.takenEmails.some((e) => same(e, email));
    if (taken) return problem(route, 400, 'Email is already registered.');

    const failure = branchProblem(branchId);
    if (failure) return problem(route, failure.status, failure.detail);

    const created = seedStaff({
      firstName,
      lastName,
      email,
      phoneNumber: phone,
      branchId,
      registeredAtUtc: new Date().toISOString(),
    });
    return reply(route, 201, view({ ...created, deleted: false }), {
      location: `${API}/api/auth/staff/${created.id}`,
    });
  }

  function move(route: Route, id: string, b: Record<string, unknown>) {
    const branchId = GUID.test(str(b['branchId'])) ? str(b['branchId']) : EMPTY_GUID;
    if (branchId === EMPTY_GUID) return invalid(route, ['Branch is required.']);
    const found = find(id);
    if (!found) return problem(route, 404, notFound(id));
    // The same branch changes nothing and keeps their sessions.
    if (same(found.branchId, branchId)) return reply(route, 200, view(found));
    const failure = branchProblem(branchId);
    if (failure) return problem(route, failure.status, failure.detail);
    found.branchId = branchId;
    revoke(found.id);
    return reply(route, 200, view(found));
  }

  function setActive(route: Route, id: string, active: boolean) {
    const found = find(id);
    if (!found) return problem(route, 404, notFound(id));
    if (!active) {
      found.isActive = false;
      revoke(found.id);
      return reply(route, 204);
    }
    if (found.isActive) return reply(route, 204);
    const failure = branchProblem(found.branchId);
    if (failure) return problem(route, failure.status, failure.detail);
    found.isActive = true;
    return reply(route, 204);
  }

  return { ...admin, accounts, seedStaff };
}
