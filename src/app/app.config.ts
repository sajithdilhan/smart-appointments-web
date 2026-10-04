import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import {
  TitleStrategy,
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
  withViewTransitions,
} from '@angular/router';
import { routes } from './app.routes';
import { provideAuth } from './core/auth/auth.providers';
import { provideAppConfig } from './core/config/config.provider';
import { provideCoreHttp } from './core/http/http.providers';
import { AppTitleStrategy } from './core/routing/app-title.strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideAppConfig(),
    provideCoreHttp(),
    provideAuth(),
    provideRouter(
      routes,
      withViewTransitions({
        // No view transition for people who asked for less motion.
        onViewTransitionCreated: ({ transition }) => {
          if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
            transition.skipTransition();
          }
        },
      }),
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }),
    ),
    { provide: TitleStrategy, useClass: AppTitleStrategy },
  ],
};
