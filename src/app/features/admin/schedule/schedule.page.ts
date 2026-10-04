import { ChangeDetectionStrategy, Component } from '@angular/core';
import type { DirtyForm } from '../shared/dirty/dirty-form';
import { FocusHeadingDirective } from '../../../shared/a11y/focus-heading.directive';

@Component({
  selector: 'app-schedule-page',
  imports: [FocusHeadingDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1 appFocusHeading class="text-3xl font-semibold tracking-tight">Schedule</h1>`,
})
export class SchedulePage implements DirtyForm {
  isDirty(): boolean {
    return false;
  }
}
