import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Stand-in for a screen a later phase builds. The heading and the phase come from the route's
 * `data` (bound to these inputs by `withComponentInputBinding`); the text is not product copy.
 */
@Component({
  selector: 'app-placeholder-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-3xl flex-col gap-2 p-6">
      <h1 class="text-3xl font-semibold tracking-tight">{{ heading() }}</h1>
      <p class="text-muted-foreground">Coming in {{ phase() }}.</p>
    </div>
  `,
})
export class PlaceholderPage {
  readonly heading = input('');
  readonly phase = input('');
}
