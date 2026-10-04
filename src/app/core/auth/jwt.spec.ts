import { makeAccessToken } from '../../../testing/make-access-token';
import { decodeAccessToken } from './jwt';

function forge(payload: unknown, pad = true): string {
  const json = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  let b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_');
  if (!pad) b64 = b64.replace(/=+$/, '');
  return `h.${b64}.s`;
}

describe('decodeAccessToken', () => {
  it('reads sub, email, role and exp from a valid token', () => {
    const token = makeAccessToken({
      sub: 'u1',
      email: 'a@b.c',
      role: 'Staff',
      expiresInSeconds: 60,
      nowMs: 1_000_000,
    });
    expect(decodeAccessToken(token)).toEqual({
      sub: 'u1',
      email: 'a@b.c',
      role: 'Staff',
      exp: 1060,
    });
  });

  it('tolerates missing base64 padding', () => {
    const claims = { sub: 'u', email: 'x@y.z', role: 'Admin', exp: 5 };
    for (const email of ['x@y.z', 'xx@y.z', 'xxx@y.z', 'xxxx@y.z']) {
      expect(decodeAccessToken(forge({ ...claims, email }, false))?.email).toBe(email);
    }
  });

  it('decodes non-ASCII characters as UTF-8', () => {
    const token = makeAccessToken({
      sub: 'u1',
      email: 'zoë.日本@例え.jp',
      role: 'Customer',
      expiresInSeconds: 60,
    });
    expect(decodeAccessToken(token)?.email).toBe('zoë.日本@例え.jp');
  });

  it.each([
    ['not a token', 'garbage'],
    ['two parts', 'a.b'],
    ['four parts', 'a.b.c.d'],
    ['non-base64 payload', 'a.@@@.c'],
    ['payload not JSON', forge('not json')],
    ['payload an array', forge('[1,2]')],
    ['empty payload', forge({})],
  ])('returns null for %s', (_name, token) => {
    expect(decodeAccessToken(token)).toBeNull();
  });

  it.each([
    ['sub', { email: 'a@b.c', role: 'Customer', exp: 1 }],
    ['exp', { sub: 'u', email: 'a@b.c', role: 'Customer' }],
    ['email', { sub: 'u', role: 'Customer', exp: 1 }],
    ['exp that is a string', { sub: 'u', email: 'a@b.c', role: 'Customer', exp: '1' }],
    ['sub that is a number', { sub: 7, email: 'a@b.c', role: 'Customer', exp: 1 }],
  ])('returns null without a usable %s', (_name, payload) => {
    expect(decodeAccessToken(forge(payload))).toBeNull();
  });

  it.each(['Owner', 'customer', '', null, 1])('returns null for the role %j', (role) => {
    expect(decodeAccessToken(forge({ sub: 'u', email: 'a@b.c', role, exp: 1 }))).toBeNull();
  });
});
