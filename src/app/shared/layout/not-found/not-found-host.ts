import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SessionStore } from '../../../core/auth/session.store';
import { AdminShell } from '../admin-shell';
import { CustomerShell } from '../customer-shell';
import { PublicShell } from '../public-shell';
import { StaffShell } from '../staff-shell';
import { NotFoundPage } from './not-found-page';

/**
 * The `**` route: the 404 page inside the shell the visitor already knows (public when signed
 * out, the role's own shell otherwise), so navigation stays available.
 */
@Component({
  selector: 'app-not-found-host',
  imports: [AdminShell, CustomerShell, NotFoundPage, PublicShell, StaffShell],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (session.role()) {
      @case ('Admin') {
        <app-admin-shell><app-not-found /></app-admin-shell>
      }
      @case ('Customer') {
        <app-customer-shell><app-not-found /></app-customer-shell>
      }
      @case ('Staff') {
        <app-staff-shell><app-not-found /></app-staff-shell>
      }
      @default {
        <app-public-shell><app-not-found /></app-public-shell>
      }
    }
  `,
})
export class NotFoundHost {
  protected readonly session = inject(SessionStore);
}
