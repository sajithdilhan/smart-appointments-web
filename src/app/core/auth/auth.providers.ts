import {
  EnvironmentProviders,
  Injector,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { APP_CONFIG_READY } from '../config/config.provider';
import { SessionSync } from './session-sync';
import { SessionStore } from './session.store';

/**
 * Registers the session initializer: it blocks the first navigation on the restore (one
 * refresh when a refresh token is stored) so a guard never sees a transient `anonymous`.
 * Angular does not wait for the config initializer before starting this one, so it awaits the
 * config explicitly before touching anything that reads it.
 */
export function provideAuth(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAppInitializer(async () => {
      const injector = inject(Injector);
      // Optional: a test that provides APP_CONFIG directly has no config initializer.
      await injector.get(APP_CONFIG_READY, null);
      const session = injector.get(SessionStore);
      const router = injector.get(Router);
      injector.get(SessionSync); // listens to the other tabs from the start
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
