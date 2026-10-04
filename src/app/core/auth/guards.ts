import { inject } from '@angular/core';
import {
  Router,
  type ActivatedRouteSnapshot,
  type CanActivateChildFn,
  type CanActivateFn,
  type RouterStateSnapshot,
} from '@angular/router';
import { ToastService } from '../notify/toast.service';
import { landingRouteFor } from './landing';
import { resolvePostLoginTarget } from './post-login-target';
import type { Role } from './session.model';
import { SessionStore } from './session.store';

/** Anonymous visitors go to `/login` with the app-generated target; read it back via `safeReturnUrl`. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const session = inject(SessionStore);
  const router = inject(Router);
  await session.settled();
  return session.status() === 'authenticated'
    ? true
    : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Signed-in users do not see the login or register page: they go to a safe target. */
export const guestGuard: CanActivateFn = async (route) => {
  const session = inject(SessionStore);
  const router = inject(Router);
  await session.settled();
  const role = session.role();
  return session.status() === 'authenticated' && role !== null
    ? router.parseUrl(resolvePostLoginTarget(role, route.queryParamMap.get('returnUrl')))
    : true;
};

/**
 * Role check for UX only (the services decide). Usable as `canActivate` and `canActivateChild`.
 * A wrong role lands on its own area with one info toast.
 */
export function roleGuard(...roles: Role[]): CanActivateFn & CanActivateChildFn {
  return async (_route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
    const session = inject(SessionStore);
    const router = inject(Router);
    const toast = inject(ToastService);
    await session.settled();
    const role = session.role();
    if (session.status() !== 'authenticated' || role === null) {
      return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
    }
    if (roles.includes(role)) return true;
    toast.showInfo('That area is not available for your account.');
    return router.createUrlTree([landingRouteFor(role)]);
  };
}
