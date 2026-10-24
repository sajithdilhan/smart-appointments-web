import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FocusHeadingDirective } from '../../../shared/a11y/focus-heading.directive';

/** Stub (F7-T6): chunk C replaces it with the staff list; the drawers are its child routes. */
@Component({
  selector: 'app-staff-accounts-page',
  imports: [FocusHeadingDirective, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 appFocusHeading class="text-3xl font-semibold tracking-tight">Staff</h1>
    <router-outlet />
  `,
})
export class StaffAccountsPage {}
