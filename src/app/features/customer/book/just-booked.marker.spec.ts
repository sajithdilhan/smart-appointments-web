import { createSafeStorage } from '../../../core/util/safe-storage';
import {
  JUST_BOOKED_KEY,
  JUST_BOOKED_TTL_MS,
  consumeJustBooked,
  markJustBooked,
} from './just-booked.marker';

function fresh() {
  const data = new Map<string, string>();
  const stub = {
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  } as unknown as Storage;
  return { data, storage: createSafeStorage('session', () => stub) };
}

describe('just-booked marker', () => {
  it('is consumed once', () => {
    const { storage, data } = fresh();
    markJustBooked(1_000, storage);
    expect(data.get(JUST_BOOKED_KEY)).toBe('1000');
    expect(consumeJustBooked(2_000, storage)).toBe(true);
    expect(consumeJustBooked(2_000, storage)).toBe(false);
  });

  it('is gone without a mark', () => {
    expect(consumeJustBooked(0, fresh().storage)).toBe(false);
  });

  it('expires after 10 minutes and is removed even then', () => {
    const { storage, data } = fresh();
    markJustBooked(0, storage);
    expect(consumeJustBooked(JUST_BOOKED_TTL_MS - 1, storage)).toBe(true);
    markJustBooked(0, storage);
    expect(consumeJustBooked(JUST_BOOKED_TTL_MS, storage)).toBe(false);
    expect(data.has(JUST_BOOKED_KEY)).toBe(false);
  });

  it('ignores a garbled value', () => {
    const { storage } = fresh();
    storage.set(JUST_BOOKED_KEY, 'soon');
    expect(consumeJustBooked(5, storage)).toBe(false);
  });
});
