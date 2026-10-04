import { Injector, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { AuthApiService } from '../api/auth-api.service';
import type { TokenResponse } from '../api/models';
import { AppError } from '../http/app-error';
import { fromEpochMs, parseUtc, toIsoUtc } from '../time';
import { CrossTabSync } from './cross-tab';
import { decodeAccessToken, type AccessClaims } from './jwt';
import type { Role, SessionStatus, SessionUser } from './session.model';
import { RefreshCoordinator } from './refresh-coordinator';
import { RefreshScheduler } from './refresh-scheduler';
import { SessionEnder } from './session-ender';
import { TokenStorage } from './token-storage';

export interface Profile {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string | null;
}

export type ProfileStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface SessionState {
  status: SessionStatus;
  /** In memory only; never written to any storage. */
  accessToken: string | null;
  /** Derived from the token's `exp` (which wins over the response field). */
  accessTokenExpiresAtUtc: string | null;
  user: SessionUser | null;
  profile: Profile | null;
  profileStatus: ProfileStatus;
}

const anonymous: SessionState = {
  status: 'anonymous',
  accessToken: null,
  accessTokenExpiresAtUtc: null,
  user: null,
  profile: null,
  profileStatus: 'idle',
};

const initialState: SessionState = { ...anonymous, status: 'unknown' };

export const SessionStore = signalStore(
  { providedIn: 'root' },
  withState<SessionState>(initialState),
  withComputed(({ status, user, profile, profileStatus }) => ({
    isAuthenticated: computed(() => status() === 'authenticated'),
    role: computed<Role | null>(() => user()?.role ?? null),
    displayName: computed(() => {
      const u = user();
      if (!u) return '';
      const p = profile();
      if (profileStatus() === 'ready' && p) return `${p.firstName} ${p.lastName}`.trim() || u.email;
      return u.email;
    }),
  })),
  withMethods((store) => {
    const injector = inject(Injector);
    const auth = inject(AuthApiService);
    const tokens = inject(TokenStorage);
    const scheduler = inject(RefreshScheduler);
    const sync = inject(CrossTabSync);

    /** Resolved lazily: the coordinator injects this store. */
    const coordinator = () => injector.get(RefreshCoordinator);

    let resolveSettled!: () => void;
    const settledPromise = new Promise<void>((resolve) => (resolveSettled = resolve));

    function clearLocal(): void {
      scheduler.cancel();
      patchState(store, anonymous);
      resolveSettled();
    }

    /** Fetches the profile; never rejects. A 401 is the interceptor's business (session end). */
    async function fetchProfile(): Promise<void> {
      if (store.status() !== 'authenticated') return;
      patchState(store, { profileStatus: 'loading' });
      try {
        const me = await firstValueFrom(auth.me());
        if (store.status() !== 'authenticated') return; // the session ended meanwhile
        const profile: Profile = {
          firstName: me.firstName,
          lastName: me.lastName,
          email: me.email,
          phoneNumber: me.phoneNumber ?? null,
        };
        const user = store.user();
        patchState(store, {
          profile,
          profileStatus: 'ready',
          user: user ? { ...user, firstName: me.firstName, lastName: me.lastName } : user,
        });
      } catch {
        if (store.status() === 'authenticated') patchState(store, { profileStatus: 'error' });
      }
    }

    /** Puts a decoded access token into state (shared by login, refresh and cross-tab adoption). */
    function establish(accessToken: string, claims: AccessClaims): void {
      const previous = store.user();
      const sameUser = previous?.id === claims.sub;
      patchState(store, {
        status: 'authenticated',
        accessToken,
        accessTokenExpiresAtUtc: toIsoUtc(fromEpochMs(claims.exp * 1000)),
        user: {
          id: claims.sub,
          email: claims.email,
          role: claims.role,
          ...(sameUser ? { firstName: previous.firstName, lastName: previous.lastName } : {}),
        },
        ...(sameUser ? {} : { profile: null, profileStatus: 'idle' as const }),
      });
      resolveSettled();
      scheduler.schedule(
        claims.exp * 1000,
        () =>
          void coordinator()
            .refresh()
            .catch(() => undefined),
      );
      const status = store.profileStatus();
      if (status === 'idle' || status === 'error') void fetchProfile();
    }

    /**
     * Adopts a token pair: writes the refresh token first, then replaces the access token,
     * user and expiry in one state change, and tells the other tabs. An undecodable token ends
     * the session and throws.
     */
    function applyTokens(response: TokenResponse): void {
      const claims = decodeAccessToken(response.accessToken);
      if (!claims) {
        endSession('invalid');
        throw new AppError(0, 'Sign-in failed. Please try again.', 'http');
      }
      tokens.write(response.refreshToken);
      establish(response.accessToken, claims);
      sync.broadcast({
        type: 'session-updated',
        accessToken: response.accessToken,
        accessTokenExpiresAtUtc: store.accessTokenExpiresAtUtc()!,
      });
    }

    /**
     * Adopts an access token another tab obtained (its refresh token is already in the shared
     * storage). Only a token that outlives the one held is taken.
     */
    function adoptAccessToken(accessToken: string): boolean {
      const claims = decodeAccessToken(accessToken);
      if (!claims) return false;
      const held = store.accessToken() === null ? null : decodeAccessToken(store.accessToken()!);
      if (held && claims.exp <= held.exp) return false;
      establish(accessToken, claims);
      return true;
    }

    /**
     * Ends the session. Before the session has settled (restore in progress) it only clears
     * silently; afterwards `SessionEnder` clears, broadcasts, navigates and toasts once.
     */
    function endSession(reason: 'expired' | 'invalid'): void {
      if (store.status() === 'anonymous') return;
      if (store.status() === 'unknown') {
        clearLocal();
        tokens.clear();
        return;
      }
      injector.get(SessionEnder).end(reason);
    }

    /** Resolves the initial state exactly once: restores from a stored refresh token. */
    async function restore(): Promise<void> {
      if (store.status() !== 'unknown') return;
      if (!tokens.read()) {
        clearLocal();
        return;
      }
      try {
        await coordinator().refresh();
      } catch {
        /* the outcome is read from the state below */
      }
      if (store.status() === 'unknown') {
        // Network, timeout, 5xx or 429: the stored token has not been proven bad, keep it.
        patchState(store, { status: 'anonymous' });
        resolveSettled();
      }
    }

    return {
      /** Resolves once, at the first transition out of `unknown`. */
      settled: (): Promise<void> => settledPromise,
      applyTokens,
      adoptAccessToken,
      restore,
      clearLocal,
      endSession,
      /** Single-flight, lock-guarded refresh. Rejects with an AppError; never retried. */
      refresh: (): Promise<void> => coordinator().refresh(),

      /** True when the held access token expires in more than `ms`. */
      hasFreshAccessToken(ms: number): boolean {
        const exp = store.accessTokenExpiresAtUtc();
        return (
          store.status() === 'authenticated' &&
          store.accessToken() !== null &&
          exp !== null &&
          parseUtc(exp).getTime() - Date.now() > ms
        );
      },

      /** The bearer for the next request: waits for a refresh in flight or due within 10 s. */
      async accessTokenForRequest(): Promise<string | null> {
        if (store.status() !== 'authenticated') return null;
        const c = coordinator();
        const exp = store.accessTokenExpiresAtUtc();
        const expiring = exp !== null && parseUtc(exp).getTime() - Date.now() < 10_000;
        if (c.inFlight || expiring) await c.refresh();
        return store.accessToken();
      },

      /** After a 401 for `usedToken`: the current token if another request already refreshed. */
      async refreshAfterUnauthorized(usedToken: string): Promise<string> {
        const held = store.accessToken();
        if (held !== null && held !== usedToken) return held;
        await coordinator().refresh(usedToken);
        const fresh = store.accessToken();
        if (fresh === null) throw new AppError(401, 'You need to sign in.', 'unauthorized');
        return fresh;
      },

      loadProfile: fetchProfile,
      reloadProfile: fetchProfile,

      async login(email: string, password: string): Promise<void> {
        const response = await firstValueFrom(auth.login({ email, password }));
        applyTokens(response);
      },

      async logout(): Promise<void> {
        const token = tokens.read();
        clearLocal();
        tokens.clear();
        sync.broadcast({ type: 'session-ended', reason: 'logout' });
        if (token) firstValueFrom(auth.logout(token)).catch(() => undefined);
        await injector
          .get(Router)
          .navigate(['/login'])
          .catch(() => false);
      },
    };
  }),
);

export type SessionStoreType = InstanceType<typeof SessionStore>;
