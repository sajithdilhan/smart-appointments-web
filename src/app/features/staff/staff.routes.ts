import { Routes } from '@angular/router';

const placeholder = () => import('../placeholder/placeholder-page').then((m) => m.PlaceholderPage);

/** Children of the staff shell. */
export const STAFF_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Staff workspace',
    loadComponent: placeholder,
    data: { heading: 'Staff workspace', phase: 'a later phase' },
  },
];

export default STAFF_ROUTES;
