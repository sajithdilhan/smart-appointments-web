import { Routes } from '@angular/router';
import { TITLES } from './titles';

/** Children of the staff shell: the gate resolves the branch, then the day page renders in it. */
export const STAFF_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./staff-gate.component').then((m) => m.StaffGate),
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: TITLES.appointments,
        loadComponent: () => import('./staff-day.page').then((m) => m.StaffDayPage),
      },
    ],
  },
];

export default STAFF_ROUTES;
