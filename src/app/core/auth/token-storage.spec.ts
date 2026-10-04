import { TestBed } from '@angular/core/testing';
import { REFRESH_TOKEN_KEY, TokenStorage } from './token-storage';

describe('TokenStorage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.inject(TokenStorage).clear();
    localStorage.clear();
  });

  it('persists under the one key and reads it back', () => {
    const storage = TestBed.inject(TokenStorage);
    expect(storage.read()).toBeNull();
    storage.write('rt_1');
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('rt_1');
    expect(REFRESH_TOKEN_KEY).toBe('sa.refreshToken');
    expect(storage.read()).toBe('rt_1');
    storage.clear();
    expect(storage.read()).toBeNull();
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
  });

  it('keeps working in memory when localStorage throws, and never throws', () => {
    const proto = Object.getPrototypeOf(localStorage);
    const boom = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    vi.spyOn(proto, 'getItem').mockImplementation(boom);
    vi.spyOn(proto, 'setItem').mockImplementation(boom);
    vi.spyOn(proto, 'removeItem').mockImplementation(boom);
    const storage = TestBed.inject(TokenStorage);
    expect(() => storage.write('rt_mem')).not.toThrow();
    expect(storage.read()).toBe('rt_mem');
    expect(() => storage.clear()).not.toThrow();
    expect(storage.read()).toBeNull();
  });

  it('sees a removal made by another tab (no stale memory copy)', () => {
    const storage = TestBed.inject(TokenStorage);
    storage.write('rt_1');
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    expect(storage.read()).toBeNull();
  });
});
