import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FocusHeadingDirective } from '../../../shared/a11y/focus-heading.directive';

@Component({
  selector: 'app-branches-page',
  imports: [FocusHeadingDirective, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 appFocusHeading class="text-3xl font-semibold tracking-tight">Branches</h1>
    <router-outlet />
  `,
})
export class BranchesPage {}
