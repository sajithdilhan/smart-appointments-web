import { dedupeById } from './dedupe-by-id';

describe('dedupeById', () => {
  it('keeps the first occurrence and the order', () => {
    const a1 = { id: 'a', v: 1 };
    const b = { id: 'b', v: 2 };
    const a2 = { id: 'a', v: 3 };
    const c = { id: 'c', v: 4 };
    expect(dedupeById([a1, b, a2, c])).toEqual([a1, b, c]);
    expect(dedupeById([a1, b, a2, c])[0]).toBe(a1);
  });

  it('handles empty input and does not mutate it', () => {
    expect(dedupeById([])).toEqual([]);
    const input = [{ id: 'x' }, { id: 'x' }];
    dedupeById(input);
    expect(input).toHaveLength(2);
  });
});
