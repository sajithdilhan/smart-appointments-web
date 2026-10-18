import { Routes } from '@angular/router';
import { AdminFrame } from './admin-frame.component';
import { BranchesStore } from './data/branches.store';
import { branchCrumb, scheduleCrumbs, serviceCrumb } from './data/resolvers';
import { ServicesStore } from './data/services.store';
import { SlotActivityStore } from './data/slot-activity.store';
import { unsavedChangesGuard } from './shared/dirty/unsaved-changes.guard';
import { TITLES } from './titles';

const dashboard = () => import('./dashboard/dashboard.page').then((m) => m.DashboardPage);
const branchesPage = () => import('./branches/branches.page').then((m) => m.BranchesPage);
const branchDrawer = () => import('./branches/branch-drawer.component').then((m) => m.BranchDrawer);
const schedule = () => import('./schedule/schedule.page').then((m) => m.SchedulePage);
const servicesPage = () => import('./services/services.page').then((m) => m.ServicesPage);
const serviceDrawer = () =>
  import('./services/service-drawer.component').then((m) => m.ServiceDrawer);
const slots = () => import('./slots/slots.page').then((m) => m.SlotsPage);

/**
 * Children of the F1 admin shell. Role guarding is F1's (`roleGuard('Admin')` on the parent); this
 * file adds none. Drawers are children of their list so the list stays mounted behind them.
 */
export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    component: AdminFrame,
    providers: [BranchesStore, ServicesStore, SlotActivityStore],
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: dashboard,
        title: TITLES.dashboard,
        data: { breadcrumb: 'Dashboard' },
      },
      // Before `branches`, so `branches/:id/schedule` is never taken for the drawer child `:id`.
      {
        path: 'branches/:id/schedule',
        loadComponent: schedule,
        title: TITLES.schedule,
        resolve: { breadcrumb: scheduleCrumbs },
        canDeactivate: [unsavedChangesGuard],
      },
      {
        path: 'branches',
        loadComponent: branchesPage,
        title: TITLES.branches,
        data: { breadcrumb: 'Branches' },
        children: [
          {
            path: 'new',
            loadComponent: branchDrawer,
            title: TITLES.newBranch,
            data: { breadcrumb: 'New branch' },
            canDeactivate: [unsavedChangesGuard],
          },
          {
            path: ':id',
            loadComponent: branchDrawer,
            title: TITLES.editBranch,
            resolve: { breadcrumb: branchCrumb },
            canDeactivate: [unsavedChangesGuard],
          },
        ],
      },
      {
        path: 'services',
        loadComponent: servicesPage,
        title: TITLES.services,
        data: { breadcrumb: 'Services' },
        children: [
          {
            path: 'new',
            loadComponent: serviceDrawer,
            title: TITLES.newService,
            data: { breadcrumb: 'New service' },
            canDeactivate: [unsavedChangesGuard],
          },
          {
            path: ':id',
            loadComponent: serviceDrawer,
            title: TITLES.editService,
            resolve: { breadcrumb: serviceCrumb },
            canDeactivate: [unsavedChangesGuard],
          },
        ],
      },
      {
        path: 'slots',
        loadComponent: slots,
        title: TITLES.slots,
        data: { breadcrumb: 'Slot generation' },
        canDeactivate: [unsavedChangesGuard],
      },
    ],
  },
];

export default ADMIN_ROUTES;
