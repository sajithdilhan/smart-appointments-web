import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-placeholder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="text-muted-foreground">
    Placeholder route. Real features arrive in F1 onwards.
  </p>`,
})
export default class Placeholder {}
