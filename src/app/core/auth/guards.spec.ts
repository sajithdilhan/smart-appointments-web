import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  Router,
  UrlTree,
  convertToParamMap,
  provideRouter,
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
} from '@angular/router';
import { ToastService } from '../notify/toast.service';
import { authGuard, guestGuard, roleGuard } from './guards';
import { ROLES, type Role, type SessionStatus } from './session.model';
import { SessionStore } from './session.store';

interface Fake {
  status: WritableSignal<SessionStatus>;
  role: WritableSignal<Role | null>;
  release: () => void;
  settled: () => Promise<void>;
}

function setup(status: SessionStatus, role: Role | null, settled = true): Fake {
  let release!: () => void;
  const gate = settled ? Promise.resolve() : new Promise<void>((r) => (release = r));
  const fake: Fake = {
    status: signal(status),
    role: signal(role),
    release: () => release(),
    settled: () => gate,
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: SessionStore, useValue: fake },
      { provide: ToastService, useValue: { showInfo: vi.fn() } },
    ],
  });
  return fake;
}

const state = (url: string) => ({ url }) as RouterStateSnapshot;
const route = (returnUrl?: string) =>
  ({ queryParamMap: convertToParamMap(returnUrl ? { returnUrl } : {}) }) as ActivatedRouteSnapshot;
const run = (fn: () => unknown) => Promise.resolve(TestBed.runInInjectionContext(fn));
const serialize = (r: unknown) => TestBed.inject(Router).serializeUrl(r as UrlTree);
const toastInfo = () => TestBed.inject(ToastService).showInfo as ReturnType<typeof vi.fn>;

describe('authGuard', () => {
  it('lets an authenticated user through', async () => {
    setup('authenticated', 'Customer');
    expect(await run(() => authGuard(route(), state('/book')))).toBe(true);
  });

  it('sends an anonymous visitor to /login with the target as returnUrl', async () => {
    setup('anonymous', null);
    const result = await run(() => authGuard(route(), state('/appointments/3?x=1')));
    expect(serialize(result)).toBe('/login?returnUrl=%2Fappointments%2F3%3Fx%3D1');
  });

  it('waits for an unknown session to settle before deciding', async () => {
    const fake = setup('unknown', null, false);
    let decided = false;
    const pending = run(() => authGuard(route(), state('/book'))).then((r) => {
      decided = true;
      return r;
    });
    await Promise.resolve();
    expect(decided).toBe(false);
    fake.status.set('authenticated');
    fake.role.set('Customer');
    fake.release();
    expect(await pending).toBe(true);
  });
});

describe('guestGuard', () => {
  it('lets an anonymous visitor open the page', async () => {
    setup('anonymous', null);
    expect(await run(() => guestGuard(route(), state('/login')))).toBe(true);
  });

  it.each([
    ['Customer', '/book'],
    ['Admin', '/admin'],
    ['Staff', '/staff'],
  ] as const)('sends a signed-in %s to %s without a returnUrl', async (role, landing) => {
    setup('authenticated', role);
    expect(serialize(await run(() => guestGuard(route(), state('/login'))))).toBe(landing);
  });

  it('honours a safe returnUrl the role may open', async () => {
    setup('authenticated', 'Customer');
    const result = await run(() => guestGuard(route('/appointments/7'), state('/login')));
    expect(serialize(result)).toBe('/appointments/7');
  });

  it.each(['/admin', '//evil.example', 'https://evil.example/', '/login'])(
    'falls back to the landing route for the unusable returnUrl %s',
    async (returnUrl) => {
      setup('authenticated', 'Customer');
      const result = await run(() => guestGuard(route(returnUrl), state('/login')));
      expect(serialize(result)).toBe('/book');
    },
  );

  it('resolves after an unknown session settles as authenticated', async () => {
    const fake = setup('unknown', null, false);
    const pending = run(() => guestGuard(route(), state('/login')));
    fake.status.set('authenticated');
    fake.role.set('Admin');
    fake.release();
    expect(serialize(await pending)).toBe('/admin');
  });
});

describe('roleGuard', () => {
  const cases: [SessionStatus, Role | null, Role, 'allow' | 'login' | 'landing'][] = [
    ['anonymous', null, 'Admin', 'login'],
    ...ROLES.flatMap((role) =>
      ROLES.map((required): [SessionStatus, Role | null, Role, 'allow' | 'login' | 'landing'] => [
        'authenticated',
        role,
        required,
        role === required ? 'allow' : 'landing',
      ]),
    ),
  ];

  it.each(cases)(
    'status %s, role %s, requires %s: %s',
    async (status, role, required, expected) => {
      setup(status, role);
      const result = await run(() => roleGuard(required)(route(), state('/admin/branches')));
      if (expected === 'allow') {
        expect(result).toBe(true);
        expect(toastInfo()).not.toHaveBeenCalled();
      } else if (expected === 'login') {
        expect(serialize(result)).toBe('/login?returnUrl=%2Fadmin%2Fbranches');
      } else {
        const landing = { Customer: '/book', Admin: '/admin', Staff: '/staff' }[role!];
        expect(serialize(result)).toBe(landing);
        expect(toastInfo()).toHaveBeenCalledOnce();
      }
    },
  );

  it('lands a Customer who opens /admin on /book with the toast', async () => {
    setup('authenticated', 'Customer');
    const result = await run(() => roleGuard('Admin')(route(), state('/admin')));
    expect(serialize(result)).toBe('/book');
    expect(toastInfo()).toHaveBeenCalledWith('That area is not available for your account.');
  });

  it('accepts any of several roles and works as a child guard', async () => {
    setup('authenticated', 'Staff');
    const guard = roleGuard('Admin', 'Staff');
    expect(await run(() => guard(route(), state('/x')))).toBe(true);
  });

  it('waits for an unknown session to settle', async () => {
    const fake = setup('unknown', null, false);
    const pending = run(() => roleGuard('Customer')(route(), state('/book')));
    fake.status.set('authenticated');
    fake.role.set('Customer');
    fake.release();
    expect(await pending).toBe(true);
  });
});
