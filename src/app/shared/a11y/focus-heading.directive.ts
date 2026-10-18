import { afterNextRender, Directive, ElementRef, inject } from '@angular/core';
import { Router } from '@angular/router';

/**
 * Moves focus to the page heading after an in-app navigation, so keyboard and screen reader
 * users land on the new page. Not on the very first load, where it would be surprising.
 */
@Directive({
  selector: 'h1[appFocusHeading]',
  host: { tabindex: '-1', style: 'outline: none' },
})
export class FocusHeadingDirective {
  constructor() {
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    if (inject(Router).navigated) {
      afterNextRender(() => el.focus({ preventScroll: true }));
    }
  }
}
