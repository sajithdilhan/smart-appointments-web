import {
  HttpInterceptorFn,
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import type { EnvironmentProviders, Provider } from '@angular/core';
import { APP_CONFIG } from '../app/core/config/app-config';
import { errorInterceptor } from '../app/core/http/error.interceptor';
import type { Role } from '../app/core/auth/session.model';
import {
  reset as resetAvailability,
  handlers as availabilityHandlers,
} from './availability-admin-backend';
import { makeAccessToken } from './make-access-token';
import { server } from './server';
import { createStaffAccountsBackend, STAFF_API_BASE } from './staff-accounts-backend';

/** The shared staff accounts model for the staff screens' specs (reset by `useStaffBackends`). */
export const staffBackend = createStaffAccountsBackend();

/**
 * Providers for a component test that talks to both stateful MSW backends behind the one test
 * gateway (Auth's staff endpoints and Availability's branches): the app config, `HttpClient` with
 * the real error normalisation, and a decodable bearer token for `role` (Admin by default).
 */
export function provideStaffApi(role: Role = 'Admin'): (Provider | EnvironmentProviders)[] {
  const token = makeAccessToken({
    sub: 'admin-1',
    email: 'admin@example.com',
    role,
    expiresInSeconds: 3600,
  });
  const bearer: HttpInterceptorFn = (req, next) =>
    next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
  return [
    { provide: APP_CONFIG, useValue: { apiBaseUrl: STAFF_API_BASE } },
    provideHttpClient(withFetch(), withInterceptors([bearer, errorInterceptor])),
  ];
}

/** Call in `beforeEach`: resets both backends and installs their handlers. */
export function useStaffBackends(): void {
  staffBackend.reset();
  resetAvailability();
  server.use(...staffBackend.handlers, ...availabilityHandlers);
}
