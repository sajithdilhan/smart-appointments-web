import type { AppointmentResponse, MyAppointmentsPage } from '../app/core/api/models';
import { BRANCH_ID, CUSTOMER_ID, SERVICE_ID } from './make-appointment';

/** The text the real backend returns for a cancel after the start (`AlreadyStarted`). */
export const ALREADY_STARTED_DETAIL =
  'The appointment has already started and can no longer be cancelled.';

export interface FakeBranch {
  id: string;
  code: string;
  name: string;
  description: string | null;
  address: string;
  phoneNumber: string;
  isActive: boolean;
  timeZoneId: string | null;
  workingHours: { dayOfWeek: number; opensAt: string; closesAt: string }[];
}

export interface FakeService {
  id: string;
  code: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  isActive: boolean;
}

export interface BackendProblem {
  status: number;
  detail: string;
}

export type BackendResult<T> = { ok: true; body: T } | { ok: false; problem: BackendProblem };

export interface ListParams {
  status?: string | null;
  when?: string | null;
  page?: string | null;
  pageSize?: string | null;
}

export type CancelOutcome = { kind: 'no-content' } | { kind: 'problem'; problem: BackendProblem };

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export function makeBranch(overrides: Partial<FakeBranch> = {}): FakeBranch {
  return {
    id: BRANCH_ID,
    code: 'LDN',
    name: 'London Central',
    description: null,
    address: '1 High Street',
    phoneNumber: '+44 20 0000 0000',
    isActive: true,
    timeZoneId: 'Europe/London',
    workingHours: [],
    ...overrides,
  };
}

export function makeService(overrides: Partial<FakeService> = {}): FakeService {
  return {
    id: SERVICE_ID,
    code: 'CHK',
    name: 'Health check',
    description: null,
    durationMinutes: 30,
    isActive: true,
    ...overrides,
  };
}

function problem(status: number, detail: string): BackendResult<never> {
  return { ok: false, problem: { status, detail } };
}

function isInt(raw: string): boolean {
  return /^[+-]?\d+$/.test(raw.trim());
}

/**
 * In-memory model of the Booking and Availability calls F4 uses, for one signed-in customer.
 * Pure (no MSW import): `appointments.handlers.ts` maps HTTP onto it, and a spec pins its rules.
 */
export class AppointmentsBackend {
  appointments: AppointmentResponse[] = [];
  branches: FakeBranch[] = [makeBranch()];
  services: FakeService[] = [makeService()];

  /** The caller. Another customer's appointment answers 404, like an unknown id. */
  customerId = CUSTOMER_ID;
  /** The clock for `upcoming`/`past` and the cancel rule; tests replace it. */
  now: () => number = () => Date.now();
  /** When true, a successful cancel still answers 503 (slot release failed; already Cancelled). */
  failReleaseWith503 = false;
  /** When set, every cancel answers 409 with this detail (an unknown text, for example). */
  forceCancelConflict: string | null = null;
  /** The list answers this problem instead of data (for 403 or 500 tests). */
  forceListProblem: BackendProblem | null = null;

  /** Requests seen, for assertions. */
  readonly listCalls: ListParams[] = [];
  readonly cancelCalls: string[] = [];
  readonly getCalls: string[] = [];

  add(...items: AppointmentResponse[]): void {
    this.appointments.push(...items);
  }

  deactivateBranch(id: string): void {
    const b = this.branches.find((x) => x.id === id);
    if (b) b.isActive = false;
  }

  deactivateService(id: string): void {
    const s = this.services.find((x) => x.id === id);
    if (s) s.isActive = false;
  }

  activeBranches(): FakeBranch[] {
    return this.branches.filter((b) => b.isActive);
  }

  activeServices(): FakeService[] {
    return this.services.filter((s) => s.isActive);
  }

  list(params: ListParams): BackendResult<MyAppointmentsPage> {
    this.listCalls.push(params);
    if (this.forceListProblem) return { ok: false, problem: this.forceListProblem };

    const invalid: string[] = [];
    const status = params.status ?? null;
    const when = params.when ?? null;
    let statusFilter: 'Booked' | 'Cancelled' | null = null;
    if (status !== null) {
      const s = status.toLowerCase();
      if (s === 'booked') statusFilter = 'Booked';
      else if (s === 'cancelled') statusFilter = 'Cancelled';
      else invalid.push(`status '${status}' is not one of Booked, Cancelled`);
    }
    let whenFilter: 'upcoming' | 'past' | null = null;
    if (when !== null) {
      const w = when.toLowerCase();
      if (w === 'upcoming' || w === 'past') whenFilter = w;
      else invalid.push(`when '${when}' is not one of upcoming, past`);
    }
    let page = 1;
    if (params.page != null) {
      if (isInt(params.page) && Number(params.page) >= 1) page = Number(params.page);
      else invalid.push(`page '${params.page}' must be an integer of at least 1`);
    }
    let pageSize = DEFAULT_PAGE_SIZE;
    if (params.pageSize != null) {
      const n = Number(params.pageSize);
      if (isInt(params.pageSize) && n >= 1 && n <= MAX_PAGE_SIZE) pageSize = n;
      else invalid.push(`pageSize '${params.pageSize}' must be an integer from 1 to 100`);
    }
    if (invalid.length > 0) return problem(400, invalid.join('; ') + '.');

    const now = this.now();
    const start = (a: AppointmentResponse) => Date.parse(a.startUtc);
    let rows = this.appointments.filter((a) => a.customerId === this.customerId);
    if (statusFilter) rows = rows.filter((a) => a.status === statusFilter);
    if (whenFilter === 'upcoming') rows = rows.filter((a) => start(a) >= now);
    if (whenFilter === 'past') rows = rows.filter((a) => start(a) < now);
    const ascending = whenFilter === 'upcoming';
    rows = [...rows].sort((a, b) => {
      const d = start(a) - start(b);
      if (d !== 0) return ascending ? d : -d;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    const from = (page - 1) * pageSize;
    return {
      ok: true,
      body: {
        items: rows.slice(from, from + pageSize).map((a) => ({ ...a })),
        page,
        pageSize,
        totalCount: rows.length,
      },
    };
  }

  get(id: string): BackendResult<AppointmentResponse> {
    this.getCalls.push(id);
    const found = this.find(id);
    return found ? { ok: true, body: { ...found } } : problem(404, 'Appointment not found.');
  }

  /** Cancel is idempotent: a repeat on a `Cancelled` appointment is a no-content again. */
  cancel(id: string): CancelOutcome {
    this.cancelCalls.push(id);
    const found = this.find(id);
    if (!found)
      return { kind: 'problem', problem: { status: 404, detail: 'Appointment not found.' } };
    if (this.forceCancelConflict !== null) {
      return { kind: 'problem', problem: { status: 409, detail: this.forceCancelConflict } };
    }
    if (found.status === 'Cancelled') return this.releaseOutcome();
    if (Date.parse(found.startUtc) <= this.now()) {
      return { kind: 'problem', problem: { status: 409, detail: ALREADY_STARTED_DETAIL } };
    }
    const stamp = new Date(this.now()).toISOString();
    found.status = 'Cancelled';
    found.cancelledAtUtc = stamp;
    found.updatedAtUtc = stamp;
    return this.releaseOutcome();
  }

  private releaseOutcome(): CancelOutcome {
    return this.failReleaseWith503
      ? { kind: 'problem', problem: { status: 503, detail: 'The slot could not be released.' } }
      : { kind: 'no-content' };
  }

  private find(id: string): AppointmentResponse | undefined {
    return this.appointments.find((a) => a.id === id && a.customerId === this.customerId);
  }
}
