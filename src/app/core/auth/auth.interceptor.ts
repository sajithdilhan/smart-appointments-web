import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { APP_CONFIG } from '../config/app-config';
import { SKIP_AUTH } from '../http/http-context';
import { isApiRequest, isAuthEndpoint } from '../http/origin';
import { SessionStore } from './session.store';

/** Bearer for the API origin only, never on the four auth endpoints. Refresh logic follows (task 14). */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApiRequest(req, inject(APP_CONFIG)) || isAuthEndpoint(req) || req.context.get(SKIP_AUTH)) {
    return next(req);
  }
  const token = inject(SessionStore).accessToken();
  return next(token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req);
};
