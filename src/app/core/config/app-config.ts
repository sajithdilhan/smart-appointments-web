import { InjectionToken } from '@angular/core';

export interface AppConfig {
  /** Origin (scheme, host, port) of the API gateway, without a trailing slash. */
  readonly apiBaseUrl: string;
}

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG');
