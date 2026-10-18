import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** A centred "nothing here" block: a short title, optional text and actions (projected). */
@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center',
  },
  template: `
    <p class="font-medium">{{ title() }}</p>
    <div class="flex flex-col items-center gap-3 text-sm text-muted-foreground empty:hidden">
      <ng-content />
    </div>
    <div class="flex flex-wrap justify-center gap-2 empty:hidden">
      <ng-content select="[actions]" />
    </div>
  `,
})
export class EmptyState {
  readonly title = input.required<string>();
}
