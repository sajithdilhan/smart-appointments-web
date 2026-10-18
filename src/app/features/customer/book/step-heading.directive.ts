import { Directive, ElementRef, afterNextRender, inject } from '@angular/core';
import { BookingWizardStore } from './wizard.store';

/**
 * Put on each step's `<h2>`. It is programmatically focusable (`tabindex="-1"`) and takes focus
 * when its step appears, except on the wizard's first render: the route announcer already
 * announces the page then, and the heading must not steal focus on load (Req 1.5, 12.2).
 */
@Directive({
  selector: '[appStepHeading]',
  host: { tabindex: '-1', class: 'outline-none scroll-mt-20' },
})
export class StepHeadingDirective {
  constructor() {
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    if (inject(BookingWizardStore).initialised()) {
      afterNextRender(() => el.focus());
    }
  }
}
