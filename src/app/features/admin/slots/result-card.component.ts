import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  input,
  output,
  viewChild,
} from '@angular/core';
import { HlmButton } from '@app/shared/ui/button';
import type { GenerateSlotsResult } from '../../../core/api/models';

/**
 * What a generation did, as the server counted it. Focus moves to the heading when the card
 * appears. A run that created and skipped nothing is explained instead of reported as plain
 * success.
 */
@Component({
  selector: 'app-result-card',
  imports: [HlmButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="flex flex-col gap-3 rounded-lg border bg-card p-4"
      aria-labelledby="result-title"
    >
      <h2 #heading id="result-title" tabindex="-1" class="text-xl font-semibold outline-none">
        {{ result().createdCount }} {{ result().createdCount === 1 ? 'slot' : 'slots' }} created
      </h2>
      <p>{{ result().skippedCount }} skipped because they overlap existing slots</p>
      @if (result().createdCount === 0 && result().skippedCount === 0) {
        <p class="text-sm text-muted-foreground">
          Nothing was created: the branch may be closed on every day in this range, or every slot in
          it has already started.
        </p>
      }
      <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt class="text-muted-foreground">Branch</dt>
        <dd>{{ branch() }}</dd>
        <dt class="text-muted-foreground">Service</dt>
        <dd>{{ service() }}</dd>
        <dt class="text-muted-foreground">Range</dt>
        <dd>{{ range() }}</dd>
      </dl>
      <div>
        <button hlmBtn type="button" variant="outline" (click)="generateMore.emit()">
          Generate more
        </button>
      </div>
    </section>
  `,
})
export class ResultCard {
  readonly result = input.required<GenerateSlotsResult>();
  readonly branch = input.required<string>();
  readonly service = input.required<string>();
  readonly range = input.required<string>();
  readonly generateMore = output<void>();
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');

  constructor() {
    afterNextRender(() => this.heading().nativeElement.focus());
  }
}
