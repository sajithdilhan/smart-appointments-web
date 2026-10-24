import { isGuid } from './guid';

describe('isGuid', () => {
  const id = '3f2a1c9e-7b4d-4e6a-9c1f-0a2b3c4d5e6f';

  it('accepts a GUID in either case', () => {
    expect(isGuid(id)).toBe(true);
    expect(isGuid(id.toUpperCase())).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isGuid('abc')).toBe(false);
    expect(isGuid('')).toBe(false);
    expect(isGuid(null)).toBe(false);
    expect(isGuid(undefined)).toBe(false);
    expect(isGuid(`${id}x`)).toBe(false);
    expect(isGuid(`x${id}`)).toBe(false);
  });
});
