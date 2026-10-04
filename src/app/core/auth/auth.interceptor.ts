import { HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, catchError, from, switchMap, throwError } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { AppError } from '../http/app-error';
import { RETRIED, SKIP_AUTH } from '../http/http-context';
import { isApiRequest, isAuthEndpoint } from '../http/origin';
import { SessionStore } from './session.store';

/**
 * Bearer for the API origin only (never on the four auth endpoints). It sits outside the error
 * interceptor, so it sees `AppError`s: a 401 refreshes once and retries once with `RETRIED`;
 * a second 401 ends the session. A request sent without a token is returned as is.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApiRequest(req, inject(APP_CONFIG)) || isAuthEndpoint(req) || req.context.get(SKIP_AUTH)) {
    return next(req);
  }
  const session = inject(SessionStore);
  const handle: HttpHandlerFn = next;

  const send = (r: HttpRequest<unknown>, token: string | null): Observable<HttpEvent<unknown>> =>
    handle(token ? r.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : r).pipe(
      catchError((err: unknown) => {
        if (!(err instanceof AppError) || err.kind !== 'unauthorized' || token === null) {
          return throwError(() => err);
        }
        if (r.context.get(RETRIED)) {
          session.endSession('expired');
          return throwError(() => err);
        }
        return from(session.refreshAfterUnauthorized(token)).pipe(
          switchMap((fresh) => send(r.clone({ context: r.context.set(RETRIED, true) }), fresh)),
        );
      }),
    );

  return from(session.accessTokenForRequest()).pipe(switchMap((token) => send(req, token)));
};
