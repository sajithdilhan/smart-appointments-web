import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FocusHeadingDirective } from '../../../shared/a11y/focus-heading.directive';

@Component({
  selector: 'app-register-page',
  imports: [FocusHeadingDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1 appFocusHeading>Create your account</h1>`,
})
export class RegisterPage {}
