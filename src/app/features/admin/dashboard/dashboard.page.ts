import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FocusHeadingDirective } from '../../../shared/a11y/focus-heading.directive';

@Component({
  selector: 'app-dashboard-page',
  imports: [FocusHeadingDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1 appFocusHeading class="text-3xl font-semibold tracking-tight">Dashboard</h1>`,
})
export class DashboardPage {}
