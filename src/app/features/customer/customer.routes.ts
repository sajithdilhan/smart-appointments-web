import { Routes } from '@angular/router';

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
    loadComponent: placeholder,
    data: { heading: 'My appointments', phase: 'F4' },
  },
  {
    path: 'appointments/:id',
    title: 'Appointment details',
    loadComponent: placeholder,
    data: { heading: 'Appointment details', phase: 'F4' },
  },
  {
    path: 'profile',
    title: 'Profile',
    loadComponent: placeholder,
    data: { heading: 'Profile', phase: 'F4' },
  },
];

export default CUSTOMER_ROUTES;
