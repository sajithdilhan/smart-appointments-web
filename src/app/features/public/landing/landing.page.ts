import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FocusHeadingDirective } from '../../../shared/a11y/focus-heading.directive';

@Component({
  selector: 'app-landing-page',
  imports: [FocusHeadingDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1 appFocusHeading>Book your next appointment in minutes.</h1>`,
})
export class LandingPage {}
