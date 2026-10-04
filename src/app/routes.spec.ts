import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { createFakeSession, provideFakeSession } from '../testing/fake-session';
import { routes } from './app.routes';
import { AREA_ROLES, roleCanOpen } from './core/auth/post-login-target';
import { ROLES, type Role } from './core/auth/session.model';
import { AppTitleStrategy } from './core/routing/app-title.strategy';

type Who = 'anonymous' | Role;
const WHOS: Who[] = ['anonymous', ...ROLES];

async function visit(who: Who, url: string) {
  TestBed.resetTestingModule();
  const session = createFakeSession(
    who === 'anonymous' ? 'anonymous' : 'authenticated',
    who === 'anonymous' ? null : who,
  );
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes, withComponentInputBinding()),
      { provide: TitleStrategy, useClass: AppTitleStrategy },
      ...provideFakeSession(session),
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  const heading = harness.routeNativeElement?.querySelector('h1')?.textContent?.trim() ?? null;
  return { url: TestBed.inject(Router).url, heading, title: TestBed.inject(Title).getTitle() };
}

const returnTo = (url: string) => `/login?returnUrl=${encodeURIComponent(url)}`;
const landing: Record<Role, string> = { Customer: '/book', Admin: '/admin', Staff: '/staff' };

const protectedPaths: Record<string, Role> = {
  '/book': 'Customer',
  '/appointments': 'Customer',
  '/appointments/3': 'Customer',
  '/profile': 'Customer',
  '/admin': 'Admin',
  '/admin/branches': 'Admin',
  '/admin/services': 'Admin',
  '/admin/slots': 'Admin',
  '/staff': 'Staff',
};

describe('route table', () => {
  it.each([
    ['/', 'Welcome'],
    ['/login', 'Sign in'],
    ['/register', 'Create account'],
  ])('renders the public page %s for an anonymous visitor', async (url, heading) => {
    expect(await visit('anonymous', url)).toMatchObject({ url, heading });
  });

  it.each(ROLES)('keeps / open for a signed-in %s', async (role) => {
    expect(await visit(role, '/')).toMatchObject({ url: '/', heading: 'Welcome' });
  });

  it.each(ROLES)(
    'sends a signed-in %s from /login and /register to its landing route',
    async (role) => {
      expect((await visit(role, '/login')).url).toBe(landing[role]);
      expect((await visit(role, '/register')).url).toBe(landing[role]);
    },
  );

  it.each(Object.keys(protectedPaths))(
    'redirects an anonymous visitor from %s to /login with returnUrl',
    async (url) => {
      expect((await visit('anonymous', url)).url).toBe(returnTo(url));
    },
  );

  describe.each(ROLES)('as a %s', (role) => {
    it.each(Object.keys(protectedPaths))('opens or redirects %s by role', async (url) => {
      const result = await visit(role, url);
      expect(result.url).toBe(protectedPaths[url] === role ? url : landing[role]);
      expect(result.heading).not.toBeNull();
    });
  });

  it.each([
    ['/book', 'Book an appointment'],
    ['/appointments', 'My appointments'],
    ['/appointments/3', 'Appointment details'],
    ['/profile', 'Profile'],
  ])('shows %s to a Customer with its heading and title', async (url, heading) => {
    expect(await visit('Customer', url)).toEqual({
      url,
      heading,
      title: `${heading} | Smart Appointments`,
    });
  });

  it.each([
    ['/admin', 'Dashboard'],
    ['/admin/branches', 'Branches'],
    ['/admin/services', 'Service types'],
    ['/admin/slots', 'Slot generation'],
  ])('shows %s to an Admin', async (url, heading) => {
    expect(await visit('Admin', url)).toMatchObject({ url, heading });
  });

  it('shows /staff to Staff', async () => {
    expect(await visit('Staff', '/staff')).toMatchObject({
      url: '/staff',
      heading: 'Staff workspace',
    });
  });

  it.each(WHOS)('renders the not-found page for %s on an unknown path', async (who) => {
    expect(await visit(who, '/no/such/page')).toMatchObject({
      url: '/no/such/page',
      heading: 'Page not found',
      title: 'Page not found | Smart Appointments',
    });
  });

  it('keeps the post-login area map in step with the guarded routes (drift test)', async () => {
    for (const segment of Object.keys(AREA_ROLES)) {
      for (const role of ROLES) {
        const result = await visit(role, `/${segment}`);
        expect(result.url === `/${segment}`, `${role} on /${segment}`).toBe(
          roleCanOpen(role, `/${segment}`),
        );
      }
    }
  });
});
