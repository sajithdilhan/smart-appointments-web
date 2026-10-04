/**
 * One API over `localStorage` and `sessionStorage` that never throws: when the storage is
 * blocked or unavailable (private window, blocked site data) values live in an in-memory map
 * for the page's lifetime. This is the only way the app touches web storage.
 */
export interface SafeStorage {
  /** The stored value; on a throw, the in-memory copy. */
  get(key: string): string | null;
  /** Writes memory first, then the storage in try/catch. */
  set(key: string, value: string): void;
  remove(key: string): void;
  /** Storage keys (try/catch), merged with the in-memory keys. */
  keys(): string[];
}

export function createSafeStorage(
  kind: 'local' | 'session',
  getStorage: () => Storage = () =>
    kind === 'local' ? globalThis.localStorage : globalThis.sessionStorage,
): SafeStorage {
  const memory = new Map<string, string>();
  return {
    get(key) {
      try {
        const value = getStorage().getItem(key);
        if (value !== null) return value;
        return memory.get(key) ?? null;
      } catch {
        return memory.get(key) ?? null;
      }
    },
    set(key, value) {
      memory.set(key, value);
      try {
        getStorage().setItem(key, value);
      } catch {
        /* memory copy keeps the value for this page load */
      }
    },
    remove(key) {
      memory.delete(key);
      try {
        getStorage().removeItem(key);
      } catch {
        /* nothing to remove */
      }
    },
    keys() {
      const result = new Set<string>(memory.keys());
      try {
        const storage = getStorage();
        for (let i = 0; i < storage.length; i++) {
          const k = storage.key(i);
          if (k !== null) result.add(k);
        }
      } catch {
        /* memory keys only */
      }
      return [...result];
    },
  };
}

export const localSafe = createSafeStorage('local');
export const sessionSafe = createSafeStorage('session');

export const safeGet = (key: string): string | null => localSafe.get(key);
export const safeSet = (key: string, value: string): void => localSafe.set(key, value);
export const safeRemove = (key: string): void => localSafe.remove(key);
