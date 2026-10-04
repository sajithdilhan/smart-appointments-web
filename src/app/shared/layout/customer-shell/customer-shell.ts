import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** Temporary frame: the real shell replaces this body in a later task. Content is projected, the router outlet is the default. */
@Component({
  selector: 'app-customer-shell',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content><router-outlet /></ng-content>',
})
export class CustomerShell {}
