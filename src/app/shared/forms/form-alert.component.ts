import { ChangeDetectionStrategy, Component, ElementRef, input, viewChild } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleAlert, lucideInfo } from '@ng-icons/lucide';

export type AlertTone = 'error' | 'info';

/**
 * A stable live region: always in the DOM so that message text appearing inside it is announced
 * reliably, and a re-render with the same text is not announced again. It is focusable by script
 * (`focus()`), for the cases where focus should move to the message.
 */
@Component({
  selector: 'app-form-alert',
  imports: [NgIcon],
  providers: [provideIcons({ lucideCircleAlert, lucideInfo })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      #region
      tabindex="-1"
      aria-atomic="true"
      class="outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      [attr.role]="tone() === 'error' ? 'alert' : 'status'"
    >
      @if (message(); as text) {
        <div
          class="flex gap-2 rounded-md p-3 text-sm"
          [class]="
            tone() === 'error'
              ? 'border-l-4 border-destructive bg-destructive/10 text-foreground'
              : 'bg-accent text-accent-foreground'
          "
        >
          <ng-icon
            [name]="tone() === 'error' ? 'lucideCircleAlert' : 'lucideInfo'"
            size="18"
            class="mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <div>
            <p>{{ text }}</p>
            @if (reference(); as ref) {
              <p class="mt-1 text-xs text-muted-foreground">Reference: {{ ref }}</p>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class FormAlertComponent {
  readonly tone = input<AlertTone>('error');
  readonly message = input<string | null>(null);
  /** A correlation id shown for server faults. */
  readonly reference = input<string | null>(null);
  private readonly region = viewChild.required<ElementRef<HTMLElement>>('region');

  focus(): void {
    this.region().nativeElement.focus();
  }
}
