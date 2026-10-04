import { HttpEventType, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { TimeoutError, catchError, switchMap, takeUntil, tap, throwError, timer } from 'rxjs';
import { CORRELATION_HEADER } from './correlation-id.interceptor';
import { OUTAGE_PROBE } from './http-context';
import { normalizeError } from './normalize-error';
import { OutageState } from './outage-state';

export const REQUEST_TIMEOUT_MS = 30_000;

/**
 * The interceptor closest to the network: it turns every failure into an `AppError` (callers
 * and the auth interceptor never see an `HttpErrorResponse`) and feeds the outage state. It
 * never toasts; that is the caller's decision.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const outage = inject(OutageState);
  const sentId = req.headers.get(CORRELATION_HEADER) ?? undefined;
  const probe = req.context.get(OUTAGE_PROBE);
  return next(req).pipe(
    // A deadline for the whole request, not rxjs `timeout({ first })`: the backend emits a
    // `Sent` event at once, which would satisfy `first`. Unsubscribing aborts the fetch.
    takeUntil(
      timer(REQUEST_TIMEOUT_MS).pipe(switchMap(() => throwError(() => new TimeoutError()))),
    ),
    tap((event) => {
      if (event.type === HttpEventType.Response) outage.onResponse(event.status);
    }),
    catchError((err: unknown) => {
      const appError = normalizeError(err, sentId);
      outage.onError(appError, probe);
      return throwError(() => appError);
    }),
  );
};
