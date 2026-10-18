import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleAlert, lucideInfo } from '@ng-icons/lucide';

export type InlineAlertTone = 'error' | 'info';

/**
 * A message that stays on the page next to what it is about. `error` is announced assertively
 * (`role="alert"`), `info` politely (`role="status"`). The tone never relies on colour alone: it
 * has an icon, and the message text says what happened.
 */
@Component({
  selector: 'app-inline-alert',
  imports: [NgIcon],
  providers: [provideIcons({ lucideCircleAlert, lucideInfo })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.role]': 'tone() === "error" ? "alert" : "status"',
    class: 'flex items-start gap-2.5 rounded-lg border bg-card px-4 py-3 text-sm',
    '[class.border-destructive]': 'tone() === "error"',
    '[class.text-destructive]': 'tone() === "error"',
  },
  template: `
    <ng-icon
      [name]="tone() === 'error' ? 'lucideCircleAlert' : 'lucideInfo'"
      size="16"
      class="mt-0.5 shrink-0"
      aria-hidden="true"
    />
    <div class="flex min-w-0 flex-1 flex-col gap-2"><ng-content /></div>
  `,
})
export class InlineAlert {
  readonly tone = input<InlineAlertTone>('info');
}
