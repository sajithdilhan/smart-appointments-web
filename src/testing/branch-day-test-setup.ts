import {
  HttpInterceptorFn,
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import {
  signal,
  type EnvironmentProviders,
  type Provider,
  type WritableSignal,
} from '@angular/core';
import type { BranchDayContext } from '../app/shared/branch-day/branch-day-context';
import type { Role } from '../app/core/auth/session.model';
import { APP_CONFIG } from '../app/core/config/app-config';
import { errorInterceptor } from '../app/core/http/error.interceptor';
import { BRANCH_DAY_API_BASE } from './branch-day-backend';
import { makeAccessToken } from './make-access-token';
import { BRANCH_ID, CUSTOMER_ID } from './make-appointment';

/**
 * Providers for a day-list test that talks to the stateful `createBranchDayBackend`: the app
 * config and `HttpClient` with the real error normalisation and a bearer token for `role` (a
 * Staff token carries `branchId`), so the backend's role checks apply.
 */
export function provideBranchDayApi(
  options: { role?: Role; branchId?: string } = {},
): (Provider | EnvironmentProviders)[] {
  const role = options.role ?? 'Staff';
  const token = makeAccessToken({
    sub: CUSTOMER_ID,
    email: 'staff@example.com',
    role,
    expiresInSeconds: 3600,
    branchId: role === 'Staff' ? (options.branchId ?? BRANCH_ID) : undefined,
  });
  const bearer: HttpInterceptorFn = (req, next) =>
    next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
  return [
    { provide: APP_CONFIG, useValue: { apiBaseUrl: BRANCH_DAY_API_BASE } },
    provideHttpClient(withFetch(), withInterceptors([bearer, errorInterceptor])),
  ];
}

export interface TestDayContext extends BranchDayContext {
  branchId: WritableSignal<string | null>;
  zone: WritableSignal<string>;
  services: WritableSignal<ReadonlyMap<string, { name: string }>>;
}

/** A writable `BRANCH_DAY_CONTEXT` for the default branch (Europe/London) and its service. */
export function makeDayContext(
  overrides: Partial<{ branchId: string | null; zone: string; services: [string, string][] }> = {},
): TestDayContext {
  return {
    branchId: signal(overrides.branchId === undefined ? BRANCH_ID : overrides.branchId),
    zone: signal(overrides.zone ?? 'Europe/London'),
    services: signal(
      new Map((overrides.services ?? []).map(([id, name]) => [id, { name }] as const)),
    ),
  };
}
