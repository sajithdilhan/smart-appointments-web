import { guestGuard } from '../../core/auth/guards';
import { PUBLIC_ROUTES } from './public.routes';
import { LANDING_TITLE, LOGIN_TITLE, REGISTER_TITLE } from './titles';

describe('public routes', () => {
  const byPath = (path: string) => PUBLIC_ROUTES.find((r) => r.path === path)!;

  it('has exactly the three entries, each lazy with loadComponent', () => {
    expect(PUBLIC_ROUTES.map((r) => r.path)).toEqual(['', 'login', 'register']);
    for (const route of PUBLIC_ROUTES) {
      expect(route.loadComponent).toBeTypeOf('function');
      expect(route.component).toBeUndefined();
    }
  });

  it('takes the titles from titles.ts', () => {
    expect(byPath('').title).toBe(LANDING_TITLE);
    expect(byPath('login').title).toBe(LOGIN_TITLE);
    expect(byPath('register').title).toBe(REGISTER_TITLE);
  });

  it('guards only the auth pages with guestGuard', () => {
    expect(byPath('').canActivate).toBeUndefined();
    expect(byPath('login').canActivate).toEqual([guestGuard]);
    expect(byPath('register').canActivate).toEqual([guestGuard]);
  });

  it('resolves every lazy component', async () => {
    for (const route of PUBLIC_ROUTES) {
      expect(await (route.loadComponent as () => Promise<unknown>)()).toBeTypeOf('function');
    }
  });
});
