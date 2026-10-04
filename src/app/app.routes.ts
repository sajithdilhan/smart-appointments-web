import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/auth/guards';

// Convention: every route after F0 is lazy-loaded. The shells are lazy parents of their area.
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./shared/layout/public-shell').then((m) => m.PublicShell),
    loadChildren: () => import('./features/public/public.routes'),
  },
  {
    path: '',
    canActivate: [authGuard, roleGuard('Customer')],
    canActivateChild: [roleGuard('Customer')],
    loadComponent: () => import('./shared/layout/customer-shell').then((m) => m.CustomerShell),
    loadChildren: () => import('./features/customer/customer.routes'),
  },
  {
    path: 'admin',
    canActivate: [authGuard, roleGuard('Admin')],
    canActivateChild: [roleGuard('Admin')],
    data: { breadcrumb: 'Admin' },
    loadComponent: () => import('./shared/layout/admin-shell').then((m) => m.AdminShell),
    loadChildren: () => import('./features/admin/admin.routes'),
  },
  {
    path: 'staff',
    canActivate: [authGuard, roleGuard('Staff')],
    canActivateChild: [roleGuard('Staff')],
    loadComponent: () => import('./shared/layout/staff-shell').then((m) => m.StaffShell),
    loadChildren: () => import('./features/staff/staff.routes'),
  },
  {
    path: '**',
    title: 'Page not found',
    loadComponent: () => import('./shared/layout/not-found').then((m) => m.NotFoundHost),
  },
];
