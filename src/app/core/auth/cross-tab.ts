import { Injectable } from '@angular/core';
import { AppError } from '../http/app-error';
import { decodeAccessToken } from './jwt';

export type SessionEndReason = 'logout' | 'expired' | 'invalid';

export type SessionMessage =
  | { type: 'session-updated'; tabId: string; accessToken: string; accessTokenExpiresAtUtc: string }
  | { type: 'session-ended'; tabId: string; reason: SessionEndReason }
  | { type: 'request-session'; tabId: string };

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
export type OutgoingSessionMessage = DistributiveOmit<SessionMessage, 'tabId'>;

export const LOCK_NAME = 'sa.refresh';
const CHANNEL_NAME = 'sa.session';
const END_REASONS: readonly unknown[] = ['logout', 'expired', 'invalid'];

/** Module-level chain: the in-process lock of the fallback path. */
let fallbackChain: Promise<unknown> = Promise.resolve();

/** Accepts only well-formed messages from another tab (Req 9.3, 9.9). */
export function parseSessionMessage(data: unknown, ownTabId: string): SessionMessage | null {
  if (typeof data !== 'object' || data === null) return null;
  const m = data as Record<string, unknown>;
  if (typeof m['tabId'] !== 'string' || m['tabId'] === ownTabId) return null;
  const tabId = m['tabId'];
  switch (m['type']) {
    case 'session-updated': {
      const { accessToken, accessTokenExpiresAtUtc } = m;
      if (typeof accessToken !== 'string' || typeof accessTokenExpiresAtUtc !== 'string') {
        return null;
      }
      if (decodeAccessToken(accessToken) === null) return null;
      return { type: 'session-updated', tabId, accessToken, accessTokenExpiresAtUtc };
    }
    case 'session-ended':
      return END_REASONS.includes(m['reason'])
        ? { type: 'session-ended', tabId, reason: m['reason'] as SessionEndReason }
        : null;
    case 'request-session':
      return { type: 'request-session', tabId };
    default:
      return null;
  }
}

/**
 * Coordinates tabs of one browser profile: a `BroadcastChannel` for access-token and
 * session-end messages (never the refresh token) and a Web Lock so only one tab refreshes at a
 * time. Without `navigator.locks` or `BroadcastChannel` it falls back to a per-tab lock and
 * does not broadcast (cross-tab logout then relies on the `storage` event).
 */
@Injectable({ providedIn: 'root' })
export class CrossTabSync {
  readonly tabId = crypto.randomUUID();
  readonly supported: boolean;
  private readonly channel: BroadcastChannel | null = null;
  private readonly handlers = new Set<(message: SessionMessage) => void>();
  private readonly updateWaiters = new Set<() => void>();

  constructor() {
    const hasChannel = typeof globalThis.BroadcastChannel === 'function';
    const hasLocks = typeof navigator !== 'undefined' && 'locks' in navigator && !!navigator.locks;
    this.supported = hasChannel && hasLocks;
    if (!this.supported) {
      console.warn(
        'Cross-tab session coordination is unavailable (no Web Locks or BroadcastChannel); ' +
          'refreshes are only serialised within this tab.',
      );
    }
    if (hasChannel) {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = (event: MessageEvent) => this.receive(event.data);
    }
  }

  broadcast(message: OutgoingSessionMessage): void {
    if (!this.supported || !this.channel) return;
    try {
      this.channel.postMessage({ ...message, tabId: this.tabId });
    } catch {
      /* a closed channel must not break the caller */
    }
  }

  subscribe(handler: (message: SessionMessage) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /**
   * Runs `fn` while holding the named lock. Waiting longer than `waitMs` gives up with a
   * `timeout` AppError (a lock already granted is never cancelled).
   */
  async withLock<T>(name: string, waitMs: number, fn: () => Promise<T>): Promise<T> {
    if (!this.supported) {
      const run = fallbackChain.then(fn, fn);
      fallbackChain = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), waitMs);
    try {
      return await navigator.locks.request(name, { signal: controller.signal }, async () => {
        clearTimeout(timer);
        return fn();
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new AppError(0, 'The request took too long. Please try again.', 'timeout');
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Resolves on the next valid `session-updated` from another tab, or after `ms`. */
  waitForUpdate(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.updateWaiters.delete(done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.updateWaiters.add(done);
    });
  }

  private receive(data: unknown): void {
    const message = parseSessionMessage(data, this.tabId);
    if (!message) return;
    for (const handler of [...this.handlers]) handler(message);
    if (message.type === 'session-updated') for (const w of [...this.updateWaiters]) w();
  }
}
