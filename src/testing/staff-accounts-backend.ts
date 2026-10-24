import { http, HttpResponse, type RequestHandler } from 'msw';
import { decodeAccessToken } from '../app/core/auth/jwt';
import type { Role } from '../app/core/auth/session.model';
import type { StaffAccount, StaffPage } from '../app/core/api/models';

/**
 * A stateful stand-in for the Auth staff endpoints (`/api/auth/staff...`) behind the gateway,
 * written from `StaffController`, `CreateStaffHandler`, `AssignStaffBranchHandler`,
 * `SetStaffActiveHandler`, `DeleteStaffHandler`, `ListStaffQueryValidator` and the repository,
 * not from the client. It answers what the real service answers: `application/problem+json`
 * `{ status, detail }` bodies, an echoed `X-Correlation-ID`, Admin only (`403` for any other
 * role, `401` without a token).
 *
 * Approximation: a request body field of the wrong JSON type (for example a branchId that is not
 * a GUID) is treated as empty, so it fails the "Branch is required." rule; ASP.NET would answer
 * its own model-binding `400` instead.
 */

export const STAFF_API_BASE = 'http://gw.test:5290';

/** Verbatim backend texts. */
export const STAFF_TEXTS = {
  validationPrefix: 'Invalid request data. Errors: ',
  duplicateEmail: 'Email is already registered.',
  unavailable: 'The availability service is unavailable. Try again later.',
  forbidden: 'You do not have permission to perform this action.',
  unauthenticated: 'Authentication is required.',
  notFound: (id: string) => `Staff member '${id}' was not found.`,
  branchInactive: (id: string) => `Branch '${id}' does not exist or is inactive.`,
  firstNameRequired: 'First name is required.',
  firstNameLength: 'First name cannot exceed 50 characters.',
  lastNameRequired: 'Last name is required.',
  lastNameLength: 'Last name cannot exceed 50 characters.',
  emailRequired: 'Email is required.',
  emailFormat: 'Invalid email format.',
  phoneRequired: 'Phone number is required.',
  phoneFormat: 'Invalid phone number format.',
  passwordRequired: 'Password is required.',
  passwordLength: 'Password must be at least 8 characters long.',
  passwordUpper: 'Password must contain at least one uppercase letter.',
  passwordLower: 'Password must contain at least one lowercase letter.',
  passwordDigit: 'Password must contain at least one digit.',
  passwordSpecial: 'Password must contain at least one special character.',
  branchRequired: 'Branch is required.',
  invalidBranchId: 'The branchId must be a valid, non-empty GUID.',
  invalidIsActive: 'The isActive must be true or false.',
  invalidPage: 'The page must be a whole number of at least 1.',
  invalidPageSize: 'The pageSize must be a whole number from 1 to 100.',
} as const;

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';
const PHONE = /^\+?[1-9]\d{1,14}$/;
// FluentValidation's default EmailAddress() is deliberately loose: something@something.
const EMAIL = /^[^@\s]+@[^@\s]+$/;

export interface StaffRecord extends StaffAccount {
  deleted: boolean;
}

export interface StaffBranch {
  id: string;
  isActive: boolean;
}

export interface StaffRequest {
  method: string;
  path: string;
  search: string;
  body: unknown;
  headers: Headers;
}

export interface StaffAccountsState {
  nowMs: number;
  /** Registration counter: staff are listed oldest first, so each gets a later stamp. */
  seq: number;
  accounts: StaffRecord[];
  /** The branches Availability knows (the `422` rule). The default one is active. */
  branches: StaffBranch[];
  /** Other users' emails (customers, admins) that are already registered. */
  takenEmails: string[];
  /** How many refresh-token sessions each staff id lost (move, deactivate, delete). */
  revocations: Record<string, number>;
  requests: StaffRequest[];
}

export interface StaffAccountsFlags {
  /** Availability cannot be reached: create, move and reactivate answer `503`. */
  branchCheckUnavailable: boolean;
  failAll: number | null;
  failNext: number | null;
  networkError: boolean;
  rateLimited: boolean;
}

export interface StaffAccountsBackendOptions {
  baseUrl?: string;
  now?: () => number;
}

