import { createSafeStorage } from './safe-storage';

function throwingStorage(): Storage {
  const fail = () => {
    throw new DOMException('blocked', 'SecurityError');
  };
  return {
    get length(): number {
      return fail() as never;
    },
    key: fail,
    getItem: fail,
    setItem: fail,
    removeItem: fail,
    clear: fail,
  } as unknown as Storage;
}

describe.each(['local', 'session'] as const)('createSafeStorage(%s)', (kind) => {
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('round-trips through the real storage', () => {
    const store = createSafeStorage(kind);
    store.set('k', 'v');
    expect((kind === 'local' ? localStorage : sessionStorage).getItem('k')).toBe('v');
    expect(store.get('k')).toBe('v');
    expect(store.keys()).toContain('k');
    store.remove('k');
    expect(store.get('k')).toBeNull();
  });

  it('keeps working in memory when the storage throws', () => {
    const store = createSafeStorage(kind, throwingStorage);
    expect(() => store.set('k', 'v')).not.toThrow();
    expect(store.get('k')).toBe('v');
    expect(store.keys()).toEqual(['k']);
    expect(() => store.remove('k')).not.toThrow();
    expect(store.get('k')).toBeNull();
    expect(store.keys()).toEqual([]);
  });

  it('survives a storage lookup that itself throws', () => {
    const store = createSafeStorage(kind, () => {
      throw new Error('no storage');
    });
    store.set('a', '1');
    expect(store.get('a')).toBe('1');
    expect(store.keys()).toEqual(['a']);
  });

  it('keeps an independent memory per instance', () => {
    const a = createSafeStorage(kind, throwingStorage);
    const b = createSafeStorage(kind, throwingStorage);
    a.set('k', 'v');
    expect(b.get('k')).toBeNull();
  });
});
