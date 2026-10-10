import { Routes } from '@angular/router';
import { guidIdMatcher } from './appointments/guid-id-matcher';

const placeholder = () => import('../placeholder/placeholder-page').then((m) => m.PlaceholderPage);

/** Children of the customer shell (the shell carries the guards). */
export const CUSTOMER_ROUTES: Routes = [
  {
    path: 'book',
    title: 'Book an appointment',
    loadComponent: placeholder,
    data: { heading: 'Book an appointment', phase: 'F3' },
  },
  {
    path: 'appointments',
    title: 'My appointments',
    loadComponent: () => import('./appointments/appointments-page').then((m) => m.AppointmentsPage),
    // The detail is a child, so the list stays mounted behind a sheet (Req 5.1).
    children: [
      {
        path: ':id',
        title: 'Appointment',
        canMatch: [guidIdMatcher],
        loadComponent: () =>
          import('./appointments/appointment-detail').then((m) => m.AppointmentDetail),
      },
      {
        path: ':id',
        title: 'Appointment not found',
        loadComponent: () =>
          import('./appointments/appointment-not-found').then((m) => m.AppointmentNotFound),
      },
    ],
  },
  {
    path: 'profile',
    title: 'Profile',
    loadComponent: placeholder,
    data: { heading: 'Profile', phase: 'F4' },
  },
];

export default CUSTOMER_ROUTES;
