import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { APP_CONFIG } from '../config/app-config';
import { isApiRequest } from './origin';

export const CORRELATION_HEADER = 'X-Correlation-ID';

/** Adds `X-Correlation-ID` to requests for the API origin (and only that origin). */
export const correlationIdInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApiRequest(req, inject(APP_CONFIG)) || req.headers.has(CORRELATION_HEADER)) {
    return next(req);
  }
  return next(req.clone({ setHeaders: { [CORRELATION_HEADER]: crypto.randomUUID() } }));
};
