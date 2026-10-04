import { Injectable } from '@angular/core';
import { localSafe } from '../util/safe-storage';

export const REFRESH_TOKEN_KEY = 'sa.refreshToken';

/**
 * The persisted refresh token (`localStorage`, one key). It never throws: when the storage is
 * blocked the token lives in memory for the page's lifetime. The access token has no storage
 * at all; it exists only in the session store.
 */
@Injectable({ providedIn: 'root' })
export class TokenStorage {
  read(): string | null {
    return localSafe.get(REFRESH_TOKEN_KEY);
  }

  write(token: string): void {
    localSafe.set(REFRESH_TOKEN_KEY, token);
  }

  clear(): void {
    localSafe.remove(REFRESH_TOKEN_KEY);
  }
}
