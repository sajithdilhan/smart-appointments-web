import { Routes } from '@angular/router';

// Convention: every route after F0 is lazy-loaded.
export const routes: Routes = [
  { path: '', pathMatch: 'full', children: [] },
  { path: 'about', loadComponent: () => import('./features/placeholder/placeholder') },
  { path: '**', redirectTo: '' },
];
