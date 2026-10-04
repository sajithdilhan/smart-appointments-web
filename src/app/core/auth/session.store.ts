import { Injector, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { AuthApiService } from '../api/auth-api.service';
import type { TokenResponse } from '../api/models';
import { AppError } from '../http/app-error';
import { fromEpochMs, parseUtc, toIsoUtc } from '../time';
import { decodeAccessToken } from './jwt';
import type { Role, SessionStatus, SessionUser } from './session.model';
import { RefreshCoordinator } from './refresh-coordinator';
import { RefreshScheduler } from './refresh-scheduler';
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

    /**
     * Adopts a token pair: writes the refresh token first, then replaces the access token,
     * user and expiry in one state change. An undecodable token ends the session and throws.
     */
    function applyTokens(response: TokenResponse): void {
      const claims = decodeAccessToken(response.accessToken);
      if (!claims) {
        endSession('invalid');
        throw new AppError(0, 'Sign-in failed. Please try again.', 'http');
      }
      tokens.write(response.refreshToken);
      const previous = store.user();
      const sameUser = previous?.id === claims.sub;
      patchState(store, {
        status: 'authenticated',
        accessToken: response.accessToken,
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
      void fetchProfile();
    }

    /** Ends the session locally (and in storage). Task 15 routes this through `SessionEnder`. */
    function endSession(reason: 'expired' | 'invalid'): void {
      void reason;
      clearLocal();
      tokens.clear();
    }

    return {
      /** Resolves once, at the first transition out of `unknown`. */
      settled: (): Promise<void> => settledPromise,
      applyTokens,
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
