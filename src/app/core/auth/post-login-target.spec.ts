import { landingRouteFor } from './landing';
import { roleCanOpen, resolvePostLoginTarget } from './post-login-target';
import type { Role } from './session.model';

describe('landingRouteFor', () => {
  it('maps each role to its landing route', () => {
    expect(landingRouteFor('Customer')).toBe('/book');
    expect(landingRouteFor('Admin')).toBe('/admin');
    expect(landingRouteFor('Staff')).toBe('/staff');
  });
});

describe('roleCanOpen', () => {
  const matrix: [Role, string, boolean][] = [
    ['Admin', '/admin', true],
    ['Admin', '/admin/branches/1?x=2', true],
    ['Customer', '/admin', false],
    ['Staff', '/admin/slots', false],
    ['Staff', '/staff', true],
    ['Customer', '/staff', false],
    ['Admin', '/staff', false],
    ['Customer', '/book', true],
    ['Customer', '/appointments/123', true],
    ['Customer', '/profile', true],
    ['Admin', '/book', false],
    ['Staff', '/appointments', false],
    ['Staff', '/profile', false],
    ['Customer', '/', true],
    ['Admin', '/', true],
    ['Staff', '/some-future-page', true],
  ];
  it.each(matrix)('%s opening %s is %s', (role, url, expected) => {
    expect(roleCanOpen(role, url)).toBe(expected);
  });
});

describe('resolvePostLoginTarget', () => {
  it('returns a safe returnUrl the role may open', () => {
    expect(resolvePostLoginTarget('Customer', '/appointments?tab=past')).toBe(
      '/appointments?tab=past',
    );
    expect(resolvePostLoginTarget('Admin', '/admin/branches')).toBe('/admin/branches');
  });

  it('falls back to the landing route for an unsafe returnUrl', () => {
    expect(resolvePostLoginTarget('Customer', '//evil.example')).toBe('/book');
    expect(resolvePostLoginTarget('Admin', 'https://evil.example')).toBe('/admin');
    expect(resolvePostLoginTarget('Staff', '/login')).toBe('/staff');
  });

  it('falls back for a returnUrl the role may not open (no guard bounce)', () => {
    expect(resolvePostLoginTarget('Customer', '/admin')).toBe('/book');
    expect(resolvePostLoginTarget('Admin', '/book')).toBe('/admin');
  });

  it.each([null, undefined, '', 5])('falls back for an absent value %j', (raw) => {
    expect(resolvePostLoginTarget('Staff', raw)).toBe('/staff');
  });
});
