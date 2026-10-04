import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideAppConfig } from './core/config/config.provider';
import { provideAuth } from './core/auth/auth.providers';
import { provideCoreHttp } from './core/http/http.providers';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideAppConfig(),
    provideCoreHttp(),
    provideAuth(),
    provideRouter(routes),
  ],
};
