import { Routes } from '@angular/router';

/** Children of the staff shell. */
export const STAFF_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Staff workspace',
    loadComponent: () => import('./staff-placeholder').then((m) => m.StaffPlaceholder),
  },
];

export default STAFF_ROUTES;
