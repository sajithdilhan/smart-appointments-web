import {
  EnvironmentProviders,
  InjectionToken,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { APP_CONFIG, type AppConfig } from './app-config';
import { renderConfigError } from './config-error';
import { loadConfig } from './load-config';

/** Thrown by the initializer to abort bootstrap after the error page has been rendered. */
export class ConfigError extends Error {}

/**
 * Settles when `/config.json` has been loaded (rejects with `ConfigError` after the error page
 * is shown). Angular starts every app initializer without waiting for the previous one, so an
 * initializer that needs `APP_CONFIG` (directly or through an HTTP service) must await this
 * before injecting anything that reads it.
 */
export const APP_CONFIG_READY = new InjectionToken<Promise<void>>('APP_CONFIG_READY');

export function provideAppConfig(): EnvironmentProviders {
  let loaded: AppConfig | undefined;
  let ready: Promise<void> | undefined;

  const load = (): Promise<void> =>
    (ready ??= (async () => {
      const result = await loadConfig(fetch);
      if (!result.ok) {
        renderConfigError(result.reason);
        throw new ConfigError(result.reason);
      }
      loaded = result.config;
    })());

  return makeEnvironmentProviders([
    provideAppInitializer(load),
    { provide: APP_CONFIG_READY, useFactory: load },
    { provide: APP_CONFIG, useFactory: (): AppConfig => loaded! },
  ]);
}