export interface StaffAccountsBackend {
  handlers: RequestHandler[];
  state: StaffAccountsState;
  flags: StaffAccountsFlags;
  reset(): void;
  setNow(ms: number): void;
  addBranch(partial?: Partial<StaffBranch>): StaffBranch;
  addStaff(partial?: Partial<StaffAccount> & { deleted?: boolean }): StaffRecord;
}

export const STAFF_BRANCH_ID = '00000000-0000-4000-8000-0000000000b1';

interface Outcome {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
  failure?: { status: number; detail: string };
}

type Body = Record<string, unknown>;

function fail(status: number, detail: string): Outcome {
  return { status, failure: { status, detail } };
}

function invalid(errors: string[]): Outcome {
  return fail(400, STAFF_TEXTS.validationPrefix + errors.join(','));
}

function freshState(nowMs: number): StaffAccountsState {
  return {
    nowMs,
    seq: 0,
    accounts: [],
    branches: [{ id: STAFF_BRANCH_ID, isActive: true }],
    takenEmails: [],
    revocations: {},
    requests: [],
  };
}

function freshFlags(): StaffAccountsFlags {
  return {
    branchCheckUnavailable: false,
    failAll: null,
    failNext: null,
    networkError: false,
    rateLimited: false,
  };
}

function wholeNumber(raw: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= min && n <= max ? n : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function guidOf(value: unknown): string {
  return typeof value === 'string' && GUID.test(value) ? value : EMPTY_GUID;
}

function roleOf(request: Request): Role | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return decodeAccessToken(header.slice(7))?.role ?? null;
}

