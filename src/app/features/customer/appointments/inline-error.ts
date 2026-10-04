import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { HlmButtonImports } from '@app/shared/ui/button';

/** A `role="alert"` message with a retry button; the message is already normalised text. */
@Component({
  selector: 'app-inline-error',
  imports: [HlmButtonImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      role="alert"
      class="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <p>{{ message() }}</p>
      <button hlmBtn variant="outline" size="sm" type="button" (click)="retry.emit()">
        {{ actionLabel() }}
      </button>
    </div>
  `,
})
export class InlineError {
  readonly message = input.required<string>();
  readonly actionLabel = input('Try again');
  readonly retry = output<void>();
}
