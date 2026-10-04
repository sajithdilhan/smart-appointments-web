import { HttpContextToken } from '@angular/common/http';

/** Set on the one retry after a refresh, so a second 401 ends the session. */
export const RETRIED = new HttpContextToken<boolean>(() => false);
/** The `/healthz` probe of the outage banner: it can clear the outage but never set it. */
export const OUTAGE_PROBE = new HttpContextToken<boolean>(() => false);
/** Skip the auth interceptor (no bearer, no 401 handling). */
export const SKIP_AUTH = new HttpContextToken<boolean>(() => false);
