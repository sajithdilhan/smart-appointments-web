import { ChangeDetectionStrategy, Component } from '@angular/core';
import type { DirtyForm } from '../shared/dirty/dirty-form';
import { FocusHeadingDirective } from '../../../shared/a11y/focus-heading.directive';

@Component({
  selector: 'app-slots-page',
  imports: [FocusHeadingDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1 appFocusHeading class="text-3xl font-semibold tracking-tight">
    Slot generation
  </h1>`,
})
export class SlotsPage implements DirtyForm {
  isDirty(): boolean {
    return false;
  }
}
