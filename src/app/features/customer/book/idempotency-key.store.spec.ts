import { TestBed } from '@angular/core/testing';
import { createSafeStorage } from '../../../core/util/safe-storage';
import {
  IDEMPOTENCY_STORAGE,
  IdempotencyKeyStore,
  NoSecureRandomError,
  isUuid,
  newUuid,
} from './idempotency-key.store';

function backing() {
  const data = new Map<string, string>();
  const storage = {
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  } as unknown as Storage;
  return { data, storage };
}

function setup(storage: Storage = backing().storage) {
  TestBed.configureTestingModule({
    providers: [
      IdempotencyKeyStore,
      { provide: IDEMPOTENCY_STORAGE, useValue: createSafeStorage('session', () => storage) },
    ],
  });
  return TestBed.inject(IdempotencyKeyStore);
}

describe('IdempotencyKeyStore', () => {
  afterEach(() => vi.restoreAllMocks());

  it('creates a key once per slot and reuses it', () => {
    const store = setup();
    const first = store.acquire('slot-1');
    expect(isUuid(first)).toBe(true);
    expect(store.acquire('slot-1')).toBe(first);
    expect(store.acquire('slot-2')).not.toBe(first);
  });

  it('persists under sa.idem.<slotId> so a reload reuses the key', () => {
    const { data, storage } = backing();
    const key = setup(storage).acquire('slot-1');
    expect(data.get('sa.idem.slot-1')).toBe(key);
    TestBed.resetTestingModule();
    expect(setup(storage).acquire('slot-1')).toBe(key);
  });

  it('replaces a tampered stored value instead of sending it', () => {
    const { data, storage } = backing();
    data.set('sa.idem.slot-1', 'not a uuid; DROP TABLE');
    const key = setup(storage).acquire('slot-1');
    expect(isUuid(key)).toBe(true);
    expect(data.get('sa.idem.slot-1')).toBe(key);
  });

  it('falls back to memory without an error when storage is blocked', () => {
    const blocked = {
      get length(): number {
        throw new Error('blocked');
      },
      key: () => {
        throw new Error('blocked');
      },
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    const store = setup(blocked);
    const key = store.acquire('slot-1');
    expect(store.acquire('slot-1')).toBe(key);
    store.pruneExcept(null);
    expect(isUuid(store.acquire('slot-1'))).toBe(true);
    expect(store.acquire('slot-1')).not.toBe(key);
  });

  it('clear removes the key so the next acquire creates a new one', () => {
    const { data, storage } = backing();
    const store = setup(storage);
    const key = store.acquire('slot-1');
    store.clear('slot-1');
    expect(data.has('sa.idem.slot-1')).toBe(false);
    expect(store.acquire('slot-1')).not.toBe(key);
  });

  it('rotate replaces the key', () => {
    const store = setup();
    const key = store.acquire('slot-1');
    const rotated = store.rotate('slot-1');
    expect(rotated).not.toBe(key);
    expect(store.acquire('slot-1')).toBe(rotated);
  });

  it('pruneExcept keeps only the current slot and other keys', () => {
    const { data, storage } = backing();
    const store = setup(storage);
    store.acquire('slot-1');
    const keep = store.acquire('slot-2');
    data.set('sa.other', 'x');
    store.pruneExcept('slot-2');
    expect([...data.keys()].sort()).toEqual(['sa.idem.slot-2', 'sa.other']);
    expect(data.get('sa.idem.slot-2')).toBe(keep);
    store.pruneExcept(null);
    expect([...data.keys()]).toEqual(['sa.other']);
  });

  it('never writes to localStorage', () => {
    const local = vi.spyOn(Storage.prototype, 'setItem');
    const store = setup();
    store.acquire('slot-1');
    store.rotate('slot-1');
    store.clear('slot-1');
    expect(local).not.toHaveBeenCalled();
  });
});

describe('newUuid', () => {
  it('uses randomUUID when it exists', () => {
    expect(newUuid({ randomUUID: () => '11111111-1111-4111-8111-111111111111' })).toBe(
      '11111111-1111-4111-8111-111111111111',
    );
  });

  it('builds a v4 UUID from getRandomValues otherwise', () => {
    const getRandomValues = (a: ArrayBufferView) => {
      (a as Uint8Array).fill(0xff);
      return a;
    };
    const id = newUuid({ getRandomValues } as Partial<Crypto>);
    expect(id).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    expect(isUuid(id)).toBe(true);
  });

  it('throws NoSecureRandomError without either, never using Math.random', () => {
    const random = vi.spyOn(Math, 'random');
    expect(() => newUuid({})).toThrow(NoSecureRandomError);
    expect(random).not.toHaveBeenCalled();
  });
});
