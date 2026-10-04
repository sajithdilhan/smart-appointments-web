import { Injectable, InjectionToken, inject } from '@angular/core';
import { sessionSafe, type SafeStorage } from '../../../core/util/safe-storage';

export const IDEMPOTENCY_KEY_PREFIX = 'sa.idem.';

/** The session storage the keys live in; tests replace it with a stub-backed `SafeStorage`. */
export const IDEMPOTENCY_STORAGE = new InjectionToken<SafeStorage>('IDEMPOTENCY_STORAGE', {
  providedIn: 'root',
  factory: () => sessionSafe,
});

/** Thrown when the browser offers no secure random source to make a key from. */
export class NoSecureRandomError extends Error {
  constructor() {
    super('This browser cannot create a secure random value.');
    this.name = 'NoSecureRandomError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null): value is string {
  return value !== null && UUID.test(value);
}

/**
 * A v4 UUID: `crypto.randomUUID`, else built from `crypto.getRandomValues`; throws
 * `NoSecureRandomError` when neither exists (never falls back to `Math.random`).
 */
export function newUuid(source: Partial<Crypto> | undefined = globalThis.crypto): string {
  if (typeof source?.randomUUID === 'function') return source.randomUUID();
  if (typeof source?.getRandomValues === 'function') {
    const b = source.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const hex = Array.from(b, (n) => n.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  throw new NoSecureRandomError();
}

/**
 * One `Idempotency-Key` per slot (Req 7.2, 7.3, 8.6), kept in `sessionStorage` as
 * `sa.idem.<slotId>` so a reload of Review reuses it. The shared safe-storage keeps a memory
 * copy, so blocked storage still reuses the key for the page load. A stored value that is not
 * a UUID (tampered) is replaced, never sent. Nothing here touches `localStorage`.
 */
@Injectable()
export class IdempotencyKeyStore {
  private readonly storage = inject(IDEMPOTENCY_STORAGE);

  /** The slot's key, created and stored on first use; throws `NoSecureRandomError`. */
  acquire(slotId: string): string {
    const storageKey = IDEMPOTENCY_KEY_PREFIX + slotId;
    const stored = this.storage.get(storageKey);
    if (isUuid(stored)) return stored;
    const created = newUuid();
    this.storage.set(storageKey, created);
    return created;
  }

  clear(slotId: string): void {
    this.storage.remove(IDEMPOTENCY_KEY_PREFIX + slotId);
  }

  /** A new key for the slot (after a `422`). */
  rotate(slotId: string): string {
    this.clear(slotId);
    return this.acquire(slotId);
  }

  /** Removes every key except the current slot (a slot change leaves no stale key). */
  pruneExcept(slotId: string | null): void {
    const keep = slotId === null ? null : IDEMPOTENCY_KEY_PREFIX + slotId;
    for (const key of this.storage.keys()) {
      if (key.startsWith(IDEMPOTENCY_KEY_PREFIX) && key !== keep) this.storage.remove(key);
    }
  }
}
