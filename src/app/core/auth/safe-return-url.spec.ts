import { safeReturnUrl } from './safe-return-url';

const ORIGIN = 'http://localhost:4200';
const check = (raw: unknown) => safeReturnUrl(raw, ORIGIN);

describe('safeReturnUrl', () => {
  it.each(['/book', '/appointments?tab=past', '/admin/branches/123', '/', '/loginx', '/a%2Fb'])(
    'accepts %s',
    (raw) => {
      expect(check(raw)).toBe(raw);
    },
  );

  it.each([
    ['an absolute URL', 'https://evil.example'],
    ['a protocol-relative URL', '//evil.example'],
    ['a slash-backslash URL', '/\\evil.example'],
    ['a double backslash', '\\\\evil.example'],
    ['a percent-encoded tab host', '/%09/evil.example'],
    ['a percent-encoded double slash', '/%2F/evil.example'],
    ['a percent-encoded slash pair', '/%2f%2fevil.example'],
    ['a percent-encoded backslash', '/%5Cevil.example'],
    ['a javascript URL', 'javascript:alert(1)'],
    ['a data URL', 'data:text/html,x'],
    ['a literal tab', '/book\t'],
    ['a literal newline', '/book\n/x'],
    ['a carriage return', '/\r/evil'],
    ['a NUL byte', '/a\u0000b'],
    ['an empty string', ''],
    ['/login', '/login'],
    ['/login with a query', '/login?returnUrl=%2Fbook'],
    ['/Login in another case', '/LOGIN'],
    ['/register with a query', '/register?x=1'],
    ['an encoded /login', '/%6Cogin'],
    ['malformed percent-encoding', '/%E0%A4%A'],
    ['a lone percent', '/100%'],
    ['an over-long value', '/' + 'a'.repeat(2048)],
  ])('rejects %s', (_name, raw) => {
    expect(check(raw)).toBeNull();
  });

  it.each([null, undefined, 42, {}, ['/book'], true])('rejects the non-string %j', (raw) => {
    expect(check(raw)).toBeNull();
  });

  it('defaults to the page origin', () => {
    expect(safeReturnUrl('/book')).toBe('/book');
    expect(safeReturnUrl('//evil.example')).toBeNull();
  });
});
