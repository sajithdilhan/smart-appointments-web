import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ToastService } from '../notify/toast.service';
import { CrossTabSync } from './cross-tab';
import { SessionStore } from './session.store';
import { TokenStorage } from './token-storage';

/** True for the two pages a signed-out user may already be on. */
export function onAuthPage(url: string): boolean {
  const path = url.split('?')[0].split('#')[0];
  return path === '/login' || path === '/register';
}

/**
 * Ends a session that cannot be renewed: clears state and storage, tells the other tabs, goes
 * to `/login?reason=session-expired&returnUrl=...` and shows one toast. Simultaneous failures
 * collapse into one run (the guard resets once the navigation settles).
 */
@Injectable({ providedIn: 'root' })
export class SessionEnder {
  private readonly session = inject(SessionStore);
  private readonly tokens = inject(TokenStorage);
  private readonly sync = inject(CrossTabSync);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private ending = false;

  end(reason: 'expired' | 'invalid'): void {
    if (this.ending) return;
    this.ending = true;
    const url = this.router.url;
    this.session.clearLocal();
    this.tokens.clear();
    this.sync.broadcast({ type: 'session-ended', reason });
    const queryParams = onAuthPage(url)
      ? { reason: 'session-expired' }
      : { reason: 'session-expired', returnUrl: url };
    void this.router
      .navigate(['/login'], { queryParams })
      .catch(() => false)
      .finally(() => (this.ending = false));
    if (reason === 'expired') this.toast.showSessionExpired();
  }
}
