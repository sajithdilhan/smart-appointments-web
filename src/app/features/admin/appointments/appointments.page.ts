import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FocusHeadingDirective } from '../../../shared/a11y/focus-heading.directive';

/** Stub (F7-T6): chunk E replaces it with the admin day list. */
@Component({
  selector: 'app-admin-appointments-page',
  imports: [FocusHeadingDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1 appFocusHeading class="text-3xl font-semibold tracking-tight">Appointments</h1>`,
})
export class AdminAppointmentsPage {}
