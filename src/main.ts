import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { ConfigError } from './app/core/config/config.provider';

bootstrapApplication(App, appConfig).catch((err: unknown) => {
  // A ConfigError means the configuration error page is already on screen.
  if (!(err instanceof ConfigError)) {
    console.error(err);
  }
});
