import {
  HttpInterceptorFn,
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import type { EnvironmentProviders, Provider } from '@angular/core';
import { APP_CONFIG } from '../app/core/config/app-config';
import { errorInterceptor } from '../app/core/http/error.interceptor';
import { ADMIN_API_BASE, handlers, reset, tokenFor, type Role } from './availability-admin-backend';
import { server } from './server';

/**
 * Providers for a component or route test that talks to the stateful MSW admin backend: the app
 * config, `HttpClient` with the real error normalisation, and a bearer token for `role` (Admin by
 * default) so the backend's role checks apply. Call `useAdminBackend()` in `beforeEach` first.
 */
export function provideAdminApi(role: Role = 'Admin'): (Provider | EnvironmentProviders)[] {
  const bearer: HttpInterceptorFn = (req, next) =>
    next(req.clone({ setHeaders: { Authorization: `Bearer ${tokenFor(role)}` } }));
  return [
    { provide: APP_CONFIG, useValue: { apiBaseUrl: ADMIN_API_BASE } },
    provideHttpClient(withFetch(), withInterceptors([bearer, errorInterceptor])),
  ];
}

/** Resets the shared admin backend and installs its handlers on the MSW server. */
export function useAdminBackend(): void {
  reset();
  server.use(...handlers);
}
