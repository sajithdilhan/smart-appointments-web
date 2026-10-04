import {
  EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { SessionSync } from './session-sync';
import { SessionStore } from './session.store';

/**
 * Registers the session initializer: it blocks the first navigation on the restore (one
 * refresh when a refresh token is stored) so a guard never sees a transient `anonymous`.
 * Register it after the config initializer and before the router.
 */
export function provideAuth(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAppInitializer(() => {
      const session = inject(SessionStore);
      const router = inject(Router);
      inject(SessionSync); // listens to the other tabs from the start
      // A failed profile load is retried once, on the next navigation (Req 6.7).
      let retried = false;
      router.events.subscribe((event) => {
        if (retried || !(event instanceof NavigationEnd) || session.profileStatus() !== 'error') {
          return;
        }
        retried = true;
        void session.loadProfile();
      });
      return session.restore();
    }),
  ]);
}
