import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CrossTabSync, type SessionEndReason, type SessionMessage } from './cross-tab';
import { onAuthPage } from './session-ender';
import { SessionStore } from './session.store';
import { REFRESH_TOKEN_KEY } from './token-storage';

/**
 * Connects the other tabs to this tab's store: adopts a newer access token, signs out when
 * another tab ended the session (also when `sa.refreshToken` disappears from storage), and
 * answers `request-session`. Created once at startup by `provideAuth`.
 */
@Injectable({ providedIn: 'root' })
export class SessionSync {
  private readonly session = inject(SessionStore);
  private readonly sync = inject(CrossTabSync);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  constructor() {
    const off = this.sync.subscribe((m) => this.onMessage(m));
    const view = this.document.defaultView;
    const onStorage = (event: StorageEvent) => {
      if (event.key === REFRESH_TOKEN_KEY && event.newValue === null) this.onEnded('logout');
    };
    view?.addEventListener('storage', onStorage);
    inject(DestroyRef).onDestroy(() => {
      off();
      view?.removeEventListener('storage', onStorage);
    });
  }

  private onMessage(message: SessionMessage): void {
    switch (message.type) {
      case 'session-updated':
        // Adopts only a later expiry; a tab that is mid-login keeps its own session.
        this.session.adoptAccessToken(message.accessToken);
        return;
      case 'session-ended':
        this.onEnded(message.reason);
        return;
      case 'request-session': {
        const token = this.session.accessToken();
        const exp = this.session.accessTokenExpiresAtUtc();
        if (token && exp) {
          this.sync.broadcast({
            type: 'session-updated',
            accessToken: token,
            accessTokenExpiresAtUtc: exp,
          });
        }
        return;
      }
    }
  }

  /** Another tab ended the session: clear memory only (no API call, no rebroadcast). */
  private onEnded(reason: SessionEndReason): void {
    if (this.session.status() !== 'authenticated') return;
    const url = this.router.url;
    this.session.clearLocal();
    if (onAuthPage(url)) return;
    const queryParams =
      reason === 'expired' ? { reason: 'session-expired', returnUrl: url } : undefined;
    void this.router.navigate(['/login'], { queryParams }).catch(() => false);
  }
}
