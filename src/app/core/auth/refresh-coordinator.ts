import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthApiService } from '../api/auth-api.service';
import { AppError } from '../http/app-error';
import { CLOCK } from '../util/clock';
import { CrossTabSync, LOCK_NAME } from './cross-tab';
import { RefreshScheduler } from './refresh-scheduler';
import { SessionStore } from './session.store';
import { TokenStorage } from './token-storage';

const LOCK_WAIT_MS = 15_000;
const BROADCAST_GRACE_MS = 1_000;
const FRESH_MS = 60_000;

/**
 * Every refresh goes through here: one in-flight promise per tab (single flight) run inside a
 * Web Lock (one refresh across tabs). Inside the lock it always re-reads the stored refresh
 * token, so it never presents a token another tab already rotated, and it never retries the
 * refresh call (a retry of a consumed token would revoke the whole family).
 */
@Injectable({ providedIn: 'root' })
export class RefreshCoordinator {
  private readonly session = inject(SessionStore);
  private readonly auth = inject(AuthApiService);
  private readonly storage = inject(TokenStorage);
  private readonly sync = inject(CrossTabSync);
  private readonly scheduler = inject(RefreshScheduler);
  private readonly clock = inject(CLOCK);
  private inFlightRun: Promise<void> | null = null;
  private blockedUntil = 0;

  get inFlight(): boolean {
    return this.inFlightRun !== null;
  }

  /**
   * @param staleAccessToken the access token a request just got a 401 for: a held token equal
   *   to it is not "fresh" even if its `exp` is far away.
   */
  refresh(staleAccessToken?: string): Promise<void> {
    const remaining = this.blockedUntil - this.clock.now();
    if (remaining > 0) {
      return Promise.reject(
        new AppError(
          429,
          'Too many requests. Please wait and try again.',
          'rate-limited',
          undefined,
          Math.ceil(remaining / 1000),
        ),
      );
    }
    return (this.inFlightRun ??= this.run(staleAccessToken).finally(() => {
      this.inFlightRun = null;
    }));
  }

  private isFresh(stale: string | undefined): boolean {
    if (!this.session.hasFreshAccessToken(FRESH_MS)) return false;
    return stale === undefined || this.session.accessToken() !== stale;
  }

  private signedOut(): AppError {
    this.session.endSession('expired');
    return new AppError(401, 'You need to sign in.', 'unauthorized');
  }

  private async run(stale: string | undefined): Promise<void> {
    const startToken = this.storage.read();
    if (!startToken) throw this.signedOut();
    await this.sync.withLock(LOCK_NAME, LOCK_WAIT_MS, async () => {
      // Another tab may have refreshed while we waited for the lock.
      if (this.isFresh(stale)) return;
      const current = this.storage.read();
      if (!current) throw this.signedOut(); // logged out elsewhere while we waited
      if (current !== startToken) {
        await this.sync.waitForUpdate(BROADCAST_GRACE_MS);
        if (this.isFresh(stale)) return;
      }
      // Always present the freshest stored token, never the one we started with.
      const token = this.storage.read();
      if (!token) throw this.signedOut();
      try {
        const response = await firstValueFrom(this.auth.refresh(token));
        this.scheduler.markRefreshed();
        this.session.applyTokens(response);
      } catch (error) {
        if (error instanceof AppError) {
          if (error.kind === 'unauthorized') this.session.endSession('expired');
          if (error.kind === 'rate-limited') {
            const seconds = error.retryAfterSeconds ?? 60;
            this.blockedUntil = this.clock.now() + seconds * 1000;
            this.scheduler.scheduleAfter(seconds * 1000);
          }
        }
        throw error; // network, timeout, 5xx and 429 keep the session
      }
    });
  }
}
