import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { authInterceptor } from '../auth/auth.interceptor';
import { correlationIdInterceptor } from './correlation-id.interceptor';
import { errorInterceptor } from './error.interceptor';

/** Outermost first: correlation id, auth, then error normalisation next to the network. */
export function provideCoreHttp(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideHttpClient(
      withFetch(),
      withInterceptors([correlationIdInterceptor, authInterceptor, errorInterceptor]),
    ),
  ]);
}
