import { Signal, computed, inject } from '@angular/core';
import { landingRouteFor } from './landing';
import { SessionStore } from './session.store';

export interface Cta {
  label: string;
  href: string;
}

export interface LandingCtas {
  primary: Cta;
  secondary: Cta | null;
}

/**
 * The calls to action of the public header and the landing page, so they never disagree:
 * anonymous visitors create an account or log in, signed-in users go to their dashboard.
 * Call in an injection context.
 */
export function landingCtas(): Signal<LandingCtas> {
  const session = inject(SessionStore);
  return computed(() => {
    const role = session.role();
    return session.status() === 'authenticated' && role !== null
      ? { primary: { label: 'Go to my dashboard', href: landingRouteFor(role) }, secondary: null }
      : {
          primary: { label: 'Create an account', href: '/register' },
          secondary: { label: 'Log in', href: '/login' },
        };
  });
}
