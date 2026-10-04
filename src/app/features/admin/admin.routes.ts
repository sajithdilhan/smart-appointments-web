import { Routes } from '@angular/router';

const placeholder = () => import('../placeholder/placeholder-page').then((m) => m.PlaceholderPage);

/** Children of the admin shell; `data.breadcrumb` feeds the breadcrumb trail. */
export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Dashboard',
    loadComponent: placeholder,
    data: { heading: 'Dashboard', phase: 'F5', breadcrumb: 'Dashboard' },
  },
  {
    path: 'branches',
    title: 'Branches',
    loadComponent: placeholder,
    data: { heading: 'Branches', phase: 'F5', breadcrumb: 'Branches' },
  },
  {
    path: 'services',
    title: 'Service types',
    loadComponent: placeholder,
    data: { heading: 'Service types', phase: 'F5', breadcrumb: 'Services' },
  },
  {
    path: 'slots',
    title: 'Slot generation',
    loadComponent: placeholder,
    data: { heading: 'Slot generation', phase: 'F5', breadcrumb: 'Slot generation' },
  },
];

export default ADMIN_ROUTES;
