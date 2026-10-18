import { Routes } from '@angular/router';
import { guestGuard } from '../../core/auth/guards';
import { LANDING_TITLE, LOGIN_TITLE, REGISTER_TITLE } from './titles';

/** Children of the public shell. `/` stays open to signed-in users; the auth pages are guest-only. */
export const PUBLIC_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: LANDING_TITLE,
    loadComponent: () => import('./landing/landing.page').then((m) => m.LandingPage),
  },
  {
    path: 'login',
    title: LOGIN_TITLE,
    canActivate: [guestGuard],
    loadComponent: () => import('./login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    title: REGISTER_TITLE,
    canActivate: [guestGuard],
    loadComponent: () => import('./register/register.page').then((m) => m.RegisterPage),
  },
];

export default PUBLIC_ROUTES;
