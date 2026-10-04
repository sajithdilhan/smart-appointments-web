import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Role, SessionStatus } from './session.model';
import { SessionStore } from './session.store';
import { landingCtas } from './landing-cta';

function ctas(status: SessionStatus, role: Role | null) {
  TestBed.configureTestingModule({
    providers: [
      { provide: SessionStore, useValue: { status: signal(status), role: signal(role) } },
    ],
  });
  return TestBed.runInInjectionContext(() => landingCtas())();
}

describe('landingCtas', () => {
  it('offers account creation and login to an anonymous visitor', () => {
    expect(ctas('anonymous', null)).toEqual({
      primary: { label: 'Create an account', href: '/register' },
      secondary: { label: 'Log in', href: '/login' },
    });
  });

  it('treats an unknown session like an anonymous one', () => {
    expect(ctas('unknown', null).primary.href).toBe('/register');
  });

  it.each([
    ['Customer', '/book'],
    ['Admin', '/admin'],
    ['Staff', '/staff'],
  ] as const)('sends a signed-in %s to %s', (role, href) => {
    expect(ctas('authenticated', role)).toEqual({
      primary: { label: 'Go to my dashboard', href },
      secondary: null,
    });
  });
});
