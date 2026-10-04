import { createAuthBackend, type AuthBackend, type AuthBackendOptions } from '../auth-backend';

/**
 * MSW handlers for register, login, refresh, logout and me, backed by one stateful model.
 * Register them per test: `server.use(...backend.handlers)`.
 */
export function authHandlers(options?: AuthBackendOptions): AuthBackend {
  return createAuthBackend(options);
}

export { createAuthBackend };
