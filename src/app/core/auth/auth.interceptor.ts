import { HttpInterceptorFn } from '@angular/common/http';

/** Placeholder pass-through; the real bearer and refresh logic arrives with the session store. */
export const authInterceptor: HttpInterceptorFn = (req, next) => next(req);