function same(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export function createStaffAccountsBackend(
  options: StaffAccountsBackendOptions = {},
): StaffAccountsBackend {
  const baseUrl = options.baseUrl ?? STAFF_API_BASE;
  const INITIAL_NOW = Date.parse('2026-10-24T09:00:00Z');
  const state = freshState(INITIAL_NOW);
  const flags = freshFlags();
  const nowMs = () => (options.now ? options.now() : state.nowMs);

  function stamp(): string {
    state.seq += 1;
    return new Date(nowMs() + state.seq * 1000).toISOString();
  }

  function addBranch(partial: Partial<StaffBranch> = {}): StaffBranch {
    const branch: StaffBranch = { id: crypto.randomUUID(), isActive: true, ...partial };
    state.branches.push(branch);
    return branch;
  }

  function addStaff(partial: Partial<StaffAccount> & { deleted?: boolean } = {}): StaffRecord {
    const n = state.accounts.length + 1;
    const { deleted, ...account } = partial;
    const record: StaffRecord = {
      id: crypto.randomUUID(),
      firstName: `Staff${n}`,
      lastName: 'Member',
      email: `staff${n}@example.com`,
      phoneNumber: '+94771234567',
      role: 'Staff',
      branchId: STAFF_BRANCH_ID,
      isActive: true,
      registeredAtUtc: stamp(),
      deleted: deleted ?? false,
      ...account,
    };
    state.accounts.push(record);
    return record;
  }

  const view = (r: StaffRecord): StaffAccount => {
    const { deleted, ...account } = r;
    void deleted;
    return account;
  };

  const find = (id: string): StaffRecord | undefined =>
    state.accounts.find((a) => same(a.id, id) && !a.deleted);

  /** The shared branch rule: null when the branch is usable, else the 422 or 503. */
  function checkBranch(branchId: string): Outcome | null {
    if (flags.branchCheckUnavailable) return fail(503, STAFF_TEXTS.unavailable);
    const branch = state.branches.find((b) => same(b.id, branchId));
    return !branch || !branch.isActive ? fail(422, STAFF_TEXTS.branchInactive(branchId)) : null;
  }

  function revoke(id: string): void {
    state.revocations[id] = (state.revocations[id] ?? 0) + 1;
  }

  function list(search: URLSearchParams): Outcome {
    const read = (name: string): string | null => {
      for (const [k, v] of search) if (k.toLowerCase() === name.toLowerCase()) return v;
      return null;
    };
    const rawBranch = read('branchId');
    const rawActive = read('isActive');
    const rawPage = read('page');
    const rawPageSize = read('pageSize');

    const errors: string[] = [];
    let branchId: string | null = null;
    if (rawBranch !== null) {
      if (GUID.test(rawBranch) && rawBranch !== EMPTY_GUID) branchId = rawBranch;
      else errors.push(STAFF_TEXTS.invalidBranchId);
    }
    let isActive: boolean | null = null;
    if (rawActive !== null) {
      if (rawActive.toLowerCase() === 'true') isActive = true;
      else if (rawActive.toLowerCase() === 'false') isActive = false;
      else errors.push(STAFF_TEXTS.invalidIsActive);
    }
    const page = rawPage === null ? 1 : wholeNumber(rawPage, 1, 2_147_483_647);
    if (page === null) errors.push(STAFF_TEXTS.invalidPage);
    const pageSize =
      rawPageSize === null ? DEFAULT_PAGE_SIZE : wholeNumber(rawPageSize, 1, MAX_PAGE_SIZE);
    if (pageSize === null) errors.push(STAFF_TEXTS.invalidPageSize);
    if (errors.length > 0) return invalid(errors);

    let rows = state.accounts.filter((a) => !a.deleted);
    if (branchId) rows = rows.filter((a) => same(a.branchId, branchId));
    if (isActive !== null) rows = rows.filter((a) => a.isActive === isActive);
    rows = [...rows].sort((a, b) => {
      const d = Date.parse(a.registeredAtUtc) - Date.parse(b.registeredAtUtc);
      return d !== 0 ? d : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    const skip = (page! - 1) * pageSize!;
    const body: StaffPage = {
      items: skip >= rows.length ? [] : rows.slice(skip, skip + pageSize!).map(view),
      page: page!,
      pageSize: pageSize!,
      totalCount: rows.length,
    };
    return { status: 200, body };
  }

  function create(b: Body): Outcome {
    const firstName = text(b['firstName']);
    const lastName = text(b['lastName']);
    const email = text(b['email']);
    const phone = text(b['phoneNumber']);
    const password = text(b['password']);
    const branchId = guidOf(b['branchId']);

    const errors: string[] = [];
    if (!firstName) errors.push(STAFF_TEXTS.firstNameRequired);
    else if (firstName.length > 50) errors.push(STAFF_TEXTS.firstNameLength);
    if (!lastName) errors.push(STAFF_TEXTS.lastNameRequired);
    else if (lastName.length > 50) errors.push(STAFF_TEXTS.lastNameLength);
    if (!email) errors.push(STAFF_TEXTS.emailRequired);
    else if (!EMAIL.test(email)) errors.push(STAFF_TEXTS.emailFormat);
    if (!phone) errors.push(STAFF_TEXTS.phoneRequired);
    else if (!PHONE.test(phone)) errors.push(STAFF_TEXTS.phoneFormat);
    if (!password) errors.push(STAFF_TEXTS.passwordRequired);
    else {
      if (password.length < 8) errors.push(STAFF_TEXTS.passwordLength);
      if (!/[A-Z]/.test(password)) errors.push(STAFF_TEXTS.passwordUpper);
      if (!/[a-z]/.test(password)) errors.push(STAFF_TEXTS.passwordLower);
      if (!/[0-9]/.test(password)) errors.push(STAFF_TEXTS.passwordDigit);
      // .NET's [\W]: anything that is not a letter, digit or underscore.
      if (!/[^\p{L}\p{Mn}\p{Nd}\p{Pc}]/u.test(password)) {
        errors.push(STAFF_TEXTS.passwordSpecial);
      }
    }
    if (branchId === EMPTY_GUID) errors.push(STAFF_TEXTS.branchRequired);
    if (errors.length > 0) return invalid(errors);

    // The email check comes before the Availability call; a deleted account keeps its email.
    const taken =
      state.accounts.some((a) => same(a.email, email)) ||
      state.takenEmails.some((e) => same(e, email));
    if (taken) return fail(400, STAFF_TEXTS.duplicateEmail);

    const branchError = checkBranch(branchId);
    if (branchError) return branchError;

    const created = addStaff({
      firstName,
      lastName,
      email,
      phoneNumber: phone,
      branchId,
    });
    return {
      status: 201,
      body: view(created),
      headers: { Location: `${baseUrl}/api/auth/staff/${created.id}` },
    };
  }

  function move(id: string, b: Body): Outcome {
    const branchId = guidOf(b['branchId']);
    if (branchId === EMPTY_GUID) return invalid([STAFF_TEXTS.branchRequired]);
    const account = find(id);
    if (!account) return fail(404, STAFF_TEXTS.notFound(id));
    // The same branch changes nothing and keeps their sessions.
    if (same(account.branchId, branchId)) return { status: 200, body: view(account) };
    const branchError = checkBranch(branchId);
    if (branchError) return branchError;
    account.branchId = branchId;
    revoke(account.id);
    return { status: 200, body: view(account) };
  }

  function setActive(id: string, active: boolean): Outcome {
    const account = find(id);
    if (!account) return fail(404, STAFF_TEXTS.notFound(id));
    if (!active) {
      // Saved and revoked even when already inactive.
      account.isActive = false;
      revoke(account.id);
      return { status: 204 };
    }
    if (account.isActive) return { status: 204 };
    const branchError = checkBranch(account.branchId);
    if (branchError) return branchError;
    account.isActive = true;
    return { status: 204 };
  }

  function remove(id: string): Outcome {
    const account = find(id);
    if (!account) return fail(404, STAFF_TEXTS.notFound(id));
    account.deleted = true;
    revoke(account.id);
    return { status: 204 };
  }

  function route(method: string, segments: string[], search: URLSearchParams, body: Body): Outcome {
    // segments: ['auth', 'staff', id?, action?]
    const [, , id, action] = segments;
    const verb = action?.toLowerCase();
    if (id === undefined) {
      if (method === 'GET') return list(search);
      if (method === 'POST') return create(body);
      return { status: 405 };
    }
    if (!GUID.test(id)) return { status: 404 }; // the {id:guid} route constraint: an empty 404
    if (action === undefined) {
      if (method === 'GET') {
        const account = find(id);
        return account ? { status: 200, body: view(account) } : fail(404, STAFF_TEXTS.notFound(id));
      }
      if (method === 'DELETE') return remove(id);
      return { status: 405 };
    }
    if (verb === 'branch' && method === 'PUT') return move(id, body);
    if ((verb === 'activate' || verb === 'deactivate') && method === 'POST') {
      return setActive(id, verb === 'activate');
    }
    return { status: 404 };
  }

  const escaped = baseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escaped}/api/auth/staff(/.*)?$`, 'i');

  const dispatcher = http.all(pattern, async ({ request }) => {
    const url = new URL(request.url);
    const base = {
      'X-Correlation-ID': request.headers.get('x-correlation-id') ?? crypto.randomUUID(),
    };
    const problem = (status: number, detail: string, extra: Record<string, string> = {}) =>
      new HttpResponse(JSON.stringify({ status, detail }), {
        status,
        headers: { ...base, ...extra, 'Content-Type': 'application/problem+json' },
      });

    let body: Body = {};
    const raw = await request.text();
    if (raw) {
      try {
        body = JSON.parse(raw) as Body;
      } catch {
        body = {};
      }
    }
    state.requests.push({
      method: request.method,
      path: url.pathname,
      search: url.search,
      body: raw ? body : undefined,
      headers: request.headers,
    });

    if (flags.networkError) return HttpResponse.error();
    if (flags.rateLimited) {
      return problem(429, 'Too many requests. Try again later.', { 'Retry-After': '60' });
    }
    const forced = flags.failNext ?? flags.failAll;
    flags.failNext = null;
    if (forced !== null) return problem(forced, STAFF_TEXTS.unavailable);

    const role = roleOf(request);
    if (role === null) return problem(401, STAFF_TEXTS.unauthenticated);
    if (role !== 'Admin') return problem(403, STAFF_TEXTS.forbidden);

    const segments = url.pathname
      .replace(/^\/api\//i, '')
      .split('/')
      .filter(Boolean);
    const outcome = route(request.method, segments, url.searchParams, body);
    if (outcome.failure) return problem(outcome.failure.status, outcome.failure.detail);
    const headers = { ...base, ...outcome.headers };
    if (outcome.body === undefined)
      return new HttpResponse(null, { status: outcome.status, headers });
    return HttpResponse.json(outcome.body as object, { status: outcome.status, headers });
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
    addBranch,
    addStaff,
  };
}
