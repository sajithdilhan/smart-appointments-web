import type { HttpRequest } from '@angular/common/http';
import type { AppConfig } from '../config/app-config';

/** True when the request goes to the configured API origin (and only then). */
export function isApiRequest(req: HttpRequest<unknown>, config: AppConfig): boolean {
  try {
    return new URL(req.url).origin === new URL(config.apiBaseUrl).origin;
  } catch {
    return false;
  }
}

const AUTH_PATHS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/logout',
];

/** Case-insensitive: the OpenAPI document emits `/api/Auth/...`. */
export function isAuthEndpoint(req: HttpRequest<unknown>): boolean {
  try {
    return AUTH_PATHS.includes(new URL(req.url).pathname.toLowerCase());
  } catch {
    return false;
  }
}
