import { Routes } from '@angular/router';
import { guestGuard } from '../../core/auth/guards';

const placeholder = () => import('../placeholder/placeholder-page').then((m) => m.PlaceholderPage);

/** Children of the public shell. `/` stays open to signed-in users; the auth pages are guest-only. */
export const PUBLIC_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: placeholder,
    data: { heading: 'Welcome', phase: 'F2' },
  },
  {
    path: 'login',
    title: 'Sign in',
    canActivate: [guestGuard],
    loadComponent: placeholder,
    data: { heading: 'Sign in', phase: 'F2' },
  },
  {
    path: 'register',
    title: 'Create account',
    canActivate: [guestGuard],
    loadComponent: placeholder,
    data: { heading: 'Create account', phase: 'F2' },
  },
];

export default PUBLIC_ROUTES;
