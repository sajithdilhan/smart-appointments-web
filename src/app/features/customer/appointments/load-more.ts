import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { HlmButtonImports } from '@app/shared/ui/button';

@Component({
  selector: 'app-load-more',
  imports: [HlmButtonImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      hlmBtn
      variant="outline"
      type="button"
      [disabled]="loading()"
      [attr.aria-busy]="loading() ? 'true' : null"
      (click)="more.emit()"
    >
      Load more
    </button>
  `,
})
export class LoadMore {
  readonly loading = input(false);
  readonly more = output<void>();
}
