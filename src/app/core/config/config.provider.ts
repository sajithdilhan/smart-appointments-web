import {
  EnvironmentProviders,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { APP_CONFIG, type AppConfig } from './app-config';
import { renderConfigError } from './config-error';
import { loadConfig } from './load-config';

/** Thrown by the initializer to abort bootstrap after the error page has been rendered. */
export class ConfigError extends Error {}

export function provideAppConfig(): EnvironmentProviders {
  let loaded: AppConfig | undefined;
  return makeEnvironmentProviders([
    provideAppInitializer(async () => {
      const result = await loadConfig(fetch);
      if (!result.ok) {
        renderConfigError(result.reason);
        throw new ConfigError(result.reason);
      }
      loaded = result.config;
    }),
    { provide: APP_CONFIG, useFactory: (): AppConfig => loaded! },
  ]);
}
