import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FocusHeadingDirective } from '../../../shared/a11y/focus-heading.directive';

@Component({
  selector: 'app-login-page',
  imports: [FocusHeadingDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1 appFocusHeading>Welcome back</h1>`,
})
export class LoginPage {}
