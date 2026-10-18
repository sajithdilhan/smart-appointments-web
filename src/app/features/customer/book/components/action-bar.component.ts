import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * The step's Back and primary actions (projected). Below 768 px it sticks to the viewport
 * bottom, above the F1 bottom tab bar (3.5 rem plus the safe area) without covering it; from
 * 768 px, where the tab bar is gone, it sits in the flow. `html` has a matching
 * `scroll-padding-bottom`, so a focused control is not hidden behind it (WCAG 2.4.11).
 */
@Component({
  selector: 'app-action-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 -mx-4 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-background px-4 py-3 md:static md:mx-0 md:border-t-0 md:px-0',
  },
  template: `<ng-content />`,
})
export class ActionBarComponent {}
