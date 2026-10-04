import type { SlotResponse } from '../../../core/api/models';
import { SlotCache, slotCacheKey } from './slot-cache';

const slots = [{ id: 'a' }] as SlotResponse[];

describe('SlotCache', () => {
  it('returns nothing for an unknown key', () => {
    expect(new SlotCache().get('x', 0)).toBeUndefined();
  });

  it('is fresh at 59 s and stale at 60 s and later', () => {
    const cache = new SlotCache();
    cache.set('k', slots, 1_000);
    expect(cache.get('k', 1_000 + 59_000)).toEqual({ slots, fetchedAt: 1_000, fresh: true });
    expect(cache.get('k', 1_000 + 60_000)?.fresh).toBe(false);
    expect(cache.get('k', 1_000 + 61_000)?.fresh).toBe(false);
    expect(cache.get('k', 1_000 + 61_000)?.slots).toBe(slots);
  });

  it('invalidate removes one entry only', () => {
    const cache = new SlotCache();
    cache.set('a', slots, 0);
    cache.set('b', slots, 0);
    cache.invalidate('a');
    expect(cache.get('a', 0)).toBeUndefined();
    expect(cache.get('b', 0)).toBeDefined();
  });

  it('dropBefore removes entries for earlier dates only', () => {
    const cache = new SlotCache();
    const key = (date: string) => slotCacheKey({ branchId: 'b', serviceId: 's', date });
    for (const d of ['2026-10-03', '2026-10-04', '2026-10-05']) cache.set(key(d), slots, 0);
    cache.dropBefore('2026-10-04');
    expect(cache.get(key('2026-10-03'), 0)).toBeUndefined();
    expect(cache.get(key('2026-10-04'), 0)).toBeDefined();
    expect(cache.get(key('2026-10-05'), 0)).toBeDefined();
  });

  it('clear empties the cache; the key joins branch, service and date', () => {
    const cache = new SlotCache();
    const k = slotCacheKey({ branchId: 'b', serviceId: 's', date: '2026-10-05' });
    expect(k).toBe('b|s|2026-10-05');
    cache.set(k, slots, 0);
    cache.clear();
    expect(cache.get(k, 0)).toBeUndefined();
  });
});
