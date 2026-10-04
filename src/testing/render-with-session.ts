import { Type } from '@angular/core';
import { provideRouter, type Routes } from '@angular/router';
import { render, type RenderComponentOptions, type RenderResult } from '@testing-library/angular';
import { APP_CONFIG } from '../app/core/config/app-config';
import { provideCoreHttp } from '../app/core/http/http.providers';
import { createAuthBackend, type AuthBackend } from './auth-backend';
import { server } from './server';

export const TEST_API_BASE = 'http://gw.test:5290';

export interface RenderWithSessionOptions<T> extends RenderComponentOptions<T> {
  /** Defaults to a fresh mock backend for `TEST_API_BASE`, registered on the MSW server. */
  backend?: AuthBackend;
  routes?: Routes;
}

/**
 * Angular Testing Library `render` with the app's HTTP pipeline, a configured `AppConfig`, a
 * router and the mock auth backend. Returns the backend next to the render result.
 */
export async function renderWithSession<T>(
  component: Type<T>,
  options: RenderWithSessionOptions<T> = {},
): Promise<RenderResult<T> & { backend: AuthBackend }> {
  const { backend = createAuthBackend({ baseUrl: TEST_API_BASE }), routes = [], ...rest } = options;
  server.use(...backend.handlers);
  const result = await render(component, {
    ...rest,
    providers: [
      { provide: APP_CONFIG, useValue: { apiBaseUrl: TEST_API_BASE } },
      provideCoreHttp(),
      provideRouter(routes),
      ...(rest.providers ?? []),
    ],
  });
  return Object.assign(result, { backend });
}
